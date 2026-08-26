import {
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  IsArray,
  IsObject,
  IsBoolean,
  Min,
  Max,
  IsUUID,
} from 'class-validator';
import { ForecastType, ForecastPeriod, ForecastModel } from '../entities/forecast.entity';

// ==================== PREDICTION ====================

export class PredictionDto {
  @IsString()
  date: Date;

  @IsNumber()
  @Min(0)
  predictedValue: number;

  @IsNumber()
  @Min(0)
  lowerBound: number;

  @IsNumber()
  @Min(0)
  upperBound: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  confidence: number;
}

// ==================== FORECAST SUMMARY ====================

export class ForecastSummaryDto {
  @IsNumber()
  @Min(0)
  averagePredicted: number;

  @IsNumber()
  @Min(0)
  minPredicted: number;

  @IsNumber()
  @Min(0)
  maxPredicted: number;

  @IsEnum(['UP', 'DOWN', 'STABLE'])
  trend: string;

  @IsEnum(ForecastModel)
  modelUsed: ForecastModel;

  @IsNumber()
  @Min(0)
  @Max(100)
  accuracy: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  confidence: number;
}

// ==================== FORECAST SCENARIOS ====================

export class ForecastScenariosDto {
  @IsNumber()
  @Min(0)
  bestCase: number;

  @IsNumber()
  @Min(0)
  expectedCase: number;

  @IsNumber()
  @Min(0)
  worstCase: number;
}

// ==================== FORECAST RESPONSE ====================

export class ForecastResponseDto {
  @IsUUID()
  id: string;

  @IsEnum(ForecastType)
  forecastType: ForecastType;

  @IsEnum(ForecastPeriod)
  period: ForecastPeriod;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsArray()
  predictions: PredictionDto[];

  @IsObject()
  summary: ForecastSummaryDto;

  @IsOptional()
  @IsObject()
  scenarios?: ForecastScenariosDto;

  @IsString()
  generatedAt: Date;
}

// ==================== CATEGORY FORECAST ====================

export class CategoryForecastDto {
  @IsUUID()
  categoryId: string;

  @IsString()
  categoryName: string;

  @IsNumber()
  @Min(0)
  currentSpending: number;

  @IsNumber()
  @Min(0)
  predictedSpending: number;

  @IsNumber()
  percentageChange: number;

  @IsEnum(['UP', 'DOWN', 'STABLE'])
  trend: string;

  @IsOptional()
  @IsString()
  recommendation?: string;
}

export class ListCategoryForecastsDto {
  @IsArray()
  forecasts: CategoryForecastDto[];

  @IsNumber()
  totalCurrentSpending: number;

  @IsNumber()
  totalPredictedSpending: number;

  @IsNumber()
  totalPercentageChange: number;
}

// ==================== BALANCE PROJECTION ====================

export class BalanceProjectionDto {
  @IsString()
  date: Date;

  @IsNumber()
  projectedBalance: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  confidence: number;

  @IsBoolean()
  isRiskyDay: boolean;

  @IsOptional()
  @IsString()
  riskReason?: string;
}

export class BalanceProjectionResponseDto {
  @IsArray()
  projections: BalanceProjectionDto[];

  @IsNumber()
  currentBalance: number;

  @IsNumber()
  minimumProjectedBalance: number;

  @IsNumber()
  maximumProjectedBalance: number;

  @IsBoolean()
  hasNegativeBalanceRisk: boolean;

  @IsOptional()
  @IsNumber()
  daysUntilNegativeBalance?: number;

  @IsString()
  period: string;
}

// ==================== FORECAST DETAILS ====================

export class ForecastDetailsDto {
  @IsUUID()
  id: string;

  @IsEnum(ForecastType)
  forecastType: ForecastType;

  @IsEnum(ForecastPeriod)
  period: ForecastPeriod;

  @IsEnum(ForecastModel)
  modelUsed: ForecastModel;

  @IsNumber()
  @Min(0)
  @Max(100)
  modelAccuracy: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  confidence: number;

  @IsNumber()
  averagePredicted: number;

  @IsNumber()
  trend: number; // -1 to 1, negative = decreasing, positive = increasing

  @IsArray()
  keyInsights: string[];

  @IsArray()
  assumptions: string[];

  @IsString()
  generatedAt: Date;

  @IsString()
  nextUpdateAt: Date;
}

// ==================== FORECAST COMPARISON ====================

export class ForecastComparisonDto {
  @IsString()
  period: string;

  @IsNumber()
  actualSpending: number;

  @IsNumber()
  forecastedSpending: number;

  @IsNumber()
  variancePercentage: number;

  @IsBoolean()
  isAccurate: boolean;

  @IsString()
  learningNote: string;
}

export class ListForecastComparisonsDto {
  @IsArray()
  comparisons: ForecastComparisonDto[];

  @IsNumber()
  averageAccuracy: number;

  @IsString()
  overallTrend: string;
}
