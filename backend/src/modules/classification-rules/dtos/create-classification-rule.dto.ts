import { IsString, IsEnum, IsOptional, IsNumber, IsBoolean, Min, Max } from 'class-validator';

export enum MatchType {
  KEYWORD = 'keyword',
  REGEX = 'regex',
  EXACT = 'exact',
}

export class CreateClassificationRuleDto {
  @IsString()
  keyword: string;

  @IsString()
  category: string;

  @IsOptional()
  @IsString()
  subcategory?: string;

  @IsOptional()
  @IsEnum(MatchType)
  matchType?: MatchType = MatchType.KEYWORD;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priority?: number = 0;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;

  @IsOptional()
  @IsString()
  bank?: string;

  @IsOptional()
  @IsString()
  merchant?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateClassificationRuleDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  subcategory?: string;

  @IsOptional()
  @IsEnum(MatchType)
  matchType?: MatchType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  bank?: string;

  @IsOptional()
  @IsString()
  merchant?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class ClassifyTransactionDto {
  @IsString()
  description: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;
}
