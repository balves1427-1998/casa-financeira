import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { SplitService } from '../split.service';
import { SplitMode, SplitRule } from '../entities/split-rule.entity';
import { FinancialDataService } from '../../financial-data/financial-data.service';
import { IncomeService } from '../../income/income.service';
import { User } from '../../users/entities/user.entity';
import { ResponsibleAggregate } from '../../financial-data/financial-data.types';

/**
 * Testes unitários do SplitService — divisão Bruno × Giovanna (item 15).
 *
 * Nenhum banco é tocado: as despesas vêm mockadas do `FinancialDataService` e a
 * renda recorrente do `IncomeService`, exatamente como em produção. Assim os
 * testes verificam a ARITMÉTICA do rateio, que é o que pode quebrar em silêncio.
 *
 * Cenário base usado na maioria dos casos (números escolhidos para conferência
 * manual):
 *   Bruno    pagou R$ 4.500,00  em 12 lançamentos
 *   Giovanna pagou R$ 2.900,00  em  8 lançamentos
 *   Total da casa: R$ 7.400,00
 */
describe('SplitService', () => {
  let service: SplitService;

  const FAMILY_ID = 'family-casa';

  const USUARIO = {
    id: 'user-bruno',
    familyId: FAMILY_ID,
  } as User;

  /** Cenário base: os dois responsáveis com despesas no período. */
  const DESPESAS_BRUNO_E_GIOVANNA: ResponsibleAggregate[] = [
    { responsible: 'bruno', total: 4500, count: 12, share: 0.608 },
    { responsible: 'giovanna', total: 2900, count: 8, share: 0.392 },
  ];

  const mockSplitRuleRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockFinancialData = {
    getPeriodRange: jest.fn(),
    getExpensesByResponsible: jest.fn(),
    getExpenses: jest.fn(),
  };

  const mockIncomeService = {
    getRecurringMonthlyIncome: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SplitService,
        {
          provide: getRepositoryToken(SplitRule),
          useValue: mockSplitRuleRepository,
        },
        { provide: FinancialDataService, useValue: mockFinancialData },
        { provide: IncomeService, useValue: mockIncomeService },
      ],
    }).compile();

    service = module.get<SplitService>(SplitService);

    // Período fixo (agosto/2026) para deixar as respostas determinísticas.
    mockFinancialData.getPeriodRange.mockReturnValue({
      start: new Date('2026-08-01T00:00:00.000Z'),
      end: new Date('2026-08-31T23:59:59.999Z'),
    });

    // Por padrão nenhum teste depende do detalhamento por categoria.
    mockFinancialData.getExpenses.mockResolvedValue([]);

    // Por padrão a família ainda não salvou regra alguma (padrão EQUAL).
    mockSplitRuleRepository.findOne.mockResolvedValue(null);
  });

  it('deve ser definido', () => {
    expect(service).toBeDefined();
  });

  // ==================== painel: quem pagou o quê ====================

  describe('getSplitSummary', () => {
    it('deve somar o total da casa e o percentual de participação de cada um', async () => {
      mockFinancialData.getExpensesByResponsible.mockResolvedValue(
        DESPESAS_BRUNO_E_GIOVANNA,
      );

      const resumo = await service.getSplitSummary(FAMILY_ID, 'THIS_MONTH');

      // 4.500 + 2.900 = 7.400
      expect(resumo.totalPaid).toBe(7400);
      expect(resumo.totalCount).toBe(20);

      // 4.500 / 7.400 = 60,81%   |   2.900 / 7.400 = 39,19%
      expect(resumo.participants[0]).toMatchObject({
        responsible: 'bruno',
        paid: 4500,
        count: 12,
        sharePercent: 60.81,
      });
      expect(resumo.participants[1]).toMatchObject({
        responsible: 'giovanna',
        paid: 2900,
        sharePercent: 39.19,
      });
    });

    it('deve informar a diferença entre quem pagou mais e quem pagou menos', async () => {
      mockFinancialData.getExpensesByResponsible.mockResolvedValue(
        DESPESAS_BRUNO_E_GIOVANNA,
      );

      const resumo = await service.getSplitSummary(FAMILY_ID);

      // 4.500 - 2.900 = 1.600   |   60,81 - 39,19 = 21,62 pontos percentuais
      expect(resumo.difference).toEqual({
        paidMore: 'bruno',
        paidLess: 'giovanna',
        amount: 1600,
        percentPoints: 21.62,
      });
    });

    it('deve converter valores decimais que chegam como STRING do PostgreSQL', async () => {
      // O driver `pg` devolve colunas decimal como texto; sem `Number()` a soma
      // vira concatenação ("1200.50" + "800.25").
      mockFinancialData.getExpensesByResponsible.mockResolvedValue([
        { responsible: 'bruno', total: '1200.50', count: '3', share: 0.6 },
        { responsible: 'giovanna', total: '800.25', count: '2', share: 0.4 },
      ] as unknown as ResponsibleAggregate[]);

      const resumo = await service.getSplitSummary(FAMILY_ID);

      expect(resumo.totalPaid).toBe(2000.75);
      expect(resumo.totalCount).toBe(5);
    });

    it('deve avisar quando não há despesas no período, sem inventar números', async () => {
      mockFinancialData.getExpensesByResponsible.mockResolvedValue([]);

      const resumo = await service.getSplitSummary(FAMILY_ID);

      expect(resumo.totalPaid).toBe(0);
      expect(resumo.participants).toEqual([]);
      expect(resumo.difference).toBeNull();
      expect(resumo.warnings[0]).toContain('Não há despesas lançadas');
    });

    it('deve tratar o caso de um único responsável: 100% dele e sem diferença', async () => {
      mockFinancialData.getExpensesByResponsible.mockResolvedValue([
        { responsible: 'bruno', total: 3200, count: 9, share: 1 },
      ]);

      const resumo = await service.getSplitSummary(FAMILY_ID);

      expect(resumo.participants).toHaveLength(1);
      expect(resumo.participants[0].sharePercent).toBe(100);
      expect(resumo.difference).toBeNull();
      expect(resumo.warnings[0]).toContain('Apenas bruno');
    });

    it('deve detalhar por categoria quem pagou o quê', async () => {
      mockFinancialData.getExpensesByResponsible.mockResolvedValue(
        DESPESAS_BRUNO_E_GIOVANNA,
      );
      mockFinancialData.getExpenses.mockResolvedValue([
        // `amount` como string, como vem do banco.
        { category: 'Supermercado', responsible: 'bruno', amount: '600.00' },
        { category: 'Supermercado', responsible: 'giovanna', amount: '400.00' },
        { category: 'Lazer', responsible: 'giovanna', amount: '250.00' },
      ]);

      const resumo = await service.getSplitSummary(FAMILY_ID);
      const supermercado = resumo.byCategory.find(
        (c) => c.category === 'Supermercado',
      );

      // 600 + 400 = 1.000 → Bruno 60%, Giovanna 40%
      expect(supermercado?.total).toBe(1000);
      expect(supermercado?.byResponsible).toEqual([
        { responsible: 'bruno', paid: 600, sharePercent: 60 },
        { responsible: 'giovanna', paid: 400, sharePercent: 40 },
      ]);

      // Categorias ordenadas do maior total para o menor.
      expect(resumo.byCategory.map((c) => c.category)).toEqual([
        'Supermercado',
        'Lazer',
      ]);
    });
  });

  // ==================== acerto de contas ====================

  describe('getSettlement — modo EQUAL (50/50)', () => {
    beforeEach(() => {
      mockFinancialData.getExpensesByResponsible.mockResolvedValue(
        DESPESAS_BRUNO_E_GIOVANNA,
      );
    });

    it('deve dividir o total ao meio quando a família não configurou regra', async () => {
      const acerto = await service.getSettlement(
        FAMILY_ID,
        USUARIO,
        'THIS_MONTH',
      );

      expect(acerto.configuredMode).toBe(SplitMode.EQUAL);
      expect(acerto.appliedMode).toBe(SplitMode.EQUAL);
      expect(acerto.fallbackApplied).toBe(false);

      // 7.400 / 2 = 3.700 para cada um
      const bruno = acerto.entries.find((e) => e.responsible === 'bruno');
      const giovanna = acerto.entries.find((e) => e.responsible === 'giovanna');

      expect(bruno).toMatchObject({
        targetPercent: 50,
        shouldHavePaid: 3700,
        paid: 4500,
        balance: 800, // 4.500 - 3.700
        status: 'RECEBE',
      });
      expect(giovanna).toMatchObject({
        targetPercent: 50,
        shouldHavePaid: 3700,
        paid: 2900,
        balance: -800, // 2.900 - 3.700
        status: 'PAGA',
      });
    });

    it('deve sugerir a transferência que equilibra a conta', async () => {
      const acerto = await service.getSettlement(FAMILY_ID, USUARIO);

      expect(acerto.transfers).toEqual([
        { from: 'giovanna', to: 'bruno', amount: 800 },
      ]);
    });

    it('não deve consultar a renda recorrente quando a regra não depende dela', async () => {
      await service.getSettlement(FAMILY_ID, USUARIO);

      expect(mockIncomeService.getRecurringMonthlyIncome).not.toHaveBeenCalled();
    });

    it('deve marcar todos como QUITADO quando os desembolsos já estão iguais', async () => {
      mockFinancialData.getExpensesByResponsible.mockResolvedValue([
        { responsible: 'bruno', total: 1500, count: 4, share: 0.5 },
        { responsible: 'giovanna', total: 1500, count: 5, share: 0.5 },
      ]);

      const acerto = await service.getSettlement(FAMILY_ID, USUARIO);

      expect(acerto.entries.every((e) => e.status === 'QUITADO')).toBe(true);
      expect(acerto.transfers).toEqual([]);
    });
  });

  describe('getSettlement — modo INCOME_PROPORTIONAL (proporcional à renda)', () => {
    beforeEach(() => {
      mockFinancialData.getExpensesByResponsible.mockResolvedValue(
        DESPESAS_BRUNO_E_GIOVANNA,
      );
      mockSplitRuleRepository.findOne.mockResolvedValue({
        mode: SplitMode.INCOME_PROPORTIONAL,
        customPercentages: null,
        notes: null,
        updatedAt: new Date('2026-08-01T10:00:00.000Z'),
      });
    });

    it('deve ratear na proporção da renda recorrente real de cada um', async () => {
      // Bruno R$ 7.000 e Giovanna R$ 3.000 → renda da casa R$ 10.000 → 70% / 30%
      mockIncomeService.getRecurringMonthlyIncome.mockResolvedValue([
        { responsible: 'bruno', monthlyAmount: 7000 },
        { responsible: 'giovanna', monthlyAmount: 3000 },
      ]);

      const acerto = await service.getSettlement(FAMILY_ID, USUARIO);

      expect(acerto.appliedMode).toBe(SplitMode.INCOME_PROPORTIONAL);
      expect(acerto.fallbackApplied).toBe(false);

      const bruno = acerto.entries.find((e) => e.responsible === 'bruno');
      const giovanna = acerto.entries.find((e) => e.responsible === 'giovanna');

      // 7.400 × 70% = 5.180   →   4.500 - 5.180 = -680 (Bruno ainda deve)
      expect(bruno).toMatchObject({
        targetPercent: 70,
        shouldHavePaid: 5180,
        balance: -680,
        status: 'PAGA',
      });
      // 7.400 × 30% = 2.220   →   2.900 - 2.220 = +680 (Giovanna adiantou)
      expect(giovanna).toMatchObject({
        targetPercent: 30,
        shouldHavePaid: 2220,
        balance: 680,
        status: 'RECEBE',
      });

      expect(acerto.transfers).toEqual([
        { from: 'bruno', to: 'giovanna', amount: 680 },
      ]);
    });

    it('deve expor a base de renda usada no cálculo', async () => {
      mockIncomeService.getRecurringMonthlyIncome.mockResolvedValue([
        { responsible: 'bruno', monthlyAmount: 7000 },
        { responsible: 'giovanna', monthlyAmount: 3000 },
      ]);

      const acerto = await service.getSettlement(FAMILY_ID, USUARIO);

      expect(acerto.incomeBasis).toEqual([
        { responsible: 'bruno', monthlyAmount: 7000 },
        { responsible: 'giovanna', monthlyAmount: 3000 },
      ]);
      expect(acerto.criteria).toContain('Proporcional à renda');
    });

    it('NÃO deve chutar 50/50 em silêncio quando não há renda cadastrada (regra 27)', async () => {
      mockIncomeService.getRecurringMonthlyIncome.mockResolvedValue([]);

      const acerto = await service.getSettlement(FAMILY_ID, USUARIO);

      // O modo configurado continua sendo o proporcional…
      expect(acerto.configuredMode).toBe(SplitMode.INCOME_PROPORTIONAL);
      // …mas o resultado diz claramente que aplicou outro critério.
      expect(acerto.appliedMode).toBe(SplitMode.EQUAL);
      expect(acerto.fallbackApplied).toBe(true);
      expect(acerto.criteria).toContain('FALTA DE DADOS');
      expect(acerto.warnings[0]).toContain('receita recorrente');

      // Os números seguem o critério anunciado: 50/50 sobre 7.400.
      expect(
        acerto.entries.every((e) => e.targetPercent === 50),
      ).toBe(true);
    });

    it('deve avisar quando apenas um dos responsáveis tem renda cadastrada', async () => {
      // Só a Giovanna tem receita recorrente: a renda da casa é 100% dela.
      mockIncomeService.getRecurringMonthlyIncome.mockResolvedValue([
        { responsible: 'giovanna', monthlyAmount: 3000 },
      ]);

      const acerto = await service.getSettlement(FAMILY_ID, USUARIO);

      expect(acerto.appliedMode).toBe(SplitMode.INCOME_PROPORTIONAL);
      expect(acerto.warnings.join(' ')).toContain('bruno');

      const bruno = acerto.entries.find((e) => e.responsible === 'bruno');
      const giovanna = acerto.entries.find((e) => e.responsible === 'giovanna');

      // Bruno entra com 0% porque não há renda dele registrada — e o aviso
      // acima explica exatamente isso, em vez de o sistema arbitrar um valor.
      expect(bruno?.targetPercent).toBe(0);
      expect(giovanna?.targetPercent).toBe(100);
      expect(bruno?.balance).toBe(4500);
      expect(giovanna?.balance).toBe(-4500); // 2.900 - 7.400
    });

    it('deve ignorar renda zerada e cair no critério igualitário anunciado', async () => {
      mockIncomeService.getRecurringMonthlyIncome.mockResolvedValue([
        { responsible: 'bruno', monthlyAmount: 0 },
        { responsible: 'giovanna', monthlyAmount: 0 },
      ]);

      const acerto = await service.getSettlement(FAMILY_ID, USUARIO);

      expect(acerto.appliedMode).toBe(SplitMode.EQUAL);
      expect(acerto.fallbackApplied).toBe(true);
      expect(acerto.incomeBasis).toEqual([]);
    });
  });

  describe('getSettlement — modo CUSTOM (percentuais manuais)', () => {
    beforeEach(() => {
      mockFinancialData.getExpensesByResponsible.mockResolvedValue(
        DESPESAS_BRUNO_E_GIOVANNA,
      );
    });

    it('deve aplicar os percentuais salvos pela família', async () => {
      mockSplitRuleRepository.findOne.mockResolvedValue({
        mode: SplitMode.CUSTOM,
        customPercentages: { bruno: 60, giovanna: 40 },
        notes: 'Acordo de 2026',
        updatedAt: new Date('2026-08-01T10:00:00.000Z'),
      });

      const acerto = await service.getSettlement(FAMILY_ID, USUARIO);

      expect(acerto.appliedMode).toBe(SplitMode.CUSTOM);

      const bruno = acerto.entries.find((e) => e.responsible === 'bruno');
      const giovanna = acerto.entries.find((e) => e.responsible === 'giovanna');

      // 7.400 × 60% = 4.440 → 4.500 - 4.440 = +60
      expect(bruno).toMatchObject({ shouldHavePaid: 4440, balance: 60 });
      // 7.400 × 40% = 2.960 → 2.900 - 2.960 = -60
      expect(giovanna).toMatchObject({ shouldHavePaid: 2960, balance: -60 });

      expect(acerto.transfers).toEqual([
        { from: 'giovanna', to: 'bruno', amount: 60 },
      ]);
    });

    it('deve avisar e usar 0% para responsável sem percentual definido', async () => {
      mockSplitRuleRepository.findOne.mockResolvedValue({
        mode: SplitMode.CUSTOM,
        customPercentages: { bruno: 100 },
        notes: null,
        updatedAt: new Date('2026-08-01T10:00:00.000Z'),
      });

      const acerto = await service.getSettlement(FAMILY_ID, USUARIO);

      expect(acerto.warnings.join(' ')).toContain('giovanna');
      expect(
        acerto.entries.find((e) => e.responsible === 'giovanna')?.targetPercent,
      ).toBe(0);
    });

    it('deve cair no critério igualitário, com aviso, se o modo CUSTOM não tiver percentuais', async () => {
      mockSplitRuleRepository.findOne.mockResolvedValue({
        mode: SplitMode.CUSTOM,
        customPercentages: null,
        notes: null,
        updatedAt: new Date('2026-08-01T10:00:00.000Z'),
      });

      const acerto = await service.getSettlement(FAMILY_ID, USUARIO);

      expect(acerto.appliedMode).toBe(SplitMode.EQUAL);
      expect(acerto.fallbackApplied).toBe(true);
      expect(acerto.warnings[0]).toContain('nenhum percentual foi salvo');
    });
  });

  describe('getSettlement — casos de borda', () => {
    it('deve devolver acerto vazio e aviso quando não há despesas', async () => {
      mockFinancialData.getExpensesByResponsible.mockResolvedValue([]);

      const acerto = await service.getSettlement(FAMILY_ID, USUARIO);

      expect(acerto.totalPaid).toBe(0);
      expect(acerto.entries).toEqual([]);
      expect(acerto.transfers).toEqual([]);
      expect(acerto.warnings[0]).toContain('Não há despesas lançadas');
    });

    it('deve deixar um único responsável quitado, sem transferência', async () => {
      mockFinancialData.getExpensesByResponsible.mockResolvedValue([
        { responsible: 'bruno', total: 3200, count: 9, share: 1 },
      ]);

      const acerto = await service.getSettlement(FAMILY_ID, USUARIO);

      expect(acerto.entries).toHaveLength(1);
      expect(acerto.entries[0]).toMatchObject({
        responsible: 'bruno',
        targetPercent: 100,
        shouldHavePaid: 3200,
        balance: 0,
        status: 'QUITADO',
      });
      expect(acerto.transfers).toEqual([]);
    });
  });

  // ==================== regra de rateio ====================

  describe('getRule', () => {
    it('deve devolver EQUAL marcado como padrão quando a família não salvou regra', async () => {
      mockSplitRuleRepository.findOne.mockResolvedValue(null);

      const regra = await service.getRule(FAMILY_ID);

      expect(regra).toEqual({
        mode: SplitMode.EQUAL,
        customPercentages: null,
        notes: null,
        isDefault: true,
        updatedAt: null,
      });
    });

    it('deve devolver a regra salva da família', async () => {
      const atualizadaEm = new Date('2026-08-10T12:00:00.000Z');
      mockSplitRuleRepository.findOne.mockResolvedValue({
        mode: SplitMode.CUSTOM,
        customPercentages: { bruno: 70, giovanna: 30 },
        notes: 'Proporcional acordado',
        updatedAt: atualizadaEm,
      });

      const regra = await service.getRule(FAMILY_ID);

      expect(regra).toEqual({
        mode: SplitMode.CUSTOM,
        customPercentages: { bruno: 70, giovanna: 30 },
        notes: 'Proporcional acordado',
        isDefault: false,
        updatedAt: atualizadaEm,
      });
    });
  });

  describe('setRule', () => {
    beforeEach(() => {
      mockSplitRuleRepository.create.mockImplementation((dados) => ({
        ...dados,
      }));
      mockSplitRuleRepository.save.mockImplementation(async (regra) => ({
        ...regra,
        updatedAt: new Date('2026-08-26T12:00:00.000Z'),
      }));
    });

    it('deve salvar percentuais CUSTOM que somam 100', async () => {
      const regra = await service.setRule(FAMILY_ID, {
        mode: SplitMode.CUSTOM,
        customPercentages: { bruno: 70, giovanna: 30 },
      });

      expect(regra.mode).toBe(SplitMode.CUSTOM);
      expect(regra.customPercentages).toEqual({ bruno: 70, giovanna: 30 });
      expect(regra.isDefault).toBe(false);
      expect(mockSplitRuleRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ familyId: FAMILY_ID }),
      );
    });

    it('deve recusar percentuais CUSTOM que não somam 100', async () => {
      await expect(
        service.setRule(FAMILY_ID, {
          mode: SplitMode.CUSTOM,
          customPercentages: { bruno: 70, giovanna: 40 },
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockSplitRuleRepository.save).not.toHaveBeenCalled();
    });

    it('deve recusar o modo CUSTOM sem nenhum percentual informado', async () => {
      await expect(
        service.setRule(FAMILY_ID, { mode: SplitMode.CUSTOM }),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve recusar percentual fora do intervalo de 0 a 100', async () => {
      await expect(
        service.setRule(FAMILY_ID, {
          mode: SplitMode.CUSTOM,
          customPercentages: { bruno: 130, giovanna: -30 },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve descartar percentuais manuais quando o modo não é CUSTOM', async () => {
      const regra = await service.setRule(FAMILY_ID, {
        mode: SplitMode.INCOME_PROPORTIONAL,
        customPercentages: { bruno: 70, giovanna: 30 },
      });

      expect(regra.mode).toBe(SplitMode.INCOME_PROPORTIONAL);
      expect(regra.customPercentages).toBeNull();
    });

    it('deve atualizar a regra existente em vez de criar outra', async () => {
      mockSplitRuleRepository.findOne.mockResolvedValue({
        id: 'regra-1',
        familyId: FAMILY_ID,
        mode: SplitMode.EQUAL,
        customPercentages: null,
        notes: null,
      });

      await service.setRule(FAMILY_ID, { mode: SplitMode.INCOME_PROPORTIONAL });

      expect(mockSplitRuleRepository.create).not.toHaveBeenCalled();
      expect(mockSplitRuleRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'regra-1',
          mode: SplitMode.INCOME_PROPORTIONAL,
        }),
      );
    });
  });
});
