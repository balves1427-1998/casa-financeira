import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RecurrenceService } from '../recurrence.service';
import { Expense } from '../../expenses/entities/expense.entity';
import { Income } from '../../income/entities/income.entity';
import { PlannedAccount } from '../../planned-accounts/entities/planned-account.entity';

/**
 * Testes da série recorrente.
 *
 * REGRA SOB TESTE: uma despesa lançada como recorrente se perpetua até ser
 * cancelada. Antes ela gerava UMA ocorrência e morria — o usuário via a conta em
 * setembro e mais nada, e precisava relançar tudo todo mês.
 *
 * O que estes testes fixam:
 *  - a janela cobre 12 meses, não um mês;
 *  - reabastecer não duplica (a leitura do Planejado chama isso o tempo todo);
 *  - a série redundante da segunda pessoa da casa é encerrada, e não fica
 *    adormecida esperando para reassumir;
 *  - cancelar limpa o futuro pendente e preserva o que já foi pago.
 */
describe('RecurrenceService', () => {
  let service: RecurrenceService;

  const USER_IDS = ['user-bruno', 'user-giovanna'];

  const despesaRecorrente = (extra: Partial<Expense> = {}): Expense =>
    ({
      id: 'expense-netflix',
      userId: 'user-bruno',
      description: 'Netflix',
      amount: 55.9,
      date: new Date('2026-08-10T12:00:00.000Z'),
      category: 'Assinaturas',
      responsible: 'bruno',
      isRecurring: true,
      frequency: 'monthly',
      ...extra,
    }) as unknown as Expense;

  /**
   * QueryBuilder falso.
   *
   * `getOne` responde a duas perguntas diferentes dentro de
   * `sincronizarSerie`: primeiro "qual a última ocorrência já gerada desta
   * série?", depois, uma vez por candidata, "já existe conta equivalente?".
   * O mock distingue pela ordem — `state.one` na primeira chamada,
   * `state.duplicata` (nula por padrão) nas seguintes. Sem isso, programar a
   * última ocorrência faria toda candidata parecer duplicada.
   */
  const criarQueryBuilder = () => {
    const qb: any = {
      state: { one: null, duplicata: null, many: [], rawMany: [], chamadas: 0 },
    };
    qb.select = jest.fn(() => qb);
    qb.addSelect = jest.fn(() => qb);
    qb.where = jest.fn(() => qb);
    qb.andWhere = jest.fn(() => qb);
    qb.orderBy = jest.fn(() => qb);
    qb.groupBy = jest.fn(() => qb);
    qb.getOne = jest.fn(async () => {
      qb.state.chamadas += 1;
      return qb.state.chamadas === 1 ? qb.state.one : qb.state.duplicata;
    });
    qb.getMany = jest.fn(async () => qb.state.many);
    qb.getRawMany = jest.fn(async () => qb.state.rawMany);
    return qb;
  };

  let plannedQb: any;

  const mockExpensesRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  };

  /**
   * A série passou a atender receitas também (salário recorrente projeta
   * ENTRADAS no Planejado). Estes testes cobrem o lado das despesas; o
   * repositório de receitas responde vazio.
   */
  const mockIncomesRepository = {
    find: jest.fn(async () => []),
    findOne: jest.fn(),
    update: jest.fn(),
  };

  const mockPlannedRepository = {
    createQueryBuilder: jest.fn(() => plannedQb),
    create: jest.fn((dados: any) => ({ id: `planned-${Math.random()}`, ...dados })),
    save: jest.fn(async (dados: any) => dados),
    softRemove: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    plannedQb = criarQueryBuilder();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecurrenceService,
        {
          provide: getRepositoryToken(Expense),
          useValue: mockExpensesRepository,
        },
        {
          provide: getRepositoryToken(Income),
          useValue: mockIncomesRepository,
        },
        {
          provide: getRepositoryToken(PlannedAccount),
          useValue: mockPlannedRepository,
        },
      ],
    }).compile();

    service = module.get<RecurrenceService>(RecurrenceService);
  });

  describe('sincronizarSerie', () => {
    it('projeta 12 meses, e não apenas o mês seguinte', async () => {
      const criadas = await service.sincronizarSerie(
        despesaRecorrente(),
        USER_IDS,
      );

      expect(criadas).toBe(12);
      expect(mockPlannedRepository.save).toHaveBeenCalledTimes(1);

      const linhas = mockPlannedRepository.save.mock.calls[0][0];
      expect(linhas).toHaveLength(12);
      // Todas ligadas à despesa de origem — é o que permite cancelar depois.
      linhas.forEach((linha: any) =>
        expect(linha.recurringExpenseId).toBe('expense-netflix'),
      );
    });

    it('não repete mês: um vencimento por competência', async () => {
      await service.sincronizarSerie(despesaRecorrente(), USER_IDS);

      const linhas = mockPlannedRepository.save.mock.calls[0][0];
      const competencias = linhas.map((l: any) =>
        `${l.dueDate.getFullYear()}-${l.dueDate.getMonth()}`,
      );

      expect(new Set(competencias).size).toBe(12);
    });

    it('continua de onde a série parou, sem recriar o que já existe', async () => {
      // A série já foi gerada até dezembro/2026.
      plannedQb.state.one = { dueDate: new Date('2026-12-10T00:00:00.000Z') };

      await service.sincronizarSerie(despesaRecorrente(), USER_IDS);

      const linhas = mockPlannedRepository.save.mock.calls[0][0];
      // Nada anterior a janeiro/2027 é recriado.
      linhas.forEach((linha: any) =>
        expect(linha.dueDate.getTime()).toBeGreaterThan(
          new Date('2026-12-10T00:00:00.000Z').getTime(),
        ),
      );
    });

    it('não projeta nada quando a despesa não é recorrente', async () => {
      const criadas = await service.sincronizarSerie(
        despesaRecorrente({ isRecurring: false }),
        USER_IDS,
      );

      expect(criadas).toBe(0);
      expect(mockPlannedRepository.save).not.toHaveBeenCalled();
    });

    it('não projeta nada quando a série foi cancelada', async () => {
      const criadas = await service.sincronizarSerie(
        despesaRecorrente({ recurrenceCancelledAt: new Date() }),
        USER_IDS,
      );

      expect(criadas).toBe(0);
      expect(mockPlannedRepository.save).not.toHaveBeenCalled();
    });

    it('encerra a série redundante da segunda pessoa da casa', async () => {
      // Toda ocorrência candidata já existe: a Giovanna lançou a mesma
      // assinatura que o Bruno. `getOne` responde tanto à busca da última
      // ocorrência da série quanto à checagem de duplicidade — aqui interessa
      // que a duplicidade sempre encontre algo.
      plannedQb.getOne = jest.fn(async () => ({ id: 'planned-existente' }));

      const criadas = await service.sincronizarSerie(
        despesaRecorrente({ id: 'expense-netflix-giovanna' }),
        USER_IDS,
      );

      expect(criadas).toBe(0);
      // Encerrada, e não deixada adormecida: uma série sem ocorrências próprias
      // reassumiria sozinha no dia em que a original fosse cancelada.
      expect(mockExpensesRepository.update).toHaveBeenCalledWith(
        'expense-netflix-giovanna',
        expect.objectContaining({ recurrenceCancelledAt: expect.any(Date) }),
      );
    });

    it('a data não escorrega quando o dia não existe no mês seguinte', async () => {
      await service.sincronizarSerie(
        despesaRecorrente({ date: new Date('2027-01-31T12:00:00.000Z') }),
        USER_IDS,
      );

      const linhas = mockPlannedRepository.save.mock.calls[0][0];
      const fevereiro = linhas[0].dueDate;

      // `setMonth` puro levaria 31/01 para 03/03.
      expect(fevereiro.getMonth()).toBe(1);
      expect(fevereiro.getDate()).toBe(28);
    });
  });

  describe('cancelarSerie', () => {
    it('marca a série como encerrada e remove o futuro pendente', async () => {
      const futuras = [{ id: 'p1' }, { id: 'p2' }];
      plannedQb.state.many = futuras;

      const removidas = await service.cancelarSerie(despesaRecorrente());

      expect(removidas).toBe(2);
      expect(mockExpensesRepository.update).toHaveBeenCalledWith(
        'expense-netflix',
        expect.objectContaining({ recurrenceCancelledAt: expect.any(Date) }),
      );
      expect(mockPlannedRepository.softRemove).toHaveBeenCalledWith(futuras);
    });

    it('não remove nada quando não há ocorrência futura pendente', async () => {
      plannedQb.state.many = [];

      const removidas = await service.cancelarSerie(despesaRecorrente());

      expect(removidas).toBe(0);
      expect(mockPlannedRepository.softRemove).not.toHaveBeenCalled();
    });
  });

  describe('sincronizarTodas', () => {
    it('ignora séries cuja janela ainda está longe do fim', async () => {
      mockExpensesRepository.find.mockResolvedValue([despesaRecorrente()]);
      mockIncomesRepository.find.mockResolvedValue([]);

      const bemAFrente = new Date();
      bemAFrente.setMonth(bemAFrente.getMonth() + 11);
      plannedQb.state.rawMany = [
        { serie: 'expense-netflix', ultima: bemAFrente.toISOString() },
      ];

      const criadas = await service.sincronizarTodas(USER_IDS);

      expect(criadas).toBe(0);
      expect(mockPlannedRepository.save).not.toHaveBeenCalled();
    });

    it('reabastece a série cuja janela encurtou', async () => {
      mockExpensesRepository.find.mockResolvedValue([despesaRecorrente()]);
      mockIncomesRepository.find.mockResolvedValue([]);

      const quaseAcabando = new Date();
      quaseAcabando.setMonth(quaseAcabando.getMonth() + 1);
      plannedQb.state.rawMany = [
        { serie: 'expense-netflix', ultima: quaseAcabando.toISOString() },
      ];
      plannedQb.state.one = { dueDate: quaseAcabando };

      const criadas = await service.sincronizarTodas(USER_IDS);

      expect(criadas).toBeGreaterThan(0);
    });

    it('não faz nada quando a casa não tem série ativa', async () => {
      mockExpensesRepository.find.mockResolvedValue([]);
      mockIncomesRepository.find.mockResolvedValue([]);

      await expect(service.sincronizarTodas(USER_IDS)).resolves.toBe(0);
    });
  });
});
