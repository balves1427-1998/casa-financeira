import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { User } from '../../users/entities/user.entity';
import { Expense } from '../../expenses/entities/expense.entity';
import { Income } from '../../income/entities/income.entity';
import { FinancialDataService } from '../../financial-data/financial-data.service';
import {
  CategoryAggregate,
  PeriodRange,
  ResponsibleAggregate,
} from '../../financial-data/financial-data.types';
import { GoalsService } from '../../goals/goals.service';
import { SplitService } from '../../split/split.service';
import { CategoriesService } from '../../categories/categories.service';
import { PlannedAccountsService } from '../../planned-accounts/planned-accounts.service';
import { CreditCardsService } from '../../credit-cards/credit-cards.service';
import { RecommendationsService } from '../../ai/services/recommendations.service';

import {
  formatarMesAno,
  formatarMesCurto,
  formatarPercentual,
  formatarReal,
} from '../utils/br-format';
import {
  AlertLine,
  BudgetLine,
  BudgetsSection,
  CategoryLine,
  ComparisonSection,
  CreditCardSection,
  GoalLine,
  GoalsSection,
  InstallmentLine,
  InstallmentsSection,
  MonthlyReport,
  NetWorthPoint,
  NetWorthSection,
  PlannedAccountLine,
  PlannedAccountsGroup,
  PlannedAccountsSection,
  ReportOverview,
  ReportPeriod,
  ResponsibleLine,
  SplitSection,
  SuggestionLine,
  TransactionLine,
  Variation,
} from '../reports.types';

/** Um dia em milissegundos. */
const UM_DIA = 86_400_000;

/** Janela da "Evolução patrimonial": 12 meses. */
const MESES_EVOLUCAO = 12;

/**
 * Monta o Relatório Mensal (item 28 do escopo do projeto).
 *
 * ESCOPO: tudo é agregado por FAMÍLIA. Antes desta reescrita o módulo consultava
 * `expense.transactionDate` — coluna que nunca existiu (a entidade usa `date`) —
 * e escopava por `userId`, enquanto todo o resto do sistema agrega pela casa.
 *
 * ORIGEM DOS NÚMEROS: nada é calculado direto no banco aqui. Os lançamentos
 * entram exclusivamente pelo `FinancialDataService`, que é a porta de entrada do
 * sistema para as tabelas financeiras; metas, rateio, orçamentos, contas
 * planejadas, cartões e sugestões vêm dos serviços que já os implementam.
 *
 * REGRA 27 DO PROJETO: sem lançamentos no período, o relatório DIZ isso em
 * `notices` e devolve `hasData: false` — nunca preenche com exemplos, e campos
 * sem base de comparação ficam `null` em vez de zero. Nenhum valor é aleatório.
 *
 * DECIMAIS: as colunas `decimal` chegam como STRING do driver do PostgreSQL.
 * Todo valor lido passa por `Number()` antes de qualquer soma.
 */
@Injectable()
export class MonthlyReportService {
  private readonly logger = new Logger(MonthlyReportService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly financialData: FinancialDataService,
    private readonly goalsService: GoalsService,
    private readonly splitService: SplitService,
    private readonly categoriesService: CategoriesService,
    private readonly plannedAccountsService: PlannedAccountsService,
    private readonly creditCardsService: CreditCardsService,
    private readonly recommendationsService: RecommendationsService,
  ) {}

  // ==================== montagem ====================

