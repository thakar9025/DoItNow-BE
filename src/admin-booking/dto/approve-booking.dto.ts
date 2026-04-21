import { IsNotEmpty, IsString } from 'class-validator';

export class ApproveBookingDto {
  @IsString()
  @IsNotEmpty({ message: 'partnerId is required' })
  partnerId!: string;
}
