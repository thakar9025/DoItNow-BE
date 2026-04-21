import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import admin from 'firebase-admin';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly configService: ConfigService) {
    this.ensureFirebaseInitialized();
  }

  async sendPushNotification(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    const filteredTokens = tokens.filter(
      (token): token is string => Boolean(token) && token.trim().length > 0,
    );

    if (filteredTokens.length === 0) {
      return;
    }

    const messaging = admin.messaging() as unknown as {
      sendMulticast?: (payload: unknown) => Promise<unknown>;
      sendEachForMulticast?: (payload: unknown) => Promise<unknown>;
    };

    const payload = {
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
          priority: 'high',
          sound: 'default',
          vibrateTimings: ['0.5s', '0.5s'],
          defaultVibrateTimings: true,
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
      },
    };

    if (messaging.sendMulticast) {
      await messaging.sendMulticast(payload);
      return;
    }

    if (messaging.sendEachForMulticast) {
      await messaging.sendEachForMulticast(payload);
    }
  }

  private ensureFirebaseInitialized(): void {
    if (admin.apps.length > 0) {
      return;
    }

    const projectId =
      this.configService.get<string>('FIREBASE_PROJECT_ID') ??
      process.env.FIREBASE_PROJECT_ID;
    const clientEmail =
      this.configService.get<string>('FIREBASE_CLIENT_EMAIL') ??
      process.env.FIREBASE_CLIENT_EMAIL;
    const privateKeyRaw =
      this.configService.get<string>('FIREBASE_PRIVATE_KEY') ??
      process.env.FIREBASE_PRIVATE_KEY;

    if (!projectId || !clientEmail || !privateKeyRaw) {
      this.logger.warn(
        'Firebase credentials are not fully set. Push notifications will be skipped.',
      );
      return;
    }

    const privateKey = privateKeyRaw.replace(/\\n/g, '\n');

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }
}
