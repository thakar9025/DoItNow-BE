import { DevicePlatform } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SaveFcmTokenDto {
  @IsString()
  @IsNotEmpty({ message: 'fcmToken is required' })
  fcmToken!: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsEnum(DevicePlatform, {
    message: 'platform must be one of ANDROID, IOS, WEB, UNKNOWN',
  })
  platform?: DevicePlatform;
}
