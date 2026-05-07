import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';

export const BOOKING_REQUEST_FILTERS = [
  'all',
  'pending',
  'approved',
  'completed',
] as const;

export type BookingRequestFilter = (typeof BOOKING_REQUEST_FILTERS)[number];

export class ListBookingRequestsDto {
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
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsIn(BOOKING_REQUEST_FILTERS, {
    message: 'filter must be one of all, pending, approved, completed',
  })
  filter?: BookingRequestFilter;
}
