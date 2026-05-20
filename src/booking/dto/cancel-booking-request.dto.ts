import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelBookingRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'reason must not exceed 500 characters' })
  reason?: string;
}
