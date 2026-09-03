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
import { SaldoService } from '../../../modules/saldo/saldo.service';
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
    private readonly saldoService: SaldoService,
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
          ? `${emReais(totalPayments)} em pagamentos`
          : undefined,
      };

      days.push(daySnapshot);

      if (isCriticalDay) {
        criticalDays.push({
          date: currentDate,
          reason: `${emReais(totalPayments)} em pagamentos`,
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
   * Saldo em caixa hoje — derivado dos lançamentos.
   *
   * Já devolveu o valor fixo 5000; depois passou a somar `accounts.balance`.
   * As duas versões erravam pelo mesmo motivo: o número não vinha do que
   * aconteceu. Nada no sistema jamais escreveu nessa coluna, então ela era o
   * saldo digitado no cadastro da conta, parado desde então.
   */
  private async getCurrentBalance(user: User): Promise<number> {
    return this.saldoService.getSaldoTotal(user);
  }

  /**
   * Saldo de abertura do mês: o fechamento da véspera.
   *
   * A versão anterior procurava um snapshot do último dia do mês anterior e,
   * não achando, devolvia o saldo de HOJE. Como nenhum código do sistema jamais
   * gravou um snapshot, o primeiro ramo nunca executava — e todo mês, passado
   * ou futuro, abria com o mesmo número. Agora a abertura é calculada, e cada
   * mês abre onde o anterior fechou.
   */
  private async getOpeningBalance(user: User, monthStart: Date): Promise<number> {
    return this.saldoService.getSaldoDeAbertura(user, monthStart);
  }

  /**
   * EXTRATO da competência: o que de fato entrou e saiu da conta.
   *
   * Isto NÃO é projeção. A diferença é a razão de a tela existir:
   *
   *  - o Planejado responde "o que vem pela frente";
   *  - o extrato responde "onde eu estou agora".
   *
   * Misturar as duas coisas numa tela só foi o que tornou o saldo do Fluxo de
   * Caixa difícil de conferir: ele nunca batia com o saldo do banco, porque
   * carregava compromissos que ainda não aconteceram.
   *
   * O QUE ENTRA AQUI, e a regra é uma só — dinheiro que MOVEU a conta:
   *  - receitas lançadas;
   *  - despesas pagas fora do cartão;
   *  - faturas de cartão MARCADAS COMO PAGAS, na data do pagamento.
   *
   * O que NÃO entra: compras no cartão. Elas foram gastas, mas o dinheiro
   * continua na conta até a fatura ser paga — e é a fatura que aparece. Somar
   * as duas mostraria o mesmo dinheiro saindo duas vezes, e o saldo do topo
   * deixaria de bater com o extrato do banco.
   */
  async getStatement(
    user: User,
    month: number,
    year: number,
  ): Promise<{
    month: number;
    year: number;
    openingBalance: number;
    saldoAteHoje: number;
    closingBalance: number;
    totalEntradas: number;
    totalSaidas: number;
    movimentos: Array<{
      date: Date;
      tipo: 'entrada' | 'saida';
      descricao: string;
      categoria?: string;
      responsavel?: string;
      valor: number;
      origem: 'receita' | 'despesa' | 'fatura';
      saldoApos: number;
    }>;
  }> {
    if (month < 1 || month > 12 || year < 2000 || year > 2100) {
      throw new BadRequestException('Mês ou ano inválido');
    }

    const userIds = await this.scopeUserIds(user);
    const inicio = new Date(year, month - 1, 1);
    const fim = new Date(year, month, 0, 23, 59, 59);

    const [despesas, receitas, planejadas] = await Promise.all([
      // A despesa entra no extrato pela data do PAGAMENTO. Buscar por `date`
      // deixaria de fora a conta lançada em setembro e paga em outubro — que
      // pertence a outubro — e traria a de outubro paga adiantada em setembro.
      this.expenseRepository
        .createQueryBuilder('expense')
        .where('expense.userId IN (:...userIds)', { userIds })
        .andWhere(
          'COALESCE(expense.paidAt, expense.date) BETWEEN :inicio AND :fim',
          { inicio, fim },
        )
        .getMany(),
      this.incomeRepository.find({
        where: { userId: In(userIds), date: Between(inicio, fim) },
      }),
      this.plannedAccountRepository.find({
        where: { userId: In(userIds), status: 'paid' },
      }),
    ]);

    const movimentos: Array<{
      date: Date;
      tipo: 'entrada' | 'saida';
      descricao: string;
      categoria?: string;
      responsavel?: string;
      valor: number;
      origem: 'receita' | 'despesa' | 'fatura';
      saldoApos: number;
    }> = [];

    for (const r of receitas) {
      movimentos.push({
        date: r.date,
        tipo: 'entrada',
        descricao: r.description,
        categoria: (r as any).type,
        responsavel: r.responsible,
        valor: Number(r.amount),
        origem: 'receita',
        saldoApos: 0,
      });
    }

    for (const d of despesas) {
      // Compra no cartão não moveu a conta. Quem move é a fatura.
      if (d.paymentMethod === 'credit' && d.creditCardId) continue;

      // Extrato é o que ACONTECEU. Uma despesa ainda não paga é compromisso:
      // mostrá-la aqui faria o saldo do topo deixar de bater com o do banco,
      // que é exatamente o que esta tela existe para evitar.
      if (!d.isPaid) continue;

      movimentos.push({
        // Na data do pagamento, não na do lançamento — mesma regra da fatura.
        date: d.paidAt ?? d.date,
        tipo: 'saida',
        descricao: d.description,
        categoria: d.category,
        responsavel: d.responsible,
        valor: Number(d.amount),
        origem: 'despesa',
        saldoApos: 0,
      });
    }

    // Faturas pagas entram pela DATA DO PAGAMENTO, não pela do vencimento:
    // pagar adiantado ou em atraso muda o dia em que o dinheiro saiu.
    for (const p of planejadas) {
      // A consulta já filtra por `paid`, mas a regra é crítica demais para
      // depender só disso: uma fatura ainda não paga no extrato mostraria
      // dinheiro saindo que continua na conta.
      if (p.status !== 'paid') continue;
      if (!p.invoiceCompetencia || !p.creditCardId) continue;

      const quando = p.paymentDate ?? p.dueDate;
      if (quando < inicio || quando > fim) continue;

      movimentos.push({
        date: quando,
        tipo: 'saida',
        descricao: p.description,
        categoria: p.category ?? 'Cartão de crédito',
        responsavel: p.responsible,
        valor: Number(p.amount),
        origem: 'fatura',
        saldoApos: 0,
      });
    }

    movimentos.sort((a, b) => a.date.getTime() - b.date.getTime());

    const openingBalance = await this.getOpeningBalance(user, inicio);

    const hoje = new Date();
    hoje.setHours(23, 59, 59, 999);

    let saldo = openingBalance;
    let saldoAteHoje = openingBalance;
    let totalEntradas = 0;
    let totalSaidas = 0;

    for (const m of movimentos) {
      saldo += m.tipo === 'entrada' ? m.valor : -m.valor;
      m.saldoApos = Number(saldo.toFixed(2));

      if (m.tipo === 'entrada') totalEntradas += m.valor;
      else totalSaidas += m.valor;

      // O saldo do topo é o de HOJE: num mês futuro ele é o de abertura, num
      // mês passado é o de fechamento, e no mês corrente para no dia de hoje.
      if (m.date <= hoje) saldoAteHoje = saldo;
    }

    return {
      month,
      year,
      openingBalance: Number(openingBalance.toFixed(2)),
      saldoAteHoje: Number(saldoAteHoje.toFixed(2)),
      closingBalance: Number(saldo.toFixed(2)),
      totalEntradas: Number(totalEntradas.toFixed(2)),
      totalSaidas: Number(totalSaidas.toFixed(2)),
      movimentos,
    };
  }
}

/**
 * Valor em real brasileiro: `R$ 1.000,00`.
 *
 * `toFixed(2)` escrevia `R$ 1000.00` — ponto decimal e sem separador de
 * milhar. O texto ia inteiro para a tela dos dias críticos, ao lado dos
 * mesmos valores já formatados em pt-BR, e a diferença saltava aos olhos.
 */
function emReais(valor: number): string {
  return (
    valor
      .toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
      // O `Intl` separa "R$" do número com espaço NÃO separável (U+00A0).
      // Numa página ele é invisível, mas este texto também vai para e-mail e
      // relatório, onde vira "R$Â 1.000,00" na primeira codificação errada.
      .replace(/\u00a0/g, ' ')
  );
}
