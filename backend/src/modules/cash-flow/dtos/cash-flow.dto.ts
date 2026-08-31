import {
  IsDate,
  IsNumber,
  IsBoolean,
  IsOptional,
  IsString,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Daily cash flow snapshot
 */
export class CashFlowDayDto {
  @IsDate()
  @Type(() => Date)
  date: Date;

  @IsNumber()
  openingBalance: number;

  @IsNumber()
  dailyIncome: number;

  @IsNumber()
  dailyExpenses: number;

  /** Contas a PAGAR previstas para o dia. */
  @IsNumber()
  plannedAccountsAmount: number;

  /**
   * Entradas previstas para o dia — salário e outras receitas recorrentes.
   * Somam no saldo projetado, ao contrário de `plannedAccountsAmount`.
   */
  @IsNumber()
  plannedIncomeAmount: number;

  @IsNumber()
  closingBalance: number;

  @IsNumber()
  projectedBalance: number;

  @IsNumber()
  transactionCount: number;

  @IsBoolean()
  isCriticalDay: boolean;

  @IsOptional()
  @IsString()
  criticalDayReason?: string;
}

/**
 * Cash flow for a month
 */
export class CashFlowMonthDto {
  @IsNumber()
  @Min(1)
  @Max(12)
  month: number;

  @IsNumber()
  @Min(2000)
  @Max(2100)
  year: number;

  days: CashFlowDayDto[];

  @IsNumber()
  openingBalance: number;

  @IsNumber()
  totalIncome: number;

  @IsNumber()
  totalExpenses: number;

  /** Total de contas a pagar previstas no mês. */
  @IsNumber()
  totalPlanned: number;

  /** Total de entradas previstas no mês (salários e demais recorrentes). */
  @IsNumber()
  totalPlannedIncome: number;

  @IsNumber()
  closingBalance: number;

  @IsNumber()
  avgDailyExpenses: number;

  criticalDays: Array<{
    date: Date;
    reason: string;
    totalPayments: number;
  }>;

  @IsNumber()
  @IsOptional()
  minimumBalance?: number;

  @IsNumber()
  @IsOptional()
  daysWithLowBalance?: number;
}

/**
 * Best day to shop recommendation
 */
export class BestDayToShopDto {
  @IsDate()
  @Type(() => Date)
  recommendedDate: Date;

  @IsString()
  reason: string;

  @IsNumber()
  projectedBalance: number;

  @IsDate()
  @Type(() => Date)
  recommendedStartDate: Date;

  @IsDate()
  @Type(() => Date)
  recommendedEndDate: Date;

  @IsNumber()
  safeSpendingLimit: number;

  daysToAvoid: Array<{
    date: Date;
    reason: string;
    paymentAmount: number;
  }>;

  @IsBoolean()
  isRiskyForDesiredAmount: boolean;

  @IsString()
  @IsOptional()
  riskReason?: string;
}

/**
 * Request for cash flow analysis
 */
export class GetCashFlowAnalysisDto {
  @IsDate()
  @Type(() => Date)
  @IsOptional()
  startDate?: Date;

  @IsDate()
  @Type(() => Date)
  @IsOptional()
  endDate?: Date;

  @IsNumber()
  @IsOptional()
  @Min(0)
  minimumBalanceThreshold?: number;
}

/**
 * Request for shopping recommendation
 */
export class GetBestDayToShopDto {
  @IsNumber()
  @Min(0)
  desiredAmount: number;

  @IsDate()
  @Type(() => Date)
  @IsOptional()
  startDate?: Date;

  @IsDate()
  @Type(() => Date)
  @IsOptional()
  endDate?: Date;

  @IsNumber()
  @IsOptional()
  @Min(0)
  minimumBalanceThreshold?: number;

  @IsBoolean()
  @IsOptional()
  onlyLowRisk?: boolean;
}

/**
 * Cash flow summary
 */
export class CashFlowSummaryDto {
  currentBalance: number;
  totalIncome: number;
  totalExpenses: number;
  totalPlanned: number;
  projectedEndOfMonth: number;

  criticalDaysCount: number;
  nextCriticalDay?: Date;
  nextCriticalDayAmount?: number;

  daysWithLowBalance: number;
  balanceTrendPercentage: number; // positive = improving, negative = worsening
}
