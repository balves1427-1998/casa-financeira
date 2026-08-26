import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../modules/auth/decorators/current-user.decorator';
import { User } from '../../../modules/users/entities/user.entity';
import { ForecastingService } from '../services/forecasting.service';
import {
  ForecastDto,
  ForecastPeriod,
  ForecastSummaryDto,
  GenerateForecastDto,
  SensitivityAnalysisDto,
} from '../dtos/forecast.dto';

@Controller('forecasting')
@UseGuards(JwtAuthGuard)
export class ForecastingController {
  constructor(private readonly forecastingService: ForecastingService) {}

  /**
   * Generate forecast for specified period
   * @param user - Current authenticated user
   * @param dto - Forecast generation parameters
   */
  @Post('generate')
  @HttpCode(HttpStatus.CREATED)
  async generateForecast(
    @CurrentUser() user: User,
    @Body() dto: GenerateForecastDto,
  ): Promise<ForecastDto> {
    return this.forecastingService.generateForecast(user, dto);
  }

  /**
   * Get forecast summary (all periods)
   * @param user - Current authenticated user
   */
  @Get('summary')
  @HttpCode(HttpStatus.OK)
  async getForecastSummary(
    @CurrentUser() user: User,
  ): Promise<ForecastSummaryDto> {
    return this.forecastingService.getForecastSummary(user);
  }

  /**
   * Analyze sensitivity to income/expense changes
   * @param user - Current authenticated user
   * @param period - Forecast period (30-days, 90-days, 365-days)
   * @param variable - Variable to analyze (income, expenses, both)
   * @param percentageChange - Percentage change to simulate (-100 to 100)
   */
  @Get('sensitivity')
  @HttpCode(HttpStatus.OK)
  async analyzeSensitivity(
    @CurrentUser() user: User,
    @Query('period') period: ForecastPeriod,
    @Query('variable') variable: 'income' | 'expenses' | 'both' = 'both',
    @Query('percentageChange') percentageChange: number = 10,
  ): Promise<SensitivityAnalysisDto[]> {
    return this.forecastingService.analyzeSensitivity(
      user,
      period,
      variable,
      percentageChange,
    );
  }
}
