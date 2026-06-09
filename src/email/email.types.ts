export type BookingEmailEvent =
  | 'BOOKING_REQUESTED'
  | 'PARTNER_ASSIGNED'
  | 'BOOKING_COMPLETED'
  | 'BOOKING_CANCELLED';

export type SendBookingEmailInput = {
  to: string;
  userName?: string | null;
  serviceName: string;
  bookingId: string;
  event: BookingEmailEvent;
  partnerName?: string | null;
};

export type EmailContent = {
  subject: string;
  html: string;
  text: string;
};

export type EnqueueEmailInput = {
  to: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
};

export type DeliverEmailInput = {
  to: string;
  subject: string;
  textBody: string;
  htmlBody: string;
};
