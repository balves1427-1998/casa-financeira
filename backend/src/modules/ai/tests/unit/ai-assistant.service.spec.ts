import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IsNull } from 'typeorm';
import { AiAssistantService } from '../../services/ai-assistant.service';
import {
  IntentDetectorService,
  IntentResult,
} from '../../services/intent-detector.service';
import { AiMessage } from '../../entities/ai-message.entity';
import { IntentType, SendChatMessageDto } from '../../dtos/ai-assistant.dto';
import { FinancialDataService } from '../../../financial-data/financial-data.service';
import {
  CategoryAggregate,
  ResponsibleAggregate,
  RecurringExpense,
} from '../../../financial-data/financial-data.types';
import { Expense } from '../../../expenses/entities/expense.entity';
import { Income } from '../../../income/entities/income.entity';

/**
 * Testes unitários do AiAssistantService.
 *
 * O assistente não devolve textos prontos: o `IntentDetectorService` roteia a
 * pergunta e o `FinancialDataService` — aqui mockado com os lançamentos reais
 * de agosto/2026 da casa — fornece os números. Os testes verificam que cada
 * resposta cita os valores REAIS em formato brasileiro e que, sem lançamentos,
 * a resposta diz isso claramente (regra 27) em vez de devolver um número.
 *
 * O relógio é fixado em 26/08/2026 para que "este mês" e os dias restantes do
 * mês sejam determinísticos.
 */
