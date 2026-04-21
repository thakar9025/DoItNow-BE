import { ForbiddenException } from '@nestjs/common';
import { User } from '@prisma/client';
import { AuthService } from './auth.service';

type Role = 'USER' | 'ADMIN' | 'SUPER_ADMIN';

describe('AuthService admin login', () => {
  let service: AuthService;
  let verifyIdTokenMock: jest.Mock;

  const usersService = {
    findById: jest.fn(),
    findOrCreateByGoogleProfile: jest.fn(),
  };

  const configValues: Record<string, string | undefined> = {
    'google.webClientId': 'google-web-client-id',
    'google.androidClientId': 'google-android-client-id',
    'google.clientId': undefined,
    'google.adminWebClientId': 'google-admin-web-client-id',
    'google.adminAndroidClientId': 'google-admin-android-client-id',
    'google.adminClientId': undefined,
    'jwt.secret': 'test-jwt-secret',
    'jwt.accessTokenExpiresIn': '15m',
    'jwt.refreshTokenExpiresIn': '30d',
    'jwt.issuer': 'test-issuer',
    'jwt.audience': 'test-audience',
  };

  const configService = {
    get: jest.fn((key: string) => configValues[key]),
  };

  const prisma = {
    userSession: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      upsert: jest.fn(),
    },
    revokedToken: {
      upsert: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(
      usersService as never,
      configService as never,
      prisma as never,
    );

    verifyIdTokenMock = jest.fn().mockResolvedValue({
      getPayload: () => ({
        sub: 'google-sub-id',
        email: 'admin@example.com',
        name: 'Test User',
        picture: 'https://example.com/avatar.png',
        email_verified: true,
      }),
    });

    (service as unknown as { googleClient: unknown }).googleClient = {
      verifyIdToken: verifyIdTokenMock,
    };
  });

  it('allows ADMIN login via admin auth and issues tokens', async () => {
    usersService.findOrCreateByGoogleProfile.mockResolvedValue(
      buildUser('ADMIN'),
    );
    prisma.user.findUnique.mockResolvedValue(buildUserWithAddresses('ADMIN'));
    prisma.userSession.upsert.mockResolvedValue({});

    const response = await service.loginAdminWithGoogle('google-id-token');

    expect(response.user.role).toBe('ADMIN');
    expect(response.accessToken).toBeDefined();
    expect(response.refreshToken).toBeDefined();
    expect(response.tokenType).toBe('Bearer');
    expect(prisma.userSession.upsert).toHaveBeenCalledTimes(1);
    expect(verifyIdTokenMock).toHaveBeenCalledWith({
      idToken: 'google-id-token',
      audience: [
        'google-admin-web-client-id',
        'google-admin-android-client-id',
      ],
    });
  });

  it('allows SUPER_ADMIN login via admin auth and issues tokens', async () => {
    usersService.findOrCreateByGoogleProfile.mockResolvedValue(
      buildUser('SUPER_ADMIN'),
    );
    prisma.user.findUnique.mockResolvedValue(
      buildUserWithAddresses('SUPER_ADMIN'),
    );
    prisma.userSession.upsert.mockResolvedValue({});

    const response = await service.loginAdminWithGoogle('google-id-token');

    expect(response.user.role).toBe('SUPER_ADMIN');
    expect(response.accessToken).toBeDefined();
    expect(response.refreshToken).toBeDefined();
    expect(prisma.userSession.upsert).toHaveBeenCalledTimes(1);
    expect(verifyIdTokenMock).toHaveBeenCalledWith({
      idToken: 'google-id-token',
      audience: [
        'google-admin-web-client-id',
        'google-admin-android-client-id',
      ],
    });
  });

  it('rejects USER login via admin auth with 403 forbidden', async () => {
    usersService.findOrCreateByGoogleProfile.mockResolvedValue(
      buildUser('USER'),
    );

    try {
      await service.loginAdminWithGoogle('google-id-token');
      fail('Expected ForbiddenException');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toEqual({
        message: 'Only admin or super admin can access admin panel',
      });
    }

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.userSession.upsert).not.toHaveBeenCalled();
  });

  it('keeps existing user auth behavior unchanged for USER role', async () => {
    usersService.findOrCreateByGoogleProfile.mockResolvedValue(
      buildUser('USER'),
    );
    prisma.user.findUnique.mockResolvedValue(buildUserWithAddresses('USER'));
    prisma.userSession.upsert.mockResolvedValue({});

    const response = await service.loginWithGoogle('google-id-token');

    expect(response.user.role).toBe('USER');
    expect(response.accessToken).toBeDefined();
    expect(response.refreshToken).toBeDefined();
    expect(prisma.userSession.upsert).toHaveBeenCalledTimes(1);
    expect(verifyIdTokenMock).toHaveBeenCalledWith({
      idToken: 'google-id-token',
      audience: ['google-web-client-id', 'google-android-client-id'],
    });
  });
});

function buildUser(role: Role): User {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: 'user-id-1',
    email: 'admin@example.com',
    phone: null,
    fullName: 'Test User',
    avatarUrl: 'https://example.com/avatar.png',
    role,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}

function buildUserWithAddresses(role: Role) {
  const user = buildUser(role);
  return {
    ...user,
    addresses: [],
  };
}
