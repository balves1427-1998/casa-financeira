export enum ForecastPeriod {
  SHORT = '30-days',
  MEDIUM = '90-days',
  LONG = '365-days',
}

/**
 * Projeção de um dia/período
 */
export interface ProjectionPointDto {
  date: Date | string;
  projectedBalance: number;
  income: number;
  expenses: number;
  minBalance: number;
  week?: number;
  month?: number;
}

/**
 * Análise de sazonalidade
 */
export interface SeasonalityAnalysisDto {
  pattern: 'high' | 'low' | 'stable';
  variance: number;
  peakDates: Array<Date | string>;
  lowDates: Array<Date | string>;
}

/**
 * Previsão completa
 */
export interface ForecastDto {
  id: string;
  period: ForecastPeriod;
  forecastDate: Date | string;
  initialBalance: number;
  projectedEndBalance: number;
  minProjectedBalance: number;
  minBalanceDate?: Date | string;
  projectedIncome: number;
  projectedExpenses: number;
  fixedExpenses: number;
  variableExpenses: number;
  installmentPayments: number;
  daysWithLowBalance: number;
  hasNegativeRisk: boolean;
  negativeRiskDate?: Date | string;
  confidence: number;
  detailedProjections?: ProjectionPointDto[];
  seasonalityAnalysis?: SeasonalityAnalysisDto;
  recommendations?: string[];
  createdAt: Date | string;
}

/**
 * Request para gerar previsão
 */
export interface GenerateForecastDto {
  period: ForecastPeriod;
  startDate?: Date;
  minimumBalanceThreshold?: number;
}

/**
 * Resumo de múltiplas previsões
 */
export interface ForecastSummaryDto {
  forecast30Days?: ForecastDto;
  forecast90Days?: ForecastDto;
  forecast365Days?: ForecastDto;
  currentBalance: number;
  generatedAt: Date | string;
}

/**
 * Análise de sensibilidade
 */
export interface SensitivityAnalysisDto {
  variable: 'income' | 'expenses' | 'both';
  percentageChange: number;
  projectedBalance30Days: number;
  projectedBalance90Days: number;
  projectedBalance365Days: number;
  riskLevel: 'low' | 'medium' | 'high';
  becomesNegative?: boolean;
  negativeDate?: Date | string;
  insights: string[];
}