describe('AiAssistantService', () => {
  let service: AiAssistantService;

  const USER_ID = '11111111-1111-1111-1111-111111111111';
  const FAMILY_ID = '22222222-2222-2222-2222-222222222222';
  const DATA_FIXA = new Date('2026-08-26T10:00:00.000Z');

  const RANGES: Record<string, { start: Date; end: Date }> = {
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
  };

  // ==================== dados financeiros reais mockados ====================

  const CATEGORIAS: CategoryAggregate[] = [
    {
      category: 'Alimentação',
      total: 1840,
      count: 23,
      average: 80,
      share: 0.575,
    },
    {
      category: 'Supermercado',
      total: 900,
      count: 10,
      average: 90,
      share: 0.28125,
    },
    {
      category: 'Transporte',
      total: 460,
      count: 8,
      average: 57.5,
      share: 0.14375,
    },
  ];

  const RESPONSAVEIS: ResponsibleAggregate[] = [
    { responsible: 'bruno', total: 1950, count: 24, share: 0.609375 },
    { responsible: 'giovanna', total: 1250, count: 17, share: 0.390625 },
  ];

  const DESPESAS: Expense[] = [
    {
      id: 'exp-1',
      description: 'Compra do mês',
      establishment: 'Atacadão',
      amount: 480,
      date: new Date(2026, 7, 12),
      category: 'Supermercado',
      responsible: 'bruno',
    },
    {
      id: 'exp-2',
      description: 'Jantar',
      establishment: 'iFood',
      amount: 92.4,
      date: new Date(2026, 7, 20),
      category: 'Alimentação',
      responsible: 'giovanna',
    },
  ] as unknown as Expense[];

  const RECEITAS: Income[] = [
    {
      id: 'inc-1',
      description: 'Salário Bruno',
      amount: 8500,
      date: new Date(2026, 7, 5),
      responsible: 'bruno',
      type: 'salary',
    },
    {
      id: 'inc-2',
      description: 'Freelance',
      amount: 1200,
      date: new Date(2026, 7, 18),
      responsible: 'giovanna',
      type: 'freelance',
    },
  ] as unknown as Income[];

  const RECORRENTES: RecurringExpense[] = [
    {
      description: 'netflix',
      category: 'Assinaturas',
      averageAmount: 55.9,
      occurrences: 6,
      averageIntervalDays: 30,
      lastDate: new Date(2026, 7, 10),
    },
  ];

  const RESUMO_MES_ATUAL = {
    totalExpenses: 3200,
    totalIncomes: 9700,
    balance: 6500,
    expenseCount: 41,
    incomeCount: 2,
    averageDailyExpense: 123.08,
    days: 26,
  };

  const RESUMO_MES_ANTERIOR = {
    totalExpenses: 2910,
    totalIncomes: 8500,
    balance: 5590,
    expenseCount: 38,
    incomeCount: 2,
    averageDailyExpense: 93.87,
    days: 31,
  };

  const RESUMO_VAZIO = {
    totalExpenses: 0,
    totalIncomes: 0,
    balance: 0,
    expenseCount: 0,
    incomeCount: 0,
    averageDailyExpense: 0,
    days: 26,
  };

  // Mock do repositório de mensagens
  const mockAiMessageRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findAndCount: jest.fn(),
    update: jest.fn(),
  };

  // Mock do detector de intenção
  const mockIntentDetectorService = {
    detectIntent: jest.fn(),
    generateFollowUpSuggestions: jest.fn(),
  };

  // Mock da camada de leitura dos lançamentos reais
  const mockFinancialData: any = {
    getPeriodRange: jest.fn(),
    getSummary: jest.fn(),
    getExpensesByCategory: jest.fn(),
    getExpensesByResponsible: jest.fn(),
    getExpenses: jest.fn(),
    getIncomes: jest.fn(),
    getCurrentBalance: jest.fn(),
    getRecurringExpenses: jest.fn(),
  };

  /**
   * Fábrica de mensagens persistidas (AiMessage) usadas nos testes.
   */
  const criarMensagem = (overrides: Partial<AiMessage> = {}): AiMessage =>
    ({
      id: 'msg-1',
      userId: USER_ID,
      familyId: FAMILY_ID,
      question: 'Quanto gastei com alimentação este mês?',
      answer: 'Resposta gerada pelo assistente.',
      intent: IntentType.QUERY,
      confidence: 100,
      sources: [],
      followUpQuestions: [],
      metadata: {},
      createdAt: DATA_FIXA,
      updatedAt: DATA_FIXA,
      deletedAt: null,
      ...overrides,
    }) as AiMessage;

  /**
   * Fábrica do resultado de detecção de intenção.
   */
  const criarIntentResult = (
    overrides: Partial<IntentResult> = {},
  ): IntentResult => ({
    intent: IntentType.QUERY,
    confidence: 100,
    entities: {},
    ...overrides,
  });

  /**
   * Cenário padrão: agosto/2026 com lançamentos reais em todas as fontes.
   */
  const configurarCenarioComDados = (
    intentResult: IntentResult = criarIntentResult(),
  ): void => {
    mockIntentDetectorService.detectIntent.mockReturnValue(intentResult);
    mockIntentDetectorService.generateFollowUpSuggestions.mockReturnValue([
      'Sugestão do detector A',
      'Sugestão do detector B',
    ]);
    mockAiMessageRepository.create.mockImplementation(
      (dados: Partial<AiMessage>) => dados as AiMessage,
    );
    mockAiMessageRepository.save.mockImplementation(async (mensagem: AiMessage) =>
      criarMensagem({ ...mensagem }),
    );

    mockFinancialData.getPeriodRange.mockImplementation(
      (periodo: string) => RANGES[periodo] ?? RANGES.THIS_MONTH,
    );
    mockFinancialData.getSummary.mockImplementation(
      async (_familyId: string, range: { start: Date }) =>
        range.start.getMonth() === 6 ? RESUMO_MES_ANTERIOR : RESUMO_MES_ATUAL,
    );
    mockFinancialData.getExpensesByCategory.mockResolvedValue(CATEGORIAS);
    mockFinancialData.getExpensesByResponsible.mockResolvedValue(RESPONSAVEIS);
    mockFinancialData.getExpenses.mockResolvedValue(DESPESAS);
    mockFinancialData.getIncomes.mockResolvedValue(RECEITAS);
    mockFinancialData.getCurrentBalance.mockResolvedValue(5230);
    mockFinancialData.getRecurringExpenses.mockResolvedValue(RECORRENTES);
  };

  /**
   * Cenário sem nenhum lançamento — nenhuma resposta pode conter números
   * inventados (regra 27).
   */
  const configurarCenarioSemDados = (
    intentResult: IntentResult = criarIntentResult(),
  ): void => {
    configurarCenarioComDados(intentResult);
    mockFinancialData.getSummary.mockResolvedValue(RESUMO_VAZIO);
    mockFinancialData.getExpensesByCategory.mockResolvedValue([]);
    mockFinancialData.getExpensesByResponsible.mockResolvedValue([]);
    mockFinancialData.getExpenses.mockResolvedValue([]);
    mockFinancialData.getIncomes.mockResolvedValue([]);
    mockFinancialData.getCurrentBalance.mockResolvedValue(0);
    mockFinancialData.getRecurringExpenses.mockResolvedValue([]);
  };

  /** Pergunta ao assistente e devolve a resposta em texto. */
  const perguntar = async (question: string): Promise<string> => {
    const resultado = await service.processUserQuestion(USER_ID, FAMILY_ID, {
      question,
    });
    return resultado.answer;
  };

  beforeAll(() => {
    jest.useFakeTimers({ now: new Date(2026, 7, 26, 12, 0, 0) });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiAssistantService,
        {
          provide: getRepositoryToken(AiMessage),
          useValue: mockAiMessageRepository,
        },
        {
          provide: IntentDetectorService,
          useValue: mockIntentDetectorService,
        },
        {
          provide: FinancialDataService,
          useValue: mockFinancialData,
        },
      ],
    }).compile();

    service = module.get<AiAssistantService>(AiAssistantService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('deve estar definido', () => {
    expect(service).toBeDefined();
  });

  // ==================== processUserQuestion ====================

  describe('processUserQuestion', () => {
    it('deve detectar a intenção, persistir a mensagem e retornar a resposta', async () => {
      configurarCenarioComDados(
        criarIntentResult({
          intent: IntentType.QUERY,
          confidence: 100,
          entities: { metric: 'gasto' },
        }),
      );

      const dto: SendChatMessageDto = {
        question: 'Quanto gastei com alimentação este mês?',
      };

      const resultado = await service.processUserQuestion(
        USER_ID,
        FAMILY_ID,
        dto,
      );

      expect(mockIntentDetectorService.detectIntent).toHaveBeenCalledWith(
        'Quanto gastei com alimentação este mês?',
      );
      expect(mockAiMessageRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_ID,
          familyId: FAMILY_ID,
          question: 'Quanto gastei com alimentação este mês?',
          intent: IntentType.QUERY,
          confidence: 100,
        }),
      );
      expect(mockAiMessageRepository.save).toHaveBeenCalledTimes(1);

      expect(resultado.intent).toBe(IntentType.QUERY);
      // A confiança vem do detector de intenção.
      expect(resultado.confidence).toBe(100);
      expect(resultado.timestamp).toEqual(DATA_FIXA);
      expect(resultado.answer.length).toBeGreaterThan(0);
    });

    it('deve registrar as fontes REALMENTE consultadas', async () => {
      configurarCenarioComDados();

      const resultado = await service.processUserQuestion(USER_ID, FAMILY_ID, {
        question: 'Quanto gastei com alimentação este mês?',
      });

      expect(resultado.sources).toEqual(['expenses']);
    });

    it('deve unir as fontes consultadas às informadas pelo cliente', async () => {
      configurarCenarioComDados();

      const resultado = await service.processUserQuestion(USER_ID, FAMILY_ID, {
        question: 'Qual é o meu saldo atual?',
        sources: ['dashboard'],
      });

      expect(resultado.sources).toEqual(
        expect.arrayContaining(['accounts', 'expenses', 'incomes', 'dashboard']),
      );
    });

    it('deve gravar metadados com entidades, tempo de processamento e fontes', async () => {
      configurarCenarioComDados(
        criarIntentResult({ entities: { period: 'este mês', metric: 'gast' } }),
      );

      await service.processUserQuestion(USER_ID, FAMILY_ID, {
        question: 'Quanto gastei este mês?',
      });

      const dadosCriados: Partial<AiMessage> =
        mockAiMessageRepository.create.mock.calls[0][0];
      const metadados: Record<string, any> = dadosCriados.metadata ?? {};
      expect(metadados.entities).toEqual({
        period: 'este mês',
        metric: 'gast',
      });
      expect(typeof metadados.processingTime).toBe('number');
      expect(metadados.dataSources).toEqual(['expenses']);
    });

    it('deve aplicar valores padrão quando a mensagem salva vier com campos nulos', async () => {
      configurarCenarioComDados();
      mockAiMessageRepository.save.mockImplementation(
        async (mensagem: AiMessage) =>
          criarMensagem({
            ...mensagem,
            intent: null,
            confidence: null,
            followUpQuestions: null,
            sources: null as unknown as string[],
          }),
      );

      const resultado = await service.processUserQuestion(USER_ID, FAMILY_ID, {
        question: 'Pergunta sem intenção clara',
      });

      expect(resultado.intent).toBe('QUERY');
      expect(resultado.confidence).toBe(0.5);
      expect(resultado.followUpQuestions).toEqual([]);
      expect(resultado.sources).toEqual([]);
    });

    it('não deve usar valores aleatórios para responder', async () => {
      configurarCenarioComDados();
      const random = jest.spyOn(Math, 'random');

      await perguntar('Quanto gastei com alimentação este mês?');

      expect(random).not.toHaveBeenCalled();
    });

    // ============ perguntas respondidas com dados reais ============

    describe('gastos por categoria', () => {
      it('deve responder com o total REAL da categoria no mês', async () => {
        configurarCenarioComDados();

        const resposta = await perguntar(
          'Quanto gastei com alimentação este mês?',
        );

        expect(resposta).toContain('agosto/2026');
        expect(resposta).toContain('R$ 1.840,00');
        expect(resposta).toContain('Alimentação');
        expect(resposta).toContain('23 lançamento(s)');
        // Participação real da categoria no período.
        expect(resposta).toContain('57,5%');
      });

      it('deve usar o mês anterior quando a pergunta citar "mês passado"', async () => {
        configurarCenarioComDados();

        await perguntar('Quanto gastei com alimentação no mês passado?');

        expect(mockFinancialData.getPeriodRange).toHaveBeenCalledWith(
          'LAST_MONTH',
        );
      });

      it('deve dizer que não há lançamentos quando a categoria não aparece no período', async () => {
        configurarCenarioComDados();
        mockFinancialData.getExpensesByCategory.mockResolvedValue([
          {
            category: 'Supermercado',
            total: 900,
            count: 10,
            average: 90,
            share: 1,
          },
        ]);

        const resposta = await perguntar(
          'Quanto gastei com alimentação este mês?',
        );

        // Regra 27: não devolver número quando não há lançamento.
        expect(resposta).toBe(
          'Ainda não há lançamentos de Alimentação em agosto/2026.',
        );
        expect(resposta).not.toContain('R$');
      });

      it('deve responder o total do período quando nenhuma categoria for citada', async () => {
        configurarCenarioComDados();

        const resposta = await perguntar('Quanto gastei este mês?');

        // 1.840 + 900 + 460 = 3.200,00 em 41 lançamentos
        expect(resposta).toContain('R$ 3.200,00');
        expect(resposta).toContain('41 lançamento(s)');
      });

      it('deve avisar quando não há nenhuma despesa lançada no período', async () => {
        configurarCenarioSemDados();

        const resposta = await perguntar('Quanto gastei este mês?');

        expect(resposta).toBe('Ainda não há despesas lançadas em agosto/2026.');
      });
    });

    describe('maior despesa', () => {
      it('deve apontar o lançamento REAL de maior valor com data e estabelecimento', async () => {
        configurarCenarioComDados();

        const resposta = await perguntar('Qual foi minha maior despesa?');

        expect(resposta).toContain('R$ 480,00');
        expect(resposta).toContain('12/08/2026');
        expect(resposta).toContain('Compra do mês');
        expect(resposta).toContain('Atacadão');
        expect(resposta).toContain('Supermercado');
        expect(resposta).toContain('Bruno');
      });

      it('deve avisar quando não há despesas lançadas', async () => {
        configurarCenarioSemDados();

        const resposta = await perguntar('Qual foi minha maior despesa?');

        expect(resposta).toBe('Ainda não há despesas lançadas em agosto/2026.');
      });
    });

    describe('gastos por responsável', () => {
      it('deve responder quanto o Bruno gastou de verdade', async () => {
        configurarCenarioComDados();

        const resposta = await perguntar('Quanto o Bruno gastou?');

        expect(resposta).toContain('Bruno');
        expect(resposta).toContain('R$ 1.950,00');
        expect(resposta).toContain('24 lançamento(s)');
        expect(resposta).toContain('60,9%');
      });

      it('deve responder quanto a Giovanna gastou de verdade', async () => {
        configurarCenarioComDados();

        const resposta = await perguntar('Quanto a Giovanna gastou?');

        expect(resposta).toContain('Giovanna');
        expect(resposta).toContain('R$ 1.250,00');
      });

      it('deve comparar Bruno e Giovanna com a diferença real', async () => {
        configurarCenarioComDados(
          criarIntentResult({ intent: IntentType.COMPARISON }),
        );

        const resposta = await perguntar('Quem gastou mais, Bruno ou Giovanna?');

        expect(resposta).toContain('R$ 1.950,00');
        expect(resposta).toContain('R$ 1.250,00');
        // 1.950,00 - 1.250,00 = 700,00
        expect(resposta).toContain('diferença de R$ 700,00');
      });

      it('deve dizer que não há lançamentos do responsável em vez de devolver zero', async () => {
        configurarCenarioComDados();
        mockFinancialData.getExpensesByResponsible.mockResolvedValue([
          { responsible: 'bruno', total: 1950, count: 24, share: 1 },
        ]);

        const resposta = await perguntar('Quanto a Giovanna gastou?');

        expect(resposta).toBe(
          'Ainda não há despesas lançadas para Giovanna em agosto/2026.',
        );
      });
    });

    describe('saldo e disponibilidade', () => {
      it('deve informar o saldo REAL das contas e o resultado do mês', async () => {
        configurarCenarioComDados();

        const resposta = await perguntar('Qual é o meu saldo atual?');

        expect(resposta).toContain('R$ 5.230,00');
        expect(resposta).toContain('R$ 9.700,00');
        expect(resposta).toContain('R$ 3.200,00');
        expect(resposta).toContain('sobra de R$ 6.500,00');
      });

      it('deve informar déficit quando as despesas superam as receitas', async () => {
        configurarCenarioComDados();
        mockFinancialData.getSummary.mockResolvedValue({
          ...RESUMO_MES_ATUAL,
          totalIncomes: 2000,
          balance: -1200,
        });

        const resposta = await perguntar('Qual é o meu saldo atual?');

        expect(resposta).toContain('déficit de R$ 1.200,00');
      });

      it('deve dizer que não há movimento do mês quando não há lançamentos', async () => {
        configurarCenarioSemDados();
        mockFinancialData.getCurrentBalance.mockResolvedValue(1500);

        const resposta = await perguntar('Qual é o meu saldo atual?');

        expect(resposta).toContain('R$ 1.500,00');
        expect(resposta).toContain('Ainda não há lançamentos em agosto/2026');
      });

      it('deve projetar quanto ainda pode ser gasto citando a base do cálculo', async () => {
        configurarCenarioComDados();

        const resposta = await perguntar('Quanto posso gastar até o fim do mês?');

        // 26/08/2026: faltam 5 dias para o dia 31.
        expect(resposta).toContain('Faltam 5 dia(s)');
        expect(resposta).toContain('R$ 5.230,00');
        expect(resposta).toContain('R$ 123,08');
        // Base explicitada: 41 lançamentos somando 3.200,00.
        expect(resposta).toContain('41 lançamento(s) do mês');
        // 123,08 × 5 = 615,40 projetados; 5.230,00 - 615,40 = 4.614,60
        expect(resposta).toContain('R$ 615,40');
        expect(resposta).toContain('R$ 4.614,60');
      });

      it('deve avisar que não há média diária quando o mês não tem despesas', async () => {
        configurarCenarioSemDados();
        mockFinancialData.getCurrentBalance.mockResolvedValue(1500);

        const resposta = await perguntar('Quanto posso gastar até o fim do mês?');

        expect(resposta).toContain('Ainda não há despesas lançadas em agosto/2026');
        expect(resposta).toContain('R$ 1.500,00');
      });
    });

    describe('comparação com o mês anterior', () => {
      it('deve comparar os totais REAIS de agosto e julho', async () => {
        configurarCenarioComDados(
          criarIntentResult({ intent: IntentType.COMPARISON }),
        );

        const resposta = await perguntar('Estou gastando mais que no mês passado?');

        expect(resposta).toContain('agosto/2026');
        expect(resposta).toContain('julho/2026');
        expect(resposta).toContain('R$ 3.200,00');
        expect(resposta).toContain('R$ 2.910,00');
        // (3.200 - 2.910) / 2.910 = 9,97% a mais; diferença de 290,00
        expect(resposta).toContain('10,0% a mais');
        expect(resposta).toContain('R$ 290,00');
      });

      it('deve dizer que falta base de comparação quando o mês anterior está vazio', async () => {
        configurarCenarioComDados(
          criarIntentResult({ intent: IntentType.COMPARISON }),
        );
        mockFinancialData.getSummary.mockImplementation(
          async (_familyId: string, range: { start: Date }) =>
            range.start.getMonth() === 6 ? RESUMO_VAZIO : RESUMO_MES_ATUAL,
        );

        const resposta = await perguntar('Estou gastando mais que no mês passado?');

        expect(resposta).toContain(
          'Ainda não há despesas lançadas em julho/2026',
        );
        expect(resposta).toContain('R$ 3.200,00');
      });
    });

    describe('ranking de categorias', () => {
      it('deve listar as maiores categorias com valores e participação reais', async () => {
        configurarCenarioComDados();

        const resposta = await perguntar('Quais são minhas maiores categorias?');

        expect(resposta).toContain('1. Alimentação: R$ 1.840,00');
        expect(resposta).toContain('2. Supermercado: R$ 900,00');
        expect(resposta).toContain('3. Transporte: R$ 460,00');
        expect(resposta).toContain('57,5%');
      });

      it('deve avisar quando não há despesas para montar o ranking', async () => {
        configurarCenarioSemDados();

        const resposta = await perguntar('Quais são minhas maiores categorias?');

        expect(resposta).toContain('Ainda não há despesas lançadas');
      });
    });

    describe('receitas', () => {
      it('deve somar as receitas REAIS e apontar a maior entrada', async () => {
        configurarCenarioComDados();

        const resposta = await perguntar('Quanto recebi este mês?');

        // 8.500,00 + 1.200,00 = 9.700,00
        expect(resposta).toContain('R$ 9.700,00');
        expect(resposta).toContain('R$ 8.500,00');
        expect(resposta).toContain('05/08/2026');
        expect(resposta).toContain('Salário Bruno');
      });

      it('deve avisar quando não há receitas lançadas', async () => {
        configurarCenarioSemDados();

        const resposta = await perguntar('Quanto recebi este mês?');

        expect(resposta).toBe('Ainda não há receitas lançadas em agosto/2026.');
      });
    });

    describe('onde reduzir gastos', () => {
      it('deve apontar a maior categoria real e a cobrança recorrente encontrada', async () => {
        configurarCenarioComDados(
          criarIntentResult({ intent: IntentType.RECOMMENDATION }),
        );

        const resposta = await perguntar('Quais gastos posso reduzir?');

        expect(resposta).toContain('Alimentação');
        expect(resposta).toContain('R$ 1.840,00');
        expect(resposta).toContain('netflix');
        // 55,90 × 12 = 670,80 por ano
        expect(resposta).toContain('R$ 670,80');
      });

      it('deve informar quando não há cobranças recorrentes identificadas', async () => {
        configurarCenarioComDados(
          criarIntentResult({ intent: IntentType.RECOMMENDATION }),
        );
        mockFinancialData.getRecurringExpenses.mockResolvedValue([]);

        const resposta = await perguntar('Quais gastos posso reduzir?');

        expect(resposta).toContain(
          'Não foram encontradas cobranças recorrentes',
        );
      });
    });

    describe('perguntas fora do alcance dos dados lidos', () => {
      it('deve dizer claramente que não lê contas planejadas nem metas', async () => {
        configurarCenarioComDados();

        const resultado = await service.processUserQuestion(
          USER_ID,
          FAMILY_ID,
          { question: 'Quais contas vencem nos próximos 7 dias?' },
        );

        expect(resultado.answer).toContain('Planejado');
        expect(resultado.answer).not.toContain('R$');
        expect(resultado.sources).toEqual([]);
        // Sem contexto de dados, as sugestões vêm do detector de intenção.
        expect(resultado.followUpQuestions).toEqual([
          'Sugestão do detector A',
          'Sugestão do detector B',
        ]);
      });
    });

    describe('resumo como resposta padrão', () => {
      it('deve resumir o mês com números reais quando a pergunta não é reconhecida', async () => {
        configurarCenarioComDados();

        const resposta = await perguntar('E aí, como estamos?');

        expect(resposta).toContain('R$ 9.700,00');
        expect(resposta).toContain('R$ 3.200,00');
        expect(resposta).toContain('R$ 123,08');
      });

      it('deve pedir lançamentos quando não há nada registrado', async () => {
        configurarCenarioSemDados();

        const resposta = await perguntar('E aí, como estamos?');

        expect(resposta).toContain('Ainda não há lançamentos em agosto/2026');
        expect(resposta).not.toContain('R$');
      });
    });

    describe('sugestões de follow-up', () => {
      it('deve sugerir perguntas coerentes com o contexto da resposta', async () => {
        configurarCenarioComDados();

        const resultado = await service.processUserQuestion(
          USER_ID,
          FAMILY_ID,
          { question: 'Quanto gastei com alimentação este mês?' },
        );

        expect(resultado.followUpQuestions).toContain(
          'Qual foi a maior despesa de Alimentação?',
        );
      });
    });
  });

  // ==================== getChatHistory ====================

  describe('getChatHistory', () => {
    it('deve retornar o histórico paginado do usuário', async () => {
      const mensagens = [
        criarMensagem({ id: 'msg-1', question: 'Pergunta 1' }),
        criarMensagem({
          id: 'msg-2',
          question: 'Pergunta 2',
          intent: IntentType.PREDICTION,
        }),
      ];
      mockAiMessageRepository.findAndCount.mockResolvedValue([mensagens, 2]);

      const resultado = await service.getChatHistory(USER_ID, FAMILY_ID, {
        limit: 10,
        offset: 0,
      });

      expect(mockAiMessageRepository.findAndCount).toHaveBeenCalledWith({
        where: { userId: USER_ID, familyId: FAMILY_ID },
        order: { createdAt: 'DESC' },
        take: 10,
        skip: 0,
      });
      expect(resultado.total).toBe(2);
      expect(resultado.messages).toHaveLength(2);
      expect(resultado.messages[0]).toEqual({
        id: 'msg-1',
        question: 'Pergunta 1',
        answer: 'Resposta gerada pelo assistente.',
        intent: IntentType.QUERY,
        createdAt: DATA_FIXA,
      });
      expect(resultado.messages[1].intent).toBe(IntentType.PREDICTION);
    });

    it('deve retornar lista vazia quando não houver histórico', async () => {
      mockAiMessageRepository.findAndCount.mockResolvedValue([[], 0]);

      const resultado = await service.getChatHistory(USER_ID, FAMILY_ID, {
        limit: 20,
        offset: 40,
      });

      expect(resultado.messages).toEqual([]);
      expect(resultado.total).toBe(0);
      expect(resultado.offset).toBe(40);
    });

    it('deve usar QUERY como intenção padrão quando a mensagem não tiver intent', async () => {
      mockAiMessageRepository.findAndCount.mockResolvedValue([
        [criarMensagem({ intent: null })],
        1,
      ]);

      const resultado = await service.getChatHistory(USER_ID, FAMILY_ID, {
        limit: 5,
        offset: 0,
      });

      expect(resultado.messages[0].intent).toBe('QUERY');
    });
  });

  // ==================== getSuggestions ====================

  describe('getSuggestions', () => {
    it('deve retornar as sugestões padrão quando não houver histórico', async () => {
      mockAiMessageRepository.find.mockResolvedValue([]);

      const resultado = await service.getSuggestions(USER_ID, FAMILY_ID);

      expect(mockAiMessageRepository.find).toHaveBeenCalledWith({
        where: { userId: USER_ID, familyId: FAMILY_ID, deletedAt: IsNull() },
        order: { createdAt: 'DESC' },
        take: 5,
      });
      expect(resultado.suggestions).toHaveLength(8);
      expect(resultado.suggestions[0]).toBe(
        'Quanto gastei com alimentação este mês?',
      );
    });

    it('deve priorizar a sugestão comparativa quando houver histórico de QUERY', async () => {
      mockAiMessageRepository.find.mockResolvedValue([
        criarMensagem({ intent: IntentType.QUERY }),
      ]);

      const resultado = await service.getSuggestions(USER_ID, FAMILY_ID);

      expect(resultado.suggestions[0]).toBe(
        'Como isso se compara ao mês anterior?',
      );
      expect(resultado.suggestions).toHaveLength(8);
    });

    it('deve priorizar a sugestão de previsão quando houver QUERY e PREDICTION no histórico', async () => {
      mockAiMessageRepository.find.mockResolvedValue([
        criarMensagem({ id: 'msg-1', intent: IntentType.QUERY }),
        criarMensagem({ id: 'msg-2', intent: IntentType.PREDICTION }),
      ]);

      const resultado = await service.getSuggestions(USER_ID, FAMILY_ID);

      expect(resultado.suggestions[0]).toBe(
        'Qual é o intervalo de confiança dessa previsão?',
      );
      expect(resultado.suggestions[1]).toBe(
        'Como isso se compara ao mês anterior?',
      );
    });

    it('não deve adicionar sugestões extras para intenções sem personalização', async () => {
      mockAiMessageRepository.find.mockResolvedValue([
        criarMensagem({ intent: IntentType.ACTION }),
      ]);

      const resultado = await service.getSuggestions(USER_ID, FAMILY_ID);

      expect(resultado.suggestions[0]).toBe(
        'Quanto gastei com alimentação este mês?',
      );
    });
  });

  // ============== deleteMessage / clearChatHistory ==============

  describe('deleteMessage', () => {
    it('deve marcar a mensagem como excluída (soft delete)', async () => {
      mockAiMessageRepository.update.mockResolvedValue({ affected: 1 });

      await service.deleteMessage(USER_ID, FAMILY_ID, 'msg-1');

      expect(mockAiMessageRepository.update).toHaveBeenCalledWith(
        { id: 'msg-1', userId: USER_ID, familyId: FAMILY_ID },
        expect.objectContaining({ deletedAt: expect.any(Date) }),
      );
    });

    it('não deve lançar erro quando nenhuma mensagem for afetada', async () => {
      mockAiMessageRepository.update.mockResolvedValue({ affected: 0 });

      await expect(
        service.deleteMessage(USER_ID, FAMILY_ID, 'inexistente'),
      ).resolves.toBeUndefined();
    });
  });

  describe('clearChatHistory', () => {
    it('deve marcar todas as mensagens ativas do usuário como excluídas', async () => {
      mockAiMessageRepository.update.mockResolvedValue({ affected: 3 });

      await service.clearChatHistory(USER_ID, FAMILY_ID);

      expect(mockAiMessageRepository.update).toHaveBeenCalledWith(
        { userId: USER_ID, familyId: FAMILY_ID, deletedAt: IsNull() },
        expect.objectContaining({ deletedAt: expect.any(Date) }),
      );
    });
  });
});
