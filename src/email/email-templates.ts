import { BookingEmailEvent, EmailContent, SendBookingEmailInput } from './email.types';

export function buildBookingEmailContent(
  input: SendBookingEmailInput,
  userName: string,
): EmailContent {
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

export function buildBookingEmailIdempotencyKey(
  bookingId: string,
  event: BookingEmailEvent,
): string {
  return `booking:${bookingId}:${event}`;
}
