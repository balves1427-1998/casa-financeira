import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BehaviorAnalyzerService } from '../../services/behavior-analyzer.service';
import { BehaviorAnalysis } from '../../entities/behavior-analysis.entity';
import { FinancialDataService } from '../../../financial-data/financial-data.service';

/**
 * Testes unitários do BehaviorAnalyzerService.
 *
 * O serviço passou a analisar exclusivamente os lançamentos REAIS da família,
 * lidos pelo `FinancialDataService`. Aqui esse serviço é mockado com dois
 * cenários:
 *
 * - "casa sem lançamentos": nada pode ser afirmado, então listas vêm vazias e
 *   os textos dizem honestamente que faltam dados (regra 27 do projeto);
 * - "casa com histórico": números escolhidos para que médias, tendências,
 *   correlações de Pearson e sazonalidade tenham resultado conhecido.
 */
describe('BehaviorAnalyzerService', () => {
  let service: BehaviorAnalyzerService;
  let behaviorAnalysisRepository: Repository<BehaviorAnalysis>;

  const USER_ID = 'user-bruno';
  const FAMILY_ID = 'family-casa';

  // Data de referência fixa: 26/08/2026.
  const HOJE = new Date(2026, 7, 26, 12, 0, 0);

  /** Intervalos devolvidos pelo `FinancialDataService` mockado. */
  const PERIODOS: Record<string, { start: Date; end: Date }> = {
    THIS_MONTH: {
      start: new Date(2026, 7, 1, 0, 0, 0, 0),
      end: new Date(2026, 7, 26, 23, 59, 59, 999),
    },
    LAST_MONTH: {
      start: new Date(2026, 6, 1, 0, 0, 0, 0),
      end: new Date(2026, 6, 31, 23, 59, 59, 999),
    },
    LAST_3_MONTHS: {
      start: new Date(2026, 4, 26, 0, 0, 0, 0),
      end: new Date(2026, 7, 26, 23, 59, 59, 999),
    },
    LAST_6_MONTHS: {
      start: new Date(2026, 1, 26, 0, 0, 0, 0),
      end: new Date(2026, 7, 26, 23, 59, 59, 999),
    },
    LAST_12_MONTHS: {
      start: new Date(2025, 7, 26, 0, 0, 0, 0),
      end: new Date(2026, 7, 26, 23, 59, 59, 999),
    },
  };

  const RESUMO_VAZIO = {
    totalExpenses: 0,
    totalIncomes: 0,
    balance: 0,
    expenseCount: 0,
    incomeCount: 0,
    averageDailyExpense: 0,
    days: 30,
  };

  // ==================== fixtures do cenário com dados ====================

  const RESUMO_MES_ATUAL = {
    totalExpenses: 4200,
    totalIncomes: 8400,
    balance: 4200,
    expenseCount: 30,
    incomeCount: 2,
    averageDailyExpense: 140,
    days: 30,
  };

  const RESUMO_MES_ANTERIOR = {
    totalExpenses: 3500,
    totalIncomes: 8400,
    balance: 4900,
    expenseCount: 28,
    incomeCount: 2,
    averageDailyExpense: 116.67,
    days: 30,
  };

  const CATEGORIAS_MES_ATUAL = [
    { category: 'Alimentação', total: 1176, count: 12, average: 98, share: 0.28 },
    { category: 'Supermercado', total: 1050, count: 8, average: 131.25, share: 0.25 },
    { category: 'Transporte', total: 630, count: 6, average: 105, share: 0.15 },
  ];

  const CATEGORIAS_MES_ANTERIOR = [
    { category: 'Supermercado', total: 900, count: 7, average: 128.57, share: 0.257 },
    { category: 'Alimentação', total: 800, count: 10, average: 80, share: 0.229 },
  ];

  /** Últimos 3 meses (base "recente" da tendência por categoria). */
  const CATEGORIAS_TRIMESTRE_ATUAL = [
    { category: 'Supermercado', total: 1480.8, count: 12, average: 123.4, share: 0.497 },
    { category: 'Alimentação', total: 900, count: 10, average: 90, share: 0.302 },
    { category: 'Lazer', total: 600, count: 8, average: 75, share: 0.201 },
  ];

  /** Os 3 meses imediatamente anteriores. */
  const CATEGORIAS_TRIMESTRE_ANTERIOR = [
    { category: 'Supermercado', total: 1200, count: 10, average: 120, share: 0.403 },
    { category: 'Lazer', total: 900, count: 9, average: 100, share: 0.302 },
    { category: 'Alimentação', total: 880, count: 9, average: 97.78, share: 0.295 },
  ];

  /**
   * Sábado concentra 1500/3500 = 42,9% dos gastos — é também o dia em que caem
   * todas as despesas da fixture `DESPESAS`, mantendo os dois lados coerentes.
   */
  const DIAS_DA_SEMANA = [
    { dayOfWeek: 0, label: 'Domingo', total: 400, count: 4, average: 100 },
    { dayOfWeek: 1, label: 'Segunda', total: 300, count: 3, average: 100 },
    { dayOfWeek: 2, label: 'Terça', total: 250, count: 3, average: 83.33 },
    { dayOfWeek: 3, label: 'Quarta', total: 200, count: 2, average: 100 },
    { dayOfWeek: 4, label: 'Quinta', total: 350, count: 4, average: 87.5 },
    { dayOfWeek: 5, label: 'Sexta', total: 500, count: 5, average: 100 },
    { dayOfWeek: 6, label: 'Sábado', total: 1500, count: 12, average: 125 },
  ];

  const RESPONSAVEIS = [
    { responsible: 'Bruno', total: 2500, count: 18, share: 0.5952 },
    { responsible: 'Giovanna', total: 1700, count: 12, share: 0.4048 },
  ];

  const RECORRENTES = [
    {
      description: 'netflix',
      category: 'Assinaturas',
      averageAmount: 55.9,
      occurrences: 6,
      averageIntervalDays: 30,
      lastDate: new Date(2026, 6, 15),
    },
    {
      description: 'academia smart',
      category: 'Saúde',
      averageAmount: 129.9,
      occurrences: 6,
      averageIntervalDays: 30,
      lastDate: new Date(2026, 6, 10),
    },
  ];

  /** Cinco meses fechados, crescimento linear de R$ 100/mês. */
  const SERIE_MENSAL_DESPESAS = [
    { month: '2026-03', total: 4000, count: 30 },
    { month: '2026-04', total: 4100, count: 31 },
    { month: '2026-05', total: 4200, count: 29 },
    { month: '2026-06', total: 4300, count: 32 },
    { month: '2026-07', total: 4400, count: 30 },
  ];

  /** Receitas perfeitamente correlacionadas com as despesas (r = 1). */
  const SERIE_MENSAL_RECEITAS = [
    { month: '2026-03', total: 8000, count: 2 },
    { month: '2026-04', total: 8200, count: 2 },
    { month: '2026-05', total: 8400, count: 2 },
    { month: '2026-06', total: 8600, count: 2 },
    { month: '2026-07', total: 8800, count: 2 },
  ];

  /**
   * Série diária com dois meses de comportamento distinto e variação zero
   * dentro de cada mês → sazonalidade máxima (variância entre meses = total).
   */
  const SERIE_DIARIA = [
    { date: '2026-06-01', total: 100, count: 2 },
    { date: '2026-06-02', total: 100, count: 1 },
    { date: '2026-06-03', total: 100, count: 1 },
    { date: '2026-07-01', total: 300, count: 3 },
    { date: '2026-07-02', total: 300, count: 2 },
    { date: '2026-07-03', total: 300, count: 2 },
  ];

  /**
   * Despesas usadas para montar as séries mensais por categoria:
   * Alimentação sobe 1000→1400 e Lazer cai 500→100 (correlação r = -1).
   */
  const DATAS_MENSAIS = [
    new Date(2026, 2, 7, 12, 0),
    new Date(2026, 3, 4, 12, 0),
    new Date(2026, 4, 2, 12, 0),
    new Date(2026, 5, 6, 12, 0),
    new Date(2026, 6, 4, 12, 0),
  ];

  const DESPESAS = DATAS_MENSAIS.flatMap((data, i) => [
    {
      id: `alim-${i}`,
      description: `Restaurante ${i}`,
      amount: 1000 + i * 100,
      date: data,
      category: 'Alimentação',
      responsible: 'Bruno',
    },
    {
      id: `lazer-${i}`,
      description: `Cinema ${i}`,
      amount: 500 - i * 100,
      date: data,
      category: 'Lazer',
      responsible: 'Giovanna',
    },
  ]);

  const criarAnalise = (
    overrides: Partial<BehaviorAnalysis> = {},
  ): BehaviorAnalysis =>
    ({
      id: 'analise-1',
      familyId: FAMILY_ID,
      createdAt: new Date('2026-08-26T00:00:00.000Z'),
      updatedAt: new Date('2026-08-26T00:00:00.000Z'),
      ...overrides,
    }) as BehaviorAnalysis;

  const mockBehaviorAnalysisRepository: any = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockFinancialData: any = {
    getPeriodRange: jest.fn(),
    getSummary: jest.fn(),
    getExpenses: jest.fn(),
    getExpensesByCategory: jest.fn(),
    getExpensesByResponsible: jest.fn(),
    getExpensesByDayOfWeek: jest.fn(),
    getMonthlyExpenseSeries: jest.fn(),
    getMonthlyIncomeSeries: jest.fn(),
    getDailyExpenseSeries: jest.fn(),
    getRecurringExpenses: jest.fn(),
  };

  /** Liga o cenário "casa com histórico real". */
  const configurarCasaComHistorico = () => {
    mockFinancialData.getSummary.mockImplementation(
      async (_familyId: string, range: any) => {
        if (range === PERIODOS.LAST_MONTH) return RESUMO_MES_ANTERIOR;
        return RESUMO_MES_ATUAL;
      },
    );

    mockFinancialData.getExpensesByCategory.mockImplementation(
      async (_familyId: string, range: any) => {
        if (range === PERIODOS.THIS_MONTH) return CATEGORIAS_MES_ATUAL;
        if (range === PERIODOS.LAST_MONTH) return CATEGORIAS_MES_ANTERIOR;
        // Intervalo construído por `periodoAnteriorA`: começa antes do
        // trimestre corrente.
        if (
          range.start.getTime() < PERIODOS.LAST_3_MONTHS.start.getTime()
        ) {
          return CATEGORIAS_TRIMESTRE_ANTERIOR;
        }
        return CATEGORIAS_TRIMESTRE_ATUAL;
      },
    );

    mockFinancialData.getExpenses.mockResolvedValue(DESPESAS);
    mockFinancialData.getExpensesByDayOfWeek.mockResolvedValue(DIAS_DA_SEMANA);
    mockFinancialData.getExpensesByResponsible.mockResolvedValue(RESPONSAVEIS);
    mockFinancialData.getMonthlyExpenseSeries.mockResolvedValue(
      SERIE_MENSAL_DESPESAS,
    );
    mockFinancialData.getMonthlyIncomeSeries.mockResolvedValue(
      SERIE_MENSAL_RECEITAS,
    );
    mockFinancialData.getDailyExpenseSeries.mockResolvedValue(SERIE_DIARIA);
    mockFinancialData.getRecurringExpenses.mockResolvedValue(RECORRENTES);
  };

  beforeEach(async () => {
    // Cenário padrão: casa SEM lançamentos.
    mockFinancialData.getPeriodRange.mockImplementation(
      (period: string) => PERIODOS[period] ?? PERIODOS.LAST_6_MONTHS,
    );
    mockFinancialData.getSummary.mockResolvedValue(RESUMO_VAZIO);
    mockFinancialData.getExpenses.mockResolvedValue([]);
    mockFinancialData.getExpensesByCategory.mockResolvedValue([]);
    mockFinancialData.getExpensesByResponsible.mockResolvedValue([]);
    mockFinancialData.getExpensesByDayOfWeek.mockResolvedValue([]);
    mockFinancialData.getMonthlyExpenseSeries.mockResolvedValue([]);
    mockFinancialData.getMonthlyIncomeSeries.mockResolvedValue([]);
    mockFinancialData.getDailyExpenseSeries.mockResolvedValue([]);
    mockFinancialData.getRecurringExpenses.mockResolvedValue([]);

    mockBehaviorAnalysisRepository.create.mockImplementation((dados: any) =>
      criarAnalise(dados),
    );
    mockBehaviorAnalysisRepository.save.mockImplementation(
      async (analise: any) => analise,
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BehaviorAnalyzerService,
        {
          provide: getRepositoryToken(BehaviorAnalysis),
          useValue: mockBehaviorAnalysisRepository,
        },
        {
          provide: FinancialDataService,
          useValue: mockFinancialData,
        },
      ],
    }).compile();

    service = module.get<BehaviorAnalyzerService>(BehaviorAnalyzerService);
    behaviorAnalysisRepository = module.get<Repository<BehaviorAnalysis>>(
      getRepositoryToken(BehaviorAnalysis),
    );

    // Data fixa para que "mês corrente" (2026-08) seja determinístico.
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(HOJE);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('deve estar definido', () => {
    expect(service).toBeDefined();
    expect(behaviorAnalysisRepository).toBeDefined();
  });

  // ==================== analyzeBehavior ====================

  describe('analyzeBehavior', () => {
    it('deve dizer honestamente que faltam lançamentos quando não há dados', async () => {
      const resultado = await service.analyzeBehavior(
        USER_ID,
        FAMILY_ID,
        'LAST_6_MONTHS',
      );

      expect(resultado.period).toBe('LAST_6_MONTHS');
      expect(resultado.summary).toContain('Ainda não há lançamentos');
      expect(resultado.patterns).toEqual([]);
      expect(resultado.correlations).toEqual([]);
      expect(resultado.anomalies).toEqual([]);
      expect(resultado.periodAnalysis.bestSpendingDays).toEqual([]);
      expect(resultado.periodAnalysis.spendingByDayOfWeek).toEqual([]);
      expect(resultado.periodAnalysis.seasonalPatterns).toEqual([]);
      expect(resultado.periodAnalysis.seasonalityScore).toBe(0);
      expect(resultado.spendingProfile.topCategory).toBe(
        'Sem dados suficientes',
      );
      expect(resultado.metadata?.possuiDadosSuficientes).toBe(false);
      expect(resultado.insights).toHaveLength(1);
      expect(resultado.insights![0]).toContain('Ainda não há lançamentos');
    });

    it('deve montar a análise com os números reais do período', async () => {
      configurarCasaComHistorico();

      const resultado = await service.analyzeBehavior(
        USER_ID,
        FAMILY_ID,
        'LAST_6_MONTHS',
      );

      expect(resultado.period).toBe('LAST_6_MONTHS');
      expect(resultado.summary).toContain('30 despesa(s)');
      expect(resultado.summary).toContain('R$ 4.200,00');
      expect(resultado.summary).toContain('R$ 8.400,00');
      expect(resultado.metadata?.possuiDadosSuficientes).toBe(true);
      expect(resultado.metadata?.totalDespesas).toBe(4200);

      // Padrões e correlações vêm dos cálculos reais, não de exemplos fixos.
      expect(resultado.patterns.length).toBeGreaterThan(0);
      expect(resultado.correlations.length).toBeGreaterThan(0);
      expect(resultado.periodAnalysis.spendingByDayOfWeek).toHaveLength(7);
      expect(resultado.periodAnalysis.seasonalityScore).toBe(1);

      // A análise é recalculada e persistida.
      expect(mockBehaviorAnalysisRepository.create).toHaveBeenCalledTimes(1);
      expect(mockBehaviorAnalysisRepository.save).toHaveBeenCalledTimes(1);
    });

    it('deve delegar o intervalo do período ao FinancialDataService', async () => {
      await service.analyzeBehavior(USER_ID, FAMILY_ID, 'THIS_MONTH');

      expect(mockFinancialData.getPeriodRange).toHaveBeenCalledWith(
        'THIS_MONTH',
      );
    });
  });

  // ==================== detectPatterns ====================

  describe('detectPatterns', () => {
    it('deve retornar lista vazia quando não há histórico', async () => {
      const resultado = await service.detectPatterns(USER_ID, FAMILY_ID, {
        limit: 10,
      });

      expect(resultado.patterns).toEqual([]);
      expect(resultado.total).toBe(0);
      expect(resultado.totalPatterns).toBe(0);
      expect(resultado.increasingCount).toBe(0);
      expect(resultado.decreasingCount).toBe(0);
      expect(resultado.stableCount).toBe(0);
    });

    it('deve detectar tendência real por categoria comparando trimestres', async () => {
      configurarCasaComHistorico();

      const resultado = await service.detectPatterns(USER_ID, FAMILY_ID, {
        limit: 50,
      });

      const supermercado = resultado.patterns.find(
        (p) => p.id === 'tendencia-supermercado',
      );
      expect(supermercado).toBeDefined();
      // (1480,80 - 1200) / 1200 = +23,4%
      expect(supermercado!.trend).toBe('increasing');
      expect(supermercado!.description).toContain('R$ 1.200,00');
      expect(supermercado!.description).toContain('R$ 1.480,80');
      expect(supermercado!.description).toContain('+23,4%');
      expect(supermercado!.affectedCategories).toEqual(['Supermercado']);
      // amostra = 12 + 10 = 22 lançamentos → 22/24
      expect(supermercado!.confidence).toBe(0.92);

      const lazer = resultado.patterns.find((p) => p.id === 'tendencia-lazer');
      expect(lazer!.trend).toBe('decreasing');

      const alimentacao = resultado.patterns.find(
        (p) => p.id === 'tendencia-alimentacao',
      );
      expect(alimentacao!.trend).toBe('stable');
    });

    it('deve detectar concentração real em um dia da semana', async () => {
      configurarCasaComHistorico();

      const resultado = await service.detectPatterns(USER_ID, FAMILY_ID, {
        limit: 50,
      });

      const concentracao = resultado.patterns.find(
        (p) => p.id === 'concentracao-dia-6',
      );
      expect(concentracao).toBeDefined();
      expect(concentracao!.frequency).toBe('weekly');
      expect(concentracao!.description).toContain('Sábado');
      expect(concentracao!.description).toContain('42,9%');
      expect(concentracao!.description).toContain('R$ 1.500,00');
      // Categorias reais lançadas nesse dia da semana, em ordem de valor.
      expect(concentracao!.affectedCategories).toEqual([
        'Alimentação',
        'Lazer',
      ]);
    });

    it('deve transformar as recorrências reais em padrões com custo anual', async () => {
      configurarCasaComHistorico();

      const resultado = await service.detectPatterns(USER_ID, FAMILY_ID, {
        limit: 50,
      });

      const netflix = resultado.patterns.find(
        (p) => p.id === 'recorrencia-netflix',
      );
      expect(netflix).toBeDefined();
      expect(netflix!.frequency).toBe('monthly');
      expect(netflix!.trend).toBe('stable');
      expect(netflix!.description).toContain('R$ 55,90');
      expect(netflix!.description).toContain('6 ocorrências');
      // 55,90 * (365 / 30) = R$ 680,12
      expect(netflix!.recommendation).toContain('R$ 680,12');
      // 6 ocorrências sobre a referência de 12
      expect(netflix!.confidence).toBe(0.5);
    });

    it('deve filtrar por frequência mantendo o total filtrado', async () => {
      configurarCasaComHistorico();

      const resultado = await service.detectPatterns(USER_ID, FAMILY_ID, {
        frequency: 'weekly',
        limit: 50,
      });

      expect(resultado.patterns.length).toBeGreaterThan(0);
      expect(resultado.patterns.every((p) => p.frequency === 'weekly')).toBe(
        true,
      );
      expect(resultado.total).toBe(resultado.patterns.length);
    });

    it('deve aplicar o limite sem alterar o total (caso de borda: limite zero)', async () => {
      configurarCasaComHistorico();

      const completo = await service.detectPatterns(USER_ID, FAMILY_ID, {
        limit: 50,
      });
      const semNada = await service.detectPatterns(USER_ID, FAMILY_ID, {
        limit: 0,
      });

      expect(semNada.patterns).toEqual([]);
      expect(semNada.total).toBe(completo.total);
      expect(semNada.increasingCount).toBe(0);
      expect(semNada.stableCount).toBe(0);
    });

    it('deve devolver padrões com confiança entre 0 e 1 e campos válidos', async () => {
      configurarCasaComHistorico();

      const resultado = await service.detectPatterns(USER_ID, FAMILY_ID, {
        limit: 50,
      });

      for (const padrao of resultado.patterns) {
        expect(padrao.confidence).toBeGreaterThanOrEqual(0);
        expect(padrao.confidence).toBeLessThanOrEqual(1);
        expect(typeof padrao.id).toBe('string');
        expect(typeof padrao.description).toBe('string');
        expect(Array.isArray(padrao.affectedCategories)).toBe(true);
        expect(['daily', 'weekly', 'monthly', 'seasonal']).toContain(
          padrao.frequency,
        );
        expect(['increasing', 'decreasing', 'stable']).toContain(padrao.trend);
      }
    });
  });

  // ==================== analyzeCorrelations ====================

  describe('analyzeCorrelations', () => {
    it('não deve calcular correlações com menos de 3 meses de histórico', async () => {
      mockFinancialData.getMonthlyExpenseSeries.mockResolvedValue([
        { month: '2026-06', total: 4000, count: 30 },
        { month: '2026-07', total: 4100, count: 31 },
      ]);

      const resultado = await service.analyzeCorrelations(USER_ID, FAMILY_ID, {
        minCorrelation: 0,
        limit: 10,
      });

      expect(resultado.correlations).toEqual([]);
      expect(resultado.total).toBe(0);
      expect(resultado.strongCorrelations).toBe(0);
    });

    it('deve calcular o coeficiente de Pearson real entre receitas e despesas', async () => {
      configurarCasaComHistorico();

      const resultado = await service.analyzeCorrelations(USER_ID, FAMILY_ID, {
        minCorrelation: 0,
        limit: 10,
      });

      const receitaDespesa = resultado.correlations.find(
        (c) => c.variable1 === 'Receitas' && c.variable2 === 'Despesas',
      );
      expect(receitaDespesa).toBeDefined();
      // Ambas as séries crescem linearmente → r = 1
      expect(receitaDespesa!.coefficient).toBe(1);
      expect(receitaDespesa!.interpretation).toContain('forte');
      expect(receitaDespesa!.interpretation).toContain('5 meses');
      expect(receitaDespesa!.pValue).toBeGreaterThanOrEqual(0);
      expect(receitaDespesa!.pValue).toBeLessThanOrEqual(1);
    });

    it('deve calcular correlação negativa real entre categorias', async () => {
      configurarCasaComHistorico();

      const resultado = await service.analyzeCorrelations(USER_ID, FAMILY_ID, {
        minCorrelation: 0,
        limit: 10,
      });

      const entreCategorias = resultado.correlations.find(
        (c) =>
          (c.variable1 === 'Alimentação' && c.variable2 === 'Lazer') ||
          (c.variable1 === 'Lazer' && c.variable2 === 'Alimentação'),
      );
      expect(entreCategorias).toBeDefined();
      // Alimentação sobe enquanto Lazer cai, linearmente → r = -1
      expect(entreCategorias!.coefficient).toBe(-1);
      expect(entreCategorias!.interpretation).toContain('sentidos opostos');
      expect(resultado.strongCorrelations).toBe(2);
    });

    it('deve filtrar pelo coeficiente mínimo (em módulo)', async () => {
      configurarCasaComHistorico();

      const resultado = await service.analyzeCorrelations(USER_ID, FAMILY_ID, {
        minCorrelation: 1.1,
        limit: 10,
      });

      expect(resultado.correlations).toEqual([]);
      expect(resultado.total).toBe(0);
    });

    it('deve aplicar o limite mantendo o total filtrado', async () => {
      configurarCasaComHistorico();

      const resultado = await service.analyzeCorrelations(USER_ID, FAMILY_ID, {
        minCorrelation: 0,
        limit: 1,
      });

      expect(resultado.correlations).toHaveLength(1);
      expect(resultado.total).toBe(2);
    });
  });

  // ==================== getSpendingProfile ====================

  describe('getSpendingProfile', () => {
    it('deve zerar o perfil e marcar a categoria como indisponível sem lançamentos', async () => {
      const perfil = await service.getSpendingProfile(
        USER_ID,
        FAMILY_ID,
        'THIS_MONTH',
      );

      expect(perfil).toEqual({
        averageDailySpend: 0,
        averageMonthlySpend: 0,
        maxSpendDay: 0,
        minSpendDay: 0,
        topCategory: 'Sem dados suficientes',
        topCategoryPercentage: 0,
        spendingLevel: 'LOW',
        trend: 'STABLE',
        predictability: 0,
      });
    });

    it('deve calcular médias, categoria principal e previsibilidade reais', async () => {
      configurarCasaComHistorico();

      const perfil = await service.getSpendingProfile(
        USER_ID,
        FAMILY_ID,
        'THIS_MONTH',
      );

      expect(perfil.averageDailySpend).toBe(140);
      expect(perfil.averageMonthlySpend).toBe(4200);
      expect(perfil.maxSpendDay).toBe(300);
      expect(perfil.minSpendDay).toBe(100);
      expect(perfil.topCategory).toBe('Alimentação');
      expect(perfil.topCategoryPercentage).toBe(28);
      // 4200 de despesa para 8400 de receita → razão 0,5
      expect(perfil.spendingLevel).toBe('MEDIUM');
      // Último mês fechado (4400) contra a média dos anteriores (4150): +6%
      expect(perfil.trend).toBe('STABLE');
      // Coeficiente de variação da série mensal ≈ 0,034 → 1 - CV ≈ 0,97
      expect(perfil.predictability).toBe(0.97);
    });

    it('deve classificar como VERY_HIGH quando há despesas e nenhuma receita', async () => {
      configurarCasaComHistorico();
      mockFinancialData.getSummary.mockResolvedValue({
        ...RESUMO_MES_ATUAL,
        totalIncomes: 0,
        incomeCount: 0,
        balance: -4200,
      });

      const perfil = await service.getSpendingProfile(
        USER_ID,
        FAMILY_ID,
        'THIS_MONTH',
      );

      expect(perfil.spendingLevel).toBe('VERY_HIGH');
    });

    it('deve manter previsibilidade entre 0 e 1 e enums válidos', async () => {
      configurarCasaComHistorico();

      const perfil = await service.getSpendingProfile(
        USER_ID,
        FAMILY_ID,
        'PERIODO_DESCONHECIDO',
      );

      expect(perfil.predictability).toBeGreaterThanOrEqual(0);
      expect(perfil.predictability).toBeLessThanOrEqual(1);
      expect(['LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH']).toContain(
        perfil.spendingLevel,
      );
      expect(['STABLE', 'GROWING', 'DECLINING']).toContain(perfil.trend);
    });
  });

  // ==================== generateInsights ====================

  describe('generateInsights', () => {
    it('deve pedir lançamentos em vez de inventar exemplos quando não há dados', async () => {
      const resultado = await service.generateInsights(USER_ID, FAMILY_ID);

      expect(resultado.insights).toHaveLength(1);
      expect(resultado.insights[0]).toContain('Ainda não há lançamentos');
      expect(resultado.generatedAt).toBeInstanceOf(Date);
    });

    it('deve gerar frases em português citando os números reais', async () => {
      configurarCasaComHistorico();

      const resultado = await service.generateInsights(USER_ID, FAMILY_ID);
      const texto = resultado.insights.join('\n');

      // Total do mês e média diária
      expect(texto).toContain('R$ 4.200,00');
      expect(texto).toContain('R$ 140,00');
      // Comparação com o mês anterior: (4200 - 3500) / 3500 = +20%
      expect(texto).toContain('20,0% acima do mês passado');
      expect(texto).toContain('R$ 3.500,00');
      // Maior categoria do mês
      expect(texto).toContain('Maior categoria do mês: Alimentação');
      expect(texto).toContain('28,0%');
      // Categoria que mais subiu: Alimentação de 800 para 1176 (+47%)
      expect(texto).toContain('47,0% acima do mês passado');
      // Divisão Bruno x Giovanna
      expect(texto).toContain('Bruno pagou R$ 2.500,00');
      expect(texto).toContain('Giovanna pagou R$ 1.700,00');
      expect(texto).toContain('R$ 800,00');
      // Recorrentes: 55,90 + 129,90 = R$ 185,80/mês → R$ 2.229,60/ano
      expect(texto).toContain('R$ 185,80');
      expect(texto).toContain('R$ 2.229,60');
      // Nenhum número inventado: não existem emojis nem textos de exemplo
      expect(texto).not.toContain('Café Diário');
    });
  });

  // ==================== getPeriodDateRange ====================

  describe('getPeriodDateRange', () => {
    it('deve delegar ao FinancialDataService em vez de duplicar a regra', () => {
      const intervalo = service.getPeriodDateRange('LAST_3_MONTHS');

      expect(mockFinancialData.getPeriodRange).toHaveBeenCalledWith(
        'LAST_3_MONTHS',
      );
      expect(intervalo).toBe(PERIODOS.LAST_3_MONTHS);
    });

    it('deve sempre devolver start anterior ou igual a end', () => {
      const periodos = [
        'THIS_MONTH',
        'LAST_MONTH',
        'LAST_3_MONTHS',
        'LAST_6_MONTHS',
        'LAST_12_MONTHS',
        '',
      ];

      for (const periodo of periodos) {
        const { start, end } = service.getPeriodDateRange(periodo);
        expect(start.getTime()).toBeLessThanOrEqual(end.getTime());
      }
    });
  });

  // ==================== generateBehaviorAnalysis ====================

  describe('generateBehaviorAnalysis', () => {
    it('deve persistir a análise com a estrutura vazia quando não há lançamentos', async () => {
      await service.generateBehaviorAnalysis(
        USER_ID,
        FAMILY_ID,
        'LAST_6_MONTHS',
      );

      const argumentos =
        mockBehaviorAnalysisRepository.create.mock.calls[0][0];

      expect(argumentos.familyId).toBe(FAMILY_ID);
      expect(argumentos.patterns).toEqual([]);
      expect(argumentos.correlations).toEqual([]);
      expect(argumentos.anomalies).toEqual([]);
      expect(argumentos.clustering).toEqual([]);
      expect(argumentos.seasonalityScore).toBe(0);
      expect(argumentos.periodAnalysis.bestSpendingDays).toEqual([]);
      expect(argumentos.periodAnalysis.worstSpendingDays).toEqual([]);
      expect(argumentos.periodAnalysis.seasonalPatterns).toEqual([]);
      expect(mockBehaviorAnalysisRepository.save).toHaveBeenCalledTimes(1);
    });

    it('deve persistir a análise calculada a partir dos lançamentos reais', async () => {
      configurarCasaComHistorico();

      await service.generateBehaviorAnalysis(
        USER_ID,
        FAMILY_ID,
        'LAST_6_MONTHS',
      );

      const argumentos =
        mockBehaviorAnalysisRepository.create.mock.calls[0][0];

      // Sazonalidade REAL: toda a variância dos gastos diários é explicada
      // pela diferença entre junho (R$ 100/dia) e julho (R$ 300/dia).
      expect(argumentos.seasonalityScore).toBe(1);
      expect(argumentos.periodAnalysis.seasonalityScore).toBe(1);

      // Dias da semana: os 3 de menor gasto médio e os 3 de maior.
      expect(argumentos.periodAnalysis.spendingByDayOfWeek).toHaveLength(7);
      expect(argumentos.periodAnalysis.bestSpendingDays).toHaveLength(3);
      expect(argumentos.periodAnalysis.worstSpendingDays).toHaveLength(3);
      expect(argumentos.periodAnalysis.worstSpendingDays[0]).toBe('Sábado');

      // Sazonalidade mensal montada com os totais reais de cada mês.
      expect(argumentos.periodAnalysis.seasonalPatterns).toHaveLength(5);
      expect(argumentos.periodAnalysis.seasonalPatterns[0]).toEqual({
        month: 'Março',
        year: 2026,
        averageSpend: 4000,
        // 4000 - média dos 5 meses (4200) = -200
        variance: -200,
      });

      expect(argumentos.patterns.length).toBeGreaterThan(0);
      expect(argumentos.correlations.length).toBeGreaterThan(0);
    });

    it('deve propagar erros do repositório ao salvar (caso de borda)', async () => {
      mockBehaviorAnalysisRepository.save.mockRejectedValue(
        new Error('Falha ao salvar análise'),
      );

      await expect(
        service.generateBehaviorAnalysis(USER_ID, FAMILY_ID, 'THIS_MONTH'),
      ).rejects.toThrow('Falha ao salvar análise');
    });
  });
});
