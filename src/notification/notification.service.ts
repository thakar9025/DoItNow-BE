import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationDeliveryStatus,
  NotificationType,
} from '@prisma/client';
import admin from 'firebase-admin';
import {
  FirebaseAudience,
  getFirebaseAppName,
  initializeFirebaseAudience,
} from '../config/firebase.config';
import { PrismaService as AppPrismaService } from '../prisma/prisma.service';

type FirebaseSendResult = {
  successCount: number;
  failureCount: number;
  responses?: Array<{
    success: boolean;
    messageId?: string;
    error?: {
      code?: string;
      message?: string;
    };
  }>;
};

type CreateBookingStatusNotificationInput = {
  userId: string;
  bookingId: string;
  serviceName: string;
  status: string;
  title: string;
  message: string;
  rejectionReason?: string;
};

type NotificationPayload = {
  bookingId?: string;
  requestId?: string;
  status?: string;
  serviceName?: string;
  rejectionReason?: string | null;
};

type ListNotificationsResult = {
  message: string;
  data: Array<{
    id: string;
    type: NotificationType;
    title: string;
    message: string;
    bookingId: string | null;
    requestId: string | null;
    status: string | null;
    payload: unknown;
    isRead: boolean;
    readAt: string | null;
    createdAt: string;
  }>;
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    unreadCount: number;
  };
};

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: AppPrismaService,
  ) {
    this.ensureFirebaseInitialized('user');
    this.ensureFirebaseInitialized('admin');
  }

  async createBookingStatusNotification(
    input: CreateBookingStatusNotificationInput,
  ): Promise<void> {
    const [preference, deviceTokens, legacyUser] = await Promise.all([
      this.prisma.userNotificationPreference.findUnique({
        where: { userId: input.userId },
        select: { bookingPushEnabled: true },
      }),
      this.prisma.userDeviceToken.findMany({
        where: { userId: input.userId, isActive: true },
        select: { token: true },
      }),
      this.prisma.user.findUnique({
        where: { id: input.userId },
        select: { fcmToken: true },
      }),
    ]);

    const notification = await this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: NotificationType.BOOKING_STATUS_CHANGED,
        title: input.title,
        message: input.message,
        payload: {
          bookingId: input.bookingId,
          requestId: input.bookingId,
          status: input.status,
          serviceName: input.serviceName,
          rejectionReason: input.rejectionReason ?? null,
        },
      },
      select: { id: true },
    });

    const pushEnabled = preference?.bookingPushEnabled ?? true;
    if (!pushEnabled) {
      return;
    }

    const tokens = this.mergeTokens(
      legacyUser?.fcmToken ?? null,
      deviceTokens.map((token) => token.token),
    );

    if (tokens.length === 0) {
      return;
    }

    const data: Record<string, string> = {
      type: NotificationType.BOOKING_STATUS_CHANGED,
      notificationId: notification.id,
      bookingId: input.bookingId,
      requestId: input.bookingId,
      status: input.status,
      serviceName: input.serviceName,
    };

    if (input.rejectionReason?.trim()) {
      data.rejectionReason = input.rejectionReason.trim();
    }

    const sendResult = await this.sendPushNotification(
      tokens,
      input.title,
      input.message,
      data,
      'user',
    );

    await this.prisma.notificationDelivery.createMany({
      data: tokens.map((token) => ({
        notificationId: notification.id,
        channel: NotificationChannel.PUSH,
        recipient: token,
        status: sendResult.failedTokens.has(token)
          ? NotificationDeliveryStatus.FAILED
          : NotificationDeliveryStatus.SENT,
        error: sendResult.failedTokens.get(token) ?? null,
        sentAt: sendResult.failedTokens.has(token) ? null : new Date(),
      })),
    });

    await this.prisma.userDeviceToken.updateMany({
      where: {
        token: { in: Array.from(sendResult.invalidTokens) },
      },
      data: { isActive: false },
    });
  }

  async listUserNotifications(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<ListNotificationsResult> {
    const skip = (page - 1) * limit;
    const [total, unreadCount, notifications] = await Promise.all([
      this.prisma.notification.count({ where: { userId } }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      message: 'Notifications fetched successfully',
      data: notifications.map((item) => this.mapNotificationForApi(item)),
      meta: {
        total,
        page,
        limit,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
        unreadCount,
      },
    };
  }

  async markAsRead(userId: string, notificationId: string): Promise<{ message: string }> {
    if (!this.isValidNotificationId(notificationId)) {
      throw new NotFoundException('Notification not found');
    }

    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
      select: { id: true },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    await this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true, readAt: new Date() },
      select: { id: true },
    });

    return { message: 'Notification marked as read' };
  }

  async markAllAsRead(userId: string): Promise<{ message: string; data: { updatedCount: number } }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });

    return {
      message: 'All notifications marked as read',
      data: { updatedCount: result.count },
    };
  }

  async createBookingRequestedNotification(input: {
    userId: string;
    bookingId: string;
    serviceName: string;
    title: string;
    message: string;
  }): Promise<void> {
    await this.createBookingStatusNotification({
      userId: input.userId,
      bookingId: input.bookingId,
      serviceName: input.serviceName,
      status: 'PENDING',
      title: input.title,
      message: input.message,
    });
  }

  async getAdminPushTokens(): Promise<string[]> {
    const admins = await this.prisma.user.findMany({
      where: {
        role: { in: ['ADMIN', 'SUPER_ADMIN'] },
      },
      select: {
        fcmToken: true,
        deviceTokens: {
          where: { isActive: true },
          select: { token: true },
        },
      },
    });

    const tokens = new Set<string>();

    for (const admin of admins) {
      if (admin.fcmToken?.trim()) {
        tokens.add(admin.fcmToken.trim());
      }

      for (const deviceToken of admin.deviceTokens) {
        if (deviceToken.token?.trim()) {
          tokens.add(deviceToken.token.trim());
        }
      }
    }

    return Array.from(tokens);
  }

  async sendPushNotification(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, string>,
    audience: FirebaseAudience = 'user',
  ): Promise<{ invalidTokens: Set<string>; failedTokens: Map<string, string> }> {
    const filteredTokens = tokens.filter(
      (token): token is string => Boolean(token) && token.trim().length > 0,
    );

    if (filteredTokens.length === 0) {
      return { invalidTokens: new Set<string>(), failedTokens: new Map<string, string>() };
    }

    const messaging = this.getMessaging(audience) as unknown as {
      sendMulticast?: (payload: unknown) => Promise<unknown>;
      sendEachForMulticast?: (payload: unknown) => Promise<unknown>;
      send?: (payload: unknown) => Promise<unknown>;
    };

    if (!messaging) {
      this.logger.warn(
        `Firebase messaging is unavailable for audience "${audience}". Skipping push send.`,
      );
      return { invalidTokens: new Set<string>(), failedTokens: new Map<string, string>() };
    }

    const payload: Record<string, unknown> = {
      tokens: filteredTokens,
      notification: {
        title,
        body,
      },
      data,
      android: {
        priority: 'high',
        notification: {
          channelId: 'high_priority',
          sound: 'default',
        },
      },
      apns: {
        headers: {
          'apns-priority': '10',
        },
        payload: {
          aps: {
            alert: {
              title,
              body,
            },
            sound: 'default',
            badge: 1,
            'content-available': 1,
          },
        },
      },
      webpush: {
        headers: {
          Urgency: 'high',
        },
        notification: {
          title,
          body,
          requireInteraction: true,
        },
      },
    };

    let result: FirebaseSendResult | null = null;

    if (messaging.sendEachForMulticast) {
      result = (await messaging.sendEachForMulticast(payload)) as FirebaseSendResult;
    } else if (messaging.sendMulticast) {
      result = (await messaging.sendMulticast(payload)) as FirebaseSendResult;
    }

    if (!result) {
      return { invalidTokens: new Set<string>(), failedTokens: new Map<string, string>() };
    }

    const firstPass = this.logFirebaseResult(filteredTokens, result, title, audience);

    const retryCandidates = Array.from(firstPass.failedTokens.entries())
      .filter(([, error]) => error.includes('messaging/invalid-argument'))
      .map(([token]) => token);

    if (retryCandidates.length === 0) {
      return firstPass;
    }

    const retryResult = await this.retryWithMinimalPayload(
      retryCandidates,
      title,
      body,
      data,
      audience,
    );

    const mergedInvalidTokens = new Set<string>([
      ...firstPass.invalidTokens,
      ...retryResult.invalidTokens,
    ]);
    const mergedFailedTokens = new Map(firstPass.failedTokens);

    for (const retriedToken of retryCandidates) {
      mergedFailedTokens.delete(retriedToken);
    }
    for (const [token, error] of retryResult.failedTokens) {
      mergedFailedTokens.set(token, error);
    }

    return {
      invalidTokens: mergedInvalidTokens,
      failedTokens: mergedFailedTokens,
    };
  }

  private mapNotificationForApi(item: {
    id: string;
    type: NotificationType;
    title: string;
    message: string;
    payload: unknown;
    isRead: boolean;
    readAt: Date | null;
    createdAt: Date;
  }) {
    const payload = this.parseNotificationPayload(item.payload);
    const requestId = payload?.requestId ?? payload?.bookingId ?? null;

    return {
      id: item.id,
      type: item.type,
      title: item.title,
      message: item.message,
      bookingId: requestId,
      requestId,
      status: payload?.status ?? null,
      payload: item.payload,
      isRead: item.isRead,
      readAt: item.readAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
    };
  }

  private isValidNotificationId(notificationId: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      notificationId.trim(),
    );
  }

  private parseNotificationPayload(payload: unknown): NotificationPayload | null {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }

    const source = payload as Record<string, unknown>;
    const bookingId =
      typeof source.bookingId === 'string' ? source.bookingId : undefined;
    const requestId =
      typeof source.requestId === 'string'
        ? source.requestId
        : bookingId;

    return {
      bookingId,
      requestId,
      status: typeof source.status === 'string' ? source.status : undefined,
      serviceName:
        typeof source.serviceName === 'string' ? source.serviceName : undefined,
      rejectionReason:
        typeof source.rejectionReason === 'string'
          ? source.rejectionReason
          : source.rejectionReason === null
            ? null
            : undefined,
    };
  }

  private ensureFirebaseInitialized(audience: FirebaseAudience): void {
    initializeFirebaseAudience(audience);
  }

  private logFirebaseResult(
    tokens: string[],
    result: FirebaseSendResult,
    title: string,
    audience: FirebaseAudience,
  ): { invalidTokens: Set<string>; failedTokens: Map<string, string> } {
    const successCount = result?.successCount ?? 0;
    const failureCount = result?.failureCount ?? 0;
    const invalidTokens = new Set<string>();
    const failedTokens = new Map<string, string>();

    this.logger.log(
      `push_result audience="${audience}" title="${title}" total=${tokens.length} success=${successCount} failure=${failureCount}`,
    );

    if (!result.responses || result.responses.length === 0) {
      return { invalidTokens, failedTokens };
    }

    result.responses.forEach((response, index) => {
      if (response.success) {
        return;
      }

      const token = tokens[index] ?? 'unknown_token';
      const errorCode = response.error?.code ?? 'unknown_error_code';
      const errorMessage = response.error?.message ?? 'unknown_error_message';
      const combinedError = `${errorCode}: ${errorMessage}`;
      failedTokens.set(token, combinedError);

      if (
        errorCode.includes('registration-token-not-registered') ||
        errorCode.includes('invalid-registration-token')
      ) {
        invalidTokens.add(token);
      }

      this.logger.warn(
        `push_failure token="${token}" code="${errorCode}" message="${errorMessage}"`,
      );
    });

    return { invalidTokens, failedTokens };
  }

  private mergeTokens(legacyToken: string | null, deviceTokens: string[]): string[] {
    const uniqueTokens = new Set<string>();

    if (legacyToken?.trim()) {
      uniqueTokens.add(legacyToken.trim());
    }

    for (const token of deviceTokens) {
      const normalizedToken = token?.trim();
      if (normalizedToken) {
        uniqueTokens.add(normalizedToken);
      }
    }

    return Array.from(uniqueTokens);
  }

  private async retryWithMinimalPayload(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, string>,
    audience: FirebaseAudience = 'user',
  ): Promise<{ invalidTokens: Set<string>; failedTokens: Map<string, string> }> {
    const messaging = this.getMessaging(audience);
    const invalidTokens = new Set<string>();
    const failedTokens = new Map<string, string>();
    let successCount = 0;

    if (!messaging) {
      this.logger.warn(
        `Firebase retry messaging is unavailable for audience "${audience}".`,
      );
      return { invalidTokens, failedTokens };
    }

    for (const token of tokens) {
      try {
        await messaging.send({
          token,
          notification: { title, body },
          data,
        });
        successCount += 1;
      } catch (error) {
        const firebaseError = error as { code?: string; message?: string };
        const errorCode = firebaseError.code ?? 'unknown_error_code';
        const errorMessage = firebaseError.message ?? 'unknown_error_message';
        const combinedError = `${errorCode}: ${errorMessage}`;
        failedTokens.set(token, combinedError);

        if (
          errorCode.includes('registration-token-not-registered') ||
          errorCode.includes('invalid-registration-token')
        ) {
          invalidTokens.add(token);
        }

        this.logger.warn(
          `push_retry_failure token="${token}" code="${errorCode}" message="${errorMessage}"`,
        );
      }
    }

    this.logger.log(
      `push_retry_result audience="${audience}" total=${tokens.length} success=${successCount} failure=${failedTokens.size}`,
    );

    return { invalidTokens, failedTokens };
  }

  private getMessaging(audience: FirebaseAudience) {
    this.ensureFirebaseInitialized(audience);
    const appName = getFirebaseAppName(audience);
    const app = admin.apps.find((candidate) => candidate?.name === appName);

    if (!app) {
      return null;
    }

    return app.messaging();
  }
}
