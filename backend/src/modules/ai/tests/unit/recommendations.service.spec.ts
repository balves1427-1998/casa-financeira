import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RecommendationsService } from '../../services/recommendations.service';
import {
  Recommendation,
  RecommendationType,
  RecommendationPriority,
  RecommendationPeriod,
} from '../../entities/recommendation.entity';
import { UpdateRecommendationDto } from '../../dtos/recommendations.dto';
import { FinancialDataService } from '../../../financial-data/financial-data.service';
import {
  CategoryAggregate,
  MonthlyPoint,
  RecurringExpense,
} from '../../../financial-data/financial-data.types';
import { Expense } from '../../../expenses/entities/expense.entity';

/**
 * Testes unitários do RecommendationsService.
 *
 * As recomendações não são textos prontos: cada uma nasce de uma regra aplicada
 * sobre os lançamentos REAIS lidos pelo `FinancialDataService`, aqui mockado
 * com dados realistas da casa (Bruno e Giovanna). O repositório de
 * Recommendation é mockado; métodos com QueryBuilder recebem um mock encadeável.
 *
 * O relógio é fixado em 26/08/2026 para que "mês corrente" (agosto/2026) e os
 * meses fechados usados nas comparações sejam determinísticos.
 */
describe('RecommendationsService', () => {
  let service: RecommendationsService;
  let recommendationRepository: Repository<Recommendation>;

  const USER_ID = 'user-1';
  const FAMILY_ID = 'family-1';

  /** Intervalo de agosto/2026 até o dia 26 (mês corrente do relógio fixo). */
  const RANGE_MES_ATUAL = {
    start: new Date(2026, 7, 1, 0, 0, 0, 0),
    end: new Date(2026, 7, 26, 23, 59, 59, 999),
  };

  /**
   * Cria uma recomendação de teste com valores padrão sobrescrevíveis.
   */
  const criarRecomendacao = (
    overrides: Partial<Recommendation> = {},
  ): Recommendation =>
    ({
      id: 'rec-1',
      userId: USER_ID,
      familyId: FAMILY_ID,
      type: RecommendationType.CATEGORY_HIGH,
      title: 'Reduzir gastos com Alimentação',
      description: 'Seus gastos com alimentação estão acima da média',
      potentialSavings: 250,
      period: RecommendationPeriod.MONTHLY,
      relevance: 80,
      impact: 70,
      ease: 60,
      priority: RecommendationPriority.MEDIUM,
      actionUrl: '/expenses/category/123',
      isDismissed: false,
      dismissedAt: null,
      metadata: {},
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      deletedAt: null,
      ...overrides,
    }) as Recommendation;

  /** Despesa real simplificada para as regras que leem lançamento a lançamento. */
  const criarDespesa = (
    valor: number,
    dia: number,
    categoria = 'Alimentação',
  ): Expense =>
    ({
      id: `exp-${dia}-${valor}`,
      userId: USER_ID,
      description: 'Lançamento',
      amount: valor,
      date: new Date(2026, 7, dia),
      category: categoria,
      responsible: 'bruno',
      paymentMethod: 'credit',
    }) as unknown as Expense;

  // Mock encadeável do QueryBuilder usado em listRecommendations
  const mockQueryBuilder: any = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
  };

  const mockRecommendationRepository: any = {
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  };

  const mockFinancialData: any = {
    getPeriodRange: jest.fn(),
    getSummary: jest.fn(),
    getExpensesByCategory: jest.fn(),
    getExpenses: jest.fn(),
    getRecurringExpenses: jest.fn(),
    getMonthlyExpenseSeries: jest.fn(),
    getMonthlyIncomeSeries: jest.fn(),
  };

  // ==================== cenário financeiro realista ====================

  /** Agosto/2026: alimentação estourada, supermercado no patamar de sempre. */
  const CATEGORIAS_MES: CategoryAggregate[] = [
    {
      category: 'Alimentação',
      total: 1840,
      count: 23,
      average: 80,
      share: 0.575,
    },
    { category: 'Supermercado', total: 900, count: 10, average: 90, share: 0.28125 },
    { category: 'Transporte', total: 460, count: 8, average: 57.5, share: 0.14375 },
  ];

  /** Maio a julho/2026 somados (3 meses fechados). */
  const CATEGORIAS_ANTERIORES: CategoryAggregate[] = [
    // Média mensal de 1.295,00 — agosto está 42% acima.
    { category: 'Alimentação', total: 3885, count: 66, average: 58.86, share: 0.59 },
    // Média mensal de 900,00 — exatamente o patamar de agosto.
    { category: 'Supermercado', total: 2700, count: 30, average: 90, share: 0.41 },
  ];

  const RECORRENTES: RecurringExpense[] = [
    {
      description: 'netflix',
      category: 'Assinaturas',
      averageAmount: 55.9,
      occurrences: 6,
      averageIntervalDays: 30,
      lastDate: new Date(2026, 7, 10),
    },
    {
      // Aluguel não é assinatura: valor alto demais para a regra UNUSED_SUB.
      description: 'aluguel apartamento',
      category: 'Moradia',
      averageAmount: 1800,
      occurrences: 6,
      averageIntervalDays: 30,
      lastDate: new Date(2026, 7, 5),
    },
  ];

  /** Série de despesas: agosto ainda em curso deve ser descartado das regras. */
  const SERIE_DESPESAS: MonthlyPoint[] = [
    { month: '2026-05', total: 3000, count: 38 },
    { month: '2026-06', total: 3100, count: 39 },
    { month: '2026-07', total: 3200, count: 41 },
    { month: '2026-08', total: 3200, count: 41 },
  ];

  const SERIE_RECEITAS: MonthlyPoint[] = [
    { month: '2026-05', total: 8500, count: 2 },
    { month: '2026-06', total: 8500, count: 2 },
    { month: '2026-07', total: 8500, count: 2 },
    { month: '2026-08', total: 8500, count: 2 },
  ];

  /** Nove pedidos de delivery de R$ 45,00 — pulverização de compras. */
  const DESPESAS_MES: Expense[] = Array.from({ length: 9 }, (_, i) =>
    criarDespesa(45, i + 2),
  );

  /**
   * Configura o cenário completo (todas as regras com dados suficientes).
   */
  const configurarCenarioCompleto = (): void => {
    mockFinancialData.getPeriodRange.mockReturnValue(RANGE_MES_ATUAL);
    mockFinancialData.getSummary.mockResolvedValue({
      totalExpenses: 3200,
      totalIncomes: 8500,
      balance: 5300,
      expenseCount: 41,
      incomeCount: 2,
      averageDailyExpense: 123.08,
      days: 26,
    });
    mockFinancialData.getExpensesByCategory
      .mockResolvedValueOnce(CATEGORIAS_MES)
      .mockResolvedValueOnce(CATEGORIAS_ANTERIORES);
    mockFinancialData.getExpenses.mockResolvedValue(DESPESAS_MES);
    mockFinancialData.getRecurringExpenses.mockResolvedValue(RECORRENTES);
    mockFinancialData.getMonthlyExpenseSeries.mockResolvedValue(SERIE_DESPESAS);
    mockFinancialData.getMonthlyIncomeSeries.mockResolvedValue(SERIE_RECEITAS);

    mockRecommendationRepository.find.mockResolvedValue([]);
    mockRecommendationRepository.update.mockResolvedValue({ affected: 0 });
    mockRecommendationRepository.create.mockImplementation((dados: any) => dados);
    mockRecommendationRepository.save.mockImplementation(async (d: any) => d);
  };

  /**
   * Cenário sem nenhum lançamento: nenhuma regra pode ser aplicada.
   */
  const configurarCenarioSemDados = (): void => {
    mockFinancialData.getPeriodRange.mockReturnValue(RANGE_MES_ATUAL);
    mockFinancialData.getSummary.mockResolvedValue({
      totalExpenses: 0,
      totalIncomes: 0,
      balance: 0,
      expenseCount: 0,
      incomeCount: 0,
      averageDailyExpense: 0,
      days: 26,
    });
    mockFinancialData.getExpensesByCategory.mockResolvedValue([]);
    mockFinancialData.getExpenses.mockResolvedValue([]);
    mockFinancialData.getRecurringExpenses.mockResolvedValue([]);
    mockFinancialData.getMonthlyExpenseSeries.mockResolvedValue([]);
    mockFinancialData.getMonthlyIncomeSeries.mockResolvedValue([]);

    mockRecommendationRepository.find.mockResolvedValue([]);
    mockRecommendationRepository.update.mockResolvedValue({ affected: 0 });
    mockRecommendationRepository.create.mockImplementation((dados: any) => dados);
    mockRecommendationRepository.save.mockImplementation(async (d: any) => d);
  };

  /** Recomendações efetivamente enviadas ao repositório. */
  const capturarPersistidas = (): any[] =>
    mockRecommendationRepository.create.mock.calls.map((c: any[]) => c[0]);

  const porTipo = (tipo: RecommendationType): any =>
    capturarPersistidas().find((r) => r.type === tipo);

  beforeAll(() => {
    jest.useFakeTimers({ now: new Date(2026, 7, 26, 12, 0, 0) });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecommendationsService,
        {
          provide: getRepositoryToken(Recommendation),
          useValue: mockRecommendationRepository,
        },
        {
          provide: FinancialDataService,
          useValue: mockFinancialData,
        },
      ],
    }).compile();

    service = module.get<RecommendationsService>(RecommendationsService);
    recommendationRepository = module.get<Repository<Recommendation>>(
      getRepositoryToken(Recommendation),
    );

    // Restaura o encadeamento do QueryBuilder após limpezas de mocks
    mockQueryBuilder.where.mockReturnThis();
    mockQueryBuilder.andWhere.mockReturnThis();
    mockQueryBuilder.orderBy.mockReturnThis();
    mockQueryBuilder.addOrderBy.mockReturnThis();
    mockQueryBuilder.skip.mockReturnThis();
    mockQueryBuilder.take.mockReturnThis();
    mockRecommendationRepository.createQueryBuilder.mockReturnValue(
      mockQueryBuilder,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('deve estar definido', () => {
    expect(service).toBeDefined();
    expect(recommendationRepository).toBeDefined();
  });

  // ==================== calculateScore ====================

  describe('calculateScore', () => {
    it('deve calcular o score ponderado (relevância 40%, impacto 35%, facilidade 25%)', () => {
      // 80 * 0.4 + 70 * 0.35 + 60 * 0.25 = 32 + 24.5 + 15 = 71.5
      expect(service.calculateScore(80, 70, 60)).toBeCloseTo(71.5, 5);
    });

    it('deve retornar 100 quando todos os fatores forem máximos', () => {
      expect(service.calculateScore(100, 100, 100)).toBeCloseTo(100, 5);
    });

    it('deve retornar 0 quando todos os fatores forem zero (caso de borda)', () => {
      expect(service.calculateScore(0, 0, 0)).toBe(0);
    });

    it('deve dar mais peso à relevância do que ao impacto e à facilidade', () => {
      const somenteRelevancia = service.calculateScore(100, 0, 0);
      const somenteImpacto = service.calculateScore(0, 100, 0);
      const somenteFacilidade = service.calculateScore(0, 0, 100);

      expect(somenteRelevancia).toBeCloseTo(40, 5);
      expect(somenteImpacto).toBeCloseTo(35, 5);
      expect(somenteFacilidade).toBeCloseTo(25, 5);
      expect(somenteRelevancia).toBeGreaterThan(somenteImpacto);
      expect(somenteImpacto).toBeGreaterThan(somenteFacilidade);
    });
  });

  // ==================== determinePriority ====================

  describe('determinePriority', () => {
    it('deve retornar HIGH para score igual ou acima de 75', () => {
      expect(service.determinePriority(75)).toBe(RecommendationPriority.HIGH);
      expect(service.determinePriority(92.5)).toBe(RecommendationPriority.HIGH);
      expect(service.determinePriority(100)).toBe(RecommendationPriority.HIGH);
    });

    it('deve retornar MEDIUM para score entre 50 e 74,99', () => {
      expect(service.determinePriority(50)).toBe(RecommendationPriority.MEDIUM);
      expect(service.determinePriority(74.99)).toBe(
        RecommendationPriority.MEDIUM,
      );
    });

    it('deve retornar LOW para score abaixo de 50', () => {
      expect(service.determinePriority(49.99)).toBe(RecommendationPriority.LOW);
      expect(service.determinePriority(0)).toBe(RecommendationPriority.LOW);
    });

    it('deve tratar scores negativos como LOW (caso de borda)', () => {
      expect(service.determinePriority(-10)).toBe(RecommendationPriority.LOW);
    });

    it('deve integrar corretamente com calculateScore', () => {
      const score = service.calculateScore(95, 90, 85);
      expect(service.determinePriority(score)).toBe(RecommendationPriority.HIGH);
    });
  });

  // ==================== listRecommendations ====================

  describe('listRecommendations', () => {
    it('deve listar recomendações e contabilizar por prioridade', async () => {
      const recomendacoes = [
        criarRecomendacao({
          id: 'rec-1',
          priority: RecommendationPriority.HIGH,
        }),
        criarRecomendacao({
          id: 'rec-2',
          priority: RecommendationPriority.MEDIUM,
        }),
        criarRecomendacao({ id: 'rec-3', priority: RecommendationPriority.LOW }),
        criarRecomendacao({
          id: 'rec-4',
          priority: RecommendationPriority.HIGH,
        }),
      ];
      mockQueryBuilder.getManyAndCount.mockResolvedValue([recomendacoes, 4]);

      const resultado = await service.listRecommendations(USER_ID, FAMILY_ID, {
        limit: 10,
        offset: 0,
        includeDismissed: false,
      });

      expect(resultado.total).toBe(4);
      expect(resultado.recommendations).toHaveLength(4);
      expect(resultado.highPriorityCount).toBe(2);
      expect(resultado.mediumPriorityCount).toBe(1);
      expect(resultado.lowPriorityCount).toBe(1);
      expect(resultado.recommendations[0].id).toBe('rec-1');
    });

    it('deve aplicar paginação (skip/take) com os filtros informados', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.listRecommendations(USER_ID, FAMILY_ID, {
        limit: 5,
        offset: 15,
        includeDismissed: false,
      });

      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(15);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(5);
    });

    it('deve filtrar recomendações descartadas quando includeDismissed for false', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.listRecommendations(USER_ID, FAMILY_ID, {
        limit: 10,
        offset: 0,
        includeDismissed: false,
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'r.isDismissed = :isDismissed',
        { isDismissed: false },
      );
    });

    it('não deve filtrar por isDismissed quando includeDismissed for true', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.listRecommendations(USER_ID, FAMILY_ID, {
        limit: 10,
        offset: 0,
        includeDismissed: true,
      });

      expect(mockQueryBuilder.andWhere).not.toHaveBeenCalledWith(
        'r.isDismissed = :isDismissed',
        { isDismissed: false },
      );
    });

    it('deve aplicar filtro por prioridade quando informado', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.listRecommendations(USER_ID, FAMILY_ID, {
        priority: RecommendationPriority.HIGH,
        limit: 10,
        offset: 0,
        includeDismissed: false,
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'r.priority = :priority',
        { priority: RecommendationPriority.HIGH },
      );
    });

    it('deve aplicar filtro por tipo quando informado', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.listRecommendations(USER_ID, FAMILY_ID, {
        type: RecommendationType.UNUSED_SUB,
        limit: 10,
        offset: 0,
        includeDismissed: false,
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('r.type = :type', {
        type: RecommendationType.UNUSED_SUB,
      });
    });

    it('deve retornar lista vazia com contadores zerados (caso de borda)', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      const resultado = await service.listRecommendations(USER_ID, FAMILY_ID, {
        limit: 10,
        offset: 0,
        includeDismissed: false,
      });

      expect(resultado.recommendations).toEqual([]);
      expect(resultado.total).toBe(0);
      expect(resultado.highPriorityCount).toBe(0);
    });

    it('deve converter potentialSavings/actionUrl nulos em undefined', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([
        [criarRecomendacao({ potentialSavings: null, actionUrl: null })],
        1,
      ]);

      const resultado = await service.listRecommendations(USER_ID, FAMILY_ID, {
        limit: 10,
        offset: 0,
        includeDismissed: false,
      });

      expect(resultado.recommendations[0].potentialSavings).toBeUndefined();
      expect(resultado.recommendations[0].actionUrl).toBeUndefined();
    });

    it('deve ordenar por relevância e usar addOrderBy para a data de criação', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.listRecommendations(USER_ID, FAMILY_ID, {
        limit: 10,
        offset: 0,
        includeDismissed: false,
      });

      expect(mockQueryBuilder.orderBy).toHaveBeenCalledTimes(1);
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        'r.relevance',
        'DESC',
      );
      expect(mockQueryBuilder.addOrderBy).toHaveBeenCalledTimes(1);
      expect(mockQueryBuilder.addOrderBy).toHaveBeenCalledWith(
        'r.createdAt',
        'DESC',
      );
    });

    it('deve escopar a consulta por usuário E por família', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.listRecommendations(USER_ID, FAMILY_ID, {
        limit: 10,
        offset: 0,
        includeDismissed: false,
      });

      expect(mockQueryBuilder.where).toHaveBeenCalledTimes(1);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'r.userId = :userId',
        { userId: USER_ID },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'r.familyId = :familyId',
        { familyId: FAMILY_ID },
      );
    });
  });

  // ==================== getHighPriorityRecommendations ====================

  describe('getHighPriorityRecommendations', () => {
    it('deve delegar para listRecommendations com prioridade HIGH e offset zero', async () => {
      const spy = jest.spyOn(service, 'listRecommendations');
      mockQueryBuilder.getManyAndCount.mockResolvedValue([
        [criarRecomendacao({ priority: RecommendationPriority.HIGH })],
        1,
      ]);

      const resultado = await service.getHighPriorityRecommendations(
        USER_ID,
        FAMILY_ID,
        3,
      );

      expect(spy).toHaveBeenCalledWith(USER_ID, FAMILY_ID, {
        priority: RecommendationPriority.HIGH,
        limit: 3,
        offset: 0,
        includeDismissed: false,
      });
      expect(resultado.highPriorityCount).toBe(1);
    });
  });

  // ==================== getRecommendation ====================

  describe('getRecommendation', () => {
    it('deve retornar a recomendação mapeada quando encontrada', async () => {
      mockRecommendationRepository.findOne.mockResolvedValue(
        criarRecomendacao(),
      );

      const resultado = await service.getRecommendation(
        USER_ID,
        FAMILY_ID,
        'rec-1',
      );

      expect(mockRecommendationRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'rec-1', userId: USER_ID, familyId: FAMILY_ID },
      });
      expect(resultado).not.toBeNull();
      expect(resultado!.id).toBe('rec-1');
      expect(resultado!.potentialSavings).toBe(250);
    });

    it('deve retornar null quando a recomendação não existir (caso de borda)', async () => {
      mockRecommendationRepository.findOne.mockResolvedValue(null);

      const resultado = await service.getRecommendation(
        USER_ID,
        FAMILY_ID,
        'inexistente',
      );

      expect(resultado).toBeNull();
    });
  });

  // ==================== updateRecommendation ====================

  describe('updateRecommendation', () => {
    it('deve marcar a recomendação como descartada e preencher dismissedAt', async () => {
      const recomendacao = criarRecomendacao({ isDismissed: false });
      mockRecommendationRepository.findOne.mockResolvedValue(recomendacao);
      mockRecommendationRepository.save.mockImplementation(
        async (r: Recommendation) => r,
      );

      const dto: UpdateRecommendationDto = { isDismissed: true };
      const resultado = await service.updateRecommendation(
        USER_ID,
        FAMILY_ID,
        'rec-1',
        dto,
      );

      expect(resultado).not.toBeNull();
      expect(resultado!.isDismissed).toBe(true);
      expect(recomendacao.dismissedAt).toBeInstanceOf(Date);
    });

    it('deve reverter o descarte limpando dismissedAt quando isDismissed for false', async () => {
      const recomendacao = criarRecomendacao({
        isDismissed: true,
        dismissedAt: new Date('2026-01-05T00:00:00.000Z'),
      });
      mockRecommendationRepository.findOne.mockResolvedValue(recomendacao);
      mockRecommendationRepository.save.mockImplementation(
        async (r: Recommendation) => r,
      );

      const resultado = await service.updateRecommendation(
        USER_ID,
        FAMILY_ID,
        'rec-1',
        { isDismissed: false },
      );

      expect(resultado!.isDismissed).toBe(false);
      expect(recomendacao.dismissedAt).toBeNull();
    });

    it('não deve alterar isDismissed quando o DTO vier vazio (caso de borda)', async () => {
      const recomendacao = criarRecomendacao({ isDismissed: false });
      mockRecommendationRepository.findOne.mockResolvedValue(recomendacao);
      mockRecommendationRepository.save.mockImplementation(
        async (r: Recommendation) => r,
      );

      const resultado = await service.updateRecommendation(
        USER_ID,
        FAMILY_ID,
        'rec-1',
        {},
      );

      expect(resultado!.isDismissed).toBe(false);
      expect(recomendacao.dismissedAt).toBeNull();
    });

    it('deve retornar null quando a recomendação não existir', async () => {
      mockRecommendationRepository.findOne.mockResolvedValue(null);

      const resultado = await service.updateRecommendation(
        USER_ID,
        FAMILY_ID,
        'inexistente',
        { isDismissed: true },
      );

      expect(resultado).toBeNull();
      expect(mockRecommendationRepository.save).not.toHaveBeenCalled();
    });
  });

  // ==================== estimateImpact ====================

  describe('estimateImpact', () => {
    it('deve somar as economias REAIS de todas as recomendações ativas', async () => {
      mockRecommendationRepository.find.mockResolvedValue([
        criarRecomendacao({
          id: 'rec-1',
          type: RecommendationType.CATEGORY_HIGH,
          potentialSavings: 545,
          ease: 59,
        }),
        criarRecomendacao({
          id: 'rec-2',
          type: RecommendationType.UNUSED_SUB,
          potentialSavings: 670.8,
          ease: 90,
        }),
        criarRecomendacao({
          id: 'rec-3',
          type: RecommendationType.CONSOLIDATION,
          potentialSavings: null,
          ease: 72,
        }),
      ]);

      const resultado = await service.estimateImpact(USER_ID, FAMILY_ID);

      // 545 + 670,80 + 0 = 1.215,80 — soma de TODAS as ativas, não de um tipo.
      expect(resultado.totalPotentialSavings).toBeCloseTo(1215.8, 2);
      // O tipo devolvido é o que concentra a maior economia.
      expect(resultado.type).toBe(RecommendationType.UNUSED_SUB);
      // Dificuldade média = 100 - média das facilidades ((59 + 90 + 72) / 3)
      expect(resultado.averageDifficulty).toBeCloseTo(26.33, 1);
      // 2 das 3 possuem ease >= 70
      expect(resultado.percentageOfEasyActions).toBeCloseTo(66.67, 1);
      expect(resultado.recommendations).toHaveLength(3);
      // Maior economia primeiro
      expect(resultado.recommendations[0].id).toBe('rec-2');
    });

    it('deve somar corretamente quando o driver devolver decimais como texto', async () => {
      mockRecommendationRepository.find.mockResolvedValue([
        criarRecomendacao({
          id: 'rec-1',
          potentialSavings: '545.00' as unknown as number,
        }),
        criarRecomendacao({
          id: 'rec-2',
          potentialSavings: '100.50' as unknown as number,
        }),
      ]);

      const resultado = await service.estimateImpact(USER_ID, FAMILY_ID);

      // Sem Number() a soma viraria a concatenação "0545.00100.50".
      expect(resultado.totalPotentialSavings).toBeCloseTo(645.5, 2);
    });

    it('deve consultar apenas recomendações não descartadas e não deletadas', async () => {
      mockRecommendationRepository.find.mockResolvedValue([]);

      await service.estimateImpact(USER_ID, FAMILY_ID);

      const argumentos = mockRecommendationRepository.find.mock.calls[0][0];
      expect(argumentos.where.userId).toBe(USER_ID);
      expect(argumentos.where.familyId).toBe(FAMILY_ID);
      expect(argumentos.where.isDismissed).toBe(false);
      expect(argumentos.where.deletedAt).toBeDefined();
    });

    it('deve retornar estimativa zerada quando não houver recomendações (caso de borda)', async () => {
      mockRecommendationRepository.find.mockResolvedValue([]);

      const resultado = await service.estimateImpact(USER_ID, FAMILY_ID);

      expect(resultado.type).toBe(RecommendationType.OPPORTUNITY);
      expect(resultado.totalPotentialSavings).toBe(0);
      expect(resultado.averageDifficulty).toBe(0);
      expect(resultado.percentageOfEasyActions).toBe(0);
      expect(resultado.recommendations).toEqual([]);
    });

    it('deve tratar potentialSavings nulo como zero', async () => {
      mockRecommendationRepository.find.mockResolvedValue([
        criarRecomendacao({
          id: 'rec-1',
          type: RecommendationType.DUPLICATE,
          potentialSavings: null,
          ease: 100,
        }),
      ]);

      const resultado = await service.estimateImpact(USER_ID, FAMILY_ID);

      expect(resultado.type).toBe(RecommendationType.DUPLICATE);
      expect(resultado.totalPotentialSavings).toBe(0);
      expect(resultado.averageDifficulty).toBe(0);
      expect(resultado.percentageOfEasyActions).toBe(100);
    });
  });

  // ==================== applyRecommendation ====================

  describe('applyRecommendation', () => {
    it('deve aplicar a recomendação e retornar sucesso com a URL de redirecionamento', async () => {
      const recomendacao = criarRecomendacao({
        actionUrl: '/expenses/category/123',
      });
      mockRecommendationRepository.findOne.mockResolvedValue(recomendacao);
      mockRecommendationRepository.save.mockResolvedValue(recomendacao);

      const resultado = await service.applyRecommendation(
        USER_ID,
        FAMILY_ID,
        'rec-1',
        { notes: 'aplicando' },
      );

      expect(resultado.success).toBe(true);
      expect(resultado.message).toContain('Reduzir gastos com Alimentação');
      expect(resultado.redirectUrl).toBe('/expenses/category/123');
    });

    it('deve retornar redirectUrl indefinido quando não houver actionUrl (caso de borda)', async () => {
      mockRecommendationRepository.findOne.mockResolvedValue(
        criarRecomendacao({ actionUrl: null }),
      );
      mockRecommendationRepository.save.mockImplementation(
        async (r: Recommendation) => r,
      );

      const resultado = await service.applyRecommendation(
        USER_ID,
        FAMILY_ID,
        'rec-1',
        {},
      );

      expect(resultado.success).toBe(true);
      expect(resultado.redirectUrl).toBeUndefined();
    });

    it('deve retornar falha quando a recomendação não existir', async () => {
      mockRecommendationRepository.findOne.mockResolvedValue(null);

      const resultado = await service.applyRecommendation(
        USER_ID,
        FAMILY_ID,
        'inexistente',
        {},
      );

      expect(resultado.success).toBe(false);
      expect(resultado.message).toBe('Recomendação não encontrada');
      expect(mockRecommendationRepository.save).not.toHaveBeenCalled();
    });
  });

  // ==================== regenerateRecommendations ====================

  describe('regenerateRecommendations', () => {
    it('deve gerar recomendações derivadas dos lançamentos reais e persisti-las', async () => {
      configurarCenarioCompleto();

      const resultado = await service.regenerateRecommendations(
        USER_ID,
        FAMILY_ID,
      );

      const persistidas = capturarPersistidas();
      expect(persistidas.length).toBeGreaterThan(0);
      expect(resultado.generated).toBe(persistidas.length);
      expect(mockRecommendationRepository.save).toHaveBeenCalledTimes(1);
      expect(resultado.success).toBe(true);
      // A mensagem cita a base real: lançamentos do mês e economia somada.
      expect(resultado.message).toContain('41 lançamento(s) de agosto/2026');

      // Todas as recomendações trazem escopo, escala e prioridade coerentes.
      for (const rec of persistidas) {
        expect(rec.userId).toBe(USER_ID);
        expect(rec.familyId).toBe(FAMILY_ID);
        expect(rec.relevance).toBeGreaterThanOrEqual(0);
        expect(rec.relevance).toBeLessThanOrEqual(100);
        expect(rec.impact).toBeLessThanOrEqual(100);
        expect(rec.ease).toBeLessThanOrEqual(100);
        expect(Object.values(RecommendationPriority)).toContain(rec.priority);
        expect(rec.metadata.score).toBeDefined();
      }
    });

    it('deve derivar prioridade do score calculado a partir dos números reais', async () => {
      configurarCenarioCompleto();

      await service.regenerateRecommendations(USER_ID, FAMILY_ID);

      for (const rec of capturarPersistidas()) {
        const score = service.calculateScore(rec.relevance, rec.impact, rec.ease);
        expect(rec.priority).toBe(service.determinePriority(score));
      }
    });

    it('deve criar CATEGORY_HIGH citando os valores REAIS da categoria em alta', async () => {
      configurarCenarioCompleto();

      await service.regenerateRecommendations(USER_ID, FAMILY_ID);

      const categoria = porTipo(RecommendationType.CATEGORY_HIGH);
      expect(categoria).toBeDefined();
      // 1.840,00 em agosto contra média de 1.295,00 nos 3 meses anteriores.
      expect(categoria.title).toContain('Alimentação');
      expect(categoria.title).toContain('42%');
      expect(categoria.description).toContain('R$ 1.840,00');
      expect(categoria.description).toContain('R$ 1.295,00');
      expect(categoria.description).toContain('23 lançamento(s)');
      // A economia é o excedente REAL: 1.840,00 - 1.295,00
      expect(categoria.potentialSavings).toBeCloseTo(545, 2);
      expect(categoria.period).toBe(RecommendationPeriod.MONTHLY);
      expect(categoria.metadata.mediaMesesAnteriores).toBeCloseTo(1295, 2);
      expect(categoria.metadata.excedente).toBeCloseTo(545, 2);
    });

    it('não deve acusar alta em categoria que ficou no próprio patamar histórico', async () => {
      configurarCenarioCompleto();

      await service.regenerateRecommendations(USER_ID, FAMILY_ID);

      // Supermercado: 900,00 no mês contra média de 900,00 — nada a recomendar.
      const supermercado = capturarPersistidas().find((r) =>
        r.title.includes('Supermercado'),
      );
      expect(supermercado).toBeUndefined();
    });

    it('não deve acusar alta em categoria sem histórico de comparação', async () => {
      configurarCenarioCompleto();

      await service.regenerateRecommendations(USER_ID, FAMILY_ID);

      // Transporte só existe no mês corrente: sem base, nenhuma conclusão.
      const transporte = capturarPersistidas().find((r) =>
        r.title.includes('Transporte'),
      );
      expect(transporte).toBeUndefined();
    });

    it('deve criar UNUSED_SUB com economia anual igual ao valor médio × 12', async () => {
      configurarCenarioCompleto();

      await service.regenerateRecommendations(USER_ID, FAMILY_ID);

      const assinatura = porTipo(RecommendationType.UNUSED_SUB);
      expect(assinatura).toBeDefined();
      expect(assinatura.title).toContain('Netflix');
      // 55,90 × 12 = 670,80
      expect(assinatura.potentialSavings).toBeCloseTo(670.8, 2);
      expect(assinatura.period).toBe(RecommendationPeriod.ANNUAL);
      expect(assinatura.description).toContain('R$ 55,90');
      expect(assinatura.description).toContain('6 cobranças');
      expect(assinatura.description).toContain('10/08/2026');
    });

    it('não deve tratar uma recorrência cara (aluguel) como assinatura', async () => {
      configurarCenarioCompleto();

      await service.regenerateRecommendations(USER_ID, FAMILY_ID);

      const aluguel = capturarPersistidas().find((r) =>
        r.title.toLowerCase().includes('aluguel'),
      );
      expect(aluguel).toBeUndefined();
    });

    it('deve criar CONSOLIDATION citando a contagem real e sem prometer economia', async () => {
      configurarCenarioCompleto();

      await service.regenerateRecommendations(USER_ID, FAMILY_ID);

      const consolidacao = porTipo(RecommendationType.CONSOLIDATION);
      expect(consolidacao).toBeDefined();
      expect(consolidacao.title).toContain('9 compras pequenas');
      expect(consolidacao.description).toContain('R$ 405,00');
      // A economia depende de taxas que os lançamentos não revelam.
      expect(consolidacao.potentialSavings).toBeNull();
      expect(consolidacao.metadata.comprasPequenas).toBe(9);
    });

    it('deve criar OPPORTUNITY usando a MENOR sobra observada nos meses fechados', async () => {
      configurarCenarioCompleto();

      await service.regenerateRecommendations(USER_ID, FAMILY_ID);

      const oportunidade = porTipo(RecommendationType.OPPORTUNITY);
      expect(oportunidade).toBeDefined();
      // Sobras: 5.500 (mai), 5.400 (jun), 5.300 (jul) — a menor é 5.300.
      expect(oportunidade.potentialSavings).toBeCloseTo(5300, 2);
      expect(oportunidade.description).toContain('R$ 5.300,00');
      expect(oportunidade.description).toContain('julho/2026');
      expect(oportunidade.metadata.mesesAnalisados).toBe(3);
    });

    it('não deve sugerir aporte quando algum mês fechou no vermelho', async () => {
      configurarCenarioCompleto();
      mockFinancialData.getMonthlyIncomeSeries.mockResolvedValue([
        { month: '2026-05', total: 8500, count: 2 },
        { month: '2026-06', total: 2900, count: 1 },
        { month: '2026-07', total: 8500, count: 2 },
        { month: '2026-08', total: 8500, count: 2 },
      ]);

      await service.regenerateRecommendations(USER_ID, FAMILY_ID);

      expect(porTipo(RecommendationType.OPPORTUNITY)).toBeUndefined();
    });

    it('deve criar PATTERN quando os gastos se concentram num dia da semana', async () => {
      configurarCenarioCompleto();
      // 01/08/2026 é um sábado: 6 lançamentos de R$ 200,00 nesse dia.
      const sabados = Array.from({ length: 6 }, (_, i) =>
        criarDespesa(200, 1, 'Lazer'),
      ).map((d, i) => ({ ...d, id: `sab-${i}` }) as Expense);
      const outros = [
        criarDespesa(50, 5, 'Transporte'),
        criarDespesa(50, 6, 'Transporte'),
        criarDespesa(50, 7, 'Transporte'),
        criarDespesa(50, 11, 'Transporte'),
        criarDespesa(50, 12, 'Transporte'),
        criarDespesa(50, 13, 'Transporte'),
      ];
      mockFinancialData.getExpenses.mockResolvedValue([...sabados, ...outros]);

      await service.regenerateRecommendations(USER_ID, FAMILY_ID);

      const padrao = capturarPersistidas().find(
        (r) => r.type === RecommendationType.PATTERN && r.title.includes('sábado'),
      );
      expect(padrao).toBeDefined();
      // 1.200,00 de 1.500,00 = 80% do mês concentrados no sábado.
      expect(padrao.title).toContain('80%');
      expect(padrao.metadata.lancamentosDoDia).toBe(6);
      expect(padrao.metadata.totalDoDia).toBeCloseTo(1200, 2);
    });

    it('deve criar PATTERN quando há três meses fechados consecutivos de alta', async () => {
      configurarCenarioCompleto();
      mockFinancialData.getMonthlyExpenseSeries.mockResolvedValue([
        { month: '2026-05', total: 3000, count: 38 },
        { month: '2026-06', total: 3600, count: 40 },
        { month: '2026-07', total: 4200, count: 44 },
        { month: '2026-08', total: 3200, count: 41 },
      ]);

      await service.regenerateRecommendations(USER_ID, FAMILY_ID);

      const tendencia = capturarPersistidas().find(
        (r) =>
          r.type === RecommendationType.PATTERN && r.title.includes('3 meses'),
      );
      expect(tendencia).toBeDefined();
      // Alta acumulada de 40% entre maio e julho.
      expect(tendencia.title).toContain('40%');
      expect(tendencia.description).toContain('maio/2026');
      expect(tendencia.description).toContain('R$ 4.200,00');
      // Excedente sobre a média dos dois primeiros meses: 4.200 - 3.300 = 900.
      expect(tendencia.potentialSavings).toBeCloseTo(900, 2);
    });

    it('deve arquivar as recomendações ativas anteriores antes de gravar as novas', async () => {
      configurarCenarioCompleto();

      await service.regenerateRecommendations(USER_ID, FAMILY_ID);

      expect(mockRecommendationRepository.update).toHaveBeenCalledTimes(1);
      const [criterio, atualizacao] =
        mockRecommendationRepository.update.mock.calls[0];
      expect(criterio.userId).toBe(USER_ID);
      expect(criterio.familyId).toBe(FAMILY_ID);
      expect(criterio.isDismissed).toBe(false);
      expect(atualizacao.deletedAt).toBeInstanceOf(Date);
    });

    it('não deve ressuscitar uma recomendação já descartada pelo usuário', async () => {
      configurarCenarioCompleto();
      // Descoberto o título exato numa primeira execução...
      await service.regenerateRecommendations(USER_ID, FAMILY_ID);
      const tituloDaCategoria = porTipo(RecommendationType.CATEGORY_HIGH).title;

      jest.clearAllMocks();
      configurarCenarioCompleto();
      mockRecommendationRepository.find.mockResolvedValue([
        criarRecomendacao({
          title: tituloDaCategoria,
          isDismissed: true,
          dismissedAt: new Date(2026, 7, 20),
        }),
      ]);

      await service.regenerateRecommendations(USER_ID, FAMILY_ID);

      expect(porTipo(RecommendationType.CATEGORY_HIGH)).toBeUndefined();
    });

    it('deve informar a ausência de dados e não gravar nada quando não há lançamentos', async () => {
      configurarCenarioSemDados();

      const resultado = await service.regenerateRecommendations(
        USER_ID,
        FAMILY_ID,
      );

      expect(resultado.success).toBe(true);
      expect(resultado.generated).toBe(0);
      expect(resultado.totalPotentialSavings).toBe(0);
      expect(resultado.message).toContain('Ainda não há despesas lançadas');
      expect(mockRecommendationRepository.create).not.toHaveBeenCalled();
      expect(mockRecommendationRepository.save).not.toHaveBeenCalled();
    });

    it('deve informar quando há lançamentos mas nenhuma regra se sustenta', async () => {
      mockFinancialData.getPeriodRange.mockReturnValue(RANGE_MES_ATUAL);
      mockFinancialData.getSummary.mockResolvedValue({
        totalExpenses: 3200,
        totalIncomes: 2000,
        balance: -1200,
        expenseCount: 12,
        incomeCount: 1,
        averageDailyExpense: 123.08,
        days: 26,
      });
      // Mesmo patamar do histórico, sem categorias em alta.
      mockFinancialData.getExpensesByCategory
        .mockResolvedValueOnce([
          { category: 'Moradia', total: 3200, count: 3, average: 1066.67, share: 1 },
        ])
        .mockResolvedValueOnce([
          { category: 'Moradia', total: 9600, count: 9, average: 1066.67, share: 1 },
        ]);
      // Poucos lançamentos e nenhum pequeno: nada a consolidar nem padrão a ver.
      mockFinancialData.getExpenses.mockResolvedValue([
        criarDespesa(1600, 5, 'Moradia'),
        criarDespesa(1600, 15, 'Moradia'),
      ]);
      mockFinancialData.getRecurringExpenses.mockResolvedValue([]);
      mockFinancialData.getMonthlyExpenseSeries.mockResolvedValue([
        { month: '2026-05', total: 3200, count: 12 },
        { month: '2026-06', total: 3200, count: 12 },
        { month: '2026-07', total: 3200, count: 12 },
      ]);
      // Receitas abaixo das despesas: não há sobra a investir.
      mockFinancialData.getMonthlyIncomeSeries.mockResolvedValue([
        { month: '2026-05', total: 2000, count: 1 },
        { month: '2026-06', total: 2000, count: 1 },
        { month: '2026-07', total: 2000, count: 1 },
      ]);
      mockRecommendationRepository.find.mockResolvedValue([]);
      mockRecommendationRepository.update.mockResolvedValue({ affected: 0 });

      const resultado = await service.regenerateRecommendations(
        USER_ID,
        FAMILY_ID,
      );

      expect(resultado.generated).toBe(0);
      expect(resultado.message).toContain('Nenhuma oportunidade de economia');
      expect(resultado.message).toContain('12 lançamento(s) de agosto/2026');
      expect(mockRecommendationRepository.save).not.toHaveBeenCalled();
    });

    it('não deve usar valores aleatórios em nenhuma etapa da geração', async () => {
      configurarCenarioCompleto();
      const random = jest.spyOn(Math, 'random');

      await service.regenerateRecommendations(USER_ID, FAMILY_ID);

      expect(random).not.toHaveBeenCalled();
    });

    it('deve produzir exatamente o mesmo resultado para os mesmos lançamentos', async () => {
      configurarCenarioCompleto();
      await service.regenerateRecommendations(USER_ID, FAMILY_ID);
      const primeira = capturarPersistidas().map((r) => ({
        type: r.type,
        title: r.title,
        potentialSavings: r.potentialSavings,
        relevance: r.relevance,
        impact: r.impact,
        ease: r.ease,
      }));

      jest.clearAllMocks();
      configurarCenarioCompleto();
      await service.regenerateRecommendations(USER_ID, FAMILY_ID);
      const segunda = capturarPersistidas().map((r) => ({
        type: r.type,
        title: r.title,
        potentialSavings: r.potentialSavings,
        relevance: r.relevance,
        impact: r.impact,
        ease: r.ease,
      }));

      expect(segunda).toEqual(primeira);
    });
  });
});
