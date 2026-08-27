import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SpendingPattern } from '../entities/spending-pattern.entity';
import { Anomaly } from '../entities/anomaly.entity';
import { Expense } from '../../expenses/entities/expense.entity';
import { Income } from '../../income/entities/income.entity';
import { User } from '../../users/entities/user.entity';
import { Category } from '../../categories/entities/category.entity';
import {
  SpendingPatternDto,
  AnomalyDto,
  CategoryTrendAnalysisDto,
  BrunoGiovannaComparisonDto,
  AnalyticsSummaryDto,
} from '../dtos/analytics.dto';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(SpendingPattern)
    private spendingPatternRepo: Repository<SpendingPattern>,
    @InjectRepository(Anomaly)
    private anomalyRepo: Repository<Anomaly>,
    @InjectRepository(Expense)
    private expenseRepo: Repository<Expense>,
    @InjectRepository(Income)
    private incomeRepo: Repository<Income>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Category)
    private categoryRepo: Repository<Category>,
  ) {}

  // ==================== SPENDING PATTERNS ====================

  async calculateSpendingPattern(
    userId: string,
    month: number,
    year: number,
    categoryId?: string,
  ): Promise<SpendingPatternDto> {
    // Get expenses for the period
    const query = this.expenseRepo
      .createQueryBuilder('expense')
      .where('expense.userId = :userId', { userId })
      .andWhere('EXTRACT(MONTH FROM expense.date) = :month', { month })
      .andWhere('EXTRACT(YEAR FROM expense.date) = :year', { year });

    if (categoryId) {
      query.andWhere('expense.category = :categoryId', { categoryId });
    }

    const expenses = await query.orderBy('expense.amount', 'ASC').getMany();

    if (expenses.length === 0) {
      return this.createEmptyPattern(month, year, categoryId);
    }

    // Calculate statistics
    const amounts = expenses.map(e => parseFloat(e.amount.toString()));
    const totalSpent = amounts.reduce((sum, a) => sum + a, 0);
    const averageTransaction = totalSpent / amounts.length;
    const sortedAmounts = amounts.sort((a, b) => a - b);
    const medianTransaction =
      amounts.length % 2 === 0
        ? (sortedAmounts[amounts.length / 2 - 1] + sortedAmounts[amounts.length / 2]) / 2
        : sortedAmounts[Math.floor(amounts.length / 2)];

    const minTransaction = Math.min(...amounts);
    const maxTransaction = Math.max(...amounts);

    // Standard deviation
    const variance =
      amounts.reduce((sum, a) => sum + Math.pow(a - averageTransaction, 2), 0) / amounts.length;
    const standardDeviation = Math.sqrt(variance);

    // Get spending by day of month
    const dayMap = new Map<number, number>();
    expenses.forEach(e => {
      const day = new Date(e.date).getDate();
      dayMap.set(day, (dayMap.get(day) || 0) + parseFloat(e.amount.toString()));
    });

    const activeDays = dayMap.size;
    const highSpendingDays = Array.from(dayMap.entries())
      .filter(([_, amount]) => amount > averageTransaction)
      .map(([day]) => day);

    // Get top days (ISO dates)
    const topDays = expenses
      .sort((a, b) => parseFloat(b.amount.toString()) - parseFloat(a.amount.toString()))
      .slice(0, 3)
      .map(e => e.date.toISOString().split('T')[0]);

    // Pattern detection
    const pattern = this.detectSpendingPattern(dayMap);

    // Day of week analysis
    const dayOfWeekAnalysis = this.analyzeDayOfWeek(expenses);

    // Top establishments
    const topEstablishments = this.getTopEstablishments(expenses);

    // Historical comparison (need to fetch previous months)
    const historicalComparison = await this.getHistoricalComparison(
      userId,
      month,
      year,
      categoryId,
    );

    // Month over month change
    const monthOverMonthChange = await this.calculateMonthOverMonthChange(
      userId,
      month,
      year,
      totalSpent,
      categoryId,
    );

    // Deviation from 6-month average
    const deviationFromAverage = await this.calculateDeviationFromAverage(
      userId,
      month,
      year,
      totalSpent,
      categoryId,
    );

    // Generate insights
    const insights = this.generateSpendingInsights(
      totalSpent,
      averageTransaction,
      monthOverMonthChange,
      pattern,
      highSpendingDays.length,
    );

    return {
      id: categoryId ? `${userId}-${categoryId}-${year}-${month}` : `${userId}-${year}-${month}`,
      month,
      year,
      totalSpent,
      averageTransaction,
      medianTransaction,
      minTransaction,
      maxTransaction,
      standardDeviation,
      transactionCount: amounts.length,
      monthOverMonthChange,
      deviationFromAverage,
      highSpendingDays,
      activeDays,
      topDays,
      pattern,
      historicalComparison,
      dayOfWeekAnalysis,
      topEstablishments,
      insights,
    };
  }

  // ==================== ANOMALY DETECTION ====================

  async detectAnomalies(userId: string, month: number, year: number): Promise<AnomalyDto[]> {
    // Get current month expenses
    const currentExpenses = await this.expenseRepo
      .createQueryBuilder('expense')
      // `expense.category` é uma coluna de texto, não uma relação. O
      // `leftJoinAndSelect` que estava aqui fazia o TypeORM lançar "Relation
      // with property path category in entity was not found" — ou seja,
      // `/analytics/anomalies` e `/analytics/summary` respondiam 500 desde
      // sempre, para qualquer usuário com um lançamento no mês.
      .where('expense.userId = :userId', { userId })
      .andWhere('EXTRACT(MONTH FROM expense.date) = :month', { month })
      .andWhere('EXTRACT(YEAR FROM expense.date) = :year', { year })
      .orderBy('expense.date', 'ASC')
      .getMany();

    if (currentExpenses.length === 0) {
      return [];
    }

    // Get 6-month historical data for comparison
    const sixMonthsAgo = new Date(year, month - 7, 1); // 6 months back
    const historicalExpenses = await this.expenseRepo
      .createQueryBuilder('expense')
      .where('expense.userId = :userId', { userId })
      .andWhere('expense.date >= :sixMonthsAgo', { sixMonthsAgo })
      .getMany();

    const anomalies: AnomalyDto[] = [];

    // Detect spikes
    const spikeAnomalies = this.detectSpikes(currentExpenses, historicalExpenses);
    anomalies.push(...spikeAnomalies);

    // Detect pattern changes
    const patternAnomalies = await this.detectPatternChanges(userId, month, year);
    anomalies.push(...patternAnomalies);

    // Detect duplicates
    const duplicateAnomalies = this.detectDuplicates(currentExpenses);
    anomalies.push(...duplicateAnomalies);

    // Detect unusual merchants
    const merchantAnomalies = await this.detectUnusualMerchants(
      userId,
      currentExpenses,
      historicalExpenses,
    );
    anomalies.push(...merchantAnomalies);

    return anomalies.slice(0, 10); // Return top 10 anomalies
  }

  private detectSpikes(
    currentExpenses: Expense[],
    historicalExpenses: Expense[],
  ): AnomalyDto[] {
    const anomalies: AnomalyDto[] = [];

    // Calculate baseline statistics
    const historicalAmounts = historicalExpenses.map(e => parseFloat(e.amount.toString()));
    if (historicalAmounts.length === 0) return anomalies;

    const mean =
      historicalAmounts.reduce((sum, a) => sum + a, 0) / historicalAmounts.length;
    const variance =
      historicalAmounts.reduce((sum, a) => sum + Math.pow(a - mean, 2), 0) /
      historicalAmounts.length;
    const stdDev = Math.sqrt(variance);

    // Check each current expense for spikes
    currentExpenses.forEach(expense => {
      const amount = parseFloat(expense.amount.toString());
      const zscore = (amount - mean) / (stdDev || 1);

      // Spike if z-score > 2.5 (more than 2.5 standard deviations)
      if (zscore > 2.5) {
        const deviationPercentage = ((amount - mean) / mean) * 100;
        anomalies.push({
          id: expense.id,
          anomalyType: 'spike',
          description: `Gasto anormalmente alto em ${expense.description}`,
          month: new Date(expense.date).getMonth() + 1,
          year: new Date(expense.date).getFullYear(),
          detectedValue: amount,
          expectedValue: mean,
          deviationPercentage: Math.round(deviationPercentage),
          zscore: Math.round(zscore * 100) / 100,
          severity: zscore > 4 ? 'critical' : zscore > 3.5 ? 'high' : 'medium',
          merchantName: expense.establishment,
          anomalyDate: expense.date.toISOString().split('T')[0],
          daysIntoMonth: new Date(expense.date).getDate(),
          recommendation: `Este gasto está ${Math.round(deviationPercentage)}% acima do seu padrão histórico. Verifique se foi uma despesa planejada.`,
          isReviewed: false,
          categoryId: expense.category,
        });
      }
    });

    return anomalies;
  }

  private async detectPatternChanges(
    userId: string,
    month: number,
    year: number,
  ): Promise<AnomalyDto[]> {
    // Get current month pattern
    const currentPattern = await this.calculateSpendingPattern(userId, month, year);

    // Get previous month pattern
    const prevDate = new Date(year, month - 2, 1); // month is 1-12
    const prevMonth = prevDate.getMonth() + 1;
    const prevYear = prevDate.getFullYear();
    const previousPattern = await this.calculateSpendingPattern(userId, prevMonth, prevYear);

    const anomalies: AnomalyDto[] = [];

    // Check for significant pattern changes
    if (currentPattern.totalSpent && previousPattern.totalSpent) {
      const changePercentage =
        ((currentPattern.totalSpent - previousPattern.totalSpent) / previousPattern.totalSpent) *
        100;

      if (Math.abs(changePercentage) > 30) {
        // 30% change is significant
        anomalies.push({
          id: `pattern-change-${userId}-${year}-${month}`,
          anomalyType: 'pattern_change',
          description: `Mudança significativa no padrão de gastos (${Math.round(changePercentage)}%)`,
          month,
          year,
          detectedValue: currentPattern.totalSpent,
          expectedValue: previousPattern.totalSpent,
          deviationPercentage: Math.round(Math.abs(changePercentage)),
          zscore: 2.0,
          severity: Math.abs(changePercentage) > 50 ? 'high' : 'medium',
          recommendation: `Seu gasto total variou ${Math.round(changePercentage)}% em relação ao mês anterior. Revise se há motivos específicos.`,
          isReviewed: false,
        });
      }
    }

    return anomalies;
  }

  private detectDuplicates(expenses: Expense[]): AnomalyDto[] {
    const anomalies: AnomalyDto[] = [];
    const checked = new Set<string>();

    for (let i = 0; i < expenses.length; i++) {
      const exp1 = expenses[i];
      if (checked.has(exp1.id)) continue;

      for (let j = i + 1; j < expenses.length; j++) {
        const exp2 = expenses[j];

        // Check if potentially duplicate
        const sameDayAndAmount =
          exp1.date.toDateString() === exp2.date.toDateString() &&
          parseFloat(exp1.amount.toString()) === parseFloat(exp2.amount.toString()) &&
          exp1.description.toLowerCase() === exp2.description.toLowerCase();

        if (sameDayAndAmount) {
          checked.add(exp2.id);
          anomalies.push({
            id: exp2.id,
            anomalyType: 'duplicate',
            description: `Possível duplicação de lançamento: ${exp2.description}`,
            month: new Date(exp2.date).getMonth() + 1,
            year: new Date(exp2.date).getFullYear(),
            detectedValue: parseFloat(exp2.amount.toString()),
            expectedValue: parseFloat(exp1.amount.toString()),
            deviationPercentage: 0,
            zscore: 3.0,
            severity: 'high',
            recommendation: 'Verifique se este lançamento é uma duplicação do anterior.',
            isReviewed: false,
            categoryId: exp2.category,
          });
        }
      }
    }

    return anomalies;
  }

  private async detectUnusualMerchants(
    userId: string,
    currentExpenses: Expense[],
    historicalExpenses: Expense[],
  ): Promise<AnomalyDto[]> {
    const anomalies: AnomalyDto[] = [];

    // Count merchants in historical data
    const merchantCounts = new Map<string, number>();
    historicalExpenses.forEach(exp => {
      if (exp.establishment) {
        merchantCounts.set(exp.establishment, (merchantCounts.get(exp.establishment) || 0) + 1);
      }
    });

    // Check current expenses for merchants not seen before or very rare
    currentExpenses.forEach(exp => {
      if (exp.establishment) {
        const historicalCount = merchantCounts.get(exp.establishment) || 0;
        if (historicalCount === 0) {
          anomalies.push({
            id: exp.id,
            anomalyType: 'unusual_merchant',
            description: `Novo estabelecimento: ${exp.establishment}`,
            month: new Date(exp.date).getMonth() + 1,
            year: new Date(exp.date).getFullYear(),
            detectedValue: parseFloat(exp.amount.toString()),
            expectedValue: 0,
            deviationPercentage: 100,
            zscore: 2.0,
            severity: 'low',
            merchantName: exp.establishment,
            recommendation: `Este é um novo estabelecimento em seu histórico. Pode ser uma nova despesa ou um erro.`,
            isReviewed: false,
            categoryId: exp.category,
          });
        }
      }
    });

    return anomalies.slice(0, 5); // Limit to 5
  }

  // ==================== CATEGORY TRENDS ====================

  async analyzeCategoryTrends(
    userId: string,
    categoryId: string,
    months: number = 6,
  ): Promise<CategoryTrendAnalysisDto> {
    const today = new Date();
    const trendData = [];

    // Fetch data for the specified number of months
    for (let i = months - 1; i >= 0; i--) {
      const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const month = date.getMonth() + 1;
      const year = date.getFullYear();

      const expenses = await this.expenseRepo
        .createQueryBuilder('expense')
        .where('expense.userId = :userId', { userId })
        .andWhere('expense.category = :categoryId', { categoryId })
        .andWhere('EXTRACT(MONTH FROM expense.date) = :month', { month })
        .andWhere('EXTRACT(YEAR FROM expense.date) = :year', { year })
        .getMany();

      const totalSpent = expenses.reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0);
      const transactionCount = expenses.length;
      const averageTransaction = transactionCount > 0 ? totalSpent / transactionCount : 0;

      trendData.push({
        month,
        year,
        totalSpent,
        transactionCount,
        averageTransaction,
        date,
      });
    }

    // Get category info
    const category = await this.categoryRepo.findOne({ where: { id: categoryId } });
    const categoryName = category?.name || 'Unknown';

    // Calculate trend
    const amounts = trendData.map(d => d.totalSpent);
    const trend = this.calculateTrend(amounts);
    const trendPercentage =
      amounts.length > 1 ? ((amounts[amounts.length - 1] - amounts[0]) / amounts[0]) * 100 : 0;

    // Find best and worst months
    const bestMonth = trendData.reduce((prev, current) =>
      parseFloat(current.totalSpent.toString()) > parseFloat(prev.totalSpent.toString())
        ? current
        : prev,
    );
    const worstMonth = trendData.reduce((prev, current) =>
      parseFloat(current.totalSpent.toString()) < parseFloat(prev.totalSpent.toString())
        ? current
        : prev,
    );

    // Calculate statistics
    const average = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const variance =
      amounts.reduce((sum, a) => sum + Math.pow(a - average, 2), 0) / amounts.length;
    const standardDeviation = Math.sqrt(variance);

    // Forecast next month
    const estimatedNextMonth = this.forecastNextMonth(amounts);
    const confidence = Math.min(95, Math.max(50, (trendData.length / 12) * 100));

    return {
      categoryId,
      categoryName,
      last6Months: trendData.map((d, i) => ({
        categoryId,
        categoryName,
        month: d.month,
        year: d.year,
        totalSpent: d.totalSpent,
        transactionCount: d.transactionCount,
        averageTransaction: d.averageTransaction,
        percentOfTotal: 0, // Will be calculated in comparison context
      })),
      trend,
      trendPercentage: Math.round(trendPercentage),
      bestMonth: {
        month: bestMonth.month,
        year: bestMonth.year,
        amount: bestMonth.totalSpent,
      },
      worstMonth: {
        month: worstMonth.month,
        year: worstMonth.year,
        amount: worstMonth.totalSpent,
      },
      average,
      standardDeviation,
      forecast: {
        estimatedNextMonth,
        confidence: Math.round(confidence),
      },
    };
  }

  // ==================== BRUNO VS GIOVANNA COMPARISON ====================

  async compareBrunoGiovanna(
    month?: number,
    year?: number,
  ): Promise<BrunoGiovannaComparisonDto> {
    const today = new Date();
    if (!month) month = today.getMonth() + 1;
    if (!year) year = today.getFullYear();

    // Get Bruno and Giovanna users
    const bruno = await this.userRepo.findOne({ where: { email: 'bruno@casa.financeira' } });
    const giovanna = await this.userRepo.findOne({ where: { email: 'giovanna@casa.financeira' } });

    if (!bruno || !giovanna) {
      return this.createEmptyComparison(month, year);
    }

    // Get expenses for both users
    const brunoExpenses = await this.getMonthlyExpenses(bruno.id, month, year);
    const giovannaExpenses = await this.getMonthlyExpenses(giovanna.id, month, year);

    const brunoTotal = brunoExpenses.reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0);
    const giovannaTotal = giovannaExpenses.reduce(
      (sum, e) => sum + parseFloat(e.amount.toString()),
      0,
    );
    const totalTogether = brunoTotal + giovannaTotal;

    const brunoPercentage =
      totalTogether > 0 ? (brunoTotal / totalTogether) * 100 : 0;
    const giovannaPercentage =
      totalTogether > 0 ? (giovannaTotal / totalTogether) * 100 : 0;

    // Category comparison
    const categoryComparison = await this.compareCategoriesBetweenUsers(
      bruno.id,
      giovanna.id,
      month,
      year,
    );

    // Get trends for both
    const brunoTrend = await this.getUserTrend(bruno.id, month, year);
    const giovannaTrend = await this.getUserTrend(giovanna.id, month, year);

    // Generate insights
    const insights = this.generateComparisonInsights(
      brunoTotal,
      giovannaTotal,
      brunoTrend,
      giovannaTrend,
    );

    return {
      period: `${year}-${String(month).padStart(2, '0')}`,
      totalSpentBruno: brunoTotal,
      totalSpentGiovanna: giovannaTotal,
      totalSpentTogether: totalTogether,
      brunoPercentage: Math.round(brunoPercentage),
      giovannaPercentage: Math.round(giovannaPercentage),
      difference: Math.abs(brunoTotal - giovannaTotal),
      transactionCountBruno: brunoExpenses.length,
      transactionCountGiovanna: giovannaExpenses.length,
      averageTransactionBruno:
        brunoExpenses.length > 0 ? brunoTotal / brunoExpenses.length : 0,
      averageTransactionGiovanna:
        giovannaExpenses.length > 0 ? giovannaTotal / giovannaExpenses.length : 0,
      categoryComparison,
      trends: {
        bruno: brunoTrend,
        giovanna: giovannaTrend,
      },
      insights,
    };
  }

  // ==================== ANALYTICS SUMMARY ====================

  async getAnalyticsSummary(userId: string): Promise<AnalyticsSummaryDto> {
    const today = new Date();
    const month = today.getMonth() + 1;
    const year = today.getFullYear();

    // Get spending pattern
    const spendingPattern = await this.calculateSpendingPattern(userId, month, year);

    // Get anomalies
    const anomalies = await this.detectAnomalies(userId, month, year);
    const anomalySummary = this.summarizeAnomalies(anomalies);

    // Get top trends
    const topIncreasingCategories = await this.getTopTrendingCategories(userId, 'increasing');
    const topDecreasingCategories = await this.getTopTrendingCategories(userId, 'decreasing');

    // Get comparison
    const comparison = await this.compareBrunoGiovanna(month, year);

    // Generate overall insights
    const insights = this.generateOverallInsights(
      spendingPattern,
      anomalySummary.total,
      topIncreasingCategories.length > 0,
    );

    return {
      spendingPattern,
      anomalies: anomalySummary,
      trends: {
        topIncreasingCategories,
        topDecreasingCategories,
      },
      comparison,
      insights,
    };
  }

  // ==================== PRIVATE HELPERS ====================

  private createEmptyPattern(month: number, year: number, categoryId?: string): SpendingPatternDto {
    return {
      id: categoryId ? `empty-${categoryId}` : 'empty',
      month,
      year,
      totalSpent: 0,
      averageTransaction: 0,
      medianTransaction: 0,
      minTransaction: 0,
      maxTransaction: 0,
      standardDeviation: 0,
      transactionCount: 0,
      activeDays: 0,
      insights: ['Nenhuma despesa registrada neste período'],
    };
  }

  private detectSpendingPattern(dayMap: Map<number, number>): string {
    if (dayMap.size === 0) return 'irregular';

    const values = Array.from(dayMap.values());
    const avgPerDay = values.reduce((a, b) => a + b, 0) / values.length;
    const variance =
      values.reduce((sum, v) => sum + Math.pow(v - avgPerDay, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = stdDev / avgPerDay;

    if (coefficientOfVariation < 0.3) return 'daily';
    if (dayMap.size >= 20 && coefficientOfVariation < 0.6) return 'weekly';
    if (dayMap.size < 5) return 'monthly';
    return 'irregular';
  }

  private analyzeDayOfWeek(
    expenses: Expense[],
  ): {
    monday: number;
    tuesday: number;
    wednesday: number;
    thursday: number;
    friday: number;
    saturday: number;
    sunday: number;
    mostExpensiveDay: string;
  } {
    const dayMap: Record<string, number> = {
      monday: 0,
      tuesday: 0,
      wednesday: 0,
      thursday: 0,
      friday: 0,
      saturday: 0,
      sunday: 0,
    };
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

    expenses.forEach(e => {
      const dayOfWeek = new Date(e.date).getDay();
      dayMap[dayNames[dayOfWeek]] = (dayMap[dayNames[dayOfWeek]] || 0) + parseFloat(e.amount.toString());
    });

    const mostExpensiveDay = Object.keys(dayMap).reduce((a, b) =>
      dayMap[b] > dayMap[a] ? b : a,
    );

    return {
      monday: dayMap['monday'],
      tuesday: dayMap['tuesday'],
      wednesday: dayMap['wednesday'],
      thursday: dayMap['thursday'],
      friday: dayMap['friday'],
      saturday: dayMap['saturday'],
      sunday: dayMap['sunday'],
      mostExpensiveDay,
    };
  }

  private getTopEstablishments(
    expenses: Expense[],
  ): Array<{ name: string; count: number; totalSpent: number; averageTransaction: number }> {
    const merchantMap = new Map<
      string,
      { count: number; total: number; transactions: number[] }
    >();

    expenses.forEach(e => {
      const merchant = e.establishment || 'Unknown';
      const amount = parseFloat(e.amount.toString());
      const current = merchantMap.get(merchant) || { count: 0, total: 0, transactions: [] };
      current.count += 1;
      current.total += amount;
      current.transactions.push(amount);
      merchantMap.set(merchant, current);
    });

    return Array.from(merchantMap.entries())
      .map(([name, data]) => ({
        name,
        count: data.count,
        totalSpent: data.total,
        averageTransaction: data.total / data.count,
      }))
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 5);
  }

  /**
   * Total gasto em cada um dos últimos `quantidade` meses, do mais antigo para
   * o mais recente. O índice 0 é o mês mais antigo; o último é `month/year`.
   *
   * ESTE MÉTODO EXISTE PARA MATAR UMA RECURSÃO INFINITA.
   * ---------------------------------------------------
   * `getHistoricalComparison` e `calculateDeviationFromAverage` chamavam
   * `calculateSpendingPattern` num laço que começava em `i = 0` — ou seja, o
   * PRÓPRIO mês que estava sendo calculado, com argumentos idênticos. Como
   * `calculateSpendingPattern` chama as duas de volta, a única saída era o mês
   * não ter nenhum lançamento (o `return` antecipado do padrão vazio).
   *
   * Na prática: bastava existir UMA despesa no mês corrente para
   * `/analytics/summary` e `/analytics/spending-pattern` nunca responderem. A
   * tela ficava carregando até o navegador desistir.
   *
   * Uma única consulta agregada resolve os doze meses de uma vez, sem recursão
   * e sem as 19 idas ao banco por mês que o laço original fazia.
   */
  private async getTotaisMensais(
    userId: string,
    month: number,
    year: number,
    quantidade: number,
    categoryId?: string,
  ): Promise<number[]> {
    const inicio = new Date(year, month - quantidade, 1);
    // Primeiro instante do mês seguinte: pega o mês de referência inteiro sem
    // depender de quantos dias ele tem.
    const fim = new Date(year, month, 1);

    const query = this.expenseRepo
      .createQueryBuilder('expense')
      .select("TO_CHAR(expense.date, 'YYYY-MM')", 'competencia')
      .addSelect('COALESCE(SUM(expense.amount), 0)', 'total')
      .where('expense.userId = :userId', { userId })
      .andWhere('expense.date >= :inicio', { inicio })
      .andWhere('expense.date < :fim', { fim });

    if (categoryId) {
      query.andWhere('expense.category = :categoryId', { categoryId });
    }

    const linhas = await query.groupBy('competencia').getRawMany();

    const porCompetencia = new Map<string, number>(
      linhas.map((linha) => [linha.competencia, Number(linha.total) || 0]),
    );

    const totais: number[] = [];
    for (let i = quantidade - 1; i >= 0; i--) {
      const data = new Date(year, month - 1 - i, 1);
      const chave = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
      totais.push(porCompetencia.get(chave) ?? 0);
    }

    return totais;
  }

  private async getHistoricalComparison(
    userId: string,
    month: number,
    year: number,
    categoryId?: string,
  ) {
    const doze = await this.getTotaisMensais(userId, month, year, 12, categoryId);

    const data: { [key: string]: number[] } = {
      last3Months: doze.slice(-3),
      last6Months: doze.slice(-6),
      last12Months: doze,
    };

    const lastAmount = data.last3Months[data.last3Months.length - 1];
    const firstAmount = data.last3Months[0];
    const trend: 'increasing' | 'decreasing' | 'stable' =
      lastAmount > firstAmount * 1.1
        ? 'increasing'
        : lastAmount < firstAmount * 0.9
          ? 'decreasing'
          : 'stable';

    return {
      last3Months: data.last3Months,
      last6Months: data.last6Months,
      last12Months: data.last12Months,
      trend,
    };
  }

  private async calculateMonthOverMonthChange(
    userId: string,
    month: number,
    year: number,
    currentTotal: number,
    categoryId?: string,
  ): Promise<number> {
    // Dois meses agregados numa consulta só: [mês anterior, mês atual].
    // Chamar `calculateSpendingPattern` aqui reabria a recursão descrita em
    // `getTotaisMensais` — o padrão completo do mês anterior é muito mais do
    // que este cálculo precisa.
    const [anterior] = await this.getTotaisMensais(
      userId,
      month,
      year,
      2,
      categoryId,
    );

    if (!anterior) return 0;

    return ((currentTotal - anterior) / anterior) * 100;
  }

  private async calculateDeviationFromAverage(
    userId: string,
    month: number,
    year: number,
    currentTotal: number,
    categoryId?: string,
  ): Promise<number> {
    const seis = await this.getTotaisMensais(userId, month, year, 6, categoryId);
    const average = seis.reduce((soma, valor) => soma + valor, 0) / seis.length;
    if (average === 0) return 0;

    return ((currentTotal - average) / average) * 100;
  }

  private generateSpendingInsights(
    totalSpent: number,
    averageTransaction: number,
    monthOverMonthChange: number,
    pattern: string,
    highSpendingDaysCount: number,
  ): string[] {
    const insights = [];

    if (monthOverMonthChange > 30) {
      insights.push(`⚠️ Você gastou ${Math.round(monthOverMonthChange)}% a mais que no mês anterior`);
    } else if (monthOverMonthChange < -20) {
      insights.push(`✅ Você conseguiu reduzir gastos em ${Math.round(Math.abs(monthOverMonthChange))}%`);
    }

    if (pattern === 'daily') {
      insights.push('📅 Seu padrão é consistente com gastos espalhados ao longo do mês');
    } else if (pattern === 'weekly') {
      insights.push('📊 Seus gastos seguem um padrão semanal');
    } else if (pattern === 'monthly') {
      insights.push('💰 Seus gastos são concentrados em poucos dias');
    }

    if (highSpendingDaysCount > 0) {
      insights.push(`⚡ Você teve ${highSpendingDaysCount} dias com gastos acima da média`);
    }

    return insights.slice(0, 3);
  }

  private summarizeAnomalies(anomalies: AnomalyDto[]) {
    const summary = {
      total: anomalies.length,
      high: anomalies.filter(a => a.severity === 'high').length,
      medium: anomalies.filter(a => a.severity === 'medium').length,
      low: anomalies.filter(a => a.severity === 'low').length,
      unreviewed: anomalies.filter(a => !a.isReviewed).length,
      recentAnomalies: anomalies.slice(0, 3),
    };
    return summary;
  }

  private calculateTrend(values: number[]): 'increasing' | 'decreasing' | 'stable' {
    if (values.length < 2) return 'stable';

    const firstHalf = values.slice(0, Math.floor(values.length / 2)).reduce((a, b) => a + b) / Math.floor(values.length / 2);
    const secondHalf = values.slice(Math.floor(values.length / 2)).reduce((a, b) => a + b) / (values.length - Math.floor(values.length / 2));

    const changePercent = ((secondHalf - firstHalf) / firstHalf) * 100;

    return changePercent > 10 ? 'increasing' : changePercent < -10 ? 'decreasing' : 'stable';
  }

  private forecastNextMonth(values: number[]): number {
    if (values.length === 0) return 0;

    // Simple linear regression forecast
    const n = values.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumX2 += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return intercept + slope * n;
  }

  private async getMonthlyExpenses(userId: string, month: number, year: number) {
    return this.expenseRepo
      .createQueryBuilder('expense')
      .where('expense.userId = :userId', { userId })
      .andWhere('EXTRACT(MONTH FROM expense.date) = :month', { month })
      .andWhere('EXTRACT(YEAR FROM expense.date) = :year', { year })
      .getMany();
  }

  private async compareCategoriesBetweenUsers(
    brunoId: string,
    giovannaId: string,
    month: number,
    year: number,
  ) {
    const categories = await this.categoryRepo.find({ where: { type: 'expense' } });
    const comparison = [];

    for (const category of categories.slice(0, 7)) {
      // Top 7 categories
      const brunoExpenses = await this.expenseRepo
        .createQueryBuilder('expense')
        .where('expense.userId = :userId', { userId: brunoId })
        .andWhere('expense.category = :categoryId', { categoryId: category.id })
        .andWhere('EXTRACT(MONTH FROM expense.date) = :month', { month })
        .andWhere('EXTRACT(YEAR FROM expense.date) = :year', { year })
        .getMany();

      const giovannaExpenses = await this.expenseRepo
        .createQueryBuilder('expense')
        .where('expense.userId = :userId', { userId: giovannaId })
        .andWhere('expense.category = :categoryId', { categoryId: category.id })
        .andWhere('EXTRACT(MONTH FROM expense.date) = :month', { month })
        .andWhere('EXTRACT(YEAR FROM expense.date) = :year', { year })
        .getMany();

      const brunoSpent = brunoExpenses.reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0);
      const giovannaSpent = giovannaExpenses.reduce(
        (sum, e) => sum + parseFloat(e.amount.toString()),
        0,
      );
      const total = brunoSpent + giovannaSpent;

      if (total > 0) {
        comparison.push({
          categoryName: category.name,
          brunoSpent,
          giovannaSpent,
          brunoPercentage: (brunoSpent / total) * 100,
          giovannaPercentage: (giovannaSpent / total) * 100,
        });
      }
    }

    return comparison;
  }

  private async getUserTrend(
    userId: string,
    month: number,
    year: number,
  ): Promise<'increasing' | 'decreasing' | 'stable'> {
    const pattern = await this.calculateSpendingPattern(userId, month, year);
    return pattern.historicalComparison?.trend || 'stable';
  }

  private generateComparisonInsights(
    brunoTotal: number,
    giovannaTotal: number,
    brunoTrend: string,
    giovannaTrend: string,
  ): string[] {
    const insights = [];

    if (brunoTotal > giovannaTotal * 1.5) {
      insights.push(
        `Bruno gastou ${Math.round(((brunoTotal - giovannaTotal) / giovannaTotal) * 100)}% a mais que Giovanna`,
      );
    } else if (giovannaTotal > brunoTotal * 1.5) {
      insights.push(
        `Giovanna gastou ${Math.round(((giovannaTotal - brunoTotal) / brunoTotal) * 100)}% a mais que Bruno`,
      );
    } else {
      insights.push('Bruno e Giovanna tiveram gastos bastante equilibrados');
    }

    if (brunoTrend === 'increasing') {
      insights.push('📈 Gastos de Bruno estão em tendência de aumento');
    }
    if (giovannaTrend === 'increasing') {
      insights.push('📈 Gastos de Giovanna estão em tendência de aumento');
    }

    return insights.slice(0, 3);
  }

  private async getTopTrendingCategories(
    userId: string,
    trendType: 'increasing' | 'decreasing',
  ): Promise<CategoryTrendAnalysisDto[]> {
    const categories = await this.categoryRepo.find({ where: { type: 'expense' } });
    const trends = [];

    for (const category of categories) {
      const analysis = await this.analyzeCategoryTrends(userId, category.id, 6);
      if (analysis.trend === trendType) {
        trends.push(analysis);
      }
    }

    return trends
      .sort((a, b) => Math.abs(b.trendPercentage) - Math.abs(a.trendPercentage))
      .slice(0, 3);
  }

  private generateOverallInsights(
    pattern: SpendingPatternDto,
    anomalyCount: number,
    hasTrendingCategories: boolean,
  ): string[] {
    const insights = [];

    if (anomalyCount > 5) {
      insights.push(`🔔 Detectadas ${anomalyCount} anomalias em seus gastos - revise em detalhes`);
    }

    if (pattern.insights && pattern.insights.length > 0) {
      insights.push(...pattern.insights);
    }

    if (hasTrendingCategories) {
      insights.push('📊 Algumas categorias mostram tendência significativa - analise');
    }

    return insights.slice(0, 4);
  }

  private createEmptyComparison(month: number, year: number): BrunoGiovannaComparisonDto {
    return {
      period: `${year}-${String(month).padStart(2, '0')}`,
      totalSpentBruno: 0,
      totalSpentGiovanna: 0,
      totalSpentTogether: 0,
      brunoPercentage: 0,
      giovannaPercentage: 0,
      difference: 0,
      transactionCountBruno: 0,
      transactionCountGiovanna: 0,
      averageTransactionBruno: 0,
      averageTransactionGiovanna: 0,
      categoryComparison: [],
      trends: {
        bruno: 'stable',
        giovanna: 'stable',
      },
      insights: [],
    };
  }
}
