import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThan } from 'typeorm';
import { Forecast } from '../entities/forecast.entity';
import { User } from '../../../modules/users/entities/user.entity';
import { Expense } from '../../../modules/expenses/entities/expense.entity';
import { Income } from '../../../modules/income/entities/income.entity';
import { PlannedAccount } from '../../../modules/planned-accounts/entities/planned-account.entity';
import {
  ForecastDto,
  ForecastPeriod,
  GenerateForecastDto,
  ForecastSummaryDto,
  ProjectionPointDto,
  SensitivityAnalysisDto,
} from '../dtos/forecast.dto';

interface HistoricalData {
  monthlyIncome: number[];
  monthlyExpenses: number[];
  fixedExpenses: number[];
  variableExpenses: number[];
  dataPoints: number;
}

@Injectable()
export class ForecastingService {
  constructor(
    @InjectRepository(Forecast)
    private forecastRepository: Repository<Forecast>,
    @InjectRepository(Expense)
    private expenseRepository: Repository<Expense>,
    @InjectRepository(Income)
    private incomeRepository: Repository<Income>,
    @InjectRepository(PlannedAccount)
    private plannedAccountRepository: Repository<PlannedAccount>,
  ) {}

  /**
   * Generate forecast for specified period
   */
  async generateForecast(
    user: User,
    dto: GenerateForecastDto,
  ): Promise<ForecastDto> {
    if (!Object.values(ForecastPeriod).includes(dto.period)) {
      throw new BadRequestException('Invalid forecast period');
    }

    const startDate = dto.startDate || new Date();
    const currentBalance = 5000; // TODO: Get from accounts module
    const minBalanceThreshold = dto.minimumBalanceThreshold || 2000;

    // Get historical data for analysis
    const historicalData = await this.getHistoricalData(user);

    // Calculate projections based on period
    let endDate: Date;
    let days: number;

    switch (dto.period) {
      case ForecastPeriod.SHORT:
        days = 30;
        endDate = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);
        break;
      case ForecastPeriod.MEDIUM:
        days = 90;
        endDate = new Date(startDate.getTime() + 90 * 24 * 60 * 60 * 1000);
        break;
      case ForecastPeriod.LONG:
        days = 365;
        endDate = new Date(startDate.getTime() + 365 * 24 * 60 * 60 * 1000);
        break;
    }

    // Get future planned transactions
    const futureIncomes = await this.incomeRepository.find({
      where: {
        userId: user.id,
        date: Between(startDate, endDate),
      },
    });

    const futureExpenses = await this.expenseRepository.find({
      where: {
        userId: user.id,
        date: Between(startDate, endDate),
      },
    });

    const futurePlanned = await this.plannedAccountRepository.find({
      where: {
        userId: user.id,
        dueDate: Between(startDate, endDate),
      },
    });

    // Calculate totals
    const projectedIncome = futureIncomes.reduce((sum, i) => sum + i.amount, 0);
    const projectedExpenses = futureExpenses.reduce((sum, e) => sum + e.amount, 0);
    const fixedExpenses = this.calculateFixedExpenses(
      historicalData,
      days,
    );
    const variableExpenses = this.calculateVariableExpenses(
      historicalData,
      days,
    );
    const installmentPayments = futurePlanned.reduce(
      (sum, p) => sum + p.amount,
      0,
    );

    const totalProjectedExpenses =
      fixedExpenses + variableExpenses + installmentPayments;
    const totalIncomeWithRecurring =
      projectedIncome +
      this.calculateRecurringIncome(historicalData, days);
    const netFlow = totalIncomeWithRecurring - totalProjectedExpenses;
    const projectedEndBalance = currentBalance + netFlow;

    // Calculate detailed projections and min balance
    const detailedProjections = this.generateDetailedProjections(
      currentBalance,
      startDate,
      days,
      historicalData,
      futureIncomes,
      futureExpenses,
      futurePlanned,
    );

