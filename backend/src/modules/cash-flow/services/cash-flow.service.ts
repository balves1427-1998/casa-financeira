import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In } from 'typeorm';
import { CashFlowSnapshot } from '../entities/cash-flow-snapshot.entity';
import { User } from '../../../modules/users/entities/user.entity';
import { Expense } from '../../../modules/expenses/entities/expense.entity';
import { Income } from '../../../modules/income/entities/income.entity';
import { PlannedAccount } from '../../../modules/planned-accounts/entities/planned-account.entity';
import { CreditCard } from '../../../modules/credit-cards/entities/credit-card.entity';
import { Account } from '../../../modules/accounts/entities/account.entity';
import { FamiliesService } from '../../../modules/families/families.service';
import {
  CashFlowDayDto,
  CashFlowMonthDto,
  BestDayToShopDto,
  GetCashFlowAnalysisDto,
  GetBestDayToShopDto,
  CashFlowSummaryDto,
} from '../dtos/cash-flow.dto';

@Injectable()
export class CashFlowService {
  constructor(
    @InjectRepository(CashFlowSnapshot)
    private snapshotRepository: Repository<CashFlowSnapshot>,
    @InjectRepository(Expense)
    private expenseRepository: Repository<Expense>,
    @InjectRepository(Income)
    private incomeRepository: Repository<Income>,
    @InjectRepository(PlannedAccount)
    private plannedAccountRepository: Repository<PlannedAccount>,
    @InjectRepository(CreditCard)
    private creditCardRepository: Repository<CreditCard>,
    @InjectRepository(Account)
    private accountRepository: Repository<Account>,
    private familiesService: FamiliesService,
  ) {}

  /**
   * Ids dos usuários cujos lançamentos entram neste fluxo de caixa.
   *
   * O caixa é da CASA. Sem isso, cada pessoa via um saldo diferente para o
   * mesmo mês — o que torna o fluxo de caixa inútil justamente para o casal que
   * divide as contas.
   */
  private async scopeUserIds(user: User): Promise<string[]> {
    if (!user.familyId) {
      return [user.id];
    }

    const memberIds = await this.familiesService.getMemberIds(user.familyId);
    return memberIds.length > 0 ? memberIds : [user.id];
  }

