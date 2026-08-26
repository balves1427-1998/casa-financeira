import {
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  IsArray,
  IsObject,
  Min,
  Max,
  IsUUID,
} from 'class-validator';
import {
  AnomalyType,
  AnomalySeverity,
  TransactionType,
  ConfirmationStatus,
} from '../entities/transaction-anomaly.entity';

// ==================== PERIOD ANALYSIS ====================

export class DaySpendingDto {
  @IsString()
  dayOfWeek: string;

  @IsNumber()
  averageSpend: number;

  @IsNumber()
  variance: number;

  @IsNumber()
  transactionCount: number;
}

export class SeasonalPatternDto {
  @IsString()
  month: string;

  @IsNumber()
  averageSpend: number;

  @IsNumber()
  variance: number;

  @IsNumber()
  year: number;
}

export class PeriodAnalysisDto {
  @IsArray()
  bestSpendingDays: string[];

  @IsArray()
  worstSpendingDays: string[];

  @IsArray()
  spendingByDayOfWeek: DaySpendingDto[];

  @IsArray()
  seasonalPatterns: SeasonalPatternDto[];

  @IsNumber()
  @Min(0)
  @Max(1)
  seasonalityScore: number;
}

// ==================== ANOMALIES ====================

export class AnomalyDto {
  @IsUUID()
  id: string;

  @IsUUID()
  transactionId: string;

  @IsEnum(AnomalyType)
  anomalyType: AnomalyType;

  @IsEnum(AnomalySeverity)
  severity: AnomalySeverity;

  @IsNumber()
  @Min(0)
  @Max(1)
  anomalyScore: number;

  @IsString()
  reason: string;

  @IsOptional()
  @IsString()
  suggestedAction?: string;

  @IsString()
  createdAt: Date;
}

export class ListAnomaliesDto {
  @IsArray()
  anomalies: AnomalyDto[];

  @IsNumber()
  total: number;

  @IsNumber()
  highSeverityCount: number;

  @IsNumber()
  mediumSeverityCount: number;

  @IsNumber()
  lowSeverityCount: number;
}

export class ConfirmAnomalyDto {
  @IsEnum(ConfirmationStatus)
  status: ConfirmationStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}

// ==================== PATTERNS ====================

export class PatternDto {
  @IsString()
  id: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  description: string;

  @IsEnum(['daily', 'weekly', 'monthly', 'seasonal'])
  frequency: string;

  @IsArray()
  affectedCategories: string[];

  @IsEnum(['increasing', 'decreasing', 'stable'])
  trend: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  confidence: number;

  @IsOptional()
  @IsString()
  recommendation?: string;
}

export class ListPatternsDto {
  @IsArray()
  patterns: PatternDto[];

  @IsNumber()
  total: number;

  @IsNumber()
  @IsOptional()
  totalPatterns?: number;

  @IsNumber()
  increasingCount: number;

  @IsNumber()
  decreasingCount: number;

  @IsNumber()
  stableCount: number;
}

// ==================== CORRELATIONS ====================

export class CorrelationDto {
  @IsString()
  @IsOptional()
  id?: string;

  @IsString()
  variable1: string;

  @IsString()
  variable2: string;

  @IsNumber()
  @Min(-1)
  @Max(1)
  coefficient: number;

  @IsString()
  interpretation: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  pValue: number;
}

export class ListCorrelationsDto {
  @IsArray()
  correlations: CorrelationDto[];

  @IsNumber()
  total: number;

  @IsNumber()
  strongCorrelations: number;
}

// ==================== SPENDING PROFILE ====================

export class SpendingProfileDto {
  @IsNumber()
  averageDailySpend: number;

  @IsNumber()
  averageMonthlySpend: number;

  @IsNumber()
  maxSpendDay: number;

  @IsNumber()
  minSpendDay: number;

  @IsString()
  topCategory: string;

  @IsNumber()
  topCategoryPercentage: number;

  @IsEnum(['LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH'])
  spendingLevel: string;

  @IsEnum(['STABLE', 'GROWING', 'DECLINING'])
  trend: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  predictability: number;
}

// ==================== BEHAVIOR ANALYSIS RESPONSE ====================

export class BehaviorAnalysisResponseDto {
  @IsObject()
  periodAnalysis: PeriodAnalysisDto;

  @IsArray()
  anomalies: AnomalyDto[];

  @IsArray()
  patterns: PatternDto[];

  @IsArray()
  correlations: CorrelationDto[];

  @IsObject()
  spendingProfile: SpendingProfileDto;

  @IsString()
  @IsOptional()
  summary?: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;

  @IsArray()
  @IsOptional()
  insights?: string[];

  @IsString()
  generatedAt: Date;

  @IsString()
  period: string;
}