  /**
   * Monta a estrutura consolidada do mês.
   *
   * @param familyId família do usuário autenticado (resolvida por `@CurrentFamily()`)
   * @param user usuário autenticado — necessário para os serviços que escopam
   *   pelo próprio usuário (metas, orçamentos, recomendações)
   */
  async build(
    familyId: string,
    user: User,
    mes: number,
    ano: number,
    referencia = new Date(),
  ): Promise<MonthlyReport> {
    this.validarCompetencia(mes, ano);

    const period = this.montarPeriodo(mes, ano);
    const anterior = this.mesAnterior(mes, ano);
    const periodoAnterior = this.montarPeriodo(anterior.mes, anterior.ano);

    const notices: string[] = [];

    // Lançamentos do mês e do mês anterior, sempre pela porta de entrada única.
    const [
      resumo,
      resumoAnterior,
      categorias,
      categoriasAnteriores,
      responsaveis,
      responsaveisAnteriores,
      despesas,
      receitas,
      saldoAtual,
    ] = await Promise.all([
      this.financialData.getSummary(familyId, this.paraRange(period)),
      this.financialData.getSummary(familyId, this.paraRange(periodoAnterior)),
      this.financialData.getExpensesByCategory(familyId, this.paraRange(period)),
      this.financialData.getExpensesByCategory(
        familyId,
        this.paraRange(periodoAnterior),
      ),
      this.financialData.getExpensesByResponsible(
        familyId,
        this.paraRange(period),
      ),
      this.financialData.getExpensesByResponsible(
        familyId,
        this.paraRange(periodoAnterior),
      ),
      this.financialData.getExpenses(familyId, this.paraRange(period)),
      this.financialData.getIncomes(familyId, this.paraRange(period)),
      this.financialData.getCurrentBalance(familyId),
    ]);

    const hasData = resumo.expenseCount > 0 || resumo.incomeCount > 0;

    if (!hasData) {
      notices.push(
        `Não há nenhum lançamento registrado em ${period.label}. ` +
          'Os totais deste relatório são zero porque não existem dados no período — ' +
          'nenhum valor foi estimado.',
      );
    }

    const membros = await this.carregarMembros(familyId, user);

    const [
      plannedAccounts,
      creditCards,
      goals,
      budgets,
      split,
      suggestions,
    ] = await Promise.all([
      this.montarContasPlanejadas(membros, mes, ano, referencia),
      this.montarCartoes(membros, despesas, resumo.totalExpenses),
      this.montarMetas(user),
      this.montarOrcamentos(membros, mes, ano, referencia),
      this.montarDivisao(familyId, user, mes, ano, referencia),
      this.montarSugestoes(user, familyId),
    ]);

    const byCategory = this.montarCategorias(categorias, categoriasAnteriores);
    const byResponsible = this.montarResponsaveis(
      responsaveis,
      responsaveisAnteriores,
    );

    const gastoNoCartao = this.somarDespesasDeCartao(despesas);
    const gastoNoCartaoAnterior = await this.gastoDeCartaoNoPeriodo(
      familyId,
      periodoAnterior,
    );

    const overview = this.montarIndicadores(
      resumo,
      despesas,
      period,
      saldoAtual,
    );

    const comparison: ComparisonSection = {
      previousLabel: periodoAnterior.label,
      previousHasData:
        resumoAnterior.expenseCount > 0 || resumoAnterior.incomeCount > 0,
      income: this.calcularVariacao(
        resumo.totalIncomes,
        resumoAnterior.totalIncomes,
      ),
      expenses: this.calcularVariacao(
        resumo.totalExpenses,
        resumoAnterior.totalExpenses,
      ),
      balance: this.calcularVariacao(
        resumo.totalIncomes - resumo.totalExpenses,
        resumoAnterior.totalIncomes - resumoAnterior.totalExpenses,
      ),
      creditCard: this.calcularVariacao(gastoNoCartao, gastoNoCartaoAnterior),
      biggestIncreases: byCategory
        .filter((c) => c.variationAbsolute > 0)
        .sort((a, b) => b.variationAbsolute - a.variationAbsolute)
        .slice(0, 5),
      biggestDecreases: byCategory
        .filter((c) => c.variationAbsolute < 0)
        .sort((a, b) => a.variationAbsolute - b.variationAbsolute)
        .slice(0, 5),
    };

    if (!comparison.previousHasData) {
      notices.push(
        `Não há lançamentos em ${periodoAnterior.label}. ` +
          'As variações percentuais em relação ao mês anterior não puderam ser ' +
          'calculadas e aparecem como "sem base de comparação".',
      );
    }

    const netWorth = await this.montarEvolucaoPatrimonial(
      familyId,
      mes,
      ano,
      saldoAtual,
      referencia,
    );

    if (netWorth.monthsWithData < 2) {
      notices.push(
        'Há menos de dois meses com lançamentos no histórico: a evolução ' +
          'patrimonial ainda não representa uma tendência.',
      );
    }

    const installments = this.montarParcelamentos(despesas);

    const alerts = this.montarAlertas(
      period,
      overview,
      budgets,
      plannedAccounts,
      creditCards,
      comparison,
      referencia,
    );

    if (suggestions.length === 0) {
      notices.push(
        'Nenhuma sugestão de economia foi gerada: as regras de recomendação não ' +
          'encontraram lançamentos suficientes para sustentar uma sugestão.',
      );
    }

    return {
      familyId,
      generatedAt: new Date(),
      period,
      hasData,
      notices,
      overview,
      byCategory,
      byResponsible,
      split,
      plannedAccounts,
      creditCards,
      installments,
      netWorth,
      goals,
      budgets,
      alerts,
      comparison,
      suggestions,
      transactions: this.montarLancamentos(despesas, receitas),
    };
  }

