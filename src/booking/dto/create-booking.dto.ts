import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
} from 'class-validator';

export class CreateBookingDto {
  @IsString()
  @IsNotEmpty({ message: 'serviceId is required' })
  serviceId!: string;

  @IsString()
  @IsNotEmpty({ message: 'addressId is required' })
  addressId!: string;

  @IsString()
  @IsNotEmpty({ message: 'date is required' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be in YYYY-MM-DD format',
  })
  date!: string;

  @IsString()
  @IsNotEmpty({ message: 'timeSlot is required' })
  timeSlot!: string;

  @IsInt({ message: 'price must be an integer value' })
  @Min(1, { message: 'price must be greater than 0' })
  price!: number;

  @IsString()
  @IsNotEmpty({ message: 'phone is required' })
  @Matches(/^[0-9]{10}$/, {
    message: 'phone must be a valid 10-digit number',
  })
  phone!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  selectedAddonIds?: string[];
}
