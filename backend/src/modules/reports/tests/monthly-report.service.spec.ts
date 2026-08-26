import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';

import { MonthlyReportService } from '../services/monthly-report.service';
import { User } from '../../users/entities/user.entity';
import { FinancialDataService } from '../../financial-data/financial-data.service';
import { GoalsService } from '../../goals/goals.service';
import { SplitService } from '../../split/split.service';
import { CategoriesService } from '../../categories/categories.service';
import { PlannedAccountsService } from '../../planned-accounts/planned-accounts.service';
import { CreditCardsService } from '../../credit-cards/credit-cards.service';
import { RecommendationsService } from '../../ai/services/recommendations.service';
import { PeriodRange } from '../../financial-data/financial-data.types';

/**
 * Testes unitários do MonthlyReportService — Relatório Mensal (item 28).
 *
 * Nenhum banco é tocado: os lançamentos vêm mockados do `FinancialDataService`,
 * exatamente como em produção, e as demais seções dos serviços que já as
 * implementam. O que está sob teste é a MONTAGEM do relatório — a aritmética das
 * seções, a comparação com o mês anterior e o comportamento sem dados —, que é o
 * que pode quebrar em silêncio.
 *
 * CENÁRIO BASE (agosto/2026, números escolhidos para conferência manual):
 *   Receitas ......... R$ 11.400,00  (Bruno 8.500 + Giovanna 2.900)
 *   Despesas ......... R$  7.400,00  (Bruno 4.500 + Giovanna 2.900)
 *   Saldo do mês ..... R$  4.000,00
 *   Julho/2026: receitas R$ 11.000,00 e despesas R$ 6.000,00 (saldo R$ 5.000,00)
 *
 * Os valores monetários dos mocks são STRINGS de propósito: é assim que o driver
 * do PostgreSQL devolve colunas `decimal`, e somá-las sem `Number()` produziria
 * concatenação de texto em vez de soma.
 */