  /**
   * Get cash flow for a specific month
   */
  async getMonthCashFlow(user: User, month: number, year: number): Promise<CashFlowMonthDto> {
    // Validate month/year
    if (month < 1 || month > 12 || year < 2000 || year > 2100) {
      throw new BadRequestException('Invalid month or year');
    }

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    // ESCOPO DE FAMÍLIA: o caixa é da casa, não de quem abriu a tela. Antes
    // cada consulta somava só os próprios lançamentos — o salário da Giovanna
    // não entrava no fluxo do Bruno, e o saldo projetado saía menor do que a
    // realidade para os dois.
    const userIds = await this.scopeUserIds(user);

    /**
     * COMPRA NO CRÉDITO NÃO TIRA DINHEIRO DA CONTA NO DIA DA COMPRA.
     *
     * Ela entra numa fatura que vence semanas depois, e a fatura já aparece no
     * Planejado como um único compromisso. Contar as duas coisas debitaria o
     * mesmo dinheiro duas vezes: uma no dia do supermercado, outra no
     * vencimento.
     *
     * Por isso o caixa ignora aqui as compras pagas no cartão — quem representa
     * esse dinheiro na projeção é a fatura, na data em que vence. As compras
     * continuam inteiras na aba Despesas: muda só QUANDO o dinheiro sai, não se
     * ele foi gasto.
     */
    const todasAsDespesas = await this.expenseRepository.find({
      where: {
        userId: In(userIds),
        date: Between(startDate, endDate),
      },
    });

    const expenses = todasAsDespesas.filter(
      (e) => !(e.paymentMethod === 'credit' && e.creditCardId),
    );

    const incomes = await this.incomeRepository.find({
      where: {
        userId: In(userIds),
        date: Between(startDate, endDate),
      },
    });

    const plannedAccounts = await this.plannedAccountRepository.find({
      where: {
        userId: In(userIds),
        dueDate: Between(startDate, endDate),
      },
    });

    // Calculate opening balance (from previous month end or default)
    const openingBalance = await this.getOpeningBalance(user, startDate);

    // Build daily snapshots
    //
    // Duas linhas de saldo caminham juntas:
    //
    //  - `saldoRealizado` só conhece o que já aconteceu (lançamentos de
    //    despesa e receita). Responde "quanto tenho hoje se nada do previsto
    //    acontecer".
    //  - `saldoProjetado` acumula TAMBÉM o que está previsto. É a resposta que
    //    a tela do Fluxo de Caixa precisa dar.
    //
    // O saldo projetado era calculado dia a dia sobre o saldo REALIZADO,
    // descontando apenas as contas daquele dia. Assim o dia 20 ignorava tudo o
    // que estava previsto do dia 1 ao 19, e a coluna nunca fechava: cada linha
    // partia de uma base diferente da anterior.
    const days: CashFlowDayDto[] = [];
    let saldoRealizado = openingBalance;
    let saldoProjetado = openingBalance;
    const criticalDays = [];

    for (let day = 1; day <= endDate.getDate(); day++) {
      const currentDate = new Date(year, month - 1, day);

      // Get transactions for this day
      const dayExpenses = expenses.filter(
        e => e.date.getDate() === day,
      );
      const dayIncomes = incomes.filter(
        i => i.date.getDate() === day,
      );
      // Só o que ainda está previsto entra na projeção. Uma conta marcada como
      // paga já virou lançamento real — contá-la de novo descontaria o mesmo
      // dinheiro duas vezes. Cancelada, idem: deixou de ser compromisso.
      const dayPlanned = plannedAccounts.filter(
        p =>
          p.dueDate.getDate() === day &&
          p.status !== 'paid' &&
          p.status !== 'cancelled',
      );

      // Colunas `decimal` voltam do PostgreSQL como string: sem Number() o
      // `+` concatenava os valores ("0" + "55.90" = "055.90") e todo o fluxo
      // de caixa saía como texto, com avgDailyExpenses = NaN.
      const dailyIncome = dayIncomes.reduce(
        (sum, i) => sum + Number(i.amount),
        0,
      );
      const dailyExpenses = dayExpenses.reduce(
        (sum, e) => sum + Number(e.amount),
        0,
      );

      // O Planejado guarda os dois lados desde que as receitas recorrentes
      // passaram a ser projetadas. Somar tudo como saída debitaria o salário
      // do saldo previsto — exatamente o oposto do que deve acontecer.
      const plannedAmount = dayPlanned
        .filter((p) => p.type !== 'income')
        .reduce((sum, p) => sum + Number(p.amount), 0);

      const plannedIncomeAmount = dayPlanned
        .filter((p) => p.type === 'income')
        .reduce((sum, p) => sum + Number(p.amount), 0);

      const aberturaProjetada = saldoProjetado;

      saldoRealizado = saldoRealizado + dailyIncome - dailyExpenses;
      saldoProjetado =
        saldoProjetado +
        dailyIncome -
        dailyExpenses +
        plannedIncomeAmount -
        plannedAmount;

      // Dia crítico é sobre dinheiro SAINDO: uma entrada prevista alta não
      // torna o dia arriscado, torna o contrário.
      const totalPayments = dailyExpenses + plannedAmount;
      const isCriticalDay = totalPayments > openingBalance * 0.15; // 15% of opening balance

      const daySnapshot: CashFlowDayDto = {
        date: currentDate,
        openingBalance: aberturaProjetada,
        dailyIncome,
        dailyExpenses,
        plannedAccountsAmount: plannedAmount,
        plannedIncomeAmount,
        closingBalance: saldoRealizado,
        projectedBalance: saldoProjetado,
        transactionCount: dayExpenses.length + dayIncomes.length + dayPlanned.length,
        isCriticalDay,
        criticalDayReason: isCriticalDay
          ? `R$ ${totalPayments.toFixed(2)} em pagamentos`
          : undefined,
      };

      days.push(daySnapshot);

      if (isCriticalDay) {
        criticalDays.push({
          date: currentDate,
          reason: `R$ ${totalPayments.toFixed(2)} em pagamentos`,
          totalPayments,
        });
      }
    }

    // Calculate totals
    const totalIncome = incomes.reduce((sum, i) => sum + Number(i.amount), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const previstas = plannedAccounts.filter(
      (p) => p.status !== 'paid' && p.status !== 'cancelled',
    );

    const totalPlanned = previstas
      .filter((p) => p.type !== 'income')
      .reduce((sum, p) => sum + Number(p.amount), 0);

    const totalPlannedIncome = previstas
      .filter((p) => p.type === 'income')
      .reduce((sum, p) => sum + Number(p.amount), 0);
    const avgDailyExpenses = totalExpenses / endDate.getDate();

    return {
      month,
      year,
      days,
      openingBalance,
      totalIncome,
      totalExpenses,
      totalPlanned,
      totalPlannedIncome,
      closingBalance: saldoRealizado,
      avgDailyExpenses,
      criticalDays,
    };
  }

  /**
   * Fluxo de caixa de um PERÍODO, atravessando a virada de mês.
   *
   * `getMonthCashFlow` responde por competência, que é o recorte certo para a
   * tela do Fluxo de Caixa. Já a recomendação de compra olha os próximos 30
   * dias — que, perguntados no dia 25, caem quase todos no mês seguinte.
   *
   * Os dias vêm concatenados na ordem, e os dias críticos de todos os meses
   * envolvidos são reunidos numa lista só.
   */
  private async getPeriodoCashFlow(
    user: User,
    inicio: Date,
    fim: Date,
  ): Promise<CashFlowMonthDto> {
    const meses: CashFlowMonthDto[] = [];

    const cursor = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
    const ultimo = new Date(fim.getFullYear(), fim.getMonth(), 1);

    // Teto de segurança: uma janela absurda informada pelo cliente não pode
    // virar centenas de consultas.
    for (let i = 0; i < 13 && cursor <= ultimo; i++) {
      meses.push(
        await this.getMonthCashFlow(
          user,
          cursor.getMonth() + 1,
          cursor.getFullYear(),
        ),
      );
      cursor.setMonth(cursor.getMonth() + 1);
    }

    if (meses.length === 0) {
      return this.getMonthCashFlow(
        user,
        inicio.getMonth() + 1,
        inicio.getFullYear(),
      );
    }

    const primeiro = meses[0];

    return {
      ...primeiro,
      days: meses.flatMap((mes) => mes.days),
      criticalDays: meses.flatMap((mes) => mes.criticalDays),
    };
  }

  /**
   * Get best day to make a purchase
   */
  async getBestDayToShop(
    user: User,
    dto: GetBestDayToShopDto,
  ): Promise<BestDayToShopDto> {
    if (dto.desiredAmount <= 0) {
      throw new BadRequestException('Desired amount must be greater than 0');
    }

    const startDate = new Date(dto.startDate || new Date());
    // Normalizado para o INÍCIO do dia. Os dias do fluxo de caixa vêm à
    // meia-noite, então comparar com a hora atual excluía o próprio dia de
    // hoje. No dia 31 do mês isso esvaziava a lista inteira e a rota quebrava
    // com "Cannot read properties of undefined (reading 'date')".
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(
      dto.endDate || new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000),
    );
    endDate.setHours(23, 59, 59, 999);

    const minBalance = dto.minimumBalanceThreshold || 2000;

    // A janela de 30 dias quase sempre atravessa a virada do mês. Consultar
    // apenas o mês de início deixava de fora justamente os dias recomendados
    // quando a pergunta era feita perto do fim do mês.
    const monthCashFlow = await this.getPeriodoCashFlow(
      user,
      startDate,
      endDate,
    );

    // Find best days (high projected balance, no critical days)
    const goodDays = monthCashFlow.days
      .filter(
        day =>
          day.date >= startDate &&
          day.date <= endDate &&
          day.projectedBalance >= minBalance + dto.desiredAmount &&
          !day.isCriticalDay,
      )
      .sort((a, b) => b.projectedBalance - a.projectedBalance);

    if (goodDays.length === 0) {
      // No perfect days, find least risky
      const riskyDays = monthCashFlow.days
        .filter(day => day.date >= startDate && day.date <= endDate)
        .sort((a, b) => b.projectedBalance - a.projectedBalance);

      const recommendedDay = riskyDays[0];

      // Sem nenhum dia no período não há o que recomendar. Antes o código
      // seguia adiante e estourava ao ler `.date` de `undefined` — devolver um
      // 500 para uma pergunta legítima. Dizer que não há base é mais honesto.
      if (!recommendedDay) {
        throw new BadRequestException(
          'Não há dias de fluxo de caixa no período informado para calcular a recomendação.',
        );
      }

      return {
        recommendedDate: recommendedDay.date,
        reason: '⚠️ Nenhum dia ideal encontrado. Este é o melhor disponível.',
        projectedBalance: recommendedDay.projectedBalance,
        recommendedStartDate: recommendedDay.date,
        recommendedEndDate: recommendedDay.date,
        safeSpendingLimit: Math.max(0, recommendedDay.projectedBalance - minBalance),
        daysToAvoid: monthCashFlow.criticalDays.slice(0, 3).map(d => ({
          date: d.date,
          reason: d.reason,
          paymentAmount: d.totalPayments,
        })),
        isRiskyForDesiredAmount: recommendedDay.projectedBalance < minBalance + dto.desiredAmount,
        riskReason: `Saldo insuficiente. Faltam R$ ${(minBalance + dto.desiredAmount - recommendedDay.projectedBalance).toFixed(2)}`,
      };
    }

    // Return best period (from first good day to last good day before critical day)
    const bestStart = goodDays[0];
    const bestEnd = goodDays[goodDays.length - 1];

    // Check for critical days in between
    const criticalInPeriod = monthCashFlow.criticalDays.filter(
      c => c.date >= bestStart.date && c.date <= bestEnd.date,
    );

    // If critical day in period, shorten window
    let finalEnd = bestEnd;
    if (criticalInPeriod.length > 0) {
      const daysBeforeCritical = monthCashFlow.days.filter(
        d => d.date < criticalInPeriod[0].date && d.date >= bestStart.date,
      );
      finalEnd = daysBeforeCritical[daysBeforeCritical.length - 1] || bestStart;
    }

    return {
      recommendedDate: bestStart.date,
      reason: `🟢 Melhor período para compras`,
      projectedBalance: bestStart.projectedBalance,
      recommendedStartDate: bestStart.date,
      recommendedEndDate: finalEnd.date,
      safeSpendingLimit: bestStart.projectedBalance - minBalance,
      daysToAvoid: monthCashFlow.criticalDays.slice(0, 3).map(d => ({
        date: d.date,
        reason: d.reason,
        paymentAmount: d.totalPayments,
      })),
      isRiskyForDesiredAmount: false,
    };
  }

