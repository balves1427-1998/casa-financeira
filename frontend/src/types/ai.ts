/**
 * Tipos do módulo de Inteligência Financeira (Fase 4 - Seção B)
 *
 * Espelham os DTOs reais do backend em:
 * backend/src/modules/ai/dtos/*.ts
 *
 * - B.1: AI Assistant (chat)
 * - B.2: Recomendações automáticas
 * - B.3: Análise comportamental / anomalias
 * - B.4: Previsões financeiras
 */

// ==================== AI ASSISTANT (CHAT) ====================

export enum IntentType {
  COMPARISON = 'COMPARISON',
  QUERY = 'QUERY',
  RECOMMENDATION = 'RECOMMENDATION',
  PREDICTION = 'PREDICTION',
  ACTION = 'ACTION',
}

export enum ChatPeriod {
  THIS_MONTH = 'THIS_MONTH',
  LAST_MONTH = 'LAST_MONTH',
  LAST_3_MONTHS = 'LAST_3_MONTHS',
  LAST_6_MONTHS = 'LAST_6_MONTHS',
  LAST_12_MONTHS = 'LAST_12_MONTHS',
  THIS_YEAR = 'THIS_YEAR',
  CUSTOM = 'CUSTOM',
}

export enum ChatUser {
  BRUNO = 'bruno',
  GIOVANNA = 'giovanna',
  BOTH = 'both',
}

export interface ChatContextDto {
  period?: ChatPeriod;
  focusUser?: ChatUser;
  categoryId?: string;
}

export interface SendChatMessageDto {
  question: string;
  context?: ChatContextDto;
  sources?: string[];
}

export interface ChatMessageResponseDto {
  answer: string;
  intent: IntentType;
  sources: string[];
  confidence: number;
  followUpQuestions: string[];
  timestamp: Date | string;
}

export interface ChatHistoryDto {
  id: string;
  question: string;
  answer: string;
  intent: IntentType;
  createdAt: Date | string;
}

export interface ListChatHistoryDto {
  messages: ChatHistoryDto[];
  total: number;
  limit: number;
  offset: number;
}

export interface ChatSuggestionsDto {
  suggestions: string[];
}

export interface GetChatHistoryDto {
  limit?: number;
  offset?: number;
}

// ==================== RECOMENDAÇÕES ====================

export enum RecommendationType {
  CATEGORY_HIGH = 'CATEGORY_HIGH',
  PATTERN = 'PATTERN',
  DUPLICATE = 'DUPLICATE',
  UNUSED_SUB = 'UNUSED_SUB',
  OPPORTUNITY = 'OPPORTUNITY',
  CONSOLIDATION = 'CONSOLIDATION',
  GOAL_OPTIMIZATION = 'GOAL_OPTIMIZATION',
}