describe('MonthlyReportService', () => {
  let service: MonthlyReportService;

  const FAMILY_ID = 'family-casa';

  /** Data de referência fixa: 26 de agosto de 2026. */
  const REFERENCIA = new Date(2026, 7, 26, 12, 0, 0);

  const BRUNO = { id: 'user-bruno', familyId: FAMILY_ID } as User;
  const GIOVANNA = { id: 'user-giovanna', familyId: FAMILY_ID } as User;

  // ---------- lançamentos de agosto/2026 ----------

  const DESPESAS_AGOSTO = [
    {
      id: 'exp-1',
      description: 'Compra do mês',
      establishment: 'ATACADAO',
      amount: '4000.00',
      date: new Date(2026, 7, 3),
      category: 'Supermercado',
      responsible: 'bruno',
      paymentMethod: 'credit',
      installments: null,
      currentInstallment: null,
    },
    {
      id: 'exp-2',
      description: 'Combustível',
      establishment: 'SHELL',
      amount: '2400.00',
      date: new Date(2026, 7, 12),
      category: 'Transporte',
      responsible: 'bruno',
      paymentMethod: 'debit',
      installments: null,
      currentInstallment: null,
    },
    {
      id: 'exp-3',
      description: 'Notebook',
      establishment: 'AMAZON',
      amount: '1000.00',
      date: new Date(2026, 7, 20),
      category: 'Lazer',
      responsible: 'giovanna',
      paymentMethod: 'credit',
      installments: 4,
      currentInstallment: 2,
    },
  ] as any[];

  const DESPESAS_JULHO = [
    {
      id: 'exp-j1',
      description: 'Compra do mês',
      establishment: 'ATACADAO',
      amount: '3000.00',
      date: new Date(2026, 6, 4),
      category: 'Supermercado',
      responsible: 'bruno',
      paymentMethod: 'credit',
      installments: null,
      currentInstallment: null,
    },
    {
      id: 'exp-j2',
      description: 'Transporte',
      amount: '3000.00',
      date: new Date(2026, 6, 15),
      category: 'Transporte',
      responsible: 'giovanna',
      paymentMethod: 'debit',
      installments: null,
      currentInstallment: null,
    },
  ] as any[];

  const RECEITAS_AGOSTO = [
    {
      id: 'inc-1',
      description: 'Salário Bruno',
      type: 'salary',
      amount: '8500.00',
      date: new Date(2026, 7, 5),
      responsible: 'bruno',
    },
    {
      id: 'inc-2',
      description: 'Salário Giovanna',
      type: 'salary',
      amount: '2900.00',
      date: new Date(2026, 7, 5),
      responsible: 'giovanna',
    },
  ] as any[];

  // ---------- mocks ----------

  const mockUserRepository = { find: jest.fn() };

  const mockFinancialData = {
    getFamilyUserIds: jest.fn(),
    getSummary: jest.fn(),
    getExpensesByCategory: jest.fn(),
    getExpensesByResponsible: jest.fn(),
    getExpenses: jest.fn(),
    getIncomes: jest.fn(),
    getCurrentBalance: jest.fn(),
    getMonthlyExpenseSeries: jest.fn(),
    getMonthlyIncomeSeries: jest.fn(),
  };

  const mockGoals = { getSummary: jest.fn(), findAll: jest.fn() };
  const mockSplit = { getSplitSummary: jest.fn(), getSettlement: jest.fn() };
  const mockCategories = { getBudgetStatus: jest.fn() };
  const mockPlannedAccounts = { getMonthlyPlan: jest.fn() };
  const mockCreditCards = { findAll: jest.fn() };
  const mockRecommendations = { listRecommendations: jest.fn() };

  /** `true` quando o intervalo consultado é o de agosto/2026. */
  const ehAgosto = (range: PeriodRange): boolean =>
    range.start.getMonth() === 7 && range.start.getFullYear() === 2026;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MonthlyReportService,
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
        { provide: FinancialDataService, useValue: mockFinancialData },
        { provide: GoalsService, useValue: mockGoals },
        { provide: SplitService, useValue: mockSplit },
        { provide: CategoriesService, useValue: mockCategories },
        { provide: PlannedAccountsService, useValue: mockPlannedAccounts },
        { provide: CreditCardsService, useValue: mockCreditCards },
        { provide: RecommendationsService, useValue: mockRecommendations },
      ],
    }).compile();

    service = module.get<MonthlyReportService>(MonthlyReportService);

    aplicarCenarioBase();
  });

  /** Cenário base: agosto/2026 com dados, julho/2026 como comparativo. */
  function aplicarCenarioBase(): void {
    mockFinancialData.getFamilyUserIds.mockResolvedValue([
      BRUNO.id,
      GIOVANNA.id,
    ]);
    mockUserRepository.find.mockResolvedValue([BRUNO, GIOVANNA]);

    mockFinancialData.getSummary.mockImplementation(
      async (_familyId: string, range: PeriodRange) =>
        ehAgosto(range)
          ? {
              totalExpenses: 7400,
              totalIncomes: 11400,
              balance: 4000,
              expenseCount: 3,
              incomeCount: 2,
              averageDailyExpense: 238.71,
              days: 31,
            }
          : {
              totalExpenses: 6000,
              totalIncomes: 11000,
              balance: 5000,
              expenseCount: 2,
              incomeCount: 2,
              averageDailyExpense: 193.55,
              days: 31,
            },
    );

    mockFinancialData.getExpensesByCategory.mockImplementation(
      async (_familyId: string, range: PeriodRange) =>
        ehAgosto(range)
          ? [
              {
                category: 'Supermercado',
                total: 4000,
                count: 10,
                average: 400,
                share: 4000 / 7400,
              },
              {
                category: 'Transporte',
                total: 2400,
                count: 6,
                average: 400,
                share: 2400 / 7400,
              },
              {
                category: 'Lazer',
                total: 1000,
                count: 4,
                average: 250,
                share: 1000 / 7400,
              },
            ]
          : [
              {
                category: 'Supermercado',
                total: 3000,
                count: 8,
                average: 375,
                share: 0.5,
              },
              {
                category: 'Transporte',
                total: 2000,
                count: 5,
                average: 400,
                share: 1 / 3,
              },
              {
                category: 'Assinaturas',
                total: 1000,
                count: 4,
                average: 250,
                share: 1 / 6,
              },
            ],
    );

    mockFinancialData.getExpensesByResponsible.mockImplementation(
      async (_familyId: string, range: PeriodRange) =>
        ehAgosto(range)
          ? [
              {
                responsible: 'bruno',
                total: 4500,
                count: 2,
                share: 4500 / 7400,
              },
              {
                responsible: 'giovanna',
                total: 2900,
                count: 1,
                share: 2900 / 7400,
              },
            ]
          : [
              { responsible: 'bruno', total: 3500, count: 1, share: 3500 / 6000 },
              {
                responsible: 'giovanna',
                total: 2500,
                count: 1,
                share: 2500 / 6000,
              },
            ],
    );

    mockFinancialData.getExpenses.mockImplementation(
      async (_familyId: string, range: PeriodRange) =>
        ehAgosto(range) ? DESPESAS_AGOSTO : DESPESAS_JULHO,
    );

    mockFinancialData.getIncomes.mockResolvedValue(RECEITAS_AGOSTO);
    mockFinancialData.getCurrentBalance.mockResolvedValue(12500);

    mockFinancialData.getMonthlyExpenseSeries.mockResolvedValue([
      { month: '2026-07', total: 6000, count: 2 },
      { month: '2026-08', total: 7400, count: 3 },
    ]);
    mockFinancialData.getMonthlyIncomeSeries.mockResolvedValue([
      { month: '2026-07', total: 11000, count: 2 },
      { month: '2026-08', total: 11400, count: 2 },
    ]);

    mockPlannedAccounts.getMonthlyPlan.mockImplementation(async (user: User) =>
      user.id === BRUNO.id
        ? [
            {
              id: 'pa-1',
              description: 'Aluguel',
              category: 'Moradia',
              amount: '1800.00',
              dueDate: new Date(2026, 7, 5),
              responsible: 'bruno',
              status: 'paid',
              paymentDate: new Date(2026, 7, 5),
            },
          ]
        : [
            {
              id: 'pa-2',
              description: 'Internet',
              category: 'Moradia',
              amount: '120.00',
              dueDate: new Date(2026, 7, 30),
              responsible: 'giovanna',
              status: 'pending',
              paymentDate: null,
            },
            {
              id: 'pa-3',
              description: 'Escola',
              category: 'Educação',
              amount: '900.00',
              dueDate: new Date(2026, 7, 10),
              responsible: 'giovanna',
              status: 'pending',
              paymentDate: null,
            },
          ],
    );

    mockCreditCards.findAll.mockImplementation(async (user: User) =>
      user.id === BRUNO.id
        ? [
            {
              id: 'cc-1',
              name: 'Nubank',
              bank: 'Nu Pagamentos',
              limit: '10000.00',
              currentBalance: '8500.00',
              closingDay: 28,
              dueDay: 5,
            },
          ]
        : [],
    );

    mockCategories.getBudgetStatus.mockImplementation(async (user: User) =>
      user.id === BRUNO.id
        ? [
            {
              categoryId: 'cat-1',
              name: 'Supermercado',
              monthlyBudget: 3000,
              spent: 4000,
              remaining: -1000,
              percentage: 133.33,
              status: 'exceeded',
            },
          ]
        : [],
    );

    mockGoals.getSummary.mockResolvedValue({
      totalGoals: 1,
      activeGoals: 1,
      completedGoals: 0,
      cancelledGoals: 0,
      totalTargetAmount: 15000,
      totalCurrentAmount: 8000,
      totalRemainingAmount: 7000,
      overallProgressPercentage: 53.33,
      totalPlannedMonthlyContribution: 1000,
      totalRequiredMonthlyContribution: 1000,
      monthlyContributionGap: 0,
      overdueGoals: 0,
      goalsAtRisk: [],
      nextDeadline: null,
    });

    mockGoals.findAll.mockResolvedValue([
      {
        id: 'goal-1',
        name: 'Viagem',
        type: 'travel',
        status: 'active',
        progress: {
          targetAmount: 15000,
          currentAmount: 8000,
          remainingAmount: 7000,
          progressPercentage: 53.33,
          deadline: new Date(2027, 0, 31),
        },
      },
    ]);

    mockSplit.getSplitSummary.mockResolvedValue({
      period: 'THIS_MONTH',
      start: new Date(2026, 7, 1),
      end: new Date(2026, 7, 31),
      totalPaid: 7400,
      totalCount: 3,
      participants: [
        { responsible: 'bruno', paid: 4500, count: 2, sharePercent: 60.81 },
        { responsible: 'giovanna', paid: 2900, count: 1, sharePercent: 39.19 },
      ],
      difference: {
        paidMore: 'bruno',
        paidLess: 'giovanna',
        amount: 1600,
        percentPoints: 21.62,
      },
      byCategory: [],
      warnings: [],
    });

    mockSplit.getSettlement.mockResolvedValue({
      criteria: 'Divisão igualitária (50/50).',
      transfers: [{ from: 'giovanna', to: 'bruno', amount: 800 }],
      entries: [],
      warnings: [],
    });

    mockRecommendations.listRecommendations.mockResolvedValue({
      recommendations: [
        {
          id: 'rec-1',
          title: 'Reduza o gasto com Supermercado',
          description:
            'O gasto com Supermercado está R$ 1.000,00 acima do mês anterior.',
          potentialSavings: 1000,
          priority: 'high',
        },
      ],
      total: 1,
      highPriorityCount: 1,
      mediumPriorityCount: 0,
      lowPriorityCount: 0,
    });
  }

  /** Zera todas as fontes de dados — mês sem nenhum lançamento. */
  function aplicarCenarioSemDados(): void {
    mockFinancialData.getSummary.mockResolvedValue({
      totalExpenses: 0,
      totalIncomes: 0,
      balance: 0,
      expenseCount: 0,
      incomeCount: 0,
      averageDailyExpense: 0,
      days: 31,
    });
    mockFinancialData.getExpensesByCategory.mockResolvedValue([]);
    mockFinancialData.getExpensesByResponsible.mockResolvedValue([]);
    mockFinancialData.getExpenses.mockResolvedValue([]);
    mockFinancialData.getIncomes.mockResolvedValue([]);
    mockFinancialData.getCurrentBalance.mockResolvedValue(0);
    mockFinancialData.getMonthlyExpenseSeries.mockResolvedValue([]);
    mockFinancialData.getMonthlyIncomeSeries.mockResolvedValue([]);
    mockPlannedAccounts.getMonthlyPlan.mockResolvedValue([]);
    mockCreditCards.findAll.mockResolvedValue([]);
    mockCategories.getBudgetStatus.mockResolvedValue([]);
    mockGoals.findAll.mockResolvedValue([]);
    mockGoals.getSummary.mockResolvedValue({
      totalGoals: 0,
      activeGoals: 0,
      completedGoals: 0,
      cancelledGoals: 0,
      totalTargetAmount: 0,
      totalCurrentAmount: 0,
      totalRemainingAmount: 0,
      overallProgressPercentage: null,
      totalPlannedMonthlyContribution: 0,
      totalRequiredMonthlyContribution: 0,
      monthlyContributionGap: 0,
      overdueGoals: 0,
      goalsAtRisk: [],
      nextDeadline: null,
    });
    mockSplit.getSplitSummary.mockResolvedValue({
      period: 'THIS_MONTH',
      start: new Date(2026, 7, 1),
      end: new Date(2026, 7, 31),
      totalPaid: 0,
      totalCount: 0,
      participants: [],
      difference: null,
      byCategory: [],
      warnings: ['Não há despesas lançadas no período selecionado.'],
    });
    mockSplit.getSettlement.mockResolvedValue({
      criteria: 'Divisão igualitária (50/50).',
      transfers: [],
      entries: [],
      warnings: [],
    });
    mockRecommendations.listRecommendations.mockResolvedValue({
      recommendations: [],
      total: 0,
      highPriorityCount: 0,
      mediumPriorityCount: 0,
      lowPriorityCount: 0,
    });
  }

  const gerar = () => service.build(FAMILY_ID, BRUNO, 8, 2026, REFERENCIA);

  // ==================== período ====================

  describe('período do relatório', () => {
    it('cobre o mês inteiro e o rotula em português', async () => {
      const relatorio = await gerar();

      expect(relatorio.period.label).toBe('Agosto de 2026');
      expect(relatorio.period.days).toBe(31);
      expect(relatorio.period.start.getDate()).toBe(1);
      expect(relatorio.period.start.getMonth()).toBe(7);
      expect(relatorio.period.end.getDate()).toBe(31);
    });

    it('usa fevereiro de ano bissexto com 29 dias', async () => {
      const relatorio = await service.build(
        FAMILY_ID,
        BRUNO,
        2,
        2028,
        new Date(2028, 1, 15),
      );

      expect(relatorio.period.days).toBe(29);
      expect(relatorio.period.label).toBe('Fevereiro de 2028');
    });

    it('recusa uma competência inválida em vez de gerar números sem sentido', async () => {
      await expect(
        service.build(FAMILY_ID, BRUNO, 13, 2026, REFERENCIA),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ==================== indicadores ====================

  describe('resumo do mês', () => {
    it('consolida receitas, despesas e saldo', async () => {
      const { overview } = await gerar();

      expect(overview.totalIncome).toBe(11400);
      expect(overview.totalExpenses).toBe(7400);
      expect(overview.balance).toBe(4000);
      expect(overview.incomeCount).toBe(2);
      expect(overview.expenseCount).toBe(3);
      expect(overview.transactionCount).toBe(5);
    });

    it('calcula a média diária sobre os dias do mês e a taxa de poupança', async () => {
      const { overview } = await gerar();

      // 7.400,00 ÷ 31 dias = 238,71
      expect(overview.averageDailyExpense).toBe(238.71);
      // 4.000,00 ÷ 11.400,00 = 35,09%
      expect(overview.savingsRate).toBe(35.09);
    });

    it('converte os decimais que chegam como string do PostgreSQL', async () => {
      const { overview } = await gerar();

      // Sem `Number()`, "4000.00" e "1000.00" seriam comparados como texto.
      expect(overview.highestExpense).toBe(4000);
      expect(overview.lowestExpense).toBe(1000);
    });

    it('traz o saldo consolidado das contas da família', async () => {
      const { overview } = await gerar();

      expect(overview.currentBalance).toBe(12500);
    });
  });

  // ==================== categorias e responsáveis ====================

  describe('gastos por categoria', () => {
    it('ordena por total e converte a participação para 0–100', async () => {
      const { byCategory } = await gerar();

      expect(byCategory.map((c) => c.category)).toEqual([
        'Supermercado',
        'Transporte',
        'Lazer',
        'Assinaturas',
      ]);
      expect(byCategory[0].total).toBe(4000);
      expect(byCategory[0].share).toBe(54.05);
    });

    it('compara cada categoria com o mês anterior', async () => {
      const { byCategory } = await gerar();
      const supermercado = byCategory.find((c) => c.category === 'Supermercado');

      expect(supermercado?.previousTotal).toBe(3000);
      expect(supermercado?.variationAbsolute).toBe(1000);
      // 1.000,00 sobre 3.000,00 = 33,33%
      expect(supermercado?.variationPercent).toBe(33.33);
    });

    it('mantém a categoria que existia no mês anterior e sumiu neste mês', async () => {
      const { byCategory } = await gerar();
      const assinaturas = byCategory.find((c) => c.category === 'Assinaturas');

      expect(assinaturas).toBeDefined();
      expect(assinaturas?.total).toBe(0);
      expect(assinaturas?.previousTotal).toBe(1000);
      expect(assinaturas?.variationAbsolute).toBe(-1000);
      expect(assinaturas?.variationPercent).toBe(-100);
    });

    it('deixa a variação percentual nula quando a categoria é nova', async () => {
      const { byCategory } = await gerar();
      const lazer = byCategory.find((c) => c.category === 'Lazer');

      // Não existe percentual sobre uma base zero (regra 27).
      expect(lazer?.previousTotal).toBe(0);
      expect(lazer?.variationAbsolute).toBe(1000);
      expect(lazer?.variationPercent).toBeNull();
    });
  });

  describe('gastos por responsável', () => {
    it('consolida quanto cada um gastou e a participação de cada um', async () => {
      const { byResponsible } = await gerar();

      expect(byResponsible[0]).toMatchObject({
        responsible: 'bruno',
        total: 4500,
        share: 60.81,
        previousTotal: 3500,
        variationAbsolute: 1000,
      });
      expect(byResponsible[1]).toMatchObject({
        responsible: 'giovanna',
        total: 2900,
        previousTotal: 2500,
        variationAbsolute: 400,
      });
    });

    it('traz o acerto Bruno × Giovanna quando o mês é o corrente', async () => {
      const { split } = await gerar();

      expect(split.available).toBe(true);
      expect(split.totalPaid).toBe(7400);
      expect(split.difference).toEqual({
        paidMore: 'bruno',
        paidLess: 'giovanna',
        amount: 1600,
      });
      expect(split.transfers).toEqual([
        { from: 'giovanna', to: 'bruno', amount: 800 },
      ]);
    });

    it('avisa que o acerto não se aplica a uma competência antiga', async () => {
      const relatorio = await service.build(
        FAMILY_ID,
        BRUNO,
        1,
        2026,
        REFERENCIA,
      );

      expect(relatorio.split.available).toBe(false);
      expect(relatorio.split.notice).toContain('mês corrente');
      expect(mockSplit.getSettlement).not.toHaveBeenCalled();
    });
  });

  // ==================== contas, cartões e parcelamentos ====================

  describe('contas do mês', () => {
    it('separa pagas, pendentes e vencidas somando os membros da família', async () => {
      const { plannedAccounts } = await gerar();

      expect(plannedAccounts.paid.count).toBe(1);
      expect(plannedAccounts.paid.total).toBe(1800);

      // Internet vence em 30/08, depois da referência (26/08): pendente.
      expect(plannedAccounts.pending.count).toBe(1);
      expect(plannedAccounts.pending.total).toBe(120);

      // Escola venceu em 10/08 e continua pendente: está vencida.
      expect(plannedAccounts.overdue.count).toBe(1);
      expect(plannedAccounts.overdue.total).toBe(900);
    });
  });

  describe('gastos no cartão', () => {
    it('soma apenas os lançamentos com forma de pagamento crédito', async () => {
      const { creditCards } = await gerar();

      // 4.000,00 + 1.000,00 = 5.000,00 de um total de 7.400,00
      expect(creditCards.totalSpent).toBe(5000);
      expect(creditCards.transactionCount).toBe(2);
      expect(creditCards.shareOfExpenses).toBe(67.57);
    });

    it('consolida os limites dos cartões da família', async () => {
      const { creditCards } = await gerar();

      expect(creditCards.totalLimit).toBe(10000);
      expect(creditCards.totalUsedLimit).toBe(8500);
      expect(creditCards.totalAvailableLimit).toBe(1500);
      expect(creditCards.cards[0].utilizationPercent).toBe(85);
    });
  });

  describe('parcelamentos', () => {
    it('identifica a compra parcelada e projeta o que ainda falta pagar', async () => {
      const { installments } = await gerar();

      expect(installments.count).toBe(1);
      expect(installments.items[0]).toMatchObject({
        description: 'Notebook',
        installmentAmount: 1000,
        currentInstallment: 2,
        totalInstallments: 4,
        remainingInstallments: 2,
        remainingAmount: 2000,
      });
      expect(installments.totalRemaining).toBe(2000);
    });

    it('ignora compras à vista', async () => {
      const { installments } = await gerar();

      expect(
        installments.items.some((i) => i.description === 'Compra do mês'),
      ).toBe(false);
    });
  });

  // ==================== evolução patrimonial ====================

  describe('evolução patrimonial', () => {
    it('devolve 12 meses terminando na competência do relatório', async () => {
      const { netWorth } = await gerar();

      expect(netWorth.points).toHaveLength(12);
      expect(netWorth.points[11].month).toBe('2026-08');
      expect(netWorth.points[0].month).toBe('2025-09');
    });

    it('acumula o resultado mês a mês', async () => {
      const { netWorth } = await gerar();

      const julho = netWorth.points.find((p) => p.month === '2026-07');
      const agosto = netWorth.points.find((p) => p.month === '2026-08');

      // Julho: 11.000 − 6.000 = 5.000. Agosto: 11.400 − 7.400 = 4.000.
      expect(julho?.net).toBe(5000);
      expect(agosto?.net).toBe(4000);
      expect(agosto?.accumulated).toBe(9000);
      expect(netWorth.accumulatedResult).toBe(9000);
      expect(netWorth.monthsWithData).toBe(2);
    });

    it('preenche com zero — e não com estimativa — os meses sem lançamento', async () => {
      const { netWorth } = await gerar();
      const semDados = netWorth.points.find((p) => p.month === '2026-01');

      expect(semDados?.income).toBe(0);
      expect(semDados?.expenses).toBe(0);
      expect(semDados?.net).toBe(0);
    });
  });

  // ==================== metas, orçamentos, alertas e sugestões ====================

  describe('metas', () => {
    it('traz o progresso real das metas da família', async () => {
      const { goals } = await gerar();

      expect(goals.totalGoals).toBe(1);
      expect(goals.overallProgressPercent).toBe(53.33);
      expect(goals.items[0]).toMatchObject({
        name: 'Viagem',
        targetAmount: 15000,
        currentAmount: 8000,
        remainingAmount: 7000,
        progressPercent: 53.33,
      });
    });
  });

  describe('orçamento', () => {
    it('acompanha o orçamento quando o relatório é do mês corrente', async () => {
      const { budgets } = await gerar();

      expect(budgets.available).toBe(true);
      expect(budgets.items[0]).toMatchObject({
        name: 'Supermercado',
        monthlyBudget: 3000,
        spent: 4000,
        status: 'exceeded',
      });
    });

    it('marca o orçamento como indisponível para uma competência anterior', async () => {
      mockSplit.getSplitSummary.mockResolvedValue({
        totalPaid: 0,
        participants: [],
        difference: null,
        warnings: [],
      });

      const relatorio = await service.build(
        FAMILY_ID,
        BRUNO,
        3,
        2026,
        REFERENCIA,
      );

      expect(relatorio.budgets.available).toBe(false);
      expect(relatorio.budgets.notice).toContain('mês corrente');
      expect(relatorio.budgets.items).toHaveLength(0);
      expect(mockCategories.getBudgetStatus).not.toHaveBeenCalled();
    });
  });

  describe('alertas', () => {
    it('gera um alerta para cada situação sustentada por dados', async () => {
      const { alerts } = await gerar();
      const tipos = alerts.map((a) => a.type);

      expect(tipos).toContain('orcamento');
      expect(tipos).toContain('conta_vencida');
      expect(tipos).toContain('conta_a_vencer');
      expect(tipos).toContain('cartao');
      expect(tipos).toContain('gasto_atipico');
    });

    it('não alerta saldo negativo quando o mês fechou positivo', async () => {
      const { alerts } = await gerar();

      expect(alerts.some((a) => a.type === 'saldo')).toBe(false);
    });

    it('formata os valores dos alertas em real brasileiro', async () => {
      const { alerts } = await gerar();
      const vencidas = alerts.find((a) => a.type === 'conta_vencida');

      expect(vencidas?.message).toContain('R$ 900,00');
    });
  });

  describe('sugestões de economia', () => {
    it('reaproveita as recomendações reais geradas pela IA', async () => {
      const { suggestions } = await gerar();

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0]).toMatchObject({
        title: 'Reduza o gasto com Supermercado',
        potentialSavings: 1000,
        priority: 'high',
      });
      expect(mockRecommendations.listRecommendations).toHaveBeenCalledWith(
        BRUNO.id,
        FAMILY_ID,
        { limit: 10, offset: 0, includeDismissed: false },
      );
    });
  });

  // ==================== lançamentos ====================

  describe('lançamentos do período', () => {
    it('junta receitas e despesas em ordem cronológica', async () => {
      const { transactions } = await gerar();

      expect(transactions).toHaveLength(5);
      expect(transactions[0].kind).toBe('despesa');
      expect(transactions[0].description).toBe('Compra do mês');
      expect(transactions.filter((t) => t.kind === 'receita')).toHaveLength(2);
      expect(
        transactions.every(
          (t, i, lista) =>
            i === 0 || lista[i - 1].date.getTime() <= t.date.getTime(),
        ),
      ).toBe(true);
    });
  });

  // ==================== comparação com o mês anterior ====================

  describe('comparação com o mês anterior', () => {
    it('traz variação absoluta e percentual de cada indicador', async () => {
      const { comparison } = await gerar();

      expect(comparison.previousLabel).toBe('Julho de 2026');
      expect(comparison.previousHasData).toBe(true);

      // Receitas: 11.400 − 11.000 = +400 (+3,64%)
      expect(comparison.income).toMatchObject({
        current: 11400,
        previous: 11000,
        absolute: 400,
        percent: 3.64,
        direction: 'up',
      });

      // Despesas: 7.400 − 6.000 = +1.400 (+23,33%)
      expect(comparison.expenses).toMatchObject({
        absolute: 1400,
        percent: 23.33,
        direction: 'up',
      });

      // Saldo: 4.000 − 5.000 = −1.000 (−20%)
      expect(comparison.balance).toMatchObject({
        absolute: -1000,
        percent: -20,
        direction: 'down',
      });
    });

    it('compara também o gasto no cartão de crédito', async () => {
      const { comparison } = await gerar();

      // Agosto: 4.000 + 1.000 no crédito. Julho: 3.000.
      expect(comparison.creditCard.current).toBe(5000);
      expect(comparison.creditCard.previous).toBe(3000);
      expect(comparison.creditCard.absolute).toBe(2000);
      expect(comparison.creditCard.percent).toBe(66.67);
    });

    it('destaca as categorias que mais subiram e as que mais caíram', async () => {
      const { comparison } = await gerar();

      expect(comparison.biggestIncreases[0].category).toBe('Supermercado');
      expect(comparison.biggestIncreases[0].variationAbsolute).toBe(1000);
      expect(comparison.biggestDecreases[0].category).toBe('Assinaturas');
      expect(comparison.biggestDecreases[0].variationAbsolute).toBe(-1000);
    });

    it('usa dezembro do ano anterior como comparativo de janeiro', async () => {
      await service.build(FAMILY_ID, BRUNO, 1, 2026, REFERENCIA);

      const intervalos = mockFinancialData.getSummary.mock.calls.map(
        (chamada: any[]) => chamada[1] as PeriodRange,
      );

      // O bug antigo (`EXTRACT(MONTH) >= x AND <= y`) nunca cruzava o ano.
      const dezembro = intervalos.find(
        (r) => r.start.getFullYear() === 2025 && r.start.getMonth() === 11,
      );

      expect(dezembro).toBeDefined();
      expect(dezembro?.end.getDate()).toBe(31);
    });
  });

  // ==================== mês sem lançamentos (regra 27) ====================

  describe('mês sem nenhum lançamento', () => {
    beforeEach(() => {
      aplicarCenarioSemDados();
    });

    it('marca o relatório como sem dados e explica isso em português', async () => {
      const relatorio = await gerar();

      expect(relatorio.hasData).toBe(false);
      expect(relatorio.notices.length).toBeGreaterThan(0);
      expect(relatorio.notices[0]).toContain('Agosto de 2026');
      expect(relatorio.notices[0]).toContain('nenhum lançamento');
    });

    it('zera os totais sem estimar nem preencher com exemplos', async () => {
      const { overview } = await gerar();

      expect(overview.totalIncome).toBe(0);
      expect(overview.totalExpenses).toBe(0);
      expect(overview.balance).toBe(0);
      expect(overview.transactionCount).toBe(0);
      expect(overview.averageDailyExpense).toBe(0);
    });

    it('deixa nulos os indicadores que não existem sem dados', async () => {
      const { overview } = await gerar();

      // Sem receita não há taxa de poupança; sem despesa não há maior nem menor.
      expect(overview.savingsRate).toBeNull();
      expect(overview.highestExpense).toBeNull();
      expect(overview.lowestExpense).toBeNull();
    });

    it('devolve as seções vazias em vez de linhas fabricadas', async () => {
      const relatorio = await gerar();

      expect(relatorio.byCategory).toHaveLength(0);
      expect(relatorio.byResponsible).toHaveLength(0);
      expect(relatorio.transactions).toHaveLength(0);
      expect(relatorio.installments.count).toBe(0);
      expect(relatorio.creditCards.totalSpent).toBe(0);
      expect(relatorio.creditCards.shareOfExpenses).toBe(0);
      expect(relatorio.plannedAccounts.paid.count).toBe(0);
      expect(relatorio.goals.items).toHaveLength(0);
    });

    it('não inventa variação percentual sem base de comparação', async () => {
      const { comparison } = await gerar();

      expect(comparison.previousHasData).toBe(false);
      expect(comparison.income.percent).toBeNull();
      expect(comparison.expenses.percent).toBeNull();
      expect(comparison.balance.percent).toBeNull();
      expect(comparison.income.direction).toBe('stable');
    });

    it('avisa que o mês anterior também está sem lançamentos', async () => {
      const { notices } = await gerar();

      expect(notices.some((n) => n.includes('Julho de 2026'))).toBe(true);
    });

    it('avisa que nenhuma sugestão de economia pôde ser gerada', async () => {
      const relatorio = await gerar();

      expect(relatorio.suggestions).toHaveLength(0);
      expect(
        relatorio.notices.some((n) => n.includes('sugestão de economia')),
      ).toBe(true);
    });

    it('não produz alertas sem dados que os sustentem', async () => {
      const { alerts } = await gerar();

      expect(alerts).toHaveLength(0);
    });
  });
});
