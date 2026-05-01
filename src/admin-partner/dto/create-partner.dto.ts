import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import { PartnerAddressDto } from './partner-address.dto';

export class CreatePartnerDto {
  @IsString()
  @IsNotEmpty({ message: 'fullName is required' })
  fullName!: string;

  @IsString()
  @IsNotEmpty({ message: 'phone is required' })
  @Matches(/^[0-9]{10}$/, {
    message: 'phone must be a valid 10-digit number',
  })
  phone!: string;

  @IsOptional()
  @IsEmail({}, { message: 'email must be a valid email' })
  email?: string;

  @IsArray({ message: 'serviceIds must be an array' })
  @ArrayUnique({ message: 'serviceIds must not contain duplicates' })
  @IsString({ each: true, message: 'each serviceId must be a string' })
  serviceIds!: string[];

  @ValidateNested()
  @Type(() => PartnerAddressDto)
  address!: PartnerAddressDto;
}
