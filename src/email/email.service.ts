import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import {
  buildBookingEmailContent,
  buildBookingEmailIdempotencyKey,
} from './email-templates';
import { EmailQueueService } from './email-queue.service';
import { DeliverEmailInput, SendBookingEmailInput } from './email.types';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly sesClient: SESClient | null;
  private readonly fromEmail: string | null;
  private readonly enabled: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly emailQueueService: EmailQueueService,
  ) {
    const region = this.configService.get<string>('AWS_SES_REGION');
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');
    this.fromEmail = this.configService.get<string>('AWS_SES_FROM_EMAIL') ?? null;
    this.enabled = this.configService.get<string>('AWS_SES_ENABLED') === 'true';

    if (!this.enabled || !region || !this.fromEmail) {
      this.sesClient = null;
      if (this.enabled) {
        this.logger.warn(
          'AWS SES is enabled but region or from-email is missing. Email sending is disabled.',
        );
      }
      return;
    }

    this.sesClient = new SESClient({
      region,
      ...(accessKeyId && secretAccessKey
        ? {
            credentials: {
              accessKeyId,
              secretAccessKey,
            },
          }
        : {}),
    });

    if (!accessKeyId || !secretAccessKey) {
      this.logger.log(
        'AWS SES using default credential provider (IAM role or local AWS profile).',
      );
    }
  }

  get isDeliveryConfigured(): boolean {
    return this.enabled && Boolean(this.sesClient) && Boolean(this.fromEmail);
  }

  async sendBookingEmail(input: SendBookingEmailInput): Promise<void> {
    if (!this.enabled) {
      return;
    }

    const recipient = input.to.trim();
    if (!recipient) {
      return;
    }

    const userName = input.userName?.trim() || 'there';
    const content = buildBookingEmailContent(input, userName);

    try {
      await this.emailQueueService.enqueue({
        to: recipient,
        subject: content.subject,
        textBody: content.text,
        htmlBody: content.html,
        idempotencyKey: buildBookingEmailIdempotencyKey(
          input.bookingId,
          input.event,
        ),
        metadata: {
          type: 'BOOKING',
          bookingId: input.bookingId,
          event: input.event,
          serviceName: input.serviceName,
        },
      });
    } catch (error) {
      this.logger.error(
        `booking_email_enqueue_failed event="${input.event}" bookingId="${input.bookingId}"`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  async deliverEmail(input: DeliverEmailInput): Promise<void> {
    if (!this.sesClient || !this.fromEmail) {
      throw new Error('SES delivery is not configured');
    }

    const recipient = input.to.trim();
    if (!recipient) {
      throw new Error('Recipient email is required');
    }

    await this.sesClient.send(
      new SendEmailCommand({
        Source: this.fromEmail,
        Destination: {
          ToAddresses: [recipient],
        },
        Message: {
          Subject: {
            Data: input.subject,
            Charset: 'UTF-8',
          },
          Body: {
            Html: {
              Data: input.htmlBody,
              Charset: 'UTF-8',
            },
            Text: {
              Data: input.textBody,
              Charset: 'UTF-8',
            },
          },
        },
      }),
    );
  }
}