  /**
   * Get cash flow summary
   */
  async getCashFlowSummary(user: User): Promise<CashFlowSummaryDto> {
    const now = new Date();
    const currentMonth = await this.getMonthCashFlow(user, now.getMonth() + 1, now.getFullYear());

    // Get current balance from accounts
    const balance = await this.getCurrentBalance(user);

    // Calculate trend (compare with previous month)
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1);
    const previousMonthCF = await this.getMonthCashFlow(
      user,
      prevMonth.getMonth() + 1,
      prevMonth.getFullYear(),
    );

    const trend = previousMonthCF.totalExpenses > 0
      ? ((currentMonth.totalExpenses - previousMonthCF.totalExpenses) / previousMonthCF.totalExpenses) * 100
      : 0;

    // Count days with low balance
    const minBalance = 2000;
    const daysLow = currentMonth.days.filter(d => d.projectedBalance < minBalance).length;

    return {
      currentBalance: balance,
      totalIncome: currentMonth.totalIncome,
      totalExpenses: currentMonth.totalExpenses,
      totalPlanned: currentMonth.totalPlanned,
      // Fim de mês PREVISTO: o saldo projetado do último dia, que já acumula
      // tudo o que está por acontecer. `closingBalance` só conhece o realizado
      // e respondia sempre como se nenhuma conta fosse vencer.
      projectedEndOfMonth:
        currentMonth.days[currentMonth.days.length - 1]?.projectedBalance ??
        currentMonth.closingBalance,
      criticalDaysCount: currentMonth.criticalDays.length,
      nextCriticalDay: currentMonth.criticalDays[0]?.date,
      nextCriticalDayAmount: currentMonth.criticalDays[0]?.totalPayments,
      daysWithLowBalance: daysLow,
      balanceTrendPercentage: -trend, // Negative = spending less = positive trend
    };
  }

  /**
   * Helper: Get current balance from all accounts
   */
  private async getCurrentBalance(user: User): Promise<number> {
    // Antes devolvia o valor fixo 5000, o que fazia todo o fluxo de caixa e o
    // "melhor dia para compras" serem calculados sobre um saldo inventado.
    // Cartões de crédito ficam de fora: o saldo deles é dívida, não disponível.
    const result = await this.accountRepository
      .createQueryBuilder('account')
      .where('account.userId = :userId', { userId: user.id })
      .andWhere('account.type != :creditCard', { creditCard: 'credit_card' })
      .select('SUM(account.balance)', 'total')
      .getRawOne<{ total: string | null }>();

    return Number(result?.total ?? 0) || 0;
  }

  /**
   * Helper: Get opening balance for a month
   */
  private async getOpeningBalance(user: User, monthStart: Date): Promise<number> {
    // Try to get from previous month's snapshot
    const previousDay = new Date(monthStart.getTime() - 24 * 60 * 60 * 1000);

    const snapshot = await this.snapshotRepository.findOne({
      where: {
        userId: user.id,
        snapshotDate: previousDay,
      },
    });

    if (snapshot) {
      return snapshot.closingBalance;
    }

    // Otherwise get current account balance
    return this.getCurrentBalance(user);
  }
}
