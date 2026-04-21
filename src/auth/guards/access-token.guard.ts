import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verify } from 'jsonwebtoken';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedRequest } from '../types/authenticated-request';
import { JwtAuthPayload } from '../types/jwt-auth-payload';

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException('Missing Bearer token');
    }

    const jwtSecret = this.configService.get<string>('jwt.secret');
    if (!jwtSecret) {
      throw new InternalServerErrorException('JWT_SECRET is not set');
    }

    let payload: JwtAuthPayload;
    try {
      payload = verify(token, jwtSecret, {
        issuer: this.configService.get<string>('jwt.issuer'),
        audience: this.configService.get<string>('jwt.audience'),
      }) as JwtAuthPayload;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    if (payload.typ !== 'access' || !payload.sub || !payload.jti) {
      throw new UnauthorizedException('Invalid access token payload');
    }

    const revoked = await this.prisma.revokedToken.findUnique({
      where: { jti: payload.jti },
      select: { id: true },
    });
    if (revoked) {
      throw new UnauthorizedException('Access token has been revoked');
    }

    request.auth = {
      token,
      payload,
    };

    return true;
  }

  private extractBearerToken(request: AuthenticatedRequest): string | null {
    const header = request.headers.authorization;
    if (!header) return null;
    const [type, token] = header.split(' ');
    if (type !== 'Bearer' || !token) return null;
    return token;
  }
}
