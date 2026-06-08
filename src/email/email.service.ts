import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

type BookingEmailEvent =
  | 'BOOKING_REQUESTED'
  | 'PARTNER_ASSIGNED'
  | 'BOOKING_COMPLETED'
  | 'BOOKING_CANCELLED';

type SendBookingEmailInput = {
  to: string;
  userName?: string | null;
  serviceName: string;
  bookingId: string;
  event: BookingEmailEvent;
  partnerName?: string | null;
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly sesClient: SESClient | null;
  private readonly fromEmail: string | null;
  private readonly enabled: boolean;

  constructor(private readonly configService: ConfigService) {
    const region = this.configService.get<string>('AWS_SES_REGION');
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');
    this.fromEmail = this.configService.get<string>('AWS_SES_FROM_EMAIL') ?? null;
    this.enabled = this.configService.get<string>('AWS_SES_ENABLED') === 'true';

    if (this.enabled && region && accessKeyId && secretAccessKey && this.fromEmail) {
      this.sesClient = new SESClient({
        region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
      return;
    }

    this.sesClient = null;
    if (this.enabled) {
      this.logger.warn(
        'AWS SES is enabled but credentials or from-email are missing. Email sending is disabled.',
      );
    }
  }

  async sendBookingEmail(input: SendBookingEmailInput): Promise<void> {
    if (!this.enabled || !this.sesClient || !this.fromEmail) {
      return;
    }

    const recipient = input.to.trim();
    if (!recipient) {
      return;
    }

    const userName = input.userName?.trim() || 'there';
    const content = this.buildBookingEmailContent(input, userName);

    try {
      await this.sesClient.send(
        new SendEmailCommand({
          Source: this.fromEmail,
          Destination: {
            ToAddresses: [recipient],
          },
          Message: {
            Subject: {
              Data: content.subject,
              Charset: 'UTF-8',
            },
            Body: {
              Html: {
                Data: content.html,
                Charset: 'UTF-8',
              },
              Text: {
                Data: content.text,
                Charset: 'UTF-8',
              },
            },
          },
        }),
      );
    } catch (error) {
      this.logger.error(
        `booking_email_failed event="${input.event}" bookingId="${input.bookingId}"`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private buildBookingEmailContent(
    input: SendBookingEmailInput,
    userName: string,
  ): { subject: string; html: string; text: string } {
    switch (input.event) {
      case 'BOOKING_REQUESTED':
        return {
          subject: `DoItNow: ${input.serviceName} request received`,
          text: `Hi ${userName},\n\nWe received your ${input.serviceName} request. Our team will review it shortly.\n\nRequest ID: ${input.bookingId}\n\nThank you,\nDoItNow Support`,
          html: `<p>Hi ${userName},</p><p>We received your <strong>${input.serviceName}</strong> request. Our team will review it shortly.</p><p><strong>Request ID:</strong> ${input.bookingId}</p><p>Thank you,<br/>DoItNow Support</p>`,
        };
      case 'PARTNER_ASSIGNED':
        return {
          subject: `DoItNow: Partner assigned for ${input.serviceName}`,
          text: `Hi ${userName},\n\nA service partner has been assigned to your ${input.serviceName} request${input.partnerName ? ` (${input.partnerName})` : ''}.\n\nRequest ID: ${input.bookingId}\n\nThank you,\nDoItNow Support`,
          html: `<p>Hi ${userName},</p><p>A service partner has been assigned to your <strong>${input.serviceName}</strong> request${input.partnerName ? ` (<strong>${input.partnerName}</strong>)` : ''}.</p><p><strong>Request ID:</strong> ${input.bookingId}</p><p>Thank you,<br/>DoItNow Support</p>`,
        };
      case 'BOOKING_COMPLETED':
        return {
          subject: `DoItNow: ${input.serviceName} completed`,
          text: `Hi ${userName},\n\nYour ${input.serviceName} request has been marked as completed.\n\nRequest ID: ${input.bookingId}\n\nThank you for using DoItNow.`,
          html: `<p>Hi ${userName},</p><p>Your <strong>${input.serviceName}</strong> request has been marked as completed.</p><p><strong>Request ID:</strong> ${input.bookingId}</p><p>Thank you for using DoItNow.</p>`,
        };
      case 'BOOKING_CANCELLED':
        return {
          subject: `DoItNow: ${input.serviceName} request cancelled`,
          text: `Hi ${userName},\n\nYour ${input.serviceName} request has been cancelled.\n\nRequest ID: ${input.bookingId}\n\nThank you,\nDoItNow Support`,
          html: `<p>Hi ${userName},</p><p>Your <strong>${input.serviceName}</strong> request has been cancelled.</p><p><strong>Request ID:</strong> ${input.bookingId}</p><p>Thank you,<br/>DoItNow Support</p>`,
        };
      default:
        return {
          subject: 'DoItNow booking update',
          text: `Hi ${userName},\n\nYour booking was updated.\n\nRequest ID: ${input.bookingId}`,
          html: `<p>Hi ${userName},</p><p>Your booking was updated.</p><p><strong>Request ID:</strong> ${input.bookingId}</p>`,
        };
    }
  }
}
