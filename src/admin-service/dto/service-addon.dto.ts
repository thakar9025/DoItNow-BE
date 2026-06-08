import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

const SELECTION_TYPES = ['SINGLE', 'MULTI'] as const;
export type AddonSelectionTypeValue = (typeof SELECTION_TYPES)[number];

export class ServiceAddonItemDto {
  @IsOptional()
  @IsUUID('4', { message: 'addon id must be a valid UUID' })
  id?: string;

  @IsString()
  @IsNotEmpty({ message: 'addon label is required' })
  label!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt({ message: 'addon price must be an integer value' })
  @Min(0, { message: 'addon price must be 0 or greater' })
  price!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ServiceAddonGroupDto {
  @IsOptional()
  @IsUUID('4', { message: 'addon group id must be a valid UUID' })
  id?: string;

  @IsString()
  @IsNotEmpty({ message: 'addon group title is required' })
  title!: string;

  @IsOptional()
  @IsString()
  helpText?: string;

  @IsOptional()
  @IsIn(SELECTION_TYPES, {
    message: 'selectionType must be either SINGLE or MULTI',
  })
  selectionType?: AddonSelectionTypeValue;

  @IsOptional()
  @IsInt()
  @Min(0)
  minSelection?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxSelection?: number | null;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ServiceAddonItemDto)
  addons!: ServiceAddonItemDto[];
}

export class ReplaceServiceAddonsDto {
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ServiceAddonGroupDto)
  addonGroups!: ServiceAddonGroupDto[];
}
