import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForecastService } from '../../services/forecast.service';
import {
  Forecast,
  ForecastType,
  ForecastPeriod,
  ForecastModel,
} from '../../entities/forecast.entity';
import { FinancialDataService } from '../../../financial-data/financial-data.service';
import {
  MonthlyPoint,
  CategoryAggregate,
} from '../../../financial-data/financial-data.types';

/**
 * Testes unitários do ForecastService.
 *
 * O serviço não inventa números: tudo sai da série mensal real lida pelo
 * `FinancialDataService`, que aqui é mockado com séries realistas. O
 * repositório de Forecast serve apenas como cache diário e também é mockado.
 *
 * O relógio é fixado em 26/08/2026 para que "mês corrente" (2026-08) e os
 * meses fechados usados no ajuste sejam determinísticos.
 */
describe('ForecastService', () => {
  let service: ForecastService;

  const USER_ID = 'user-bruno';
  const FAMILY_ID = 'family-casa';

  const mockForecastRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };

  const mockFinancialData = {
    getPeriodDays: jest.fn(),
    getPeriodRange: jest.fn(),
    getMonthlyExpenseSeries: jest.fn(),
    getMonthlyIncomeSeries: jest.fn(),
    getExpensesByCategory: jest.fn(),
    getCurrentBalance: jest.fn(),
    getSummary: jest.fn(),
    getIncomes: jest.fn(),
    hasSufficientHistory: jest.fn(),
  };

  /**
   * Série real de exemplo: 6 meses fechados em crescimento perfeitamente
   * linear (+200/mês) mais o mês corrente ainda incompleto, que o serviço deve
   * descartar do ajuste.
   */
  const SERIE_CRESCENTE: MonthlyPoint[] = [
    { month: '2026-02', total: 4000, count: 40 },
    { month: '2026-03', total: 4200, count: 42 },
    { month: '2026-04', total: 4400, count: 44 },
    { month: '2026-05', total: 4600, count: 46 },
    { month: '2026-06', total: 4800, count: 48 },
    { month: '2026-07', total: 5000, count: 50 },
    // Mês corrente parcial — não pode entrar na regressão.
    { month: '2026-08', total: 1200, count: 12 },
  ];

  /** Apenas 4 meses fechados: insuficiente para o ensemble, suficiente para a reta. */
  const SERIE_CURTA: MonthlyPoint[] = [
    { month: '2026-04', total: 4000, count: 40 },
    { month: '2026-05', total: 4100, count: 41 },
    { month: '2026-06', total: 4200, count: 42 },
    { month: '2026-07', total: 4300, count: 43 },
    { month: '2026-08', total: 1000, count: 10 },
  ];

  /** Menos de 3 meses fechados: nenhuma previsão pode ser feita. */
  const SERIE_INSUFICIENTE: MonthlyPoint[] = [
    { month: '2026-07', total: 4300, count: 43 },
    { month: '2026-08', total: 1000, count: 10 },
  ];

  /** Repassa ao teste a entidade que o serviço mandou criar. */
  const capturarCriacao = () => mockForecastRepository.create.mock.calls[0][0];

  const buildForecastPersistido = (
    overrides: Record<string, any> = {},
  ): Forecast =>
    ({
      id: '11111111-1111-1111-1111-111111111111',
      familyId: FAMILY_ID,
      forecastType: ForecastType.TOTAL,
      period: ForecastPeriod.NEXT_30_DAYS,
      categoryId: null,
      targetUserId: null,
      predictions: [
        {
          date: '2026-08-27',
          predictedValue: 162.58,
          lowerBound: 162.58,
          upperBound: 162.58,
          confidence: 0.75,
        },
      ],
      summary: {
        averagePredicted: 170.43,
        minPredicted: 162.58,
        maxPredicted: 172,
        trend: 'UP',
        modelUsed: ForecastModel.ENSEMBLE,
        accuracy: 100,
        confidence: 0.76,
      },
      scenarios: { bestCase: 4738.73, expectedCase: 5112.9, worstCase: 5487.07 },
      modelUsed: ForecastModel.ENSEMBLE,
      accuracy: 100,
      metadata: {
        monthsAnalyzed: 6,
        expenseCount: 270,
        slopePerMonth: 200,
        relativeTrend: 0.0444,
        monthlyAverage: 4500,
        monthlyStdDev: 374.17,
        residualStdDev: 0,
        movingAverage: 4800,
        horizonTotal: 5112.9,
        horizonMonths: 1,
        mape: 0,
        insufficientData: false,
      },
      createdAt: new Date('2026-08-26T08:00:00.000Z'),
      updatedAt: new Date('2026-08-26T08:00:00.000Z'),
      ...overrides,
    }) as unknown as Forecast;

  beforeAll(() => {
    jest.useFakeTimers({ now: new Date('2026-08-26T12:00:00.000Z') });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ForecastService,
        {
          provide: getRepositoryToken(Forecast),
          useValue: mockForecastRepository,
        },
        {
          provide: FinancialDataService,
          useValue: mockFinancialData,
        },
      ],
    }).compile();

    service = module.get<ForecastService>(ForecastService);

    // Comportamento padrão: horizonte real, histórico saudável e nenhum
    // resultado em cache.
    mockFinancialData.getPeriodDays.mockImplementation((period: string) => {
      const mapa: Record<string, number> = {
        '30_DAYS': 30,
        '90_DAYS': 90,
        '180_DAYS': 180,
        '365_DAYS': 365,
      };
      return mapa[period] ?? 90;
    });
    mockFinancialData.getPeriodRange.mockImplementation(
      (period: string, reference = new Date()) => {
        const dias: Record<string, number> = {
          '30_DAYS': 30,
          '90_DAYS': 90,
          '180_DAYS': 180,
          '365_DAYS': 365,
        };
        const end = new Date(reference);
        const start = new Date(reference);
        start.setDate(start.getDate() - (dias[period] ?? 90));
        return { start, end };
      },
    );
    mockFinancialData.hasSufficientHistory.mockResolvedValue(true);
    mockFinancialData.getMonthlyExpenseSeries.mockResolvedValue(
      SERIE_CRESCENTE,
    );
    mockFinancialData.getExpensesByCategory.mockResolvedValue([]);
    mockFinancialData.getCurrentBalance.mockResolvedValue(0);
    mockFinancialData.getIncomes.mockResolvedValue([]);
    mockFinancialData.getSummary.mockResolvedValue({
      totalExpenses: 0,
      totalIncomes: 0,
      balance: 0,
      expenseCount: 0,
      incomeCount: 0,
      averageDailyExpense: 0,
      days: 90,
    });

    mockForecastRepository.findOne.mockResolvedValue(null);
    mockForecastRepository.create.mockImplementation((data: any) => ({
      ...data,
    }));
    mockForecastRepository.save.mockImplementation(async (data: any) => ({
      ...data,
      id: '22222222-2222-2222-2222-222222222222',
      createdAt: new Date('2026-08-26T12:00:00.000Z'),
    }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('deve estar definido', () => {
    expect(service).toBeDefined();
  });

  // ==================== getForecast ====================

  describe('getForecast', () => {
    it('deve calcular a previsão a partir da série mensal real da família', async () => {
      const result = await service.getForecast(
        USER_ID,
        FAMILY_ID,
        ForecastPeriod.NEXT_30_DAYS,
      );

      expect(mockFinancialData.getMonthlyExpenseSeries).toHaveBeenCalledWith(
        FAMILY_ID,
        12,
      );

      const criado = capturarCriacao();
      expect(criado.familyId).toBe(FAMILY_ID);
      expect(criado.forecastType).toBe(ForecastType.TOTAL);
      // 30 dias de horizonte => 30 predições diárias
      expect(criado.predictions).toHaveLength(30);
      expect(result.predictions).toHaveLength(30);
      expect(result.generatedAt).toEqual(new Date('2026-08-26T12:00:00.000Z'));
    });

    it('deve descartar o mês corrente incompleto do ajuste', async () => {
      await service.getForecast(USER_ID, FAMILY_ID, '30_DAYS');

      const criado = capturarCriacao();
      // A série tem 7 pontos, mas 2026-08 ainda está aberto.
      expect(criado.metadata.monthsAnalyzed).toBe(6);
      expect(criado.metadata.expenseCount).toBe(270);
    });

    it('deve estimar a tendência por regressão linear sobre a série real', async () => {
      await service.getForecast(USER_ID, FAMILY_ID, '30_DAYS');

      const criado = capturarCriacao();
      // Série cresce exatamente R$ 200 por mês sobre uma média de R$ 4.500.
      expect(criado.metadata.slopePerMonth).toBeCloseTo(200, 6);
      expect(criado.metadata.monthlyAverage).toBeCloseTo(4500, 6);
      expect(criado.metadata.relativeTrend).toBeCloseTo(200 / 4500, 3);
      expect(criado.summary.trend).toBe('UP');
    });

    it('deve usar o ENSEMBLE (tendência + média móvel) com 6 meses ou mais', async () => {
      await service.getForecast(USER_ID, FAMILY_ID, '30_DAYS');

      const criado = capturarCriacao();
      expect(criado.modelUsed).toBe(ForecastModel.ENSEMBLE);
      expect(criado.summary.modelUsed).toBe(ForecastModel.ENSEMBLE);
      // Média móvel dos 3 últimos meses fechados: (4600 + 4800 + 5000) / 3
      expect(criado.metadata.movingAverage).toBeCloseTo(4800, 6);

      // Primeiro dia projetado cai em agosto (x = 6):
      // linear = 4000 + 200 * 6 = 5200; ensemble = 0,6 * 5200 + 0,4 * 4800 = 5040
      // valor diário = 5040 / 31 dias de agosto
      expect(criado.predictions[0].date).toBe('2026-08-27');
      expect(criado.predictions[0].predictedValue).toBeCloseTo(5040 / 31, 1);
    });

    it('deve usar apenas a tendência LINEAR quando houver menos de 6 meses fechados', async () => {
      mockFinancialData.getMonthlyExpenseSeries.mockResolvedValue(SERIE_CURTA);

      await service.getForecast(USER_ID, FAMILY_ID, '30_DAYS');

      const criado = capturarCriacao();
      expect(criado.modelUsed).toBe(ForecastModel.LINEAR);
      expect(criado.metadata.monthsAnalyzed).toBe(4);
    });

    it('não deve declarar modelos inexistentes no projeto (PROPHET/ARIMA)', async () => {
      await service.getForecast(USER_ID, FAMILY_ID, '30_DAYS');

      const criado = capturarCriacao();
      const serializado = JSON.stringify(criado);
      expect(serializado).not.toContain('PROPHET');
      expect(serializado).not.toContain('ARIMA');
    });

    it('deve derivar os limites do intervalo do desvio dos resíduos', async () => {
      // Série com ruído => resíduos diferentes de zero => banda de confiança.
      mockFinancialData.getMonthlyExpenseSeries.mockResolvedValue([
        { month: '2026-02', total: 4000, count: 40 },
        { month: '2026-03', total: 4600, count: 46 },
        { month: '2026-04', total: 4100, count: 41 },
        { month: '2026-05', total: 5000, count: 50 },
        { month: '2026-06', total: 4400, count: 44 },
        { month: '2026-07', total: 5200, count: 52 },
        { month: '2026-08', total: 1500, count: 15 },
      ]);

      await service.getForecast(USER_ID, FAMILY_ID, '30_DAYS');

      const criado = capturarCriacao();
      expect(criado.metadata.residualStdDev).toBeGreaterThan(0);

      for (const p of criado.predictions) {
        expect(p.lowerBound).toBeLessThan(p.predictedValue);
        expect(p.upperBound).toBeGreaterThan(p.predictedValue);
        expect(p.lowerBound).toBeGreaterThanOrEqual(0);
      }
    });

    it('deve reduzir a confiança ao longo do horizonte', async () => {
      await service.getForecast(USER_ID, FAMILY_ID, '30_DAYS');

      const criado = capturarCriacao();
      const primeira = criado.predictions[0].confidence;
      const ultima = criado.predictions[29].confidence;

      expect(primeira).toBeLessThanOrEqual(1);
      expect(ultima).toBeLessThan(primeira);
      expect(ultima).toBeGreaterThan(0);
    });

    it('deve usar 90 dias como horizonte padrão quando o período for desconhecido', async () => {
      await service.getForecast(USER_ID, FAMILY_ID, 'PERIODO_INEXISTENTE');

      expect(capturarCriacao().predictions).toHaveLength(90);
    });

    it('deve reaproveitar a previsão já gerada no mesmo dia', async () => {
      const persistida = buildForecastPersistido();
      mockForecastRepository.findOne.mockResolvedValue(persistida);

      const result = await service.getForecast(
        USER_ID,
        FAMILY_ID,
        ForecastPeriod.NEXT_30_DAYS,
      );

      expect(result.id).toBe(persistida.id);
      expect(mockFinancialData.getMonthlyExpenseSeries).not.toHaveBeenCalled();
      expect(mockForecastRepository.create).not.toHaveBeenCalled();
      expect(mockForecastRepository.save).not.toHaveBeenCalled();
    });

    it('deve tratar retorno em array do save (caso de borda do TypeORM)', async () => {
      mockForecastRepository.save.mockResolvedValue([
        buildForecastPersistido({ id: 'forecast-array' }),
      ]);

      const result = await service.getForecast(
        USER_ID,
        FAMILY_ID,
        ForecastPeriod.NEXT_180_DAYS,
      );

      expect(result.id).toBe('forecast-array');
    });

    // ---------- regra 27: sem dados, sem invenção ----------

    it('deve devolver previsão zerada quando não houver histórico suficiente', async () => {
      mockFinancialData.hasSufficientHistory.mockResolvedValue(false);
      mockFinancialData.getMonthlyExpenseSeries.mockResolvedValue(
        SERIE_INSUFICIENTE,
      );

      const result = await service.getForecast(USER_ID, FAMILY_ID, '30_DAYS');

      expect(result.predictions).toHaveLength(0);
      expect(result.summary.averagePredicted).toBe(0);
      expect(result.summary.minPredicted).toBe(0);
      expect(result.summary.maxPredicted).toBe(0);
      expect(result.summary.accuracy).toBe(0);
      expect(result.summary.confidence).toBe(0);
      expect(result.summary.trend).toBe('STABLE');
      expect(result.scenarios).toEqual({
        bestCase: 0,
        expectedCase: 0,
        worstCase: 0,
      });
      // Nada é persistido: não há previsão, apenas a constatação da falta de dados.
      expect(mockForecastRepository.save).not.toHaveBeenCalled();
    });

    it('deve devolver previsão zerada quando só houver meses abertos na série', async () => {
      // hasSufficientHistory conta o mês corrente; após descartá-lo restam 2 meses.
      mockFinancialData.hasSufficientHistory.mockResolvedValue(true);
      mockFinancialData.getMonthlyExpenseSeries.mockResolvedValue([
        { month: '2026-06', total: 4000, count: 40 },
        { month: '2026-07', total: 4200, count: 42 },
        { month: '2026-08', total: 900, count: 9 },
      ]);

      const result = await service.getForecast(USER_ID, FAMILY_ID, '30_DAYS');

      expect(result.predictions).toHaveLength(0);
      expect(result.summary.accuracy).toBe(0);
      expect(mockForecastRepository.save).not.toHaveBeenCalled();
    });
  });

  // ==================== getForecastByCategory ====================

  describe('getForecastByCategory', () => {
    const ATUAIS: CategoryAggregate[] = [
      {
        category: 'Alimentação',
        total: 1200,
        count: 30,
        average: 40,
        share: 0.39,
      },
      { category: 'Transporte', total: 600, count: 12, average: 50, share: 0.19 },
      {
        category: 'Supermercado',
        total: 1000,
        count: 8,
        average: 125,
        share: 0.32,
      },
      { category: 'Pets', total: 300, count: 3, average: 100, share: 0.1 },
    ];

    const ANTERIORES: CategoryAggregate[] = [
      {
        category: 'Alimentação',
        total: 1000,
        count: 25,
        average: 40,
        share: 0.36,
      },
      { category: 'Transporte', total: 800, count: 16, average: 50, share: 0.29 },
      {
        category: 'Supermercado',
        total: 950,
        count: 8,
        average: 118.75,
        share: 0.35,
      },
    ];

    beforeEach(() => {
      mockFinancialData.getExpensesByCategory
        .mockResolvedValueOnce(ATUAIS)
        .mockResolvedValueOnce(ANTERIORES);
    });

    it('deve comparar o período atual com o anterior para obter variação e tendência', async () => {
      const result = await service.getForecastByCategory(USER_ID, FAMILY_ID, {
        period: '90_DAYS',
      });

      const alimentacao = result.forecasts.find(
        (f) => f.categoryId === 'Alimentação',
      );
      // 1200 vs 1000 => +20%; projeção repete a variação absoluta (+200)
      expect(alimentacao?.percentageChange).toBeCloseTo(20, 5);
      expect(alimentacao?.predictedSpending).toBeCloseTo(1400, 5);
      expect(alimentacao?.trend).toBe('UP');

      const transporte = result.forecasts.find(
        (f) => f.categoryId === 'Transporte',
      );
      // 600 vs 800 => -25%
      expect(transporte?.percentageChange).toBeCloseTo(-25, 5);
      expect(transporte?.predictedSpending).toBeCloseTo(400, 5);
      expect(transporte?.trend).toBe('DOWN');

      const supermercado = result.forecasts.find(
        (f) => f.categoryId === 'Supermercado',
      );
      // 1000 vs 950 => +5,26%, acima do limiar de 5%
      expect(supermercado?.trend).toBe('UP');
    });

    it('deve marcar como sem base de comparação a categoria inédita no período anterior', async () => {
      const result = await service.getForecastByCategory(USER_ID, FAMILY_ID, {
        period: '90_DAYS',
      });

      const pets = result.forecasts.find((f) => f.categoryId === 'Pets');
      expect(pets?.percentageChange).toBe(0);
      expect(pets?.trend).toBe('STABLE');
      expect(pets?.predictedSpending).toBe(300);
      expect(pets?.recommendation).toContain('base de comparação');
    });

    it('deve consolidar os totais do período completo', async () => {
      const result = await service.getForecastByCategory(USER_ID, FAMILY_ID, {
        period: '90_DAYS',
      });

      // 1200 + 600 + 1000 + 300
      expect(result.totalCurrentSpending).toBeCloseTo(3100, 5);
      // 1400 + 400 + 1050 + 300
      expect(result.totalPredictedSpending).toBeCloseTo(3150, 5);
      expect(result.totalPercentageChange).toBeCloseTo(1.61, 1);
    });

    it('deve consultar um período anterior de mesma duração e sem sobreposição', async () => {
      await service.getForecastByCategory(USER_ID, FAMILY_ID, {
        period: '90_DAYS',
      });

      const [, chamadaAnterior] =
        mockFinancialData.getExpensesByCategory.mock.calls;
      const atual = mockFinancialData.getExpensesByCategory.mock.calls[0][1];
      const anterior = chamadaAnterior[1];

      expect(anterior.end.getTime()).toBeLessThan(atual.start.getTime());
      expect(anterior.end.getTime() - anterior.start.getTime()).toBe(
        atual.end.getTime() - atual.start.getTime(),
      );
    });

    it('deve respeitar o filtro de variação mínima', async () => {
      const result = await service.getForecastByCategory(USER_ID, FAMILY_ID, {
        period: '90_DAYS',
        minVariation: 10,
      });

      expect(result.forecasts).toHaveLength(1);
      expect(result.forecasts[0].categoryId).toBe('Alimentação');
      // Os totais continuam refletindo o período inteiro
      expect(result.totalCurrentSpending).toBeCloseTo(3100, 5);
    });

    it('deve respeitar o limite de resultados', async () => {
      const result = await service.getForecastByCategory(USER_ID, FAMILY_ID, {
        period: '90_DAYS',
        limit: 2,
      });

      expect(result.forecasts).toHaveLength(2);
    });

    it('deve filtrar por categoria específica', async () => {
      const result = await service.getForecastByCategory(USER_ID, FAMILY_ID, {
        period: '90_DAYS',
        categoryId: 'Transporte',
      });

      expect(result.forecasts).toHaveLength(1);
      expect(result.forecasts[0].categoryName).toBe('Transporte');
    });
  });

  describe('getForecastByCategory sem lançamentos', () => {
    it('deve devolver listas e totais zerados quando não houver despesas', async () => {
      mockFinancialData.getExpensesByCategory.mockResolvedValue([]);

      const result = await service.getForecastByCategory(USER_ID, FAMILY_ID, {
        period: '90_DAYS',
      });

      expect(result.forecasts).toHaveLength(0);
      expect(result.totalCurrentSpending).toBe(0);
      expect(result.totalPredictedSpending).toBe(0);
      expect(result.totalPercentageChange).toBe(0);
    });
  });

  // ==================== getScenarios ====================

  describe('getScenarios', () => {
    it('deve derivar os cenários da volatilidade real da série mensal', async () => {
      const result = await service.getScenarios(USER_ID, FAMILY_ID, '30_DAYS');

      expect(result.hasSufficientData).toBe(true);

      const { bestCase, expectedCase, worstCase } = result.scenarios;
      expect(bestCase.amount).toBeLessThan(expectedCase.amount);
      expect(worstCase.amount).toBeGreaterThan(expectedCase.amount);

      // Desvio padrão amostral de [4000..5000] = 374,17; horizonte de 1 mês
      expect(result.volatility.monthlyStdDev).toBeCloseTo(374.17, 1);
      expect(result.volatility.horizonMonths).toBeCloseTo(1, 5);
      expect(expectedCase.amount - bestCase.amount).toBeCloseTo(374.17, 1);
      expect(worstCase.amount - expectedCase.amount).toBeCloseTo(374.17, 1);
    });

    it('deve usar a repartição de ±1σ de uma normal nas probabilidades', async () => {
      const result = await service.getScenarios(USER_ID, FAMILY_ID, '90_DAYS');

      const total =
        result.scenarios.bestCase.probability +
        result.scenarios.expectedCase.probability +
        result.scenarios.worstCase.probability;

      expect(total).toBeCloseTo(1, 5);
      expect(result.scenarios.expectedCase.probability).toBeCloseTo(0.68, 5);
    });

    it('deve escalar a volatilidade com a raiz do horizonte', async () => {
      const result = await service.getScenarios(USER_ID, FAMILY_ID, '90_DAYS');

      // 90 dias ≈ 3 meses => desvio × √3
      expect(result.volatility.deviation).toBeCloseTo(374.17 * Math.sqrt(3), 0);
    });

    it('deve informar honestamente a falta de dados em vez de simular cenários', async () => {
      mockFinancialData.hasSufficientHistory.mockResolvedValue(false);
      mockFinancialData.getMonthlyExpenseSeries.mockResolvedValue(
        SERIE_INSUFICIENTE,
      );

      const result = await service.getScenarios(USER_ID, FAMILY_ID, '30_DAYS');

      expect(result.hasSufficientData).toBe(false);
      expect(result.scenarios.bestCase.amount).toBe(0);
      expect(result.scenarios.expectedCase.amount).toBe(0);
      expect(result.scenarios.worstCase.amount).toBe(0);
      expect(result.volatility.monthlyStdDev).toBe(0);
      expect(result.note).toContain('meses completos');
    });
  });

  // ==================== getBalanceProjection ====================

  describe('getBalanceProjection', () => {
    const configurarSaldo = (
      opcoes: {
        saldo?: number;
        gastoMedioDiario?: number;
        expenseCount?: number;
        receitas?: any[];
      } = {},
    ) => {
      mockFinancialData.getCurrentBalance.mockResolvedValue(
        opcoes.saldo ?? 5000,
      );
      mockFinancialData.getSummary.mockResolvedValue({
        totalExpenses: 13500,
        totalIncomes: 25500,
        balance: 12000,
        expenseCount: opcoes.expenseCount ?? 120,
        incomeCount: 6,
        averageDailyExpense: opcoes.gastoMedioDiario ?? 150,
        days: 90,
      });
      mockFinancialData.getIncomes.mockResolvedValue(opcoes.receitas ?? []);
    };

    it('deve projetar dia a dia a partir do saldo real e da média diária de gastos', async () => {
      configurarSaldo({
        saldo: 5000,
        gastoMedioDiario: 150,
        receitas: [
          {
            description: 'Salário Bruno',
            amount: 8500,
            date: new Date('2026-08-05T00:00:00.000Z'),
            isRecurring: true,
            frequency: 'monthly',
          },
          {
            description: 'Freelance',
            amount: 900,
            date: new Date('2026-08-10T00:00:00.000Z'),
            isRecurring: false,
          },
        ],
      });

      const result = await service.getBalanceProjection(USER_ID, FAMILY_ID, {
        period: '30_DAYS',
        includeRisk: true,
      });

      expect(result.projections).toHaveLength(30);
      expect(result.currentBalance).toBe(5000);

      // Primeiro dia (27/08): 5000 − 150
      expect(result.projections[0].projectedBalance).toBeCloseTo(4850, 2);

      // 05/09 é o 10º dia projetado e recebe o salário recorrente:
      // 5000 − 10 × 150 + 8500
      const diaDoSalario = result.projections[9];
      expect(new Date(diaDoSalario.date).getDate()).toBe(5);
      expect(diaDoSalario.projectedBalance).toBeCloseTo(12000, 2);

      // Receita não recorrente não entra na projeção
      expect(result.projections[13].projectedBalance).toBeLessThan(
        diaDoSalario.projectedBalance,
      );
    });

    it('deve marcar como arriscado o dia em que o saldo projetado fica negativo', async () => {
      configurarSaldo({ saldo: 5000, gastoMedioDiario: 600 });

      const result = await service.getBalanceProjection(USER_ID, FAMILY_ID, {
        period: '30_DAYS',
        includeRisk: true,
      });

      expect(result.hasNegativeBalanceRisk).toBe(true);
      // 5000 / 600 => negativo a partir do 9º dia
      expect(result.daysUntilNegativeBalance).toBe(9);
      expect(result.projections[7].isRiskyDay).toBe(false);
      expect(result.projections[8].isRiskyDay).toBe(true);
      expect(result.projections[8].riskReason).toContain('negativo');
      expect(result.minimumProjectedBalance).toBeCloseTo(5000 - 30 * 600, 2);
    });

    it('não deve marcar dias de risco quando includeRisk for falso', async () => {
      configurarSaldo({ saldo: 5000, gastoMedioDiario: 600 });

      const result = await service.getBalanceProjection(USER_ID, FAMILY_ID, {
        period: '30_DAYS',
        includeRisk: false,
      });

      expect(result.projections.every((p) => p.isRiskyDay === false)).toBe(true);
      // O risco agregado continua sendo reportado com honestidade
      expect(result.hasNegativeBalanceRisk).toBe(true);
    });

    it('não deve indicar risco quando o saldo projetado permanece positivo', async () => {
      configurarSaldo({ saldo: 20000, gastoMedioDiario: 100 });

      const result = await service.getBalanceProjection(USER_ID, FAMILY_ID, {
        period: '30_DAYS',
        includeRisk: true,
      });

      expect(result.hasNegativeBalanceRisk).toBe(false);
      expect(result.daysUntilNegativeBalance).toBeUndefined();
    });

    it('deve gerar 365 projeções para o período de um ano', async () => {
      configurarSaldo();

      const result = await service.getBalanceProjection(USER_ID, FAMILY_ID, {
        period: '365_DAYS',
        includeRisk: true,
      });

      expect(result.projections).toHaveLength(365);
    });

    it('deve reduzir a confiança ao longo do horizonte', async () => {
      configurarSaldo();

      const result = await service.getBalanceProjection(USER_ID, FAMILY_ID, {
        period: '30_DAYS',
        includeRisk: true,
      });

      expect(result.projections[0].confidence).toBeLessThanOrEqual(0.8);
      expect(result.projections[29].confidence).toBeLessThan(
        result.projections[0].confidence,
      );
      expect(result.projections[29].confidence).toBeGreaterThan(0);
    });

    it('deve reduzir a confiança quando o histórico for curto', async () => {
      configurarSaldo();
      mockFinancialData.hasSufficientHistory.mockResolvedValue(false);

      const result = await service.getBalanceProjection(USER_ID, FAMILY_ID, {
        period: '30_DAYS',
        includeRisk: true,
      });

      expect(result.projections[0].confidence).toBeLessThanOrEqual(0.5);
    });

    it('não deve projetar nada quando não houver despesas registradas', async () => {
      configurarSaldo({ saldo: 3200, expenseCount: 0, gastoMedioDiario: 0 });

      const result = await service.getBalanceProjection(USER_ID, FAMILY_ID, {
        period: '30_DAYS',
        includeRisk: true,
      });

      expect(result.projections).toHaveLength(0);
      expect(result.currentBalance).toBe(3200);
      expect(result.minimumProjectedBalance).toBe(3200);
      expect(result.maximumProjectedBalance).toBe(3200);
      expect(result.hasNegativeBalanceRisk).toBe(false);
      expect(result.daysUntilNegativeBalance).toBeUndefined();
    });
  });

  // ==================== getForecastDetails ====================

  describe('getForecastDetails', () => {
    it('deve refletir o modelo, a acurácia e a tendência realmente calculados', async () => {
      const result = await service.getForecastDetails(
        USER_ID,
        FAMILY_ID,
        '30_DAYS',
      );

      expect(result.modelUsed).toBe(ForecastModel.ENSEMBLE);
      // Série perfeitamente linear => erro de ajuste nulo
      expect(result.modelAccuracy).toBeCloseTo(100, 5);
      expect(result.trend).toBeCloseTo(200 / 4500, 3);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.averagePredicted).toBeGreaterThan(0);
      expect(new Date(result.nextUpdateAt).getTime()).toBe(
        new Date(result.generatedAt).getTime() + 7 * 24 * 60 * 60 * 1000,
      );
    });

    it('deve descrever nas premissas o que foi de fato calculado', async () => {
      const result = await service.getForecastDetails(
        USER_ID,
        FAMILY_ID,
        '30_DAYS',
      );

      const premissas = result.assumptions.join(' ');
      expect(premissas).toContain('6 meses fechados');
      expect(premissas).toContain('média móvel');
      expect(premissas).toContain('mês corrente');
      expect(premissas).not.toContain('Prophet');

      const insights = result.keyInsights.join(' ');
      expect(insights).toContain('regressão linear');
      expect(insights).toContain('alta');
    });

    it('deve explicar a falta de dados em vez de listar insights inventados', async () => {
      mockFinancialData.hasSufficientHistory.mockResolvedValue(false);
      mockFinancialData.getMonthlyExpenseSeries.mockResolvedValue(
        SERIE_INSUFICIENTE,
      );

      const result = await service.getForecastDetails(
        USER_ID,
        FAMILY_ID,
        '30_DAYS',
      );

      expect(result.modelAccuracy).toBe(0);
      expect(result.confidence).toBe(0);
      expect(result.averagePredicted).toBe(0);
      expect(result.trend).toBe(0);
      expect(result.keyInsights.join(' ')).toContain(
        'histórico suficiente',
      );
      expect(result.assumptions.join(' ')).toContain('nada foi projetado');
    });
  });

  // ==================== getAccuracyComparison ====================

  describe('getAccuracyComparison', () => {
    it('deve comparar previsões retroativas com o gasto real de cada mês fechado', async () => {
      const result = await service.getAccuracyComparison(USER_ID, FAMILY_ID, 12);

      // 6 meses fechados − 3 meses mínimos de treino = 3 comparações
      expect(result.comparisons).toHaveLength(3);
      // Mais recentes primeiro
      expect(result.comparisons[0].period).toBe('2026-07');
      expect(result.comparisons[0].actualSpending).toBe(5000);
      // Série perfeitamente linear => previsão retroativa exata
      expect(result.comparisons[0].forecastedSpending).toBeCloseTo(5000, 2);
      expect(result.comparisons[0].variancePercentage).toBeCloseTo(0, 5);
      expect(result.comparisons[0].isAccurate).toBe(true);
      expect(result.averageAccuracy).toBeCloseTo(100, 5);
    });

    it('deve medir desvio real quando a série não for linear', async () => {
      mockFinancialData.getMonthlyExpenseSeries.mockResolvedValue([
        { month: '2026-02', total: 3000, count: 30 },
        { month: '2026-03', total: 3100, count: 31 },
        { month: '2026-04', total: 3200, count: 32 },
        { month: '2026-05', total: 6000, count: 60 },
        { month: '2026-06', total: 3300, count: 33 },
        { month: '2026-07', total: 3400, count: 34 },
        { month: '2026-08', total: 900, count: 9 },
      ]);

      const result = await service.getAccuracyComparison(USER_ID, FAMILY_ID, 12);

      // O mês de 6000 destoa da reta ajustada com os 3 meses anteriores
      const maio = result.comparisons.find((c) => c.period === '2026-05');
      expect(maio?.isAccurate).toBe(false);
      expect(Math.abs(maio!.variancePercentage)).toBeGreaterThan(10);
      expect(maio?.learningNote).toContain('subestimou');
      expect(result.averageAccuracy).toBeLessThan(100);
      expect(['IMPROVING', 'STABLE', 'DEGRADING']).toContain(
        result.overallTrend,
      );
    });

    it('deve respeitar o limite de comparações solicitado', async () => {
      const result = await service.getAccuracyComparison(USER_ID, FAMILY_ID, 2);

      expect(result.comparisons).toHaveLength(2);
      // A média continua sendo calculada sobre todas as comparações
      expect(result.averageAccuracy).toBeCloseTo(100, 5);
    });

    it('deve retornar lista vazia quando o limite for zero', async () => {
      const result = await service.getAccuracyComparison(USER_ID, FAMILY_ID, 0);

      expect(result.comparisons).toHaveLength(0);
    });

    it('deve informar falta de dados quando não houver meses fechados suficientes', async () => {
      mockFinancialData.getMonthlyExpenseSeries.mockResolvedValue(
        SERIE_INSUFICIENTE,
      );

      const result = await service.getAccuracyComparison(USER_ID, FAMILY_ID, 12);

      expect(result.comparisons).toHaveLength(0);
      expect(result.averageAccuracy).toBe(0);
      expect(result.overallTrend).toBe('INSUFFICIENT_DATA');
    });
  });

  // ==================== regenerateForecasts ====================

  describe('regenerateForecasts', () => {
    it('deve limpar o cache de previsões da família', async () => {
      mockForecastRepository.delete.mockResolvedValue({ affected: 3 });

      const result = await service.regenerateForecasts(USER_ID, FAMILY_ID);

      expect(mockForecastRepository.delete).toHaveBeenCalledWith({
        familyId: FAMILY_ID,
      });
      expect(result.success).toBe(true);
      expect(result.message).toBe('Previsões regeneradas com sucesso');
      expect(result.regeneratedAt).toBeInstanceOf(Date);
    });

    it('deve propagar erro quando a exclusão falhar', async () => {
      mockForecastRepository.delete.mockRejectedValue(
        new Error('falha no banco'),
      );

      await expect(
        service.regenerateForecasts(USER_ID, FAMILY_ID),
      ).rejects.toThrow('falha no banco');
    });
  });
});
