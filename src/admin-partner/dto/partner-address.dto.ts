import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class PartnerAddressDto {
  @IsString()
  @IsNotEmpty({ message: 'address.label is required' })
  label!: string;

  @IsString()
  @IsNotEmpty({ message: 'address.fullAddress is required' })
  fullAddress!: string;

  @IsOptional()
  @IsString()
  addressType?: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{10}$/, {
    message: 'address.phone must be a valid 10-digit number',
  })
  phone?: string;

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
  @IsNotEmpty({ message: 'address.city is required' })
  city!: string;

  @IsString()
  @IsNotEmpty({ message: 'address.state is required' })
  state!: string;

  @IsString()
  @IsNotEmpty({ message: 'address.pincode is required' })
  pincode!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'address.latitude must be a valid number' })
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'address.longitude must be a valid number' })
  longitude?: number;

  @IsOptional()
  @IsBoolean({ message: 'address.isDefault must be a boolean value' })
  isDefault?: boolean;
}

export class UpdatePartnerAddressDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  fullAddress?: string;

  @IsOptional()
  @IsString()
  addressType?: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{10}$/, {
    message: 'address.phone must be a valid 10-digit number',
  })
  phone?: string;

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

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  pincode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'address.latitude must be a valid number' })
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'address.longitude must be a valid number' })
  longitude?: number;

  @IsOptional()
  @IsBoolean({ message: 'address.isDefault must be a boolean value' })
  isDefault?: boolean;
}
