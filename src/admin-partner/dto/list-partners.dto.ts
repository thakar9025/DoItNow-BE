import { Transform } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';

export class ListPartnersDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  serviceId?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true')
  onlyActive?: boolean;
}
