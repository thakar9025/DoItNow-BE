import { IsNotEmpty, IsString } from 'class-validator';

export class RejectBookingDto {
  @IsString()
  @IsNotEmpty({ message: 'reason is required' })
  reason!: string;
}
