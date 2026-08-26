/**
 * Daily cash flow snapshot
 */
export interface CashFlowDayDto {
  date: Date | string;
  openingBalance: number;
  dailyIncome: number;
  dailyExpenses: number;
  plannedAccountsAmount: number;
  closingBalance: number;
  projectedBalance: number;
  transactionCount: number;
  isCriticalDay: boolean;
  criticalDayReason?: string;
}

/**
 * Cash flow for a month
 */
export interface CashFlowMonthDto {
  month: number;
  year: number;
  days: CashFlowDayDto[];
  openingBalance: number;
  totalIncome: number;
  totalExpenses: number;
  closingBalance: number;
  avgDailyExpenses: number;
  criticalDays: Array<{
    date: Date | string;
    reason: string;
    totalPayments: number;
  }>;
  minimumBalance?: number;
  daysWithLowBalance?: number;
}

/**
 * Best day to shop recommendation
 */
export interface BestDayToShopDto {
  recommendedDate: Date | string;
  reason: string;
  projectedBalance: number;
  recommendedStartDate: Date | string;
  recommendedEndDate: Date | string;
  safeSpendingLimit: number;
  daysToAvoid: Array<{
    date: Date | string;
    reason: string;
    paymentAmount: number;
  }>;
  isRiskyForDesiredAmount: boolean;
  riskReason?: string;
}

/**
 * Request for best shopping recommendation
 */
export interface GetBestDayToShopDto {
  desiredAmount: number;
  startDate?: Date;
  endDate?: Date;
  minimumBalanceThreshold?: number;
  onlyLowRisk?: boolean;
}

/**
 * Cash flow summary
 */
export interface CashFlowSummaryDto {
  currentBalance: number;
  totalIncome: number;
  totalExpenses: number;
  totalPlanned: number;
  projectedEndOfMonth: number;
  criticalDaysCount: number;
  nextCriticalDay?: Date | string;
  nextCriticalDayAmount?: number;
  daysWithLowBalance: number;
  balanceTrendPercentage: number;
}
