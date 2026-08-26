import { IsEnum, IsNumber, IsString, IsOptional, IsDateString, IsArray } from 'class-validator';

// ==================== SPENDING PATTERNS ====================

export class SpendingPatternDto {
  id: string;
  month: number;
  year: number;
  totalSpent: number;
  averageTransaction: number;
  medianTransaction: number;
  minTransaction: number;
  maxTransaction: number;
  standardDeviation: number;
  transactionCount: number;
  monthOverMonthChange?: number;
  deviationFromAverage?: number;
  highSpendingDays?: number[];
  activeDays: number;
  topDays?: string[];
  pattern?: string;
  historicalComparison?: {
    last3Months: number[];
    last6Months: number[];
    last12Months: number[];
    trend: 'increasing' | 'decreasing' | 'stable';
  };
  dayOfWeekAnalysis?: {
    monday: number;
    tuesday: number;
    wednesday: number;
    thursday: number;
    friday: number;
    saturday: number;
    sunday: number;
    mostExpensiveDay: string;
  };
  topEstablishments?: Array<{
    name: string;
    count: number;
    totalSpent: number;
    averageTransaction: number;
  }>;
  insights?: string[];
}

export class GetSpendingPatternDto {
  @IsOptional()
  @IsNumber()
  month?: number;

  @IsOptional()
  @IsNumber()
  year?: number;

  @IsOptional()
  @IsString()
  categoryId?: string;
}

export class SpendingPatternComparisonDto {
  currentMonth: SpendingPatternDto;
  previousMonth?: SpendingPatternDto;
  last3Months: SpendingPatternDto[];
  last6Months: SpendingPatternDto[];
  trend: 'increasing' | 'decreasing' | 'stable';
  categoryComparison?: Array<{
    categoryId: string;
    categoryName: string;
    currentSpent: number;
    previousSpent: number;
    change: number;
  }>;
}

// ==================== ANOMALIES ====================

export class AnomalyDto {
  id: string;
  anomalyType: 'spike' | 'pattern_change' | 'duplicate' | 'suspicious' | 'unusual_merchant' | 'frequency_increase';
  description: string;
  month: number;
  year: number;
  detectedValue: number;
  expectedValue: number;
  deviationPercentage: number;
  zscore: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  merchantName?: string;
  frequencyChange?: number;
  occurrenceCount?: number;
  anomalyDate?: string;
  daysIntoMonth?: number;
  historicalComparison?: {
    lastMonthAverage: number;
    last3MonthsAverage: number;
    last6MonthsAverage: number;
    trendDirection: 'increasing' | 'decreasing' | 'stable';
  };
  recommendation?: string;
  isReviewed: boolean;
  userAction?: 'confirmed' | 'dismissed' | 'needs_investigation';
  userNote?: string;
  categoryId?: string;
  categoryName?: string;
}

export class GetAnomaliesDto {
  @IsOptional()
  @IsEnum(['spike', 'pattern_change', 'duplicate', 'suspicious', 'unusual_merchant', 'frequency_increase'])
  anomalyType?: string;

  @IsOptional()
  @IsEnum(['low', 'medium', 'high', 'critical'])
  severity?: string;

  @IsOptional()
  @IsNumber()
  month?: number;

  @IsOptional()
  @IsNumber()
  year?: number;

  @IsOptional()
  @IsEnum(['all', 'reviewed', 'pending'])
  status?: string;
}

export class ReviewAnomalyDto {
  @IsEnum(['confirmed', 'dismissed', 'needs_investigation'])
  userAction: 'confirmed' | 'dismissed' | 'needs_investigation';

  @IsOptional()
  @IsString()
  userNote?: string;
}

// ==================== TRENDS ====================

export class CategoryTrendDto {
  categoryId: string;
  categoryName: string;
  month: number;
  year: number;
  totalSpent: number;
  transactionCount: number;
  averageTransaction: number;
  percentOfTotal: number;
}

export class CategoryTrendAnalysisDto {
  categoryId: string;
  categoryName: string;
  last6Months: CategoryTrendDto[];
  trend: 'increasing' | 'decreasing' | 'stable';
  trendPercentage: number; // % change from oldest to newest
  bestMonth: {
    month: number;
    year: number;
    amount: number;
  };
  worstMonth: {
    month: number;
    year: number;
    amount: number;
  };
  average: number;
  standardDeviation: number;
  forecast: {
    estimatedNextMonth: number;
    confidence: number;
  };
}

export class GetCategoryTrendsDto {
  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsNumber()
  months?: number; // Quantos meses analisar (default 6)
}

// ==================== COMPARISONS ====================

export class UserComparisonMetricsDto {
  userId: string;
  userName: string;
  totalSpent: number;
  transactionCount: number;
  averageTransaction: number;
  percentOfTotal: number;
  categories: Array<{
    categoryName: string;
    spent: number;
    percentage: number;
  }>;
}

export class BrunoGiovannaComparisonDto {
  period: string; // "2026-08"
  totalSpentBruno: number;
  totalSpentGiovanna: number;
  totalSpentTogether: number;
  brunoPercentage: number;
  giovannaPercentage: number;
  difference: number;
  transactionCountBruno: number;
  transactionCountGiovanna: number;
  averageTransactionBruno: number;
  averageTransactionGiovanna: number;
  categoryComparison: Array<{
    categoryName: string;
    brunoSpent: number;
    giovannaSpent: number;
    brunoPercentage: number;
    giovannaPercentage: number;
  }>;
  trends: {
    bruno: 'increasing' | 'decreasing' | 'stable';
    giovanna: 'increasing' | 'decreasing' | 'stable';
  };
  insights: string[];
}

export class GetComparisonDto {
  @IsOptional()
  @IsNumber()
  month?: number;

  @IsOptional()
  @IsNumber()
  year?: number;

  @IsOptional()
  @IsNumber()
  months?: number; // Para comparação de múltiplos meses
}

// ==================== SUMMARY ====================

export class AnalyticsSummaryDto {
  spendingPattern: SpendingPatternDto;
  anomalies: {
    total: number;
    high: number;
    medium: number;
    low: number;
    unreviewed: number;
    recentAnomalies: AnomalyDto[];
  };
  trends: {
    topIncreasingCategories: CategoryTrendAnalysisDto[];
    topDecreasingCategories: CategoryTrendAnalysisDto[];
  };
  comparison: BrunoGiovannaComparisonDto;
  insights: string[];
}
