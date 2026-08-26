import {
  IsDate,
  IsNumber,
  IsBoolean,
  IsOptional,
  IsString,
  IsEnum,
  IsArray,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Período de previsão disponível
 */
export enum ForecastPeriod {
  SHORT = '30-days',
  MEDIUM = '90-days',
  LONG = '365-days',
}

/**
 * Projeção de um dia/período
 */
export class ProjectionPointDto {
  @IsDate()
  @Type(() => Date)
  date: Date;

  @IsNumber()
  projectedBalance: number;

  @IsNumber()
  income: number;

  @IsNumber()
  expenses: number;

  @IsNumber()
  minBalance: number;

  @IsOptional()
  @IsNumber()
  week?: number;

  @IsOptional()
  @IsNumber()
  month?: number;
}

/**
 * Análise de sazonalidade
 */
export class SeasonalityAnalysisDto {
  @IsString()
  pattern: 'high' | 'low' | 'stable';

  @IsNumber()
  @Min(0)
  @Max(1)
  variance: number;

  @IsArray()
  @Type(() => Date)
  peakDates: Date[];

  @IsArray()
  @Type(() => Date)
  lowDates: Date[];
}

/**
 * Previsão completa
 */
export class ForecastDto {
  @IsString()
  id: string;

  @IsEnum(ForecastPeriod)
  period: ForecastPeriod;

  @IsDate()
  @Type(() => Date)
  forecastDate: Date;

  @IsNumber()
  initialBalance: number;

  @IsNumber()
  projectedEndBalance: number;

  @IsNumber()
  minProjectedBalance: number;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  minBalanceDate?: Date;

  @IsNumber()
  projectedIncome: number;

  @IsNumber()
  projectedExpenses: number;

  @IsNumber()
  fixedExpenses: number;

  @IsNumber()
  variableExpenses: number;

  @IsNumber()
  installmentPayments: number;

  @IsNumber()
  daysWithLowBalance: number;

  @IsBoolean()
  hasNegativeRisk: boolean;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  negativeRiskDate?: Date;

  @IsNumber()
  @Min(0)
  @Max(1)
  confidence: number;

  @IsOptional()
  @IsArray()
  @Type(() => ProjectionPointDto)
  detailedProjections?: ProjectionPointDto[];

  @IsOptional()
  seasonalityAnalysis?: SeasonalityAnalysisDto;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  recommendations?: string[];

  @IsDate()
  @Type(() => Date)
  createdAt: Date;
}

/**
 * Request para gerar previsão
 */
export class GenerateForecastDto {
  @IsEnum(ForecastPeriod)
  period: ForecastPeriod;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  startDate?: Date;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minimumBalanceThreshold?: number;
}

/**
 * Resumo de múltiplas previsões
 */
export class ForecastSummaryDto {
  @IsOptional()
  forecast30Days?: ForecastDto;

  @IsOptional()
  forecast90Days?: ForecastDto;

  @IsOptional()
  forecast365Days?: ForecastDto;

  @IsNumber()
  currentBalance: number;

  @IsDate()
  @Type(() => Date)
  generatedAt: Date;
}

/**
 * Comparação de cenários
 */
export class ScenarioComparisonDto {
  @IsString()
  scenarioName: string;

  @IsNumber()
  description: string;

  @IsNumber()
  projectedBalance30Days: number;

  @IsNumber()
  projectedBalance90Days: number;

  @IsNumber()
  projectedBalance365Days: number;

  @IsNumber()
  riskLevel: 'low' | 'medium' | 'high'; // Baseado em minBalance e negativeRisk

  @IsArray()
  @IsString({ each: true })
  insights: string[];
}

/**
 * Análise de sensibilidade
 */
export class SensitivityAnalysisDto {
  @IsString()
  variable: string; // 'income', 'expenses', 'both'

  @IsNumber()
  @Min(-100)
  @Max(100)
  percentageChange: number;

  @IsNumber()
  projectedBalance30Days: number;

  @IsNumber()
  projectedBalance90Days: number;

  @IsNumber()
  projectedBalance365Days: number;

  @IsBoolean()
  becomesNegative: boolean;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  negativeDate?: Date;
}
