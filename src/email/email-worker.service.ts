import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailQueueService } from './email-queue.service';
import { EmailService } from './email.service';

@Injectable()
export class EmailWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailWorkerService.name);
  private readonly enabled: boolean;
  private intervalRef: NodeJS.Timeout | null = null;
  private isTickInProgress = false;
  private lastPurgeAt = 0;

  constructor(
    private readonly configService: ConfigService,
    private readonly emailQueueService: EmailQueueService,
    private readonly emailService: EmailService,
  ) {
    this.enabled = this.configService.get<string>('AWS_SES_ENABLED') === 'true';
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log('Email worker disabled because AWS_SES_ENABLED is not true.');
      return;
    }

    if (!this.emailService.isDeliveryConfigured) {
      this.logger.warn(
        'Email worker disabled because SES delivery is not configured.',
      );
      return;
    }

    const pollIntervalMs = this.parsePositiveInt(
      this.configService.get<string>('EMAIL_QUEUE_POLL_INTERVAL_MS'),
      1000,
    );

    this.intervalRef = setInterval(() => {
      void this.tick();
    }, pollIntervalMs);

    this.logger.log(
      `Email worker started intervalMs=${pollIntervalMs} sendsPerTick=${this.emailQueueService.sendsPerTick}`,
    );

    void this.tick();
  }

  onModuleDestroy(): void {
    if (this.intervalRef) {
      clearInterval(this.intervalRef);
      this.intervalRef = null;
    }
  }

  private async tick(): Promise<void> {
    if (this.isTickInProgress) {
      return;
    }

    this.isTickInProgress = true;

    try {
      await this.emailQueueService.recoverStaleProcessingRows();

      const batch = await this.emailQueueService.claimNextBatch(
        this.emailQueueService.sendsPerTick,
      );

      for (const row of batch) {
        try {
          await this.emailService.deliverEmail({
            to: row.to_email,
            subject: row.subject,
            textBody: row.text_body,
            htmlBody: row.html_body,
          });
          await this.emailQueueService.markSent(row.id);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Unknown email delivery error';
          await this.emailQueueService.markFailedOrRetry(row, message);
          this.logger.error(
            `email_queue_delivery_failed id="${row.id}"`,
            error instanceof Error ? error.stack : undefined,
          );
        }
      }

      await this.maybePurgeExpiredRows();
    } catch (error) {
      this.logger.error(
        'email_worker_tick_failed',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.isTickInProgress = false;
    }
  }

  private async maybePurgeExpiredRows(): Promise<void> {
    const now = Date.now();
    const purgeIntervalMs = 60 * 60 * 1000;

    if (now - this.lastPurgeAt < purgeIntervalMs) {
      return;
    }

    this.lastPurgeAt = now;
    await this.emailQueueService.purgeExpiredRows();
  }

  private parsePositiveInt(raw: string | undefined, fallback: number): number {
    const parsed = Number.parseInt(raw ?? '', 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return parsed;
  }
}