  // ==================== período ====================

  private validarCompetencia(mes: number, ano: number): void {
    if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
      throw new BadRequestException('O mês deve ser um número inteiro de 1 a 12.');
    }

    if (!Number.isInteger(ano) || ano < 1970 || ano > 2999) {
      throw new BadRequestException('O ano informado é inválido.');
    }
  }

  /** Primeiro e último instante do mês da competência. */
  private montarPeriodo(mes: number, ano: number): ReportPeriod {
    const start = new Date(ano, mes - 1, 1, 0, 0, 0, 0);
    // Dia 0 do mês seguinte é o último dia deste mês — resolve fevereiro e
    // anos bissextos sem tabela de dias.
    const end = new Date(ano, mes, 0, 23, 59, 59, 999);

    return {
      month: mes,
      year: ano,
      label: formatarMesAno(mes, ano),
      start,
      end,
      days: end.getDate(),
    };
  }

  /**
   * Mês anterior à competência.
   *
   * Janeiro volta para dezembro do ano anterior. A lógica antiga comparava
   * `EXTRACT(MONTH) >= x AND <= y`, que nunca funcionou em períodos que cruzam
   * o ano.
   */
  private mesAnterior(mes: number, ano: number): { mes: number; ano: number } {
    return mes === 1 ? { mes: 12, ano: ano - 1 } : { mes: mes - 1, ano };
  }

  private paraRange(periodo: ReportPeriod): PeriodRange {
    return { start: periodo.start, end: periodo.end };
  }

  // ==================== indicadores ====================

  private montarIndicadores(
    resumo: {
      totalExpenses: number;
      totalIncomes: number;
      expenseCount: number;
      incomeCount: number;
    },
    despesas: Expense[],
    periodo: ReportPeriod,
    saldoAtual: number,
  ): ReportOverview {
    const totalIncome = this.arredondar(resumo.totalIncomes);
    const totalExpenses = this.arredondar(resumo.totalExpenses);
    const balance = this.arredondar(totalIncome - totalExpenses);

    const valores = despesas.map((d) => Number(d.amount) || 0);

    return {
      totalIncome,
      totalExpenses,
      balance,
      incomeCount: resumo.incomeCount,
      expenseCount: resumo.expenseCount,
      transactionCount: resumo.incomeCount + resumo.expenseCount,
      // A média diária usa os dias do MÊS, não o intervalo lido do banco.
      averageDailyExpense: this.arredondar(totalExpenses / periodo.days),
      // Sem receita não existe "taxa de poupança" — devolver 0 ou 100 mentiria.
      savingsRate:
        totalIncome > 0 ? this.arredondar((balance / totalIncome) * 100) : null,
      currentBalance: this.arredondar(saldoAtual),
      highestExpense: valores.length > 0 ? this.arredondar(Math.max(...valores)) : null,
      lowestExpense: valores.length > 0 ? this.arredondar(Math.min(...valores)) : null,
    };
  }

  // ==================== categorias e responsáveis ====================

  private montarCategorias(
    atuais: CategoryAggregate[],
    anteriores: CategoryAggregate[],
  ): CategoryLine[] {
    const mapaAnterior = new Map<string, number>(
      anteriores.map((c) => [c.category, Number(c.total) || 0]),
    );

    const linhas: CategoryLine[] = atuais.map((c) => {
      const total = this.arredondar(Number(c.total) || 0);
      const previousTotal = this.arredondar(mapaAnterior.get(c.category) ?? 0);
      mapaAnterior.delete(c.category);

      const variacao = this.calcularVariacao(total, previousTotal);

      return {
        category: c.category ?? 'Outros',
        total,
        count: Number(c.count) || 0,
        average: this.arredondar(Number(c.average) || 0),
        // `share` chega de 0 a 1 do FinancialDataService; o relatório usa 0–100.
        share: this.arredondar(Number(c.share) * 100),
        previousTotal,
        variationAbsolute: variacao.absolute,
        variationPercent: variacao.percent,
      };
    });

    // Categorias que existiam no mês anterior e sumiram neste mês também são
    // informação: entram com total zero e variação negativa.
    for (const [category, previousTotal] of mapaAnterior.entries()) {
      const variacao = this.calcularVariacao(0, previousTotal);

      linhas.push({
        category: category ?? 'Outros',
        total: 0,
        count: 0,
        average: 0,
        share: 0,
        previousTotal: this.arredondar(previousTotal),
        variationAbsolute: variacao.absolute,
        variationPercent: variacao.percent,
      });
    }

    return linhas.sort((a, b) => b.total - a.total);
  }

  private montarResponsaveis(
    atuais: ResponsibleAggregate[],
    anteriores: ResponsibleAggregate[],
  ): ResponsibleLine[] {
    const mapaAnterior = new Map<string, number>(
      anteriores.map((r) => [r.responsible, Number(r.total) || 0]),
    );

    const linhas: ResponsibleLine[] = atuais.map((r) => {
      const total = this.arredondar(Number(r.total) || 0);
      const previousTotal = this.arredondar(mapaAnterior.get(r.responsible) ?? 0);
      mapaAnterior.delete(r.responsible);

      const variacao = this.calcularVariacao(total, previousTotal);

      return {
        responsible: r.responsible ?? 'não informado',
        total,
        count: Number(r.count) || 0,
        share: this.arredondar(Number(r.share) * 100),
        previousTotal,
        variationAbsolute: variacao.absolute,
        variationPercent: variacao.percent,
      };
    });

    for (const [responsible, previousTotal] of mapaAnterior.entries()) {
      const variacao = this.calcularVariacao(0, previousTotal);

      linhas.push({
        responsible: responsible ?? 'não informado',
        total: 0,
        count: 0,
        share: 0,
        previousTotal: this.arredondar(previousTotal),
        variationAbsolute: variacao.absolute,
        variationPercent: variacao.percent,
      });
    }

    return linhas.sort((a, b) => b.total - a.total);
  }

  // ==================== divisão Bruno × Giovanna ====================

  /**
   * Painel de divisão do mês.
   *
   * O `SplitService` trabalha com RÓTULOS de período (`THIS_MONTH`,
   * `LAST_MONTH`) e não com uma competência arbitrária. Para meses fora desses
   * dois rótulos a seção é devolvida com `available: false` e um aviso — em vez
   * de mostrar o acerto de um período diferente do relatório.
   */
  private async montarDivisao(
    familyId: string,
    user: User,
    mes: number,
    ano: number,
    referencia: Date,
  ): Promise<SplitSection> {
    const rotulo = this.rotuloDePeriodo(mes, ano, referencia);

    if (!rotulo) {
      return {
        available: false,
        notice:
          'O acerto de contas entre os responsáveis é calculado apenas para o mês ' +
          'corrente e o mês anterior. Consulte "Gastos por responsável" para a ' +
          'divisão deste período.',
        totalPaid: 0,
        participants: [],
        difference: null,
        criteria: null,
        transfers: [],
      };
    }

    const [resumo, acerto] = await Promise.all([
      this.splitService.getSplitSummary(familyId, rotulo),
      this.splitService.getSettlement(familyId, user, rotulo),
    ]);

    return {
      available: true,
      notice: resumo.warnings.length > 0 ? resumo.warnings.join(' ') : null,
      totalPaid: resumo.totalPaid,
      participants: resumo.participants.map((p) => ({
        responsible: p.responsible,
        paid: p.paid,
        sharePercent: p.sharePercent,
      })),
      difference: resumo.difference
        ? {
            paidMore: resumo.difference.paidMore,
            paidLess: resumo.difference.paidLess,
            amount: resumo.difference.amount,
          }
        : null,
      criteria: acerto.criteria,
      transfers: acerto.transfers,
    };
  }

  /** `THIS_MONTH` / `LAST_MONTH` quando a competência corresponde; senão `null`. */
  private rotuloDePeriodo(
    mes: number,
    ano: number,
    referencia: Date,
  ): string | null {
    const mesAtual = referencia.getMonth() + 1;
    const anoAtual = referencia.getFullYear();

    if (mes === mesAtual && ano === anoAtual) {
      return 'THIS_MONTH';
    }

    const anterior = this.mesAnterior(mesAtual, anoAtual);
    if (mes === anterior.mes && ano === anterior.ano) {
      return 'LAST_MONTH';
    }

    return null;
  }

  // ==================== contas planejadas ====================

  /**
   * Contas pagas e pendentes do mês.
   *
   * O `PlannedAccountsService` escopa por usuário; o relatório é da casa, então
   * o plano é lido para cada membro da família e consolidado aqui.
   */
  private async montarContasPlanejadas(
    membros: User[],
    mes: number,
    ano: number,
    referencia: Date,
  ): Promise<PlannedAccountsSection> {
    const planos = await Promise.all(
      membros.map((membro) =>
        this.plannedAccountsService.getMonthlyPlan(membro, mes, ano),
      ),
    );

    // Só contas a PAGAR: a seção do relatório se chama "contas planejadas" e
    // soma compromissos. As entradas previstas (salário projetado) entram na
    // visão geral como receita, não aqui — misturá-las inflaria o total de
    // contas pendentes da casa com dinheiro que vai ENTRAR.
    const linhas: PlannedAccountLine[] = planos
      .flat()
      .filter((conta) => conta.type !== 'income')
      .map((conta) => ({
      id: conta.id,
      description: conta.description,
      category: conta.category ?? null,
      amount: this.arredondar(Number(conta.amount) || 0),
      dueDate: conta.dueDate,
      responsible: conta.responsible,
      status: conta.status,
      paymentDate: conta.paymentDate ?? null,
    }));

    const agrupar = (predicado: (l: PlannedAccountLine) => boolean): PlannedAccountsGroup => {
      const items = linhas
        .filter(predicado)
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

      return {
        count: items.length,
        total: this.arredondar(items.reduce((soma, i) => soma + i.amount, 0)),
        items,
      };
    };

    // A referência é injetável para que "vencida" e "a vencer" não dependam do
    // relógio da máquina — o que tornaria o resultado (e os testes) instável.
    const agora = referencia;

    return {
      paid: agrupar((l) => l.status === 'paid'),
      // "Pendente" inclui `confirmed`: a conta foi confirmada mas ainda não paga.
      pending: agrupar(
        (l) =>
          (l.status === 'pending' || l.status === 'confirmed') &&
          new Date(l.dueDate).getTime() >= agora.getTime(),
      ),
      // Vencida: marcada como `overdue` OU pendente com vencimento no passado.
      overdue: agrupar(
        (l) =>
          l.status === 'overdue' ||
          ((l.status === 'pending' || l.status === 'confirmed') &&
            new Date(l.dueDate).getTime() < agora.getTime()),
      ),
      cancelled: agrupar((l) => l.status === 'cancelled'),
    };
  }

  // ==================== cartões ====================

  /**
   * Gastos no cartão de crédito.
   *
   * O valor gasto vem dos LANÇAMENTOS do mês com forma de pagamento `credit` —
   * o saldo do cartão é acumulado e não representa o mês. Os limites vêm do
   * `CreditCardsService`, consolidados entre os membros da família.
   */
  private async montarCartoes(
    membros: User[],
    despesas: Expense[],
    totalDespesas: number,
  ): Promise<CreditCardSection> {
    const utilizacoes = await Promise.all(
      membros.map((membro) => this.creditCardsService.findAll(membro)),
    );

    const cards = utilizacoes.flat().map((card) => {
      const limit = Number(card.limit) || 0;
      const currentBalance = Number(card.currentBalance) || 0;

      return {
        cardId: card.id,
        name: card.name,
        bank: card.bank,
        limit: this.arredondar(limit),
        currentBalance: this.arredondar(currentBalance),
        availableLimit: this.arredondar(limit - currentBalance),
        utilizationPercent:
          limit > 0 ? this.arredondar((currentBalance / limit) * 100) : 0,
        closingDay: card.closingDay,
        dueDay: card.dueDay,
      };
    });

    const noCartao = despesas.filter((d) => d.paymentMethod === 'credit');
    const totalSpent = this.somarDespesasDeCartao(despesas);
    const totalLimit = this.arredondar(
      cards.reduce((soma, c) => soma + c.limit, 0),
    );
    const totalUsedLimit = this.arredondar(
      cards.reduce((soma, c) => soma + c.currentBalance, 0),
    );

    return {
      totalSpent,
      transactionCount: noCartao.length,
      shareOfExpenses:
        totalDespesas > 0
          ? this.arredondar((totalSpent / totalDespesas) * 100)
          : 0,
      cards: cards.sort((a, b) => b.currentBalance - a.currentBalance),
      totalLimit,
      totalUsedLimit,
      totalAvailableLimit: this.arredondar(totalLimit - totalUsedLimit),
    };
  }

  private somarDespesasDeCartao(despesas: Expense[]): number {
    return this.arredondar(
      despesas
        .filter((d) => d.paymentMethod === 'credit')
        .reduce((soma, d) => soma + (Number(d.amount) || 0), 0),
    );
  }

  private async gastoDeCartaoNoPeriodo(
    familyId: string,
    periodo: ReportPeriod,
  ): Promise<number> {
    const despesas = await this.financialData.getExpenses(
      familyId,
      this.paraRange(periodo),
    );

    return this.somarDespesasDeCartao(despesas);
  }

  // ==================== parcelamentos ====================

  /**
   * Compras parceladas lançadas no mês e o que ainda falta pagar delas.
   *
   * Só entram lançamentos com `installments > 1`; uma compra à vista gravada com
   * `installments = 1` não é parcelamento.
   */
  private montarParcelamentos(despesas: Expense[]): InstallmentsSection {
    const items: InstallmentLine[] = despesas
      .filter((d) => Number(d.installments) > 1)
      .map((d) => {
        const totalInstallments = Number(d.installments) || 0;
        const currentInstallment = Number(d.currentInstallment) || 1;
        const installmentAmount = this.arredondar(Number(d.amount) || 0);
        const remainingInstallments = Math.max(
          0,
          totalInstallments - currentInstallment,
        );

        return {
          description: d.description,
          establishment: d.establishment ?? null,
          category: d.category,
          responsible: d.responsible,
          date: d.date,
          installmentAmount,
          totalInstallments,
          currentInstallment,
          remainingInstallments,
          remainingAmount: this.arredondar(
            installmentAmount * remainingInstallments,
          ),
        };
      })
      .sort((a, b) => b.remainingAmount - a.remainingAmount);

    return {
      count: items.length,
      totalInMonth: this.arredondar(
        items.reduce((soma, i) => soma + i.installmentAmount, 0),
      ),
      totalRemaining: this.arredondar(
        items.reduce((soma, i) => soma + i.remainingAmount, 0),
      ),
    items,
    };
  }

  // ==================== evolução patrimonial ====================

  /**
   * Série de 12 meses terminando na competência do relatório.
   *
   * `getMonthlyExpenseSeries` conta os meses a partir de HOJE, então a janela é
   * ampliada de acordo com a distância entre a competência e o mês corrente —
   * sem isso, um relatório de um mês passado devolveria uma série vazia.
   */
  private async montarEvolucaoPatrimonial(
    familyId: string,
    mes: number,
    ano: number,
    saldoAtual: number,
    referencia: Date,
  ): Promise<NetWorthSection> {
    const distancia =
      (referencia.getFullYear() - ano) * 12 +
      (referencia.getMonth() + 1 - mes);
    const janela = Math.max(MESES_EVOLUCAO - 1, MESES_EVOLUCAO - 1 + distancia);

    const [despesas, receitas] = await Promise.all([
      this.financialData.getMonthlyExpenseSeries(familyId, janela),
      this.financialData.getMonthlyIncomeSeries(familyId, janela),
    ]);

    const mapaDespesas = new Map(despesas.map((p) => [p.month, p.total]));
    const mapaReceitas = new Map(receitas.map((p) => [p.month, p.total]));

    const points: NetWorthPoint[] = [];
    let acumulado = 0;
    let mesesComDados = 0;

    for (let i = MESES_EVOLUCAO - 1; i >= 0; i -= 1) {
      const data = new Date(ano, mes - 1 - i, 1);
      const chave = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;

      const income = this.arredondar(Number(mapaReceitas.get(chave)) || 0);
      const expenses = this.arredondar(Number(mapaDespesas.get(chave)) || 0);
      const net = this.arredondar(income - expenses);

      acumulado = this.arredondar(acumulado + net);

      if (income > 0 || expenses > 0) {
        mesesComDados += 1;
      }

      points.push({
        month: chave,
        label: formatarMesCurto(chave),
        income,
        expenses,
        net,
        accumulated: acumulado,
      });
    }

    return {
      points,
      accumulatedResult: acumulado,
      currentBalance: this.arredondar(saldoAtual),
      monthsWithData: mesesComDados,
    };
  }

  // ==================== metas ====================

  private async montarMetas(user: User): Promise<GoalsSection> {
    const [resumo, metas] = await Promise.all([
      this.goalsService.getSummary(user),
      this.goalsService.findAll(user),
    ]);

    const items: GoalLine[] = metas.map((meta) => ({
      id: meta.id,
      name: meta.name,
      type: meta.type,
      targetAmount: this.arredondar(meta.progress.targetAmount),
      currentAmount: this.arredondar(meta.progress.currentAmount),
      remainingAmount: this.arredondar(meta.progress.remainingAmount),
      progressPercent: meta.progress.progressPercentage,
      deadline: meta.progress.deadline,
      status: meta.status,
    }));

    return {
      totalGoals: resumo.totalGoals,
      activeGoals: resumo.activeGoals,
      completedGoals: resumo.completedGoals,
      totalTargetAmount: this.arredondar(resumo.totalTargetAmount),
      totalCurrentAmount: this.arredondar(resumo.totalCurrentAmount),
      totalRemainingAmount: this.arredondar(resumo.totalRemainingAmount),
      overallProgressPercent: resumo.overallProgressPercentage,
      items,
    };
  }

  // ==================== orçamentos ====================

  /**
   * Situação dos orçamentos por categoria.
   *
   * O `CategoriesService.getBudgetStatus` compara o teto com o gasto do MÊS
   * CORRENTE. Para uma competência passada a seção é marcada como indisponível
   * em vez de exibir números de outro mês.
   */
  private async montarOrcamentos(
    membros: User[],
    mes: number,
    ano: number,
    referencia: Date,
  ): Promise<BudgetsSection> {
    const ehMesCorrente =
      mes === referencia.getMonth() + 1 && ano === referencia.getFullYear();

    if (!ehMesCorrente) {
      return {
        available: false,
        notice:
          'O acompanhamento de orçamento é calculado sobre o mês corrente. ' +
          'Para uma competência anterior, consulte "Gastos por categoria".',
        items: [],
      };
    }

    const status = await Promise.all(
      membros.map((membro) => this.categoriesService.getBudgetStatus(membro)),
    );

    const items: BudgetLine[] = status.flat().map((linha) => ({
      categoryId: linha.categoryId,
      name: linha.name,
      monthlyBudget: this.arredondar(Number(linha.monthlyBudget) || 0),
      spent: this.arredondar(Number(linha.spent) || 0),
      remaining: this.arredondar(Number(linha.remaining) || 0),
      percent: this.arredondar(Number(linha.percentage) || 0),
      status: linha.status,
    }));

    return {
      available: true,
      notice:
        items.length === 0
          ? 'Nenhuma categoria possui orçamento mensal definido.'
          : null,
      items: items.sort((a, b) => b.percent - a.percent),
    };
  }

  // ==================== sugestões de economia ====================

  private async montarSugestoes(
    user: User,
    familyId: string,
  ): Promise<SuggestionLine[]> {
    const resultado = await this.recommendationsService.listRecommendations(
      user.id,
      familyId,
      { limit: 10, offset: 0, includeDismissed: false },
    );

    return resultado.recommendations.map((r) => ({
      title: r.title,
      description: r.description,
      potentialSavings:
        r.potentialSavings === undefined || r.potentialSavings === null
          ? null
          : this.arredondar(Number(r.potentialSavings)),
      priority: r.priority,
    }));
  }

  // ==================== alertas ====================

  /**
   * Alertas do mês, todos derivados de números já calculados neste relatório.
   * Nenhum alerta é criado sem o dado que o sustenta.
   */
  private montarAlertas(
    periodo: ReportPeriod,
    overview: ReportOverview,
    orcamentos: BudgetsSection,
    contas: PlannedAccountsSection,
    cartoes: CreditCardSection,
    comparacao: ComparisonSection,
    referencia: Date,
  ): AlertLine[] {
    const alertas: AlertLine[] = [];

    if (overview.balance < 0) {
      alertas.push({
        type: 'saldo',
        severity: 'critical',
        title: 'Mês fechou no vermelho',
        message:
          `As despesas de ${periodo.label} superaram as receitas em ` +
          `${formatarReal(Math.abs(overview.balance))}.`,
      });
    }

    for (const orcamento of orcamentos.items) {
      if (orcamento.status === 'exceeded') {
        alertas.push({
          type: 'orcamento',
          severity: 'critical',
          title: `Orçamento estourado: ${orcamento.name}`,
          message:
            `Gasto de ${formatarReal(orcamento.spent)} contra um teto de ` +
            `${formatarReal(orcamento.monthlyBudget)} (${formatarPercentual(orcamento.percent)}).`,
        });
      } else if (orcamento.status === 'warning') {
        alertas.push({
          type: 'orcamento',
          severity: 'warning',
          title: `Orçamento em atenção: ${orcamento.name}`,
          message:
            `Já foram consumidos ${formatarPercentual(orcamento.percent)} do teto de ` +
            `${formatarReal(orcamento.monthlyBudget)}.`,
        });
      }
    }

    if (contas.overdue.count > 0) {
      alertas.push({
        type: 'conta_vencida',
        severity: 'critical',
        title: `${contas.overdue.count} conta(s) vencida(s)`,
        message: `Total em atraso: ${formatarReal(contas.overdue.total)}.`,
      });
    }

    const limite = referencia.getTime() + 7 * UM_DIA;
    const proximas = contas.pending.items.filter(
      (c) => new Date(c.dueDate).getTime() <= limite,
    );

    if (proximas.length > 0) {
      const total = proximas.reduce((soma, c) => soma + c.amount, 0);
      alertas.push({
        type: 'conta_a_vencer',
        severity: 'warning',
        title: `${proximas.length} conta(s) vencendo nos próximos 7 dias`,
        message: `Total previsto: ${formatarReal(total)}.`,
      });
    }

    for (const cartao of cartoes.cards) {
      if (cartao.utilizationPercent >= 80) {
        alertas.push({
          type: 'cartao',
          severity: cartao.utilizationPercent >= 100 ? 'critical' : 'warning',
          title: `Cartão ${cartao.name} próximo do limite`,
          message:
            `${formatarPercentual(cartao.utilizationPercent)} do limite de ` +
            `${formatarReal(cartao.limit)} já está comprometido.`,
        });
      }
    }

    // Gasto atípico: só faz sentido se o mês anterior tiver base de comparação.
    if (
      comparacao.previousHasData &&
      comparacao.expenses.percent !== null &&
      comparacao.expenses.percent >= 20
    ) {
      alertas.push({
        type: 'gasto_atipico',
        severity: 'warning',
        title: 'Despesas acima do mês anterior',
        message:
          `As despesas subiram ${formatarPercentual(comparacao.expenses.percent)} ` +
          `em relação a ${comparacao.previousLabel} ` +
          `(${formatarReal(comparacao.expenses.absolute)} a mais).`,
      });
    }

    return alertas;
  }

  // ==================== lançamentos ====================

  private montarLancamentos(
    despesas: Expense[],
    receitas: Income[],
  ): TransactionLine[] {
    const linhas: TransactionLine[] = [
      ...receitas.map((r) => ({
        date: r.date,
        kind: 'receita' as const,
        description: r.description,
        establishment: null,
        category: r.type,
        responsible: r.responsible,
        paymentMethod: null,
        amount: this.arredondar(Number(r.amount) || 0),
      })),
      ...despesas.map((d) => ({
        date: d.date,
        kind: 'despesa' as const,
        description: d.description,
        establishment: d.establishment ?? null,
        category: d.category,
        responsible: d.responsible,
        paymentMethod: d.paymentMethod,
        amount: this.arredondar(Number(d.amount) || 0),
      })),
    ];

    return linhas.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
  }

  // ==================== helpers ====================

  /**
   * Usuários da família, usados pelos serviços escopados por usuário.
   *
   * Se por algum motivo a família não tiver membros carregáveis, cai no próprio
   * usuário autenticado — melhor um relatório parcial e honesto do que um erro.
   */
  private async carregarMembros(familyId: string, user: User): Promise<User[]> {
    const ids = await this.financialData.getFamilyUserIds(familyId);

    if (ids.length === 0) {
      return [user];
    }

    const membros = await this.userRepository.find({ where: { id: In(ids) } });
    return membros.length > 0 ? membros : [user];
  }

  /**
   * Variação entre dois números.
   *
   * `percent` fica `null` quando a base é zero: não existe percentual sobre
   * nada, e devolver 100% seria inventar informação (regra 27).
   */
  private calcularVariacao(atual: number, anterior: number): Variation {
    const current = this.arredondar(atual);
    const previous = this.arredondar(anterior);
    const absolute = this.arredondar(current - previous);

    let direction: Variation['direction'] = 'stable';
    if (absolute > 0) direction = 'up';
    else if (absolute < 0) direction = 'down';

    return {
      current,
      previous,
      absolute,
      percent:
        previous === 0
          ? null
          : this.arredondar((absolute / Math.abs(previous)) * 100),
      direction,
    };
  }

  /** Duas casas decimais — evita `0.30000000000000004` no JSON e no Excel. */
  private arredondar(valor: number): number {
    const numero = Number(valor);
    return Number.isFinite(numero) ? Math.round(numero * 100) / 100 : 0;
  }
}
