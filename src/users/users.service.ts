import { Injectable, Logger } from '@nestjs/common';
import { BookingStatus, DevicePlatform, Prisma, User } from '@prisma/client';
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

  async getProfileSummary(userId: string): Promise<{
    message: string;
    data: {
      completedCount: number;
      pendingCount: number;
      rating: number | null;
      totalRequests: number;
    };
  }> {
    const [completedCount, pendingCount, totalRequests, ratingAggregate] =
      await Promise.all([
        this.prisma.booking.count({
          where: {
            userId,
            status: BookingStatus.COMPLETED,
          },
        }),
        this.prisma.booking.count({
          where: {
            userId,
            status: {
              in: [BookingStatus.PENDING, BookingStatus.CONFIRMED],
            },
          },
        }),
        this.prisma.booking.count({
          where: { userId },
        }),
        this.prisma.booking.aggregate({
          where: {
            userId,
            status: BookingStatus.COMPLETED,
            customerRating: { not: null },
          },
          _avg: {
            customerRating: true,
          },
        }),
      ]);

    const averageRating = ratingAggregate._avg.customerRating;
    const rating =
      typeof averageRating === 'number' && Number.isFinite(averageRating)
        ? Math.round(averageRating * 10) / 10
        : null;

    return {
      message: 'Profile summary fetched successfully',
      data: {
        completedCount,
        pendingCount,
        rating,
        totalRequests,
      },
    };
  }

  async saveFcmToken(
    userId: string,
    fcmToken: string,
    platform?: DevicePlatform,
  ): Promise<void> {
    const normalizedToken = fcmToken.trim();

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { fcmToken: normalizedToken } as Prisma.UserUncheckedUpdateInput,
        select: { id: true },
      }),
      this.prisma.userDeviceToken.upsert({
        where: { token: normalizedToken },
        update: {
          userId,
          platform: platform ?? DevicePlatform.UNKNOWN,
          isActive: true,
          lastSeenAt: new Date(),
        },
        create: {
          userId,
          token: normalizedToken,
          platform: platform ?? DevicePlatform.UNKNOWN,
          isActive: true,
          lastSeenAt: new Date(),
        },
      }),
    ]);
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
