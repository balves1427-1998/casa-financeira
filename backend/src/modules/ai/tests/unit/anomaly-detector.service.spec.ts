import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AnomalyDetectorService } from '../../services/anomaly-detector.service';
import {
  TransactionAnomaly,
  AnomalyType,
  AnomalySeverity,
  TransactionType,
  ConfirmationStatus,
} from '../../entities/transaction-anomaly.entity';
import { ConfirmAnomalyDto } from '../../dtos/analysis.dto';
import { FinancialDataService } from '../../../financial-data/financial-data.service';

/**
 * Testes unitários do AnomalyDetectorService.
 *
 * `listAnomalies`, `getAnomaly` e `confirmAnomaly` continuam trabalhando sobre
 * o repositório de TransactionAnomaly (mockado, incluindo o QueryBuilder).
 *
 * `detectAnomalies` passou a analisar os lançamentos REAIS da família: aqui o
 * `FinancialDataService` é mockado com dados realistas (e com os cenários "sem
 * dados", em que nenhuma anomalia pode ser inventada — regra 27 do projeto).
 */
describe('AnomalyDetectorService', () => {
  let service: AnomalyDetectorService;

  const USER_ID = 'user-giovanna';
  const FAMILY_ID = 'family-casa';

  /** Período analisado em todos os testes de detecção. */
  const PERIODO = {
    start: new Date(2026, 2, 1, 0, 0, 0, 0),
    end: new Date(2026, 7, 26, 23, 59, 59, 999),
  };

  /** Cria uma despesa como a que vem do banco. */
  const despesa = (
    id: string,
    category: string,
    amount: number,
    date: Date,
    description = `Compra ${id}`,
  ): any => ({
    id,
    userId: USER_ID,
    description,
    amount,
    date,
    category,
    responsible: 'Bruno',
    paymentMethod: 'credit',
  });

  // Mock encadeável do QueryBuilder do TypeORM
  const mockQueryBuilder: any = {
    where: jest.fn(),
    andWhere: jest.fn(),
    orderBy: jest.fn(),
    addOrderBy: jest.fn(),
    skip: jest.fn(),
    take: jest.fn(),
    getManyAndCount: jest.fn(),
  };

  const mockAnomalyRepository = {
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockFinancialData = {
    getPeriodRange: jest.fn(),
    getExpenses: jest.fn(),
    getCategoryStatistics: jest.fn(),
    getDailyExpenseSeries: jest.fn(),
    getRecurringExpenses: jest.fn(),
  };

  /**
   * Constrói uma entidade TransactionAnomaly válida para os testes de leitura.
   */
  const buildAnomaly = (
    overrides: Record<string, any> = {},
  ): TransactionAnomaly =>
    ({
      id: 'anomaly-1',
      familyId: FAMILY_ID,
      transactionId: 'tx-1',
      transactionType: TransactionType.EXPENSE,
      anomalyType: AnomalyType.UNUSUAL_AMOUNT,
      severity: AnomalySeverity.HIGH,
      anomalyScore: '0.92',
      reason: 'Valor muito acima da média da categoria Supermercado',
      suggestedAction: 'Revisar esta transação',
      isConfirmed: false,
      confirmationStatus: null,
      createdAt: new Date('2026-08-20T10:00:00.000Z'),
      updatedAt: new Date('2026-08-20T10:00:00.000Z'),
      ...overrides,
    }) as unknown as TransactionAnomaly;

  beforeEach(async () => {
    // Reencadeia os métodos fluentes a cada teste
    mockQueryBuilder.where.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.andWhere.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.orderBy.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.addOrderBy.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.skip.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.take.mockReturnValue(mockQueryBuilder);
    mockAnomalyRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

    // create devolve o próprio objeto para facilitar as asserções
    mockAnomalyRepository.create.mockImplementation((data: any) => ({
      ...data,
    }));
    mockAnomalyRepository.save.mockImplementation(async (data: any) => data);

    // Cenário padrão: família SEM lançamentos.
    mockFinancialData.getPeriodRange.mockReturnValue(PERIODO);
    mockFinancialData.getExpenses.mockResolvedValue([]);
    mockFinancialData.getCategoryStatistics.mockResolvedValue([]);
    mockFinancialData.getDailyExpenseSeries.mockResolvedValue([]);
    mockFinancialData.getRecurringExpenses.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnomalyDetectorService,
        {
          provide: getRepositoryToken(TransactionAnomaly),
          useValue: mockAnomalyRepository,
        },
        {
          provide: FinancialDataService,
          useValue: mockFinancialData,
        },
      ],
    }).compile();

    service = module.get<AnomalyDetectorService>(AnomalyDetectorService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('deve estar definido', () => {
    expect(service).toBeDefined();
  });

  // ==================== listAnomalies ====================

  describe('listAnomalies', () => {
    it('deve listar anomalias e contabilizar por severidade', async () => {
      const anomalias = [
        buildAnomaly({ id: 'a1', severity: AnomalySeverity.HIGH }),
        buildAnomaly({
          id: 'a2',
          severity: AnomalySeverity.MEDIUM,
          anomalyType: AnomalyType.SPIKE,
        }),
        buildAnomaly({
          id: 'a3',
          severity: AnomalySeverity.LOW,
          anomalyType: AnomalyType.PATTERN_BREAK,
          suggestedAction: null,
        }),
      ];
      mockQueryBuilder.getManyAndCount.mockResolvedValue([anomalias, 3]);

      const result = await service.listAnomalies(USER_ID, FAMILY_ID, {
        limit: 10,
        offset: 0,
      });

      expect(mockAnomalyRepository.createQueryBuilder).toHaveBeenCalledWith('a');
      // Anomalias são escopadas somente por família: a entidade
      // TransactionAnomaly não possui colunas `userId` nem `deletedAt`.
      expect(mockQueryBuilder.where).toHaveBeenCalledTimes(1);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'a.familyId = :familyId',
        { familyId: FAMILY_ID },
      );
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);

      expect(result.total).toBe(3);
      expect(result.anomalies).toHaveLength(3);
      expect(result.highSeverityCount).toBe(1);
      expect(result.mediumSeverityCount).toBe(1);
      expect(result.lowSeverityCount).toBe(1);
      // anomalyScore deve ser convertido de decimal (string) para número
      expect(result.anomalies[0].anomalyScore).toBe(0.92);
      expect(typeof result.anomalies[0].anomalyScore).toBe('number');
      // suggestedAction nulo vira undefined no DTO
      expect(result.anomalies[2].suggestedAction).toBeUndefined();
    });

    it('deve aplicar o filtro de severidade quando informado', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([
        [buildAnomaly({ severity: AnomalySeverity.HIGH })],
        1,
      ]);

      const result = await service.listAnomalies(USER_ID, FAMILY_ID, {
        severity: AnomalySeverity.HIGH,
        limit: 20,
        offset: 0,
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'a.severity = :severity',
        { severity: AnomalySeverity.HIGH },
      );
      expect(result.highSeverityCount).toBe(1);
    });

    it('deve aplicar o filtro de confirmação quando informado', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.listAnomalies(USER_ID, FAMILY_ID, {
        limit: 20,
        offset: 0,
        confirmed: false,
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'a.isConfirmed = :isConfirmed',
        { isConfirmed: false },
      );
    });

    it('não deve aplicar filtros opcionais quando não informados', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.listAnomalies(USER_ID, FAMILY_ID, {
        limit: 20,
        offset: 0,
      });

      // Sem filtros opcionais nenhum andWhere é aplicado; em especial não
      // existe filtro de soft delete (`deletedAt`) na entidade de anomalias.
      expect(mockQueryBuilder.andWhere).not.toHaveBeenCalled();
    });

    it('deve ordenar por score e usar addOrderBy para a data de criação', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.listAnomalies(USER_ID, FAMILY_ID, {
        limit: 20,
        offset: 0,
      });

      // Um segundo `orderBy` substituiria a ordenação primária; por isso a
      // ordenação secundária precisa usar `addOrderBy`.
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledTimes(1);
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        'a.anomalyScore',
        'DESC',
      );
      expect(mockQueryBuilder.addOrderBy).toHaveBeenCalledTimes(1);
      expect(mockQueryBuilder.addOrderBy).toHaveBeenCalledWith(
        'a.createdAt',
        'DESC',
      );
    });

    it('deve retornar lista vazia e contadores zerados quando não houver anomalias', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      const result = await service.listAnomalies(USER_ID, FAMILY_ID, {
        limit: 20,
        offset: 40,
      });

      expect(result.anomalies).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.highSeverityCount).toBe(0);
      expect(result.mediumSeverityCount).toBe(0);
      expect(result.lowSeverityCount).toBe(0);
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(40);
    });
  });

  // ==================== getAnomaly ====================

  describe('getAnomaly', () => {
    it('deve retornar os detalhes da anomalia encontrada', async () => {
      const anomalia = buildAnomaly({ id: 'anomaly-99' });
      mockAnomalyRepository.findOne.mockResolvedValue(anomalia);

      const result = await service.getAnomaly(USER_ID, FAMILY_ID, 'anomaly-99');

      expect(mockAnomalyRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'anomaly-99', familyId: FAMILY_ID },
      });
      expect(result).not.toBeNull();
      expect(result!.id).toBe('anomaly-99');
      expect(result!.anomalyType).toBe(AnomalyType.UNUSUAL_AMOUNT);
      expect(result!.severity).toBe(AnomalySeverity.HIGH);
      expect(result!.anomalyScore).toBe(0.92);
    });

    it('deve retornar null quando a anomalia não existir', async () => {
      mockAnomalyRepository.findOne.mockResolvedValue(null);

      const result = await service.getAnomaly(
        USER_ID,
        FAMILY_ID,
        'inexistente',
      );

      expect(result).toBeNull();
    });
  });

  // ==================== confirmAnomaly ====================

  describe('confirmAnomaly', () => {
    it('deve confirmar a anomalia e persistir o status informado', async () => {
      const anomalia = buildAnomaly();
      mockAnomalyRepository.findOne.mockResolvedValue(anomalia);

      const dto: ConfirmAnomalyDto = {
        status: ConfirmationStatus.FRAUDULENT,
        notes: 'Cobrança desconhecida no cartão',
      };

      const result = await service.confirmAnomaly(
        USER_ID,
        FAMILY_ID,
        'anomaly-1',
        dto,
      );

      expect(mockAnomalyRepository.save).toHaveBeenCalledTimes(1);
      const salvo = mockAnomalyRepository.save.mock.calls[0][0];
      expect(salvo.isConfirmed).toBe(true);
      expect(salvo.confirmationStatus).toBe(ConfirmationStatus.FRAUDULENT);

      expect(result).not.toBeNull();
      expect(result!.id).toBe('anomaly-1');
      expect(result!.anomalyScore).toBe(0.92);
    });

    it('deve aceitar o status NORMAL (falso positivo)', async () => {
      const anomalia = buildAnomaly({ id: 'anomaly-2' });
      mockAnomalyRepository.findOne.mockResolvedValue(anomalia);

      const dto: ConfirmAnomalyDto = { status: ConfirmationStatus.NORMAL };

      const result = await service.confirmAnomaly(
        USER_ID,
        FAMILY_ID,
        'anomaly-2',
        dto,
      );

      expect(result!.id).toBe('anomaly-2');
      expect(
        mockAnomalyRepository.save.mock.calls[0][0].confirmationStatus,
      ).toBe(ConfirmationStatus.NORMAL);
    });

    it('deve retornar null e não salvar quando a anomalia não existir', async () => {
      mockAnomalyRepository.findOne.mockResolvedValue(null);

      const result = await service.confirmAnomaly(
        USER_ID,
        FAMILY_ID,
        'inexistente',
        { status: ConfirmationStatus.UNUSUAL_BUT_OK },
      );

      expect(result).toBeNull();
      expect(mockAnomalyRepository.save).not.toHaveBeenCalled();
    });
  });

  // ==================== detectAnomalies ====================

  describe('detectAnomalies — sem dados suficientes', () => {
    it('deve retornar lista vazia quando a família não tem lançamentos no período', async () => {
      const result = await service.detectAnomalies(USER_ID, FAMILY_ID);

      expect(result).toEqual([]);
      expect(mockAnomalyRepository.save).not.toHaveBeenCalled();
      // Sem despesas nem sequer buscamos estatísticas: não há o que analisar.
      expect(mockFinancialData.getCategoryStatistics).not.toHaveBeenCalled();
      expect(mockFinancialData.getPeriodRange).toHaveBeenCalledWith(
        'LAST_6_MONTHS',
      );
    });

    it('deve respeitar o período informado', async () => {
      await service.detectAnomalies(USER_ID, FAMILY_ID, 'THIS_MONTH');

      expect(mockFinancialData.getPeriodRange).toHaveBeenCalledWith(
        'THIS_MONTH',
      );
    });

    it('não deve julgar categorias com menos de 3 lançamentos', async () => {
      mockFinancialData.getExpenses.mockResolvedValue([
        despesa('tx-1', 'Viagem', 4200, new Date(2026, 7, 10, 12, 0)),
      ]);
      mockFinancialData.getCategoryStatistics.mockResolvedValue([
        { category: 'Viagem', mean: 500, stdDev: 200, min: 300, max: 4200, count: 2 },
      ]);

      const result = await service.detectAnomalies(USER_ID, FAMILY_ID);

      expect(result).toEqual([]);
      expect(mockAnomalyRepository.save).not.toHaveBeenCalled();
    });

    it('não deve julgar categorias com desvio padrão zero', async () => {
      mockFinancialData.getExpenses.mockResolvedValue([
        despesa('tx-1', 'Aluguel', 1800, new Date(2026, 7, 5, 12, 0)),
      ]);
      mockFinancialData.getCategoryStatistics.mockResolvedValue([
        { category: 'Aluguel', mean: 1800, stdDev: 0, min: 1800, max: 1800, count: 6 },
      ]);

      const result = await service.detectAnomalies(USER_ID, FAMILY_ID);

      expect(result).toEqual([]);
    });
  });

  describe('detectAnomalies — UNUSUAL_AMOUNT (z-score por categoria)', () => {
    const estatisticasSupermercado = [
      {
        category: 'Supermercado',
        mean: 390,
        stdDev: 120,
        min: 40,
        max: 1250,
        count: 24,
      },
    ];

    it('deve marcar como HIGH um valor acima de 3 desvios padrão citando os números reais', async () => {
      mockFinancialData.getExpenses.mockResolvedValue([
        despesa(
          'tx-atacadao',
          'Supermercado',
          1250,
          new Date(2026, 7, 10, 12, 0),
          'ATACADAO',
        ),
      ]);
      mockFinancialData.getCategoryStatistics.mockResolvedValue(
        estatisticasSupermercado,
      );

      const result = await service.detectAnomalies(USER_ID, FAMILY_ID);

      expect(result).toHaveLength(1);
      expect(result[0].anomalyType).toBe(AnomalyType.UNUSUAL_AMOUNT);
      expect(result[0].severity).toBe(AnomalySeverity.HIGH);
      expect(result[0].transactionId).toBe('tx-atacadao');
      expect(result[0].transactionType).toBe(TransactionType.EXPENSE);
      expect(result[0].familyId).toBe(FAMILY_ID);
      // z = (1250 - 390) / 120 = 7,17 → normalizado em 4σ satura em 1
      expect(result[0].anomalyScore).toBe(1);
      // O texto cita os valores reais em português
      expect(result[0].reason).toContain('R$ 1.250,00');
      expect(result[0].reason).toContain('3,2x a média de Supermercado');
      expect(result[0].reason).toContain('R$ 390,00');
      expect(mockAnomalyRepository.save).toHaveBeenCalledWith(result);
    });

    it('deve marcar como MEDIUM um valor entre 2 e 3 desvios padrão', async () => {
      // 390 + 2,5 * 120 = 690
      mockFinancialData.getExpenses.mockResolvedValue([
        despesa('tx-medio', 'Supermercado', 690, new Date(2026, 7, 11, 12, 0)),
      ]);
      mockFinancialData.getCategoryStatistics.mockResolvedValue(
        estatisticasSupermercado,
      );

      const result = await service.detectAnomalies(USER_ID, FAMILY_ID);

      expect(result).toHaveLength(1);
      expect(result[0].severity).toBe(AnomalySeverity.MEDIUM);
      // 2,5 / 4 = 0,625 → 0,63
      expect(result[0].anomalyScore).toBe(0.63);
    });

    it('deve marcar como LOW um valor entre 1 e 2 desvios padrão', async () => {
      // 390 + 1,5 * 120 = 570
      mockFinancialData.getExpenses.mockResolvedValue([
        despesa('tx-baixo', 'Supermercado', 570, new Date(2026, 7, 12, 12, 0)),
      ]);
      mockFinancialData.getCategoryStatistics.mockResolvedValue(
        estatisticasSupermercado,
      );

      const result = await service.detectAnomalies(USER_ID, FAMILY_ID);

      expect(result).toHaveLength(1);
      expect(result[0].severity).toBe(AnomalySeverity.LOW);
      expect(result[0].anomalyScore).toBe(0.38);
    });

    it('não deve gerar anomalia para valores dentro de 1 desvio padrão', async () => {
      mockFinancialData.getExpenses.mockResolvedValue([
        despesa('tx-normal', 'Supermercado', 440, new Date(2026, 7, 13, 12, 0)),
      ]);
      mockFinancialData.getCategoryStatistics.mockResolvedValue(
        estatisticasSupermercado,
      );

      const result = await service.detectAnomalies(USER_ID, FAMILY_ID);

      expect(result).toEqual([]);
      expect(mockAnomalyRepository.save).not.toHaveBeenCalled();
    });

    it('deve reconhecer valores muito abaixo da média (possível lançamento incompleto)', async () => {
      mockFinancialData.getExpenses.mockResolvedValue([
        despesa('tx-baixissimo', 'Supermercado', 10, new Date(2026, 7, 14, 12, 0)),
      ]);
      mockFinancialData.getCategoryStatistics.mockResolvedValue(
        estatisticasSupermercado,
      );

      const result = await service.detectAnomalies(USER_ID, FAMILY_ID);

      expect(result).toHaveLength(1);
      expect(result[0].reason).toContain('abaixo da média');
      expect(result[0].suggestedAction).toContain('valor completo');
    });
  });

  describe('detectAnomalies — DUPLICATE', () => {
    it('deve detectar mesmo valor e mesma descrição no mesmo dia (sem diferenciar maiúsculas)', async () => {
      const base = new Date(2026, 7, 5, 12, 0, 0);
      mockFinancialData.getExpenses.mockResolvedValue([
        despesa('tx-a', 'Assinaturas', 55.9, base, 'NETFLIX'),
        despesa(
          'tx-b',
          'Assinaturas',
          55.9,
          new Date(base.getTime() + 6 * 3_600_000),
          'netflix',
        ),
      ]);

      const result = await service.detectAnomalies(USER_ID, FAMILY_ID);

      expect(result).toHaveLength(1);
      expect(result[0].anomalyType).toBe(AnomalyType.DUPLICATE);
      expect(result[0].severity).toBe(AnomalySeverity.HIGH);
      expect(result[0].transactionId).toBe('tx-b');
      expect(result[0].anomalyScore).toBe(0.9);
      expect(result[0].reason).toContain('R$ 55,90');
      expect(result[0].reason).toContain('mesmo dia');
    });

    it('não deve marcar duplicidade em dias diferentes', async () => {
      // `expenses.date` é um `date` sem hora: dois lançamentos em dias seguidos
      // são duas compras, não uma cobrança repetida.
      const base = new Date(2026, 7, 5, 12, 0, 0);
      mockFinancialData.getExpenses.mockResolvedValue([
        despesa('tx-a', 'Assinaturas', 55.9, base, 'NETFLIX'),
        despesa(
          'tx-b',
          'Assinaturas',
          55.9,
          new Date(base.getTime() + 36 * 3_600_000),
          'NETFLIX',
        ),
      ]);

      const result = await service.detectAnomalies(USER_ID, FAMILY_ID);

      expect(
        result.filter((a) => a.anomalyType === AnomalyType.DUPLICATE),
      ).toHaveLength(0);
    });

    it('não deve marcar duplicidade em gasto de hábito diário', async () => {
      // 10 almoços de mesmo valor em 10 dias seguidos, dois deles no mesmo dia:
      // é rotina, não cobrança repetida.
      const despesas = Array.from({ length: 10 }, (_, i) =>
        despesa(
          `tx-almoco-${i}`,
          'Alimentacao',
          45,
          new Date(2026, 7, 1 + i, 12, 0, 0),
          'iFood',
        ),
      );
      despesas.push(
        despesa(
          'tx-almoco-dup',
          'Alimentacao',
          45,
          new Date(2026, 7, 3, 20, 0, 0),
          'iFood',
        ),
      );
      mockFinancialData.getExpenses.mockResolvedValue(despesas);

      const result = await service.detectAnomalies(USER_ID, FAMILY_ID);

      expect(
        result.filter((a) => a.anomalyType === AnomalyType.DUPLICATE),
      ).toHaveLength(0);
    });

    it('não deve marcar duplicidade fora da janela de 48h', async () => {
      const base = new Date(2026, 7, 5, 12, 0, 0);
      mockFinancialData.getExpenses.mockResolvedValue([
        despesa('tx-a', 'Assinaturas', 55.9, base, 'NETFLIX'),
        despesa(
          'tx-b',
          'Assinaturas',
          55.9,
          new Date(base.getTime() + 72 * 3_600_000),
          'NETFLIX',
        ),
      ]);

      const result = await service.detectAnomalies(USER_ID, FAMILY_ID);

      expect(result).toEqual([]);
    });

    it('não deve marcar duplicidade quando o valor for diferente', async () => {
      const base = new Date(2026, 7, 5, 12, 0, 0);
      mockFinancialData.getExpenses.mockResolvedValue([
        despesa('tx-a', 'Assinaturas', 55.9, base, 'NETFLIX'),
        despesa(
          'tx-b',
          'Assinaturas',
          39.9,
          new Date(base.getTime() + 3_600_000),
          'NETFLIX',
        ),
      ]);

      const result = await service.detectAnomalies(USER_ID, FAMILY_ID);

      expect(result).toEqual([]);
    });
  });

  describe('detectAnomalies — SPIKE (dia muito acima da média diária)', () => {
    /** 19 dias de R$ 100 e um dia de R$ 900 → média 140, z ≈ 4,25. */
    const serieComPico = [
      ...Array.from({ length: 19 }, (_, i) => ({
        date: `2026-08-${String(i + 1).padStart(2, '0')}`,
        total: 100,
        count: 1,
      })),
      { date: '2026-08-20', total: 900, count: 4 },
    ];

    it('deve detectar o dia de pico e ancorar na maior despesa do dia', async () => {
      mockFinancialData.getExpenses.mockResolvedValue([
        despesa('tx-pequena', 'Lazer', 150, new Date(2026, 7, 20, 10, 0)),
        despesa('tx-grande', 'Lazer', 600, new Date(2026, 7, 20, 18, 0)),
      ]);
      mockFinancialData.getDailyExpenseSeries.mockResolvedValue(serieComPico);

      const result = await service.detectAnomalies(USER_ID, FAMILY_ID);

      const picos = result.filter((a) => a.anomalyType === AnomalyType.SPIKE);
      expect(picos).toHaveLength(1);
      expect(picos[0].severity).toBe(AnomalySeverity.HIGH);
      expect(picos[0].transactionId).toBe('tx-grande');
      expect(picos[0].anomalyScore).toBe(1);
      expect(picos[0].reason).toContain('20/08/2026');
      expect(picos[0].reason).toContain('R$ 900,00');
      expect(picos[0].reason).toContain('média diária');
    });

    it('não deve avaliar picos com menos de 7 dias de movimento', async () => {
      mockFinancialData.getExpenses.mockResolvedValue([
        despesa('tx-grande', 'Lazer', 600, new Date(2026, 7, 20, 18, 0)),
      ]);
      mockFinancialData.getDailyExpenseSeries.mockResolvedValue([
        { date: '2026-08-18', total: 100, count: 1 },
        { date: '2026-08-19', total: 100, count: 1 },
        { date: '2026-08-20', total: 900, count: 1 },
      ]);

      const result = await service.detectAnomalies(USER_ID, FAMILY_ID);

      expect(result).toEqual([]);
    });

    it('não deve marcar pico quando os dias são homogêneos', async () => {
      mockFinancialData.getExpenses.mockResolvedValue([
        despesa('tx-1', 'Lazer', 100, new Date(2026, 7, 10, 18, 0)),
      ]);
      mockFinancialData.getDailyExpenseSeries.mockResolvedValue(
        Array.from({ length: 20 }, (_, i) => ({
          date: `2026-08-${String(i + 1).padStart(2, '0')}`,
          total: 100,
          count: 1,
        })),
      );

      const result = await service.detectAnomalies(USER_ID, FAMILY_ID);

      expect(result).toEqual([]);
    });
  });

  describe('detectAnomalies — PATTERN_BREAK (recorrências)', () => {
    it('deve apontar recorrência que mudou muito de valor', async () => {
      mockFinancialData.getExpenses.mockResolvedValue([
        despesa(
          'tx-netflix',
          'Assinaturas',
          129.9,
          new Date(2026, 7, 15, 12, 0),
          'NETFLIX',
        ),
      ]);
      mockFinancialData.getRecurringExpenses.mockResolvedValue([
        {
          description: 'netflix',
          category: 'Assinaturas',
          averageAmount: 55.9,
          occurrences: 6,
          averageIntervalDays: 30,
          lastDate: new Date(2026, 7, 15, 12, 0),
        },
      ]);

      const result = await service.detectAnomalies(USER_ID, FAMILY_ID);

      expect(result).toHaveLength(1);
      expect(result[0].anomalyType).toBe(AnomalyType.PATTERN_BREAK);
      // Variação de +132,4% (>= 100%) → severidade alta
      expect(result[0].severity).toBe(AnomalySeverity.HIGH);
      expect(result[0].transactionId).toBe('tx-netflix');
      expect(result[0].anomalyScore).toBe(0.66);
      expect(result[0].reason).toContain('R$ 55,90');
      expect(result[0].reason).toContain('R$ 129,90');
      expect(result[0].reason).toContain('+132,4%');
    });

    it('deve apontar recorrência que deixou de ocorrer no intervalo esperado', async () => {
      mockFinancialData.getExpenses.mockResolvedValue([
        despesa(
          'tx-academia',
          'Saúde',
          129.9,
          new Date(2026, 4, 20, 12, 0),
          'ACADEMIA SMART',
        ),
      ]);
      mockFinancialData.getRecurringExpenses.mockResolvedValue([
        {
          description: 'academia smart',
          category: 'Saúde',
          averageAmount: 129.9,
          occurrences: 6,
          averageIntervalDays: 30,
          lastDate: new Date(2026, 4, 20, 12, 0),
        },
      ]);

      const result = await service.detectAnomalies(USER_ID, FAMILY_ID);

      expect(result).toHaveLength(1);
      expect(result[0].anomalyType).toBe(AnomalyType.PATTERN_BREAK);
      expect(result[0].severity).toBe(AnomalySeverity.MEDIUM);
      expect(result[0].anomalyScore).toBeGreaterThan(0);
      expect(result[0].anomalyScore).toBeLessThanOrEqual(1);
      expect(result[0].reason).toContain('não é registrada há');
      expect(result[0].reason).toContain('a cada 30 dias');
    });

    it('não deve apontar recorrência estável e em dia', async () => {
      mockFinancialData.getExpenses.mockResolvedValue([
        despesa(
          'tx-netflix',
          'Assinaturas',
          57,
          new Date(2026, 7, 15, 12, 0),
          'NETFLIX',
        ),
      ]);
      mockFinancialData.getRecurringExpenses.mockResolvedValue([
        {
          description: 'netflix',
          category: 'Assinaturas',
          averageAmount: 55.9,
          occurrences: 6,
          averageIntervalDays: 30,
          lastDate: new Date(2026, 7, 15, 12, 0),
        },
      ]);

      const result = await service.detectAnomalies(USER_ID, FAMILY_ID);

      expect(result).toEqual([]);
    });
  });

  describe('detectAnomalies — persistência', () => {
    it('deve gravar todas as anomalias detectadas em uma única chamada', async () => {
      const base = new Date(2026, 7, 5, 12, 0, 0);
      mockFinancialData.getExpenses.mockResolvedValue([
        despesa('tx-a', 'Supermercado', 1250, base, 'ATACADAO'),
        despesa(
          'tx-b',
          'Supermercado',
          1250,
          new Date(base.getTime() + 2 * 3_600_000),
          'ATACADAO',
        ),
      ]);
      mockFinancialData.getCategoryStatistics.mockResolvedValue([
        {
          category: 'Supermercado',
          mean: 390,
          stdDev: 120,
          min: 40,
          max: 1250,
          count: 24,
        },
      ]);

      const result = await service.detectAnomalies(USER_ID, FAMILY_ID);

      const tipos = result.map((a) => a.anomalyType);
      expect(tipos).toContain(AnomalyType.UNUSUAL_AMOUNT);
      expect(tipos).toContain(AnomalyType.DUPLICATE);
      expect(mockAnomalyRepository.save).toHaveBeenCalledTimes(1);
      expect(mockAnomalyRepository.save).toHaveBeenCalledWith(result);
      expect(mockAnomalyRepository.create).toHaveBeenCalledTimes(result.length);
    });

    it('não deve repetir o mesmo tipo de anomalia para o mesmo lançamento', async () => {
      const base = new Date(2026, 7, 5, 12, 0, 0);
      mockFinancialData.getExpenses.mockResolvedValue([
        despesa('tx-a', 'Supermercado', 1250, base, 'ATACADAO'),
        despesa(
          'tx-b',
          'Supermercado',
          1250,
          new Date(base.getTime() + 3_600_000),
          'ATACADAO',
        ),
        despesa(
          'tx-c',
          'Supermercado',
          1250,
          new Date(base.getTime() + 2 * 3_600_000),
          'ATACADAO',
        ),
      ]);
      mockFinancialData.getCategoryStatistics.mockResolvedValue([
        {
          category: 'Supermercado',
          mean: 390,
          stdDev: 120,
          min: 40,
          max: 1250,
          count: 24,
        },
      ]);

      const result = await service.detectAnomalies(USER_ID, FAMILY_ID);

      const chaves = result.map((a) => `${a.transactionId}:${a.anomalyType}`);
      expect(new Set(chaves).size).toBe(chaves.length);
    });
  });
});
