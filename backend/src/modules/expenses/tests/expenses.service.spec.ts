import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ExpensesService } from '../expenses.service';
import { Expense } from '../entities/expense.entity';
import { FamiliesService } from '../../families/families.service';
import { User } from '../../users/entities/user.entity';
import { PlannedAccount } from '../../planned-accounts/entities/planned-account.entity';
import { RecurrenceService } from '../../recurrence/recurrence.service';

/**
 * Testes unitários do ExpensesService — escopo de leitura por FAMÍLIA.
 *
 * O ponto sob teste é a regra "ler é coletivo, escrever é individual": Bruno e
 * Giovanna moram na mesma casa e precisam enxergar os lançamentos um do outro
 * (senão a lista de despesas não bate com o dashboard, que sempre agregou por
 * família), mas só quem lançou pode alterar ou apagar o próprio registro.
 *
 * Nenhum banco é tocado: o repositório e o `FamiliesService` são mockados. O
 * mock do QueryBuilder registra as condições recebidas, permitindo afirmar que
 * a consulta foi montada com `userId IN (:...userIds)` e com os ids certos.
 */
describe('ExpensesService', () => {
  let service: ExpensesService;

  const FAMILY_ID = 'family-casa';

  const BRUNO = {
    id: 'user-bruno',
    familyId: FAMILY_ID,
  } as User;

  const GIOVANNA = {
    id: 'user-giovanna',
    familyId: FAMILY_ID,
  } as User;

  /** Usuário em estado transitório: cadastrado, mas ainda sem família. */
  const SEM_FAMILIA = {
    id: 'user-solo',
    familyId: undefined,
  } as unknown as User;

  const DESPESA_DA_GIOVANNA = {
    id: 'expense-giovanna',
    userId: GIOVANNA.id,
    description: 'Mercado',
    amount: 320.5,
    responsible: 'giovanna',
  } as Expense;

  const DESPESA_DO_BRUNO = {
    id: 'expense-bruno',
    userId: BRUNO.id,
    description: 'Combustível',
    amount: 180,
    responsible: 'bruno',
  } as Expense;

  /**
   * QueryBuilder falso: encadeia como o do TypeORM e guarda todas as condições
   * e parâmetros para inspeção nos testes.
   */
  const criarQueryBuilder = () => {
    const state = {
      conditions: [] as string[],
      params: {} as Record<string, any>,
      many: [] as Expense[],
      one: null as Expense | null,
      raw: null as any,
      rawMany: [] as any[],
    };

    const qb: any = {
      state,
      select: jest.fn(() => qb),
      addSelect: jest.fn(() => qb),
      leftJoinAndSelect: jest.fn(() => qb),
      groupBy: jest.fn(() => qb),
      orderBy: jest.fn(() => qb),
      where: jest.fn((condition: string, params: Record<string, any> = {}) => {
        state.conditions.push(condition);
        Object.assign(state.params, params);
        return qb;
      }),
      andWhere: jest.fn(
        (condition: string, params: Record<string, any> = {}) => {
          state.conditions.push(condition);
          Object.assign(state.params, params);
          return qb;
        },
      ),
      getMany: jest.fn(async () => state.many),
      getOne: jest.fn(async () => state.one),
      getRawOne: jest.fn(async () => state.raw),
      getRawMany: jest.fn(async () => state.rawMany),
    };

    return qb;
  };

  let queryBuilder: any;

  const mockExpensesRepository = {
    createQueryBuilder: jest.fn(() => queryBuilder),
    create: jest.fn(),
    save: jest.fn(),
    softRemove: jest.fn(),
    // Usado para gravar o vínculo com a conta planejada recém-criada.
    update: jest.fn(),
  };

  const mockFamiliesService = {
    getMemberIds: jest.fn(),
  };

  /**
   * Repositório de contas planejadas.
   *
   * O service passou a criar a próxima ocorrência no Planejado quando a
   * despesa é recorrente; sem este mock o módulo de teste nem compila.
   */
  let plannedQueryBuilder: any;

  const mockPlannedAccountsRepository = {
    createQueryBuilder: jest.fn(() => plannedQueryBuilder),
    create: jest.fn((dados: any) => dados),
    save: jest.fn(async (dados: any) => ({ id: 'planned-novo', ...dados })),
    update: jest.fn(),
  };

  /**
   * A projeção da série recorrente tem testes próprios em
   * `modules/recurrence`. Aqui interessa apenas que o ExpensesService a aciona
   * na hora certa — e que uma falha dela não derruba o lançamento da despesa.
   */
  const mockRecurrenceService = {
    sincronizarSerie: jest.fn(async () => 12),
    cancelarSerie: jest.fn(async () => 12),
    reativarSerie: jest.fn(async () => 12),
    sincronizarTodas: jest.fn(async () => 0),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    queryBuilder = criarQueryBuilder();

    // Por padrão, nenhuma conta planejada equivalente existe — a checagem de
    // duplicidade não encontra nada e a criação segue em frente.
    plannedQueryBuilder = criarQueryBuilder();
    plannedQueryBuilder.getOne.mockResolvedValue(null);

    // Por padrão, a casa tem os dois responsáveis.
    mockFamiliesService.getMemberIds.mockResolvedValue([
      BRUNO.id,
      GIOVANNA.id,
    ]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpensesService,
        {
          provide: getRepositoryToken(Expense),
          useValue: mockExpensesRepository,
        },
        {
          provide: getRepositoryToken(PlannedAccount),
          useValue: mockPlannedAccountsRepository,
        },
        { provide: FamiliesService, useValue: mockFamiliesService },
        { provide: RecurrenceService, useValue: mockRecurrenceService },
      ],
    }).compile();

    service = module.get<ExpensesService>(ExpensesService);
  });

  it('deve ser definido', () => {
    expect(service).toBeDefined();
  });

  describe('escopo de leitura por família', () => {
    it('traz o lançamento de OUTRO membro da família na listagem', async () => {
      queryBuilder.state.many = [DESPESA_DO_BRUNO, DESPESA_DA_GIOVANNA];

      const despesas = await service.findAll(BRUNO);

      // Bruno consulta e enxerga a despesa lançada pela Giovanna.
      expect(despesas).toHaveLength(2);
      expect(despesas.map((d) => d.userId)).toContain(GIOVANNA.id);

      expect(mockFamiliesService.getMemberIds).toHaveBeenCalledWith(FAMILY_ID);
      expect(queryBuilder.state.conditions).toContain(
        'expense.userId IN (:...userIds)',
      );
      expect(queryBuilder.state.params.userIds).toEqual([
        BRUNO.id,
        GIOVANNA.id,
      ]);
    });

    it('permite consultar por id um lançamento de outro membro', async () => {
      queryBuilder.state.one = DESPESA_DA_GIOVANNA;

      const despesa = await service.findOne(DESPESA_DA_GIOVANNA.id, BRUNO);

      expect(despesa).toBe(DESPESA_DA_GIOVANNA);
      expect(queryBuilder.state.params.userIds).toEqual([
        BRUNO.id,
        GIOVANNA.id,
      ]);
    });

    it('lança NotFoundException quando o lançamento está fora do escopo da família', async () => {
      queryBuilder.state.one = null;

      await expect(service.findOne('expense-de-terceiro', BRUNO)).rejects.toThrow(
        NotFoundException,
      );
    });

    it.each([
      ['findByCategory', () => service.findByCategory(BRUNO, 'supermercado')],
      ['findByResponsible', () => service.findByResponsible(BRUNO, 'giovanna')],
      [
        'findByDateRange',
        () =>
          service.findByDateRange(
            BRUNO,
            new Date('2026-08-01'),
            new Date('2026-08-31'),
          ),
      ],
      ['findRecurring', () => service.findRecurring(BRUNO)],
      ['findInstallments', () => service.findInstallments(BRUNO)],
    ])('%s consulta no escopo da família', async (_nome, executar) => {
      queryBuilder.state.many = [DESPESA_DA_GIOVANNA];

      const despesas = await executar();

      expect(despesas).toEqual([DESPESA_DA_GIOVANNA]);
      expect(queryBuilder.state.conditions).toContain(
        'expense.userId IN (:...userIds)',
      );
      expect(queryBuilder.state.params.userIds).toEqual([
        BRUNO.id,
        GIOVANNA.id,
      ]);
    });

    it('findInstallments filtra pela parcela quando o número é informado', async () => {
      queryBuilder.state.many = [];

      await service.findInstallments(BRUNO, 3);

      expect(queryBuilder.state.conditions).toContain(
        'expense.currentInstallment = :installmentNumber',
      );
      expect(queryBuilder.state.params.installmentNumber).toBe(3);
    });
  });

  describe('usuário sem família', () => {
    it('enxerga apenas os próprios lançamentos', async () => {
      queryBuilder.state.many = [];

      await service.findAll(SEM_FAMILIA);

      // Sem família não há a quem perguntar os membros.
      expect(mockFamiliesService.getMemberIds).not.toHaveBeenCalled();
      expect(queryBuilder.state.params.userIds).toEqual([SEM_FAMILIA.id]);
    });

    it('cai no próprio id quando a família não retorna membros', async () => {
      mockFamiliesService.getMemberIds.mockResolvedValue([]);
      queryBuilder.state.many = [];

      await service.findAll(BRUNO);

      expect(queryBuilder.state.params.userIds).toEqual([BRUNO.id]);
    });
  });

  describe('escrita individual', () => {
    it('impede editar lançamento de outro membro (ForbiddenException)', async () => {
      queryBuilder.state.one = DESPESA_DA_GIOVANNA;

      await expect(
        service.update(DESPESA_DA_GIOVANNA.id, BRUNO, { amount: 999 } as any),
      ).rejects.toThrow(ForbiddenException);

      expect(mockExpensesRepository.save).not.toHaveBeenCalled();
    });

    it('impede remover lançamento de outro membro (ForbiddenException)', async () => {
      queryBuilder.state.one = DESPESA_DA_GIOVANNA;

      await expect(
        service.delete(DESPESA_DA_GIOVANNA.id, BRUNO),
      ).rejects.toThrow(ForbiddenException);

      expect(mockExpensesRepository.softRemove).not.toHaveBeenCalled();
    });

    it('edita o próprio lançamento com sucesso', async () => {
      const propria = { ...DESPESA_DO_BRUNO } as Expense;
      queryBuilder.state.one = propria;
      mockExpensesRepository.save.mockImplementation(async (e: Expense) => e);

      const atualizada = await service.update(propria.id, BRUNO, {
        description: 'Combustível — posto Shell',
      } as any);

      expect(atualizada.description).toBe('Combustível — posto Shell');
      expect(mockExpensesRepository.save).toHaveBeenCalledWith(propria);
    });

    it('ignora tentativa de trocar a autoria (userId) na edição', async () => {
      const propria = { ...DESPESA_DO_BRUNO } as Expense;
      queryBuilder.state.one = propria;
      mockExpensesRepository.save.mockImplementation(async (e: Expense) => e);

      const atualizada = await service.update(propria.id, BRUNO, {
        userId: GIOVANNA.id,
        amount: 200,
      } as any);

      expect(atualizada.userId).toBe(BRUNO.id);
      expect(atualizada.amount).toBe(200);
    });

    it('remove o próprio lançamento com sucesso', async () => {
      const propria = { ...DESPESA_DO_BRUNO } as Expense;
      queryBuilder.state.one = propria;

      await service.delete(propria.id, BRUNO);

      expect(mockExpensesRepository.softRemove).toHaveBeenCalledWith(propria);
    });

    it('grava a autoria do usuário logado ao criar', async () => {
      mockExpensesRepository.create.mockImplementation((dados: any) => dados);
      mockExpensesRepository.save.mockImplementation(async (e: any) => ({
        ...e,
        id: 'nova-despesa',
      }));

      const criada = await service.create(GIOVANNA, {
        description: 'Farmácia',
        amount: 75.9,
      } as any);

      expect(mockExpensesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: GIOVANNA.id }),
      );
      expect(criada.id).toBe('nova-despesa');
    });
  });

  describe('somas com decimal vindo como string', () => {
    // O driver do Postgres devolve colunas `decimal` como string; sem `Number`
    // a soma vira concatenação ("100" + "20" = "10020").
    it('getMonthlyTotal converte a string em número', async () => {
      queryBuilder.state.raw = { total: '1234.56' };

      const total = await service.getMonthlyTotal(BRUNO, 8, 2026);

      expect(total).toBe(1234.56);
      expect(typeof total).toBe('number');
    });

    it('getTotalByCategory converte a string em número', async () => {
      queryBuilder.state.raw = { total: '890.10' };

      const total = await service.getTotalByCategory(BRUNO, 'supermercado');

      expect(total).toBe(890.1);
      expect(typeof total).toBe('number');
    });

    it('getTotalByResponsible converte a string em número', async () => {
      queryBuilder.state.raw = { total: '2900.00' };

      const total = await service.getTotalByResponsible(BRUNO, 'giovanna');

      expect(total).toBe(2900);
      expect(typeof total).toBe('number');
    });

    it('getDailyAverage divide números, não concatena strings', async () => {
      queryBuilder.state.raw = { total: '3000.00' };

      const media = await service.getDailyAverage(BRUNO, 30);

      expect(media).toBe(100);
    });

    it('retorna 0 quando não há lançamentos no período', async () => {
      queryBuilder.state.raw = { total: null };

      await expect(service.getMonthlyTotal(BRUNO, 1, 2026)).resolves.toBe(0);
    });

    it('getCategoryBreakdown converte total e count de cada linha', async () => {
      queryBuilder.state.rawMany = [
        { category: 'supermercado', total: '1200.50', count: '12' },
        { category: 'transporte', total: '300.00', count: '4' },
      ];

      const breakdown = await service.getCategoryBreakdown(BRUNO);

      expect(breakdown).toEqual([
        { category: 'supermercado', total: 1200.5, count: 12 },
        { category: 'transporte', total: 300, count: 4 },
      ]);

      // A soma dos totais precisa ser aritmética, não textual.
      const soma = breakdown.reduce((acc, linha) => acc + linha.total, 0);
      expect(soma).toBe(1500.5);

      expect(queryBuilder.state.params.userIds).toEqual([
        BRUNO.id,
        GIOVANNA.id,
      ]);
    });
  });

  /**
   * Despesa recorrente aciona a série.
   *
   * A projeção em si (12 meses, sem duplicar, avanço de mês correto) é testada
   * em `modules/recurrence`. Aqui o que importa é o contrato entre os dois: a
   * despesa recorrente ACIONA a série, a comum não, e uma falha na projeção não
   * pode derrubar o lançamento — o gasto é o fato, a projeção é derivada dele.
   */
  describe('despesa recorrente aciona a série', () => {
    const montarDespesa = (extra: Partial<Expense> = {}) => {
      const base = {
        id: 'expense-aluguel',
        userId: BRUNO.id,
        description: 'Aluguel',
        amount: 1800,
        date: new Date('2026-08-05T00:00:00.000Z'),
        category: 'Moradia',
        responsible: 'bruno',
        paymentMethod: 'transfer',
        isRecurring: true,
        frequency: 'monthly',
        isPaid: false,
        ...extra,
      } as unknown as Expense;

      mockExpensesRepository.create.mockReturnValue(base);
      mockExpensesRepository.save.mockResolvedValue(base);

      return base;
    };

    it('projeta a série no escopo da família', async () => {
      const despesa = montarDespesa();

      await service.create(BRUNO, {} as any);

      expect(mockRecurrenceService.sincronizarSerie).toHaveBeenCalledWith(
        despesa,
        [BRUNO.id, GIOVANNA.id],
      );
    });

    it('não aciona a série quando a despesa não é recorrente', async () => {
      montarDespesa({ isRecurring: false } as Partial<Expense>);

      await service.create(BRUNO, {} as any);

      expect(mockRecurrenceService.sincronizarSerie).not.toHaveBeenCalled();
    });

    it('a falha ao projetar não derruba o lançamento da despesa', async () => {
      montarDespesa();
      mockRecurrenceService.sincronizarSerie.mockRejectedValueOnce(
        new Error('banco indisponível'),
      );

      await expect(service.create(BRUNO, {} as any)).resolves.toBeDefined();
    });
  });

  describe('cancelar e retomar a recorrência', () => {
    const RECORRENTE = {
      id: 'expense-bruno',
      userId: BRUNO.id,
      description: 'Netflix',
      amount: 55.9,
      isRecurring: true,
    } as Expense;

    beforeEach(() => {
      queryBuilder.getOne.mockResolvedValue({ ...RECORRENTE });
    });

    it('cancelar encerra a série', async () => {
      await service.setRecurrenceActive('expense-bruno', BRUNO, false);

      expect(mockRecurrenceService.cancelarSerie).toHaveBeenCalled();
      expect(mockRecurrenceService.reativarSerie).not.toHaveBeenCalled();
    });

    it('retomar reprojeta a série', async () => {
      await service.setRecurrenceActive('expense-bruno', BRUNO, true);

      expect(mockRecurrenceService.reativarSerie).toHaveBeenCalled();
      expect(mockRecurrenceService.cancelarSerie).not.toHaveBeenCalled();
    });

    it('recusa despesa que não foi lançada como recorrente', async () => {
      queryBuilder.getOne.mockResolvedValue({
        ...RECORRENTE,
        isRecurring: false,
      });

      await expect(
        service.setRecurrenceActive('expense-bruno', BRUNO, false),
      ).rejects.toThrow(BadRequestException);
    });

    it('só quem lançou pode encerrar a recorrência', async () => {
      queryBuilder.getOne.mockResolvedValue({
        ...DESPESA_DA_GIOVANNA,
        isRecurring: true,
      });

      await expect(
        service.setRecurrenceActive('expense-giovanna', BRUNO, false),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('marcar como paga', () => {
    const DESPESA_PENDENTE = {
      id: 'expense-bruno',
      userId: BRUNO.id,
      description: 'Internet',
      amount: 120,
      isPaid: false,
    } as Expense;

    beforeEach(() => {
      queryBuilder.getOne.mockResolvedValue({ ...DESPESA_PENDENTE });
      mockExpensesRepository.save.mockImplementation(async (e: any) => e);
    });

    it('marca a despesa e registra a data do pagamento', async () => {
      const resultado = await service.setPaid('expense-bruno', BRUNO, true);

      expect(resultado.isPaid).toBe(true);
      expect(resultado.paidAt).toBeInstanceOf(Date);
    });

    it('desmarcar limpa a data do pagamento', async () => {
      queryBuilder.getOne.mockResolvedValue({
        ...DESPESA_PENDENTE,
        isPaid: true,
        paidAt: new Date(),
      });

      const resultado = await service.setPaid('expense-bruno', BRUNO, false);

      expect(resultado.isPaid).toBe(false);
      expect(resultado.paidAt).toBeUndefined();
    });

    it('propaga o pagamento para a conta planejada vinculada', async () => {
      queryBuilder.getOne.mockResolvedValue({
        ...DESPESA_PENDENTE,
        plannedAccountId: 'planned-aluguel',
      });

      await service.setPaid('expense-bruno', BRUNO, true);

      expect(mockPlannedAccountsRepository.update).toHaveBeenCalledWith(
        'planned-aluguel',
        expect.objectContaining({ status: 'paid' }),
      );
    });

    it('só quem lançou pode marcar como paga', async () => {
      queryBuilder.getOne.mockResolvedValue({ ...DESPESA_DA_GIOVANNA });

      await expect(
        service.setPaid('expense-giovanna', BRUNO, true),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('resumo de contas pagas no mês', () => {
    it('converte a contagem e o total, que vêm como texto do Postgres', async () => {
      queryBuilder.state.raw = { count: '4', total: '5820.00' };

      const resumo = await service.getPaidSummary(BRUNO, 8, 2026);

      expect(resumo).toEqual({ count: 4, total: 5820 });
    });

    it('conta no escopo da família, não só de quem pergunta', async () => {
      queryBuilder.state.raw = { count: '2', total: '300.00' };

      await service.getPaidSummary(BRUNO, 8, 2026);

      expect(queryBuilder.state.params.userIds).toEqual([
        BRUNO.id,
        GIOVANNA.id,
      ]);
    });

    it('devolve zero quando o mês não teve pagamento', async () => {
      queryBuilder.state.raw = { count: '0', total: null };

      await expect(service.getPaidSummary(BRUNO, 2, 2026)).resolves.toEqual({
        count: 0,
        total: 0,
      });
    });
  });
});
