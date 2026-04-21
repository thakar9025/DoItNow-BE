import { Injectable, Logger } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type GoogleProfile = {
  googleId: string;
  email: string;
  name?: string;
  picture?: string;
};

const GOOGLE_PROVIDER = 'google';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async saveFcmToken(userId: string, fcmToken: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { fcmToken } as Prisma.UserUncheckedUpdateInput,
      select: { id: true },
    });
  }

  async findOrCreateByGoogleProfile(profile: GoogleProfile): Promise<User> {
    try {
      const existingProvider = await this.prisma.authProvider.findUnique({
        where: {
          provider_providerUserId: {
            provider: GOOGLE_PROVIDER,
            providerUserId: profile.googleId,
          },
        },
        include: { user: true },
      });

      if (existingProvider) {
        await this.prisma.authProvider.update({
          where: { id: existingProvider.id },
          data: {
            providerEmail: profile.email,
            providerAvatarUrl: profile.picture,
          },
        });

        return existingProvider.user;
      }

      let user = await this.prisma.user.findFirst({
        where: {
          email: { equals: profile.email, mode: 'insensitive' },
        },
      });

      if (!user) {
        try {
          user = await this.prisma.user.create({
            data: {
              email: profile.email,
              fullName: profile.name,
              avatarUrl: profile.picture,
            },
          });
        } catch (error) {
          if (this.isUniqueConstraintError(error)) {
            user = await this.prisma.user.findFirst({
              where: {
                email: { equals: profile.email, mode: 'insensitive' },
              },
            });
          } else {
            throw error;
          }
        }
      }

      if (!user) {
        throw new Error('Unable to resolve user for Google sign-in');
      }

      try {
        await this.prisma.authProvider.create({
          data: {
            provider: GOOGLE_PROVIDER,
            providerUserId: profile.googleId,
            providerEmail: profile.email,
            providerAvatarUrl: profile.picture,
            userId: user.id,
          },
        });
      } catch (error) {
        if (!this.isUniqueConstraintError(error)) {
          throw error;
        }
      }

      const finalProvider = await this.prisma.authProvider.findUnique({
        where: {
          provider_providerUserId: {
            provider: GOOGLE_PROVIDER,
            providerUserId: profile.googleId,
          },
        },
        include: { user: true },
      });

      if (!finalProvider) {
        throw new Error('Unable to link Google provider to user');
      }

      return finalProvider.user;
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'find_or_create_google_profile_failed',
          googleSub: profile.googleId,
          prismaCode:
            error instanceof Prisma.PrismaClientKnownRequestError
              ? error.code
              : undefined,
          errorName: error instanceof Error ? error.name : 'UnknownError',
          errorMessage:
            error instanceof Error ? error.message : String(error),
        }),
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
