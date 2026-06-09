import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailQueueStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EnqueueEmailInput } from './email.types';

type ClaimedEmailQueueRow = {
  id: string;
  to_email: string;
  subject: string;
  text_body: string;
  html_body: string;
  attempts: number;
  max_attempts: number;
};

@Injectable()
export class EmailQueueService {
  private readonly logger = new Logger(EmailQueueService.name);
  private readonly maxSendsPerSecond: number;
  private readonly staleLockMinutes: number;
  private readonly retentionDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.maxSendsPerSecond = this.parsePositiveInt(
      this.configService.get<string>('AWS_SES_MAX_SENDS_PER_SECOND'),
      1,
    );
    this.staleLockMinutes = this.parsePositiveInt(
      this.configService.get<string>('EMAIL_QUEUE_STALE_LOCK_MINUTES'),
      5,
    );
    this.retentionDays = this.parsePositiveInt(
      this.configService.get<string>('EMAIL_QUEUE_RETENTION_DAYS'),
      14,
    );
  }

  get sendsPerTick(): number {
    return this.maxSendsPerSecond;
  }

  async enqueue(input: EnqueueEmailInput): Promise<void> {
    const toEmail = input.to.trim();
    if (!toEmail) {
      return;
    }

    try {
      await this.prisma.emailQueue.create({
        data: {
          idempotencyKey: input.idempotencyKey ?? null,
          toEmail,
          subject: input.subject,
          textBody: input.textBody,
          htmlBody: input.htmlBody,
          metadata: input.metadata as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        this.logger.debug(
          `email_queue_duplicate_skipped key="${input.idempotencyKey ?? 'none'}"`,
        );
        return;
      }

      this.logger.error(
        `email_queue_enqueue_failed to="${toEmail}"`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  async recoverStaleProcessingRows(): Promise<void> {
    const staleBefore = new Date(Date.now() - this.staleLockMinutes * 60_000);

    const result = await this.prisma.emailQueue.updateMany({
      where: {
        status: EmailQueueStatus.PROCESSING,
        lockedAt: {
          lt: staleBefore,
        },
      },
      data: {
        status: EmailQueueStatus.PENDING,
        lockedAt: null,
        lastError: 'Recovered stale processing lock',
      },
    });

    if (result.count > 0) {
      this.logger.warn(`email_queue_recovered_stale count=${result.count}`);
    }
  }

  async claimNextBatch(limit: number): Promise<ClaimedEmailQueueRow[]> {
    if (limit <= 0) {
      return [];
    }

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<ClaimedEmailQueueRow[]>`
        SELECT
          id,
          to_email,
          subject,
          text_body,
          html_body,
          attempts,
          max_attempts
        FROM email_queue
        WHERE status = 'PENDING'::"EmailQueueStatus"
          AND scheduled_at <= NOW()
        ORDER BY scheduled_at ASC, created_at ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      `;

      if (rows.length === 0) {
        return [];
      }

      const ids = rows.map((row) => row.id);

      await tx.emailQueue.updateMany({
        where: {
          id: { in: ids },
          status: EmailQueueStatus.PENDING,
        },
        data: {
          status: EmailQueueStatus.PROCESSING,
          lockedAt: new Date(),
          attempts: { increment: 1 },
        },
      });

      return rows.map((row) => ({
        ...row,
        attempts: row.attempts + 1,
      }));
    });
  }

  async markSent(id: string): Promise<void> {
    await this.prisma.emailQueue.update({
      where: { id },
      data: {
        status: EmailQueueStatus.SENT,
        sentAt: new Date(),
        lockedAt: null,
        lastError: null,
      },
    });
  }

  async markFailedOrRetry(
    row: ClaimedEmailQueueRow,
    errorMessage: string,
  ): Promise<void> {
    const attempts = row.attempts;
    const maxAttempts = row.max_attempts;

    if (attempts >= maxAttempts) {
      await this.prisma.emailQueue.update({
        where: { id: row.id },
        data: {
          status: EmailQueueStatus.FAILED,
          lockedAt: null,
          lastError: errorMessage,
        },
      });
      this.logger.error(
        `email_queue_permanently_failed id="${row.id}" attempts=${attempts}`,
      );
      return;
    }

    const retryDelaySeconds = Math.min(30 * attempts, 300);

    await this.prisma.emailQueue.update({
      where: { id: row.id },
      data: {
        status: EmailQueueStatus.PENDING,
        lockedAt: null,
        lastError: errorMessage,
        scheduledAt: new Date(Date.now() + retryDelaySeconds * 1000),
      },
    });
  }

  async purgeExpiredRows(): Promise<number> {
    const cutoff = new Date(Date.now() - this.retentionDays * 24 * 60 * 60 * 1000);

    const result = await this.prisma.emailQueue.deleteMany({
      where: {
        createdAt: {
          lt: cutoff,
        },
      },
    });

    if (result.count > 0) {
      this.logger.log(
        `email_queue_purged count=${result.count} retentionDays=${this.retentionDays}`,
      );
    }

    return result.count;
  }

  private parsePositiveInt(raw: string | undefined, fallback: number): number {
    const parsed = Number.parseInt(raw ?? '', 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return parsed;
  }
}
