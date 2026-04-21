import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class CreateAddressDto {
  @IsString()
  @IsNotEmpty({ message: 'label is required' })
  label!: string;

  @IsOptional()
  @IsString()
  addressType?: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  // Frontend alias; we store this into `contactName`.
  // Keeping this avoids 400s from ValidationPipe(forbidNonWhitelisted: true)
  // when clients send `displayName`.
  @IsOptional()
  @IsString()
  displayName?: string;

  @IsString()
  @IsNotEmpty({ message: 'phone is required' })
  @Matches(/^[0-9]{10}$/, {
    message: 'phone must be a valid 10-digit number',
  })
  phone!: string;

  @IsOptional()
  @IsString()
  houseNumber?: string;

  @IsOptional()
  @IsString()
  building?: string;

  @IsOptional()
  @IsString()
  landmark?: string;

  @IsOptional()
  @IsString()
  area?: string;

  @IsString()
  @IsNotEmpty({ message: 'city is required' })
  city!: string;

  @IsString()
  @IsNotEmpty({ message: 'state is required' })
  state!: string;

  @IsString()
  @IsNotEmpty({ message: 'pincode is required' })
  pincode!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'latitude must be a valid number' })
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'longitude must be a valid number' })
  longitude?: number;

  @IsOptional()
  @IsBoolean({ message: 'isDefault must be a boolean value' })
  isDefault?: boolean;
}