export enum RecommendationPriority {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

export enum RecommendationPeriod {
  MONTHLY = 'monthly',
  ANNUAL = 'annual',
  QUARTERLY = 'quarterly',
}

export interface RecommendationDto {
  id: string;
  userId: string;
  familyId: string;
  type: RecommendationType;
  title: string;
  description: string;
  potentialSavings?: number;
  period: RecommendationPeriod;
  relevance: number;
  impact: number;
  ease: number;
  priority: RecommendationPriority;
  actionUrl?: string;
  isDismissed: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ListRecommendationsDto {
  recommendations: RecommendationDto[];
  total: number;
  highPriorityCount: number;
  mediumPriorityCount: number;
  lowPriorityCount: number;
}

export interface GetRecommendationsDto {
  priority?: RecommendationPriority | string;
  type?: RecommendationType | string;
  limit?: number;
  offset?: number;
  includeDismissed?: boolean;
}

export interface UpdateRecommendationDto {
  isDismissed?: boolean;
}

export interface ApplyRecommendationDto {
  notes?: string;
}

export interface RecommendationActionResultDto {
  success: boolean;
  message: string;
  redirectUrl?: string;
}

export interface RecommendationImpactEstimateDto {
  type: RecommendationType;
  totalPotentialSavings: number;
  averageDifficulty: number;
  percentageOfEasyActions: number;
  recommendations: RecommendationDto[];
}

// ==================== ANÁLISE COMPORTAMENTAL ====================

export enum AnalysisPeriod {
  THIS_MONTH = 'THIS_MONTH',
  LAST_3_MONTHS = 'LAST_3_MONTHS',
  LAST_6_MONTHS = 'LAST_6_MONTHS',
  LAST_12_MONTHS = 'LAST_12_MONTHS',
}

export enum AnomalyType {
  UNUSUAL_AMOUNT = 'UNUSUAL_AMOUNT',
  DUPLICATE = 'DUPLICATE',
  SPIKE = 'SPIKE',
  PATTERN_BREAK = 'PATTERN_BREAK',
}

export enum AnomalySeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export enum ConfirmationStatus {
  NORMAL = 'NORMAL',
  UNUSUAL_BUT_OK = 'UNUSUAL_BUT_OK',
  FRAUDULENT = 'FRAUDULENT',
}

export interface AiAnomalyDto {
  id: string;
  transactionId: string;
  anomalyType: AnomalyType;
  severity: AnomalySeverity;
  anomalyScore: number;
  reason: string;
  suggestedAction?: string;
  createdAt: Date | string;
}

export interface ListAnomaliesDto {
  anomalies: AiAnomalyDto[];
  total: number;
  highSeverityCount: number;
  mediumSeverityCount: number;
  lowSeverityCount: number;
}

export interface GetAnomaliesDto {
  severity?: AnomalySeverity | string;
  limit?: number;
  offset?: number;
  confirmed?: boolean;
}

export interface ConfirmAnomalyDto {
  status: ConfirmationStatus;
  notes?: string;
}

/**
 * Resultado de POST /analysis/anomalies/detect
 *
 * `GET /analysis/anomalies` apenas LISTA o que já foi detectado; sem disparar
 * a varredura a lista fica eternamente vazia.
 */
export interface DetectAnomaliesResultDto {
  detected: number;
  period: string;
}

export interface DaySpendingDto {
  dayOfWeek: string;
  averageSpend: number;
  variance: number;
  transactionCount: number;
}

export interface SeasonalPatternDto {
  month: string;
  averageSpend: number;
  variance: number;
  year: number;
}

export interface PeriodAnalysisDto {
  bestSpendingDays: string[];
  worstSpendingDays: string[];
  spendingByDayOfWeek: DaySpendingDto[];
  seasonalPatterns: SeasonalPatternDto[];
  seasonalityScore: number;
}

export interface PatternDto {
  id: string;
  name?: string;
  description: string;
  frequency: string;
  affectedCategories: string[];
  trend: string;
  confidence: number;
  recommendation?: string;
}

export interface ListPatternsDto {
  patterns: PatternDto[];
  total: number;
  totalPatterns?: number;
  increasingCount: number;
  decreasingCount: number;
  stableCount: number;
}

export interface GetPatternsDto {
  frequency?: string;
  limit?: number;
}

export interface CorrelationDto {
  id?: string;
  variable1: string;
  variable2: string;
  coefficient: number;
  interpretation: string;
  pValue: number;
}

export interface ListCorrelationsDto {
  correlations: CorrelationDto[];
  total: number;
  strongCorrelations: number;
}

export interface GetCorrelationsDto {
  minCorrelation?: number;
  limit?: number;
}

export interface SpendingProfileDto {
  averageDailySpend: number;
  averageMonthlySpend: number;
  maxSpendDay: number;
  minSpendDay: number;
  topCategory: string;
  topCategoryPercentage: number;
  spendingLevel: string;
  trend: string;
  predictability: number;
}

export interface BehaviorAnalysisResponseDto {
  periodAnalysis: PeriodAnalysisDto;
  anomalies: AiAnomalyDto[];
  patterns: PatternDto[];
  correlations: CorrelationDto[];
  spendingProfile: SpendingProfileDto;
  summary?: string;
  metadata?: Record<string, any>;
  insights?: string[];
  generatedAt: Date | string;
  period: string;
}

export interface AiInsightsDto {
  insights: string[];
  generatedAt: Date | string;
}

// ==================== PREVISÕES ====================

export enum ForecastType {
  TOTAL = 'TOTAL',
  BY_CATEGORY = 'BY_CATEGORY',
  BY_USER = 'BY_USER',
  BALANCE = 'BALANCE',
}

export enum AiForecastPeriod {
  NEXT_30_DAYS = '30_DAYS',
  NEXT_90_DAYS = '90_DAYS',
  NEXT_180_DAYS = '180_DAYS',
  NEXT_365_DAYS = '365_DAYS',
}

export enum ForecastModel {
  PROPHET = 'PROPHET',
  ARIMA = 'ARIMA',
  LINEAR = 'LINEAR',
  ENSEMBLE = 'ENSEMBLE',
}

export interface PredictionDto {
  date: Date | string;
  predictedValue: number;
  lowerBound: number;
  upperBound: number;
  confidence: number;
}

export interface ForecastSummaryDto {
  averagePredicted: number;
  minPredicted: number;
  maxPredicted: number;
  trend: string;
  modelUsed: ForecastModel;
  accuracy: number;
  confidence: number;
}

export interface ForecastScenariosDto {
  bestCase: number;
  expectedCase: number;
  worstCase: number;
}

export interface ForecastResponseDto {
  id: string;
  forecastType: ForecastType;
  period: AiForecastPeriod;
  categoryId?: string;
  predictions: PredictionDto[];
  summary: ForecastSummaryDto;
  scenarios?: ForecastScenariosDto;
  generatedAt: Date | string;
}

export interface CategoryForecastDto {
  categoryId: string;
  categoryName: string;
  currentSpending: number;
  predictedSpending: number;
  percentageChange: number;
  trend: string;
  recommendation?: string;
}

export interface ListCategoryForecastsDto {
  forecasts: CategoryForecastDto[];
  totalCurrentSpending: number;
  totalPredictedSpending: number;
  totalPercentageChange: number;
}

export interface GetCategoryForecastsDto {
  period?: AiForecastPeriod | string;
  limit?: number;
  minVariation?: number;
}

export interface BalanceProjectionDto {
  date: Date | string;
  projectedBalance: number;
  confidence: number;
  isRiskyDay: boolean;
  riskReason?: string;
}

export interface BalanceProjectionResponseDto {
  projections: BalanceProjectionDto[];
  currentBalance: number;
  minimumProjectedBalance: number;
  maximumProjectedBalance: number;
  hasNegativeBalanceRisk: boolean;
  daysUntilNegativeBalance?: number;
  period: string;
}

export interface ForecastDetailsDto {
  id: string;
  forecastType: ForecastType;
  period: AiForecastPeriod;
  modelUsed: ForecastModel;
  modelAccuracy: number;
  confidence: number;
  averagePredicted: number;
  /** -1 a 1: negativo = queda, positivo = alta */
  trend: number;
  keyInsights: string[];
  assumptions: string[];
  generatedAt: Date | string;
  nextUpdateAt: Date | string;
}

export interface ForecastComparisonDto {
  period: string;
  actualSpending: number;
  forecastedSpending: number;
  variancePercentage: number;
  isAccurate: boolean;
  learningNote: string;
}

export interface ListForecastComparisonsDto {
  comparisons: ForecastComparisonDto[];
  averageAccuracy: number;
  overallTrend: string;
}
