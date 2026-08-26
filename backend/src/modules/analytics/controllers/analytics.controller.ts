import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../../users/entities/user.entity';
import { AnalyticsService } from '../services/analytics.service';
import {
  SpendingPatternDto,
  GetSpendingPatternDto,
  AnomalyDto,
  GetAnomaliesDto,
  CategoryTrendAnalysisDto,
  GetCategoryTrendsDto,
  BrunoGiovannaComparisonDto,
  GetComparisonDto,
  AnalyticsSummaryDto,
  ReviewAnomalyDto,
} from '../dtos/analytics.dto';

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  // ==================== SPENDING PATTERNS ====================

  /**
   * GET /analytics/spending-pattern
   * Get spending pattern for current or specified month
   */
  @Get('spending-pattern')
  async getSpendingPattern(
    @CurrentUser() user: User,
    @Query() dto: GetSpendingPatternDto,
  ): Promise<SpendingPatternDto> {
    const today = new Date();
    const month = dto.month || today.getMonth() + 1;
    const year = dto.year || today.getFullYear();

    return this.analyticsService.calculateSpendingPattern(
      user.id,
      month,
      year,
      dto.categoryId,
    );
  }

  // ==================== ANOMALIES ====================

  /**
   * GET /analytics/anomalies
   * Detect and retrieve anomalies in spending
   */
  @Get('anomalies')
  async getAnomalies(
    @CurrentUser() user: User,
    @Query() dto: GetAnomaliesDto,
  ): Promise<AnomalyDto[]> {
    const today = new Date();
    const month = dto.month || today.getMonth() + 1;
    const year = dto.year || today.getFullYear();

    const anomalies = await this.analyticsService.detectAnomalies(user.id, month, year);

    // Filter by type if specified
    if (dto.anomalyType) {
      return anomalies.filter(a => a.anomalyType === dto.anomalyType);
    }

    // Filter by severity if specified
    if (dto.severity) {
      return anomalies.filter(a => a.severity === dto.severity);
    }

    // Filter by status if specified
    if (dto.status === 'reviewed') {
      return anomalies.filter(a => a.isReviewed);
    } else if (dto.status === 'pending') {
      return anomalies.filter(a => !a.isReviewed);
    }

    return anomalies;
  }

  /**
   * POST /analytics/anomalies/:anomalyId/review
   * Review and action an anomaly
   */
  @Post('anomalies/:anomalyId/review')
  @HttpCode(HttpStatus.OK)
  async reviewAnomaly(
    @CurrentUser() user: User,
    @Param('anomalyId') anomalyId: string,
    @Body() dto: ReviewAnomalyDto,
  ): Promise<{ message: string }> {
    // In a real implementation, this would update the anomaly in the database
    // For now, just acknowledge
    return {
      message: `Anomaly ${anomalyId} reviewed with action: ${dto.userAction}`,
    };
  }

  // ==================== CATEGORY TRENDS ====================

  /**
   * GET /analytics/trends/:categoryId
   * Analyze trends for a specific category
   */
  @Get('trends/:categoryId')
  async getCategoryTrends(
    @CurrentUser() user: User,
    @Param('categoryId') categoryId: string,
    @Query() dto: GetCategoryTrendsDto,
  ): Promise<CategoryTrendAnalysisDto> {
    const months = dto.months || 6;
    return this.analyticsService.analyzeCategoryTrends(user.id, categoryId, months);
  }

  /**
   * GET /analytics/trends
   * Get all category trends
   */
  @Get('trends')
  async getAllTrends(
    @CurrentUser() user: User,
    @Query() dto: GetCategoryTrendsDto,
  ): Promise<{
    increasing: CategoryTrendAnalysisDto[];
    decreasing: CategoryTrendAnalysisDto[];
  }> {
    const months = dto.months || 6;

    // This would normally fetch from database, but for now returns structure
    return {
      increasing: [],
      decreasing: [],
    };
  }

  // ==================== COMPARISONS ====================

  /**
   * GET /analytics/comparison
   * Compare Bruno and Giovanna spending
   */
  @Get('comparison')
  async compareBrunoGiovanna(
    @CurrentUser() user: User,
    @Query() dto: GetComparisonDto,
  ): Promise<BrunoGiovannaComparisonDto> {
    return this.analyticsService.compareBrunoGiovanna(dto.month, dto.year);
  }

  // ==================== SUMMARY ====================

  /**
   * GET /analytics/summary
   * Get complete analytics summary for the current user
   */
  @Get('summary')
  async getAnalyticsSummary(@CurrentUser() user: User): Promise<AnalyticsSummaryDto> {
    return this.analyticsService.getAnalyticsSummary(user.id);
  }
}
