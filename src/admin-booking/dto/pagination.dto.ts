import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';

export const ADMIN_BOOKING_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'COMPLETED',
  'CANCELLED_BY_ADMIN',
  'CANCELLED_BY_USER',
] as const;

export type AdminBookingStatus = (typeof ADMIN_BOOKING_STATUSES)[number];

export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page must be an integer value' })
  @Min(1, { message: 'page must be greater than 0' })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit must be an integer value' })
  @Min(1, { message: 'limit must be greater than 0' })
  limit?: number;

  @IsOptional()
  @IsIn(ADMIN_BOOKING_STATUSES, {
    message:
      'status must be one of PENDING, CONFIRMED, COMPLETED, CANCELLED_BY_ADMIN, CANCELLED_BY_USER',
  })
  status?: AdminBookingStatus;
}