    const minProjectedBalance = Math.min(
      ...detailedProjections.map(p => p.projectedBalance),
    );
    const minBalancePoint = detailedProjections.find(
      p => p.projectedBalance === minProjectedBalance,
    );

    const daysWithLowBalance = detailedProjections.filter(
      p => p.projectedBalance < minBalanceThreshold,
    ).length;

    const hasNegativeRisk = minProjectedBalance < 0;
    const negativeRiskDate = detailedProjections.find(
      p => p.projectedBalance < 0,
    )?.date;

    // Calculate confidence based on historical data quality
    const confidence = Math.min(
      0.95,
      Math.max(0.5, historicalData.dataPoints / 24),
    );

    // Analyze seasonality
    const seasonalityAnalysis = this.analyzeSeasonality(
      historicalData,
      startDate,
      endDate,
    );

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      currentBalance,
      projectedEndBalance,
      minProjectedBalance,
      daysWithLowBalance,
      hasNegativeRisk,
      historicalData,
    );

    // Save forecast
    const forecast = this.forecastRepository.create({
      userId: user.id,
      period: dto.period,
      forecastDate: startDate,
      initialBalance: currentBalance,
      projectedEndBalance,
      minProjectedBalance,
      minBalanceDate: minBalancePoint?.date,
      projectedIncome: totalIncomeWithRecurring,
      projectedExpenses: totalProjectedExpenses,
      fixedExpenses,
      variableExpenses,
      installmentPayments,
      daysWithLowBalance,
      hasNegativeRisk,
      negativeRiskDate,
      confidence,
      detailedProjections,
      seasonalityAnalysis,
      recommendations,
      metadata: {
        dataPoints: historicalData.dataPoints,
        historyMonths: Math.floor(historicalData.dataPoints / 30),
        averageMonthlyIncome:
          historicalData.monthlyIncome.length > 0
            ? historicalData.monthlyIncome.reduce((a, b) => a + b, 0) /
              historicalData.monthlyIncome.length
            : 0,
        averageMonthlyExpenses:
          historicalData.monthlyExpenses.length > 0
            ? historicalData.monthlyExpenses.reduce((a, b) => a + b, 0) /
              historicalData.monthlyExpenses.length
            : 0,
        consistencyScore: this.calculateConsistencyScore(historicalData),
      },
    });

    await this.forecastRepository.save(forecast);

    return this.mapForecastToDto(forecast);
  }

  /**
   * Get latest forecasts for all periods
   */
  async getForecastSummary(user: User): Promise<ForecastSummaryDto> {
    const forecasts = await this.forecastRepository.find({
      where: { userId: user.id },
      order: { createdAt: 'DESC' },
      take: 3,
    });

    const forecast30 = forecasts.find(f => f.period === ForecastPeriod.SHORT);
    const forecast90 = forecasts.find(f => f.period === ForecastPeriod.MEDIUM);
    const forecast365 = forecasts.find(f => f.period === ForecastPeriod.LONG);

    return {
      forecast30Days: forecast30 ? this.mapForecastToDto(forecast30) : undefined,
      forecast90Days: forecast90 ? this.mapForecastToDto(forecast90) : undefined,
      forecast365Days: forecast365 ? this.mapForecastToDto(forecast365) : undefined,
      currentBalance: 5000, // TODO: Get from accounts
      generatedAt: new Date(),
    };
  }

  /**
   * Analyze sensitivity to income/expense changes
   */
  async analyzeSensitivity(
    user: User,
    period: ForecastPeriod,
    variable: 'income' | 'expenses' | 'both',
    percentageChange: number,
  ): Promise<SensitivityAnalysisDto[]> {
    if (percentageChange < -100 || percentageChange > 100) {
      throw new BadRequestException(
        'Percentage change must be between -100 and 100',
      );
    }

    const forecast = await this.forecastRepository.findOne({
      where: { userId: user.id, period },
      order: { createdAt: 'DESC' },
    });

    if (!forecast) {
      throw new BadRequestException(`No forecast found for period ${period}`);
    }

    const results: SensitivityAnalysisDto[] = [];

    // Test different scenarios
    const scenarios = [
      { income: percentageChange, expenses: 0 },
      { income: 0, expenses: percentageChange },
      { income: percentageChange, expenses: percentageChange },
    ];

    for (const scenario of scenarios) {
      const scenarioName =
        scenario.income !== 0 && scenario.expenses !== 0
          ? 'both'
          : scenario.income !== 0
            ? 'income'
            : 'expenses';

      if (variable !== 'both' && scenarioName !== variable) {
        continue;
      }

      const adjustedIncome =
        forecast.projectedIncome * (1 + scenario.income / 100);
      const adjustedExpenses =
        forecast.projectedExpenses * (1 + scenario.expenses / 100);
      const netFlow = adjustedIncome - adjustedExpenses;
      const projectedBalance30 =
        forecast.initialBalance + (netFlow * 30) / this.getPeriodDays(period);
      const projectedBalance90 =
        forecast.initialBalance + (netFlow * 90) / this.getPeriodDays(period);
      const projectedBalance365 =
        forecast.initialBalance + (netFlow * 365) / this.getPeriodDays(period);

      const becomesNegative = Math.min(
        projectedBalance30,
        projectedBalance90,
        projectedBalance365,
      ) < 0;

      results.push({
        variable: scenarioName,
        percentageChange,
        projectedBalance30Days: projectedBalance30,
        projectedBalance90Days: projectedBalance90,
        projectedBalance365Days: projectedBalance365,
        becomesNegative: becomesNegative,
        negativeDate: becomesNegative
          ? new Date(
              forecast.forecastDate.getTime() +
                (Math.abs(forecast.initialBalance) /
                  Math.abs(netFlow / this.getPeriodDays(period))) *
                  24 *
                  60 *
                  60 *
                  1000,
            )
          : undefined,
      });
    }

    return results;
  }

  /**
   * Private helper methods
   */

  private async getHistoricalData(user: User): Promise<HistoricalData> {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const incomes = await this.incomeRepository.find({
      where: {
        userId: user.id,
        date: MoreThan(sixMonthsAgo),
      },
    });

    const expenses = await this.expenseRepository.find({
      where: {
        userId: user.id,
        date: MoreThan(sixMonthsAgo),
      },
    });

    const monthlyIncome: number[] = [];
    const monthlyExpenses: number[] = [];
    const fixedExpensesList: number[] = [];
    const variableExpensesList: number[] = [];

    // Group by month
    for (let i = 0; i < 6; i++) {
      const monthStart = new Date();
      monthStart.setMonth(monthStart.getMonth() - i);
      monthStart.setDate(1);

      const monthEnd = new Date(monthStart);
      monthEnd.setMonth(monthEnd.getMonth() + 1);
      monthEnd.setDate(0);

      const monthIncome = incomes
        .filter(
          inc =>
            inc.date >= monthStart &&
            inc.date <= monthEnd,
        )
        .reduce((sum, inc) => sum + inc.amount, 0);

      const monthExpenses = expenses
        .filter(
          exp =>
            exp.date >= monthStart &&
            exp.date <= monthEnd,
        )
        .reduce((sum, exp) => sum + exp.amount, 0);

      if (monthIncome > 0) monthlyIncome.push(monthIncome);
      if (monthExpenses > 0) monthlyExpenses.push(monthExpenses);
    }

    return {
      monthlyIncome,
      monthlyExpenses,
      fixedExpenses: fixedExpensesList,
      variableExpenses: variableExpensesList,
      dataPoints: incomes.length + expenses.length,
    };
  }

  private calculateFixedExpenses(data: HistoricalData, days: number): number {
    // Approximate fixed expenses as 60% of average monthly
    const avgMonthly =
      data.monthlyExpenses.length > 0
        ? data.monthlyExpenses.reduce((a, b) => a + b, 0) /
          data.monthlyExpenses.length
        : 0;
    return (avgMonthly * 0.6 * days) / 30;
  }

  private calculateVariableExpenses(data: HistoricalData, days: number): number {
    // Variable expenses as 40% of average monthly
    const avgMonthly =
      data.monthlyExpenses.length > 0
        ? data.monthlyExpenses.reduce((a, b) => a + b, 0) /
          data.monthlyExpenses.length
        : 0;
    return (avgMonthly * 0.4 * days) / 30;
  }

  private calculateRecurringIncome(data: HistoricalData, days: number): number {
    const avgMonthly =
      data.monthlyIncome.length > 0
        ? data.monthlyIncome.reduce((a, b) => a + b, 0) /
          data.monthlyIncome.length
        : 0;
    return (avgMonthly * days) / 30;
  }

  private generateDetailedProjections(
    initialBalance: number,
    startDate: Date,
    days: number,
    historicalData: HistoricalData,
    incomes: any[],
    expenses: any[],
    planned: any[],
  ): ProjectionPointDto[] {
    const projections: ProjectionPointDto[] = [];
    let balance = initialBalance;

    const dailyVariableExpense = this.calculateVariableExpenses(historicalData, 1);
    const dailyFixedExpense = this.calculateFixedExpenses(historicalData, 1);

    for (let i = 0; i < days; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + i);

      // Add income for this date
      const dayIncome = incomes
        .filter(inc => inc.date.getDate() === currentDate.getDate())
        .reduce((sum, inc) => sum + inc.amount, 0);

      // Add expenses for this date
      const dayExpenses = expenses
        .filter(exp => exp.date.getDate() === currentDate.getDate())
        .reduce((sum, exp) => sum + exp.amount, 0);

      // O Planejado guarda os dois lados desde que as receitas recorrentes
      // passaram a ser projetadas. Sem separar, o salário previsto seria
      // DEBITADO do saldo — a previsão daria exatamente o contrário.
      const doDia = planned.filter(
        p =>
          p.dueDate.getDate() === currentDate.getDate() &&
          p.status !== 'paid' &&
          p.status !== 'cancelled',
      );

      const dayPlanned = doDia
        .filter(p => p.type !== 'income')
        .reduce((sum, p) => sum + Number(p.amount), 0);

      const dayPlannedIncome = doDia
        .filter(p => p.type === 'income')
        .reduce((sum, p) => sum + Number(p.amount), 0);

      // Update balance
      balance =
        balance + dayIncome + dayPlannedIncome - (dayExpenses + dayPlanned);

      projections.push({
        date: new Date(currentDate),
        projectedBalance: balance,
        income: dayIncome + dayPlannedIncome,
        expenses: dayExpenses + dayPlanned,
        minBalance: Math.min(balance, ...projections.map(p => p.projectedBalance)),
        week: Math.ceil((i + 1) / 7),
        month: Math.ceil((i + 1) / 30),
      });
    }

    return projections;
  }

  private analyzeSeasonality(
    data: HistoricalData,
    startDate: Date,
    endDate: Date,
  ) {
    const avgMonthly =
      data.monthlyExpenses.length > 0
        ? data.monthlyExpenses.reduce((a, b) => a + b, 0) /
          data.monthlyExpenses.length
        : 0;

    const variance =
      data.monthlyExpenses.length > 1
        ? Math.sqrt(
            data.monthlyExpenses.reduce(
              (sum, m) => sum + Math.pow(m - avgMonthly, 2),
              0,
            ) / data.monthlyExpenses.length,
          ) / avgMonthly
        : 0;

    let pattern: 'high' | 'low' | 'stable' = 'stable';
    if (variance > 0.3) pattern = 'high';
    else if (variance < 0.1) pattern = 'low';

    return {
      pattern,
      variance,
      peakDates: [], // TODO: Analyze by month/season
      lowDates: [],
    };
  }

  private generateRecommendations(
    currentBalance: number,
    projectedEnd: number,
    minBalance: number,
    daysLow: number,
    hasNegativeRisk: boolean,
    historicalData: HistoricalData,
  ): string[] {
    const recommendations: string[] = [];

    if (hasNegativeRisk) {
      recommendations.push(
        'Atenção: Seu saldo pode ficar negativo. Considere aumentar receitas ou reduzir despesas.',
      );
    }

    if (daysLow > 10) {
      recommendations.push(
        `Você terá ${daysLow} dias com saldo baixo. Considere criar uma reserva de emergência.`,
      );
    }

    if (projectedEnd < currentBalance) {
      recommendations.push(
        'Suas despesas projetadas excedem as receitas. Revise seu orçamento.',
      );
    } else if (projectedEnd > currentBalance * 1.2) {
      recommendations.push(
        'Suas receitas projetadas são maiores que as despesas. Considere investimentos.',
      );
    }

    if (historicalData.dataPoints < 60) {
      recommendations.push(
        'Você tem pouco histórico de dados. As previsões podem ser menos precisas.',
      );
    }

    return recommendations;
  }

  private generateSensitivityInsights(
    balance30: number,
    balance90: number,
    balance365: number,
    negative: boolean,
  ): string[] {
    const insights: string[] = [];

    if (negative) {
      insights.push('Risco alto: Este cenário levaria a saldo negativo.');
    } else if (
      balance30 < 2000 ||
      balance90 < 2000 ||
      balance365 < 2000
    ) {
      insights.push('Risco médio: Saldo projetado fica abaixo do recomendado.');
    } else {
      insights.push('Risco baixo: Saldo permaneceria confortável.');
    }

    if (balance365 > balance90 && balance90 > balance30) {
      insights.push('Tendência positiva de acúmulo de recursos.');
    }

    return insights;
  }

  private calculateConsistencyScore(data: HistoricalData): number {
    if (data.monthlyExpenses.length < 2) return 0.3;

    const avg =
      data.monthlyExpenses.reduce((a, b) => a + b, 0) /
      data.monthlyExpenses.length;
    const variance =
      data.monthlyExpenses.reduce(
        (sum, m) => sum + Math.pow(m - avg, 2),
        0,
      ) / data.monthlyExpenses.length;
    const stdDev = Math.sqrt(variance);
    const cv = stdDev / avg; // Coefficient of variation

    return Math.max(0.3, Math.min(0.95, 1 - cv));
  }

  private getPeriodDays(period: ForecastPeriod): number {
    switch (period) {
      case ForecastPeriod.SHORT:
        return 30;
      case ForecastPeriod.MEDIUM:
        return 90;
      case ForecastPeriod.LONG:
        return 365;
    }
  }

  private mapForecastToDto(forecast: Forecast): ForecastDto {
    return {
      id: forecast.id,
      period: forecast.period as ForecastPeriod,
      forecastDate: forecast.forecastDate,
      initialBalance: Number(forecast.initialBalance),
      projectedEndBalance: Number(forecast.projectedEndBalance),
      minProjectedBalance: Number(forecast.minProjectedBalance),
      minBalanceDate: forecast.minBalanceDate,
      projectedIncome: Number(forecast.projectedIncome),
      projectedExpenses: Number(forecast.projectedExpenses),
      fixedExpenses: Number(forecast.fixedExpenses),
      variableExpenses: Number(forecast.variableExpenses),
      installmentPayments: Number(forecast.installmentPayments),
      daysWithLowBalance: forecast.daysWithLowBalance,
      hasNegativeRisk: forecast.hasNegativeRisk,
      negativeRiskDate: forecast.negativeRiskDate,
      confidence: Number(forecast.confidence),
      detailedProjections: forecast.detailedProjections as ProjectionPointDto[],
      seasonalityAnalysis: forecast.seasonalityAnalysis as any,
      recommendations: forecast.recommendations,
      createdAt: forecast.createdAt,
    };
  }
}
