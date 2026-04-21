import { IsNotEmpty, IsString } from 'class-validator';

export class SaveFcmTokenDto {
  @IsString()
  @IsNotEmpty({ message: 'fcmToken is required' })
  fcmToken!: string;
}
