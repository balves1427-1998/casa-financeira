// ==================== SPENDING PATTERNS ====================

export interface DayOfWeekAnalysis {
  monday: number;
  tuesday: number;
  wednesday: number;
  thursday: number;
  friday: number;
  saturday: number;
  sunday: number;
  mostExpensiveDay: string;
}

export interface TopEstablishment {
  name: string;
  count: number;
  totalSpent: number;
  averageTransaction: number;
}

export interface HistoricalComparison {
  last3Months: number[];
  last6Months: number[];
  last12Months: number[];
  trend: 'increasing' | 'decreasing' | 'stable';
}

export interface SpendingPatternDto {
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
  historicalComparison?: HistoricalComparison;
  dayOfWeekAnalysis?: DayOfWeekAnalysis;
  topEstablishments?: TopEstablishment[];
  insights?: string[];
}

export interface GetSpendingPatternDto {
  month?: number;
  year?: number;
  categoryId?: string;
}

// ==================== ANOMALIES ====================

export interface AnomalyDto {
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

export interface GetAnomaliesDto {
  anomalyType?: string;
  severity?: string;
  month?: number;
  year?: number;
  status?: string;
}

export interface ReviewAnomalyDto {
  userAction: 'confirmed' | 'dismissed' | 'needs_investigation';
  userNote?: string;
}

// ==================== TRENDS ====================

export interface CategoryTrendDto {
  categoryId: string;
  categoryName: string;
  month: number;
  year: number;
  totalSpent: number;
  transactionCount: number;
  averageTransaction: number;
  percentOfTotal: number;
}

export interface ForecastData {
  estimatedNextMonth: number;
  confidence: number;
}

export interface CategoryTrendAnalysisDto {
  categoryId: string;
  categoryName: string;
  last6Months: CategoryTrendDto[];
  trend: 'increasing' | 'decreasing' | 'stable';
  trendPercentage: number;
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
  forecast: ForecastData;
}

export interface GetCategoryTrendsDto {
  categoryId?: string;
  months?: number;
}

// ==================== COMPARISONS ====================

export interface UserComparisonMetrics {
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

export interface CategoryComparison {
  categoryName: string;
  brunoSpent: number;
  giovannaSpent: number;
  brunoPercentage: number;
  giovannaPercentage: number;
}

export interface BrunoGiovannaComparisonDto {
  period: string;
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
  categoryComparison: CategoryComparison[];
  trends: {
    bruno: 'increasing' | 'decreasing' | 'stable';
    giovanna: 'increasing' | 'decreasing' | 'stable';
  };
  insights: string[];
}

export interface GetComparisonDto {
  month?: number;
  year?: number;
  months?: number;
}

// ==================== SUMMARY ====================

export interface AnomalySummary {
  total: number;
  high: number;
  medium: number;
  low: number;
  unreviewed: number;
  recentAnomalies: AnomalyDto[];
}

export interface TrendsSummary {
  topIncreasingCategories: CategoryTrendAnalysisDto[];
  topDecreasingCategories: CategoryTrendAnalysisDto[];
}

export interface AnalyticsSummaryDto {
  spendingPattern: SpendingPatternDto;
  anomalies: AnomalySummary;
  trends: TrendsSummary;
  comparison: BrunoGiovannaComparisonDto;
  insights: string[];
}
