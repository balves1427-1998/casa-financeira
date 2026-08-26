import {
  IsString,
  IsEnum,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsArray,
  Min,
  Max,
  ValidateNested,
  ArrayNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum MatchType {
  KEYWORD = 'keyword',
  REGEX = 'regex',
  EXACT = 'exact',
}

/**
 * DTO para criar regra customizada
 */
export class CreateCustomRuleDto {
  @IsString()
  pattern: string;

  @IsEnum(MatchType)
  matchType: MatchType;

  @IsString()
  categoryId: string;

  @IsOptional()
  @IsString()
  subcategoryId?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  priority?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number = 0.8;
}

/**
 * DTO para atualizar regra
 */
export class UpdateCustomRuleDto {
  @IsOptional()
  @IsString()
  pattern?: string;

  @IsOptional()
  @IsEnum(MatchType)
  matchType?: MatchType;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  subcategoryId?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  priority?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;
}

/**
 * DTO para testar padrão (regex tester)
 */
export class TestPatternDto {
  @IsString()
  pattern: string;

  @IsEnum(MatchType)
  matchType: MatchType;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  testStrings: string[];
}

/**
 * Resultado de teste de padrão
 */
export class TestPatternResultDto {
  pattern: string;
  matchType: MatchType;
  testResults: Array<{
    input: string;
    matched: boolean;
    error?: string;
  }>;
  matchCount: number;
  successRate: number;
}

/**
 * DTO para operação em bulk (aplicar múltiplas regras)
 */
export class BulkApplyRulesDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreateCustomRuleDto)
  rules: CreateCustomRuleDto[];

  @IsOptional()
  @IsBoolean()
  overwrite?: boolean = false;

  @IsOptional()
  @IsString()
  tag?: string;
}

/**
 * Resultado de operação em bulk
 */
export class BulkApplyResultDto {
  created: number;
  updated: number;
  failed: number;
  errors: Array<{
    rule: CreateCustomRuleDto;
    error: string;
  }>;
}

/**
 * DTO para importar/exportar regras
 */
export class ExportRulesDto {
  rules: Array<{
    pattern: string;
    matchType: MatchType;
    categoryId: string;
    subcategoryId?: string;
    priority: number;
    isActive: boolean;
    description?: string;
    confidence: number;
    createdAt: Date;
  }>;
  exportedAt: Date;
  count: number;
}

/**
 * DTO para compartilhar regras
 */
export class ShareRulesDto {
  @IsArray()
  @ArrayNotEmpty()
  ruleIds: string[];

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean = false;
}

/**
 * DTO para estatísticas de regras
 */
export class RuleStatsDto {
  totalRules: number;
  activeRules: number;
  inactiveRules: number;
  byMatchType: {
    keyword: number;
    regex: number;
    exact: number;
  };
  byCategory: Array<{
    categoryId: string;
    categoryName: string;
    ruleCount: number;
  }>;
  mostUsed: Array<{
    ruleId: string;
    pattern: string;
    matchType: MatchType;
    usageCount: number;
    lastUsedAt: Date;
  }>;
  successRate: number;
}
