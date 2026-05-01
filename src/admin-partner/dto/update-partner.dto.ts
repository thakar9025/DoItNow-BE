import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import { UpdatePartnerAddressDto } from './partner-address.dto';

export class UpdatePartnerDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{10}$/, {
    message: 'phone must be a valid 10-digit number',
  })
  phone?: string;

  @IsOptional()
  @IsEmail({}, { message: 'email must be a valid email' })
  email?: string;

  @IsOptional()
  @IsBoolean({ message: 'isActive must be a boolean value' })
  isActive?: boolean;

  @IsOptional()
  @IsArray({ message: 'serviceIds must be an array' })
  @ArrayUnique({ message: 'serviceIds must not contain duplicates' })
  @IsString({ each: true, message: 'each serviceId must be a string' })
  serviceIds?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdatePartnerAddressDto)
  address?: UpdatePartnerAddressDto;
}
