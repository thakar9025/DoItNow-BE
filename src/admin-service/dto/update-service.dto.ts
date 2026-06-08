import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { ServiceAddonGroupDto } from './service-addon.dto';

const DISPLAY_TYPES = ['IMAGE', 'ICON'] as const;
export type DisplayTypeValue = (typeof DISPLAY_TYPES)[number];

export class UpdateServiceDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  subtitle?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt({ message: 'startingPrice must be an integer value' })
  @Min(1, { message: 'startingPrice must be greater than 0' })
  startingPrice?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  iconUrl?: string;

  @IsOptional()
  @IsIn(DISPLAY_TYPES, {
    message: 'displayType must be either IMAGE or ICON',
  })
  displayType?: DisplayTypeValue;

  @IsOptional()
  @IsString()
  colorClass?: string;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsBoolean()
  isPopular?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ServiceAddonGroupDto)
  addonGroups?: ServiceAddonGroupDto[];
}
