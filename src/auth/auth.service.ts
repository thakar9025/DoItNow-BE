import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, User } from '@prisma/client';
import { OAuth2Client } from 'google-auth-library';
import { decode, JwtPayload, sign, SignOptions, verify } from 'jsonwebtoken';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { JwtAuthPayload } from './types/jwt-auth-payload';

type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  accessTokenExpiresIn: number | string;
  refreshTokenExpiresIn: number | string;
  user: AuthUserResponse;
};

type AuthAddressResponse = {
  id: string;
  userId: string;
  label: string;
  addressType: string | null;
  displayName: string | null;
  phone: string | null;
  shortAddress: string;
  fullAddress: string;
  location: {
    lat: number | null;
    lng: number | null;
  };
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type AuthUserResponse = {
  id: string;
  email: string | null;
  phone: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  role: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  addresses: AuthAddressResponse[];
};

type ExpiresInValue = NonNullable<SignOptions['expiresIn']>;

type TokenConfig = {
  secret: string;
  accessTokenExpiresIn: ExpiresInValue;
  refreshTokenExpiresIn: ExpiresInValue;
  issuer?: string;
  audience?: string;
};

@Injectable()
export class AuthService {
  private static readonly ADMIN_PANEL_ACCESS_DENIED_MESSAGE =
    'Only admin or super admin can access admin panel';
  private readonly googleClient: OAuth2Client;
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.googleClient = new OAuth2Client();
  }

  async loginWithGoogle(token: string): Promise<AuthResponse> {
    return this.loginWithGoogleInternal(token);
  }

  async loginAdminWithGoogle(token: string): Promise<AuthResponse> {
    return this.loginWithGoogleInternal(token, {
      requireAdminPanelAccess: true,
    });
  }

  private async loginWithGoogleInternal(
    token: string,
    options?: { requireAdminPanelAccess?: boolean },
  ): Promise<AuthResponse> {
    if (!token) {
      throw new BadRequestException('token is required');
    }

    const authContext = options?.requireAdminPanelAccess ? 'admin' : 'user';
    const allowedGoogleClientIds = this.getAllowedGoogleClientIds(
      options?.requireAdminPanelAccess,
    );

    if (allowedGoogleClientIds.length === 0) {
      throw new InternalServerErrorException(
        `Google OAuth client IDs are not set for ${authContext} login`,
      );
    }

    let payload: {
      sub?: string;
      email?: string;
      name?: string;
      picture?: string;
      email_verified?: boolean;
    };

    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: token,
        audience: allowedGoogleClientIds,
      });
      payload = ticket.getPayload() ?? {};
    } catch (error) {
      this.logAuthError('google_token_verification_failed', error, {
        hasToken: Boolean(token),
        authContext,
      });
      throw new UnauthorizedException('Invalid Google token');
    }

    if (!payload.sub || !payload.email || !payload.email_verified) {
      throw new UnauthorizedException('Invalid Google token');
    }

    let user: User;
    try {
      user = await this.usersService.findOrCreateByGoogleProfile({
        googleId: payload.sub,
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
      });
    } catch (error) {
      this.logAuthError('google_user_resolve_failed', error, {
        googleSub: payload.sub,
      });
      if (error instanceof HttpException) {
        throw error;
      }
      throw this.toAuthInternalError(error, 'Unable to complete sign-in');
    }

    if (options?.requireAdminPanelAccess) {
      this.assertAdminPanelAccess(user.role);
    }

    if (!user.isActive) {
      throw new UnauthorizedException('User account is inactive');
    }

    return this.issueTokensForUser(user);
  }

  private getAllowedGoogleClientIds(
    requireAdminPanelAccess?: boolean,
  ): string[] {
    const configuredClientIds = requireAdminPanelAccess
      ? [
          this.configService.get<string>('google.adminWebClientId'),
          this.configService.get<string>('google.adminAndroidClientId'),
          this.configService.get<string>('google.adminClientId'),
        ]
      : [
          this.configService.get<string>('google.webClientId'),
          this.configService.get<string>('google.androidClientId'),
          this.configService.get<string>('google.clientId'),
        ];

    return Array.from(
      new Set(
        configuredClientIds.filter(
          (clientId): clientId is string => Boolean(clientId),
        ),
      ),
    );
  }

  private assertAdminPanelAccess(role: User['role']): void {
    if (role === 'USER') {
      throw new ForbiddenException({
        message: AuthService.ADMIN_PANEL_ACCESS_DENIED_MESSAGE,
      });
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<AuthResponse> {
    if (!refreshToken) {
      throw new BadRequestException('refreshToken is required');
    }

    const tokenConfig = this.getTokenConfig();
    const refreshPayload = this.verifyRefreshToken(refreshToken, tokenConfig);

    if (!refreshPayload.sid) {
      throw new UnauthorizedException('Invalid refresh token payload');
    }

    let session: {
      id: string;
      userId: string;
      refreshTokenHash: string;
      revokedAt: Date | null;
      expiresAt: Date;
    } | null;
    try {
      session = await this.prisma.userSession.findUnique({
        where: { id: refreshPayload.sid },
        select: {
          id: true,
          userId: true,
          refreshTokenHash: true,
          revokedAt: true,
          expiresAt: true,
        },
      });
    } catch (error) {
      this.logAuthError('refresh_session_lookup_failed', error, {
        sessionId: refreshPayload.sid,
      });
      throw this.toAuthInternalError(
        error,
        'Unable to validate refresh session (database error)',
      );
    }

    if (
      !session ||
      session.userId !== refreshPayload.sub ||
      session.revokedAt
    ) {
      throw new UnauthorizedException('Invalid refresh session');
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const incomingHash = this.hashToken(refreshToken);
    if (!this.constantTimeEqual(incomingHash, session.refreshTokenHash)) {
      await this.prisma.userSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    const user = await this.usersService.findById(session.userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User account is inactive');
    }

    return this.issueTokensForUser(user, session.id);
  }

  async logout(
    accessPayload: JwtAuthPayload,
    refreshToken?: string,
  ): Promise<void> {
    await this.revokeAccessToken(accessPayload);

    if (!refreshToken) {
      return;
    }

    const tokenConfig = this.getTokenConfig();

    try {
      const refreshPayload = verify(refreshToken, tokenConfig.secret, {
        issuer: tokenConfig.issuer,
        audience: tokenConfig.audience,
        ignoreExpiration: true,
      }) as JwtAuthPayload;

      if (
        refreshPayload.typ === 'refresh' &&
        refreshPayload.sub === accessPayload.sub &&
        refreshPayload.sid
      ) {
        await this.prisma.userSession.updateMany({
          where: {
            id: refreshPayload.sid,
            userId: accessPayload.sub,
            revokedAt: null,
          },
          data: {
            revokedAt: new Date(),
          },
        });
      }
    } catch (error) {
      this.logAuthError('logout_session_revocation_failed', error, {
        userId: accessPayload.sub,
      });
      // Best-effort session revocation; access token is already revoked.
    }
  }

  async logoutAll(accessPayload: JwtAuthPayload): Promise<void> {
    await Promise.all([
      this.revokeAccessToken(accessPayload),
      this.prisma.userSession.updateMany({
        where: {
          userId: accessPayload.sub,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      }),
    ]);
  }

  async getCurrentUser(userId: string): Promise<AuthUserResponse> {
    const user = await this.getUserWithAddresses(userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User account is inactive');
    }

    return user;
  }

  private async issueTokensForUser(
    user: User,
    existingSessionId?: string,
  ): Promise<AuthResponse> {
    let currentUser: AuthUserResponse | null;
    try {
      currentUser = await this.getUserWithAddresses(user.id);
    } catch (error) {
      this.logAuthError('get_user_with_addresses_failed', error, {
        userId: user.id,
      });
      throw this.toAuthInternalError(
        error,
        'Unable to load user profile (database error)',
      );
    }

    if (!currentUser) {
      throw new UnauthorizedException('User account not found');
    }

    const tokenConfig = this.getTokenConfig();
    const accessTokenJti = randomUUID();
    const refreshTokenJti = randomUUID();

    const sessionId = existingSessionId ?? randomUUID();

    const accessToken = sign(
      {
        sub: user.id,
        userId: currentUser.id,
        typ: 'access',
        jti: accessTokenJti,
      },
      tokenConfig.secret,
      {
        expiresIn: tokenConfig.accessTokenExpiresIn,
        issuer: tokenConfig.issuer,
        audience: tokenConfig.audience,
      },
    );

    const refreshToken = sign(
      {
        sub: user.id,
        userId: currentUser.id,
        typ: 'refresh',
        jti: refreshTokenJti,
        sid: sessionId,
      },
      tokenConfig.secret,
      {
        expiresIn: tokenConfig.refreshTokenExpiresIn,
        issuer: tokenConfig.issuer,
        audience: tokenConfig.audience,
      },
    );

    const refreshExpiresAt = this.getTokenExpiryDate(refreshToken);

    try {
      await this.prisma.userSession.upsert({
        where: { id: sessionId },
        create: {
          id: sessionId,
          userId: currentUser.id,
          refreshTokenHash: this.hashToken(refreshToken),
          expiresAt: refreshExpiresAt,
        },
        update: {
          refreshTokenHash: this.hashToken(refreshToken),
          expiresAt: refreshExpiresAt,
          revokedAt: null,
        },
      });
    } catch (error) {
      this.logAuthError('auth_session_upsert_failed', error, {
        userId: currentUser.id,
      });
      throw this.toAuthInternalError(
        error,
        'Unable to create login session (database error)',
      );
    }

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      accessTokenExpiresIn: tokenConfig.accessTokenExpiresIn,
      refreshTokenExpiresIn: tokenConfig.refreshTokenExpiresIn,
      user: currentUser,
    };
  }

  private async getUserWithAddresses(
    userId: string,
  ): Promise<AuthUserResponse | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phone: true,
        fullName: true,
        avatarUrl: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        addresses: {
          select: {
            id: true,
            userId: true,
            label: true,
            addressType: true,
            contactName: true,
            phone: true,
            houseNumber: true,
            building: true,
            landmark: true,
            area: true,
            city: true,
            state: true,
            pincode: true,
            latitude: true,
            longitude: true,
            isDefault: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        },
      },
    });

    if (!user) {
      return null;
    }

    return {
      ...user,
      addresses: user.addresses.map((address) => ({
        id: address.id,
        userId: address.userId,
        label: address.label,
        addressType: address.addressType,
        displayName: address.contactName,
        phone: address.phone,
        shortAddress: this.buildShortAddress({
          building: address.building,
          area: address.area,
        }),
        fullAddress: this.buildFullAddress({
          houseNumber: address.houseNumber,
          building: address.building,
          landmark: address.landmark,
          area: address.area,
          city: address.city,
          state: address.state,
          pincode: address.pincode,
        }),
        location: {
          lat: address.latitude,
          lng: address.longitude,
        },
        isDefault: address.isDefault,
        createdAt: address.createdAt,
        updatedAt: address.updatedAt,
      })),
    };
  }

  private buildShortAddress(address: {
    building: string | null;
    area: string | null;
  }): string {
    return [address.building, address.area]
      .filter((value): value is string => Boolean(value))
      .join(', ');
  }

  private buildFullAddress(address: {
    houseNumber: string | null;
    building: string | null;
    landmark: string | null;
    area: string | null;
    city: string | null;
    state: string | null;
    pincode: string | null;
  }): string {
    const baseAddress = [
      address.houseNumber,
      address.building,
      address.landmark,
      address.area,
      address.city,
      address.state,
    ]
      .filter((value): value is string => Boolean(value))
      .join(', ');

    if (address.pincode) {
      return baseAddress
        ? `${baseAddress} - ${address.pincode}`
        : address.pincode;
    }

    return baseAddress;
  }

  private getTokenConfig(): TokenConfig {
    const secret = this.configService.get<string>('jwt.secret');
    if (!secret) {
      throw new InternalServerErrorException('JWT_SECRET is not set');
    }

    return {
      secret,
      accessTokenExpiresIn: (this.configService.get<string>(
        'jwt.accessTokenExpiresIn',
      ) ?? '15m') as ExpiresInValue,
      refreshTokenExpiresIn: (this.configService.get<string>(
        'jwt.refreshTokenExpiresIn',
      ) ?? '30d') as ExpiresInValue,
      issuer: this.configService.get<string>('jwt.issuer'),
      audience: this.configService.get<string>('jwt.audience'),
    };
  }

  private toAuthInternalError(
    error: unknown,
    fallbackMessage: string,
  ): InternalServerErrorException {
    // Keep messages safe to show to clients while still being useful for debugging.
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return new InternalServerErrorException(
        'Database connection failed. Check DATABASE_URL and database availability.',
      );
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2021') {
        return new InternalServerErrorException(
          'Database schema is missing a required table. Run `npx prisma db push` (or migrations) against your database.',
        );
      }

      return new InternalServerErrorException(
        `Database request failed (${error.code}).`,
      );
    }

    if (error instanceof Prisma.PrismaClientUnknownRequestError) {
      return new InternalServerErrorException(
        'Database request failed (unknown Prisma error).',
      );
    }

    if (error instanceof Prisma.PrismaClientValidationError) {
      return new InternalServerErrorException(
        'Database query validation failed. Ensure Prisma schema matches the database.',
      );
    }

    return new InternalServerErrorException(fallbackMessage);
  }

  private verifyRefreshToken(
    refreshToken: string,
    tokenConfig: TokenConfig,
  ): JwtAuthPayload {
    let payload: JwtAuthPayload;

    try {
      payload = verify(refreshToken, tokenConfig.secret, {
        issuer: tokenConfig.issuer,
        audience: tokenConfig.audience,
      }) as JwtAuthPayload;
    } catch (error) {
      this.logAuthError('refresh_token_verification_failed', error);
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.typ !== 'refresh' || !payload.sub || !payload.jti) {
      throw new UnauthorizedException('Invalid refresh token payload');
    }

    return payload;
  }

  private getTokenExpiryDate(token: string): Date {
    const decoded = decode(token) as JwtPayload | null;
    if (!decoded?.exp || typeof decoded.exp !== 'number') {
      throw new InternalServerErrorException(
        'Unable to determine token expiry',
      );
    }

    return new Date(decoded.exp * 1000);
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private constantTimeEqual(a: string, b: string): boolean {
    const aBuffer = Buffer.from(a);
    const bBuffer = Buffer.from(b);

    if (aBuffer.length !== bBuffer.length) {
      return false;
    }

    return timingSafeEqual(aBuffer, bBuffer);
  }

  private async revokeAccessToken(payload: JwtAuthPayload): Promise<void> {
    const expiryDate = new Date(payload.exp * 1000);
    if (Number.isNaN(expiryDate.getTime())) {
      throw new UnauthorizedException('Invalid access token expiry');
    }

    await this.prisma.revokedToken.upsert({
      where: { jti: payload.jti },
      create: {
        jti: payload.jti,
        userId: payload.sub,
        expiresAt: expiryDate,
      },
      update: {
        expiresAt: expiryDate,
      },
    });
  }

  private logAuthError(
    event: string,
    error: unknown,
    metadata: Record<string, unknown> = {},
  ): void {
    const safePayload = {
      event,
      ...metadata,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : String(error),
    };

    this.logger.error(
      JSON.stringify(safePayload),
      error instanceof Error ? error.stack : undefined,
    );
  }
}
