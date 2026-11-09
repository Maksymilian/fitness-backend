import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

export class LedgerDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  /** `nextCursor` of the previous page. Empty means the first page. */
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z_[0-9a-f-]{36}$/)
  cursor?: string;
}
