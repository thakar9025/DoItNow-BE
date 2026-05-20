import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class ListNotificationsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page must be an integer value' })
  @Min(1, { message: 'page must be greater than 0' })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit must be an integer value' })
  @Min(1, { message: 'limit must be greater than 0' })
  limit?: number;
}
