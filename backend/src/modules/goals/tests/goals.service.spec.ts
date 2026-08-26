import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { GoalsService } from '../goals.service';
import { Goal, GoalStatus, GoalType } from '../entities/goal.entity';
import { FamiliesService } from '../../families/families.service';
import { User } from '../../users/entities/user.entity';

/**
 * Testes unitários do GoalsService.
 *
 * O repositório e o FamiliesService são mockados: o que está sob teste é a
 * regra de negócio das metas — o cálculo de progresso, a conclusão automática
 * no aporte e o escopo de leitura/escrita —, não o acesso ao banco.
 *
 * O "hoje" é sempre injetado explicitamente no cálculo de progresso para que os
 * meses restantes não dependam do relógio da máquina que roda a suíte.
 */
describe('GoalsService', () => {
  let service: GoalsService;

  const HOJE = new Date('2026-08-26T12:00:00.000Z');

  const bruno = {
    id: 'user-bruno',
    familyId: 'family-casa',
  } as User;

  const giovanna = {
    id: 'user-giovanna',
    familyId: 'family-casa',
  } as User;

  const mockGoalRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    softRemove: jest.fn(),
  };

  const mockFamiliesService = {
    getMemberIds: jest.fn(),
  };

  /** Monta uma meta com os valores mínimos, permitindo sobrescrever campos. */
  const criarMeta = (overrides: Partial<Goal> = {}): Goal =>
    ({
      id: 'goal-viagem',
      familyId: 'family-casa',
      userId: bruno.id,
      name: 'Viagem',
      type: GoalType.TRAVEL,
      targetAmount: 15000,
      currentAmount: 8000,
      deadline: new Date('2026-12-20T00:00:00.000Z'),
      monthlyContribution: 1000,
      status: GoalStatus.ACTIVE,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      ...overrides,
    }) as Goal;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoalsService,
        { provide: getRepositoryToken(Goal), useValue: mockGoalRepository },
        { provide: FamiliesService, useValue: mockFamiliesService },
      ],
    }).compile();

    service = module.get<GoalsService>(GoalsService);

    mockFamiliesService.getMemberIds.mockResolvedValue([
      bruno.id,
      giovanna.id,
    ]);
    mockGoalRepository.save.mockImplementation((goal: Goal) =>
      Promise.resolve(goal),
    );
    mockGoalRepository.create.mockImplementation((dados: Partial<Goal>) => ({
      ...dados,
    }));
  });

  it('deve ser definido', () => {
    expect(service).toBeDefined();
  });

  // ==================== cálculo de progresso ====================

  describe('calcularProgresso', () => {
    it('calcula o exemplo do escopo: viagem de R$ 15.000 com R$ 8.000 guardados', () => {
      const progresso = service.calcularProgresso(criarMeta(), HOJE);

      expect(progresso.progressPercentage).toBeCloseTo(53.33, 2);
      expect(progresso.remainingAmount).toBe(7000);
      // 26/08 até 20/12: agosto não conta (dia 20 < 26), setembro a dezembro = 4.
      expect(progresso.monthsRemaining).toBe(4);
      expect(progresso.requiredMonthlyContribution).toBe(1750);
      expect(progresso.isCompleted).toBe(false);
      expect(progresso.isOverdue).toBe(false);
    });

    it('aponta que o aporte planejado é insuficiente e mostra a diferença mensal', () => {
      const progresso = service.calcularProgresso(criarMeta(), HOJE);

      // Precisa de 1.750/mês, planejou 1.000 → faltam 750 por mês.
      expect(progresso.plannedMonthlyContribution).toBe(1000);
      expect(progresso.isPlannedContributionSufficient).toBe(false);
      expect(progresso.monthlyContributionGap).toBe(750);
      expect(progresso.message).toContain('não basta');
    });

    it('aponta que o aporte planejado é suficiente quando cobre o necessário', () => {
      const progresso = service.calcularProgresso(
        criarMeta({ monthlyContribution: 2000 }),
        HOJE,
      );

      expect(progresso.requiredMonthlyContribution).toBe(1750);
      expect(progresso.isPlannedContributionSufficient).toBe(true);
      expect(progresso.monthlyContributionGap).toBe(0);
      expect(progresso.willMeetDeadline).toBe(true);
    });

    it('projeta a conclusão no ritmo do aporte planejado', () => {
      const progresso = service.calcularProgresso(criarMeta(), HOJE);

      // 7.000 restantes ÷ 1.000 por mês = 7 meses → março de 2027.
      expect(progresso.projectedMonthsToComplete).toBe(7);
      expect(progresso.projectedCompletionDate?.getFullYear()).toBe(2027);
      expect(progresso.projectedCompletionDate?.getMonth()).toBe(2); // março
      // O prazo é dezembro/2026: no ritmo atual a meta não é atingida a tempo.
      expect(progresso.willMeetDeadline).toBe(false);
    });

    it('converte valores decimais que chegam do banco como string', () => {
      // O driver do PostgreSQL devolve `decimal` como texto; sem `Number()` a
      // soma vira concatenação e o percentual sai errado.
      const meta = criarMeta({
        targetAmount: '15000.00' as unknown as number,
        currentAmount: '8000.00' as unknown as number,
        monthlyContribution: '1000.00' as unknown as number,
      });

      const progresso = service.calcularProgresso(meta, HOJE);

      expect(progresso.targetAmount).toBe(15000);
      expect(progresso.currentAmount).toBe(8000);
      expect(progresso.remainingAmount).toBe(7000);
      expect(progresso.plannedMonthlyContribution).toBe(1000);
    });

    it('trata prazo vencido exigindo o valor restante de uma vez', () => {
      const progresso = service.calcularProgresso(
        criarMeta({ deadline: new Date('2026-05-10T00:00:00.000Z') }),
        HOJE,
      );

      expect(progresso.isOverdue).toBe(true);
      expect(progresso.monthsRemaining).toBe(0);
      expect(progresso.requiredMonthlyContribution).toBe(7000);
      expect(progresso.message).toContain('Prazo vencido');
    });

    it('trata meta já concluída sem exigir novos aportes', () => {
      const progresso = service.calcularProgresso(
        criarMeta({ currentAmount: 15000, status: GoalStatus.COMPLETED }),
        HOJE,
      );

      expect(progresso.isCompleted).toBe(true);
      expect(progresso.progressPercentage).toBe(100);
      expect(progresso.remainingAmount).toBe(0);
      expect(progresso.requiredMonthlyContribution).toBe(0);
      expect(progresso.isOverdue).toBe(false);
      expect(progresso.willMeetDeadline).toBe(true);
      expect(progresso.message).toContain('concluída');
    });

    it('limita o percentual a 100% quando o acumulado ultrapassa o objetivo', () => {
      const progresso = service.calcularProgresso(
        criarMeta({ currentAmount: 20000 }),
        HOJE,
      );

      expect(progresso.progressPercentage).toBe(100);
      expect(progresso.remainingAmount).toBe(0);
      expect(progresso.isCompleted).toBe(true);
    });

    it('não inventa percentual quando o valor objetivo é zero', () => {
      const progresso = service.calcularProgresso(
        criarMeta({ targetAmount: 0, currentAmount: 0 }),
        HOJE,
      );

      expect(progresso.progressPercentage).toBeNull();
      expect(progresso.requiredMonthlyContribution).toBeNull();
      expect(progresso.message).toContain('sem valor objetivo');
    });

    it('não calcula aporte necessário quando não há prazo, mas projeta o ritmo atual', () => {
      const progresso = service.calcularProgresso(
        criarMeta({ deadline: undefined }),
        HOJE,
      );

      expect(progresso.deadline).toBeNull();
      expect(progresso.monthsRemaining).toBeNull();
      expect(progresso.requiredMonthlyContribution).toBeNull();
      expect(progresso.isPlannedContributionSufficient).toBeNull();
      expect(progresso.projectedMonthsToComplete).toBe(7);
      expect(progresso.willMeetDeadline).toBeNull();
    });

    it('não projeta conclusão quando não há aporte mensal planejado', () => {
      const progresso = service.calcularProgresso(
        criarMeta({ monthlyContribution: undefined }),
        HOJE,
      );

      expect(progresso.plannedMonthlyContribution).toBeNull();
      expect(progresso.projectedMonthsToComplete).toBeNull();
      expect(progresso.projectedCompletionDate).toBeNull();
      expect(progresso.requiredMonthlyContribution).toBe(1750);
      expect(progresso.message).toContain('nenhum aporte mensal foi planejado');
    });

    it('conta zero mês restante quando o prazo vence ainda neste mês', () => {
      const progresso = service.calcularProgresso(
        criarMeta({ deadline: new Date('2026-08-31T00:00:00.000Z') }),
        HOJE,
      );

      // Dia 31 > dia 26 → ainda há o mês corrente.
      expect(progresso.monthsRemaining).toBe(1);
      expect(progresso.requiredMonthlyContribution).toBe(7000);
      expect(progresso.isOverdue).toBe(false);
    });
  });

  // ==================== aportes ====================

  describe('addContribution', () => {
    it('soma o aporte ao valor acumulado sem concatenar strings', async () => {
      // `currentAmount` chega como string do banco: 8000 + 500 = 8500, nunca "8000500".
      mockGoalRepository.findOne.mockResolvedValue(
        criarMeta({ currentAmount: '8000.00' as unknown as number }),
      );

      const resultado = await service.addContribution('goal-viagem', bruno, {
        amount: 500,
      });

      expect(resultado.currentAmount).toBe(8500);
      expect(resultado.status).toBe(GoalStatus.ACTIVE);
    });

    it('marca a meta como concluída ao atingir o objetivo', async () => {
      mockGoalRepository.findOne.mockResolvedValue(
        criarMeta({ currentAmount: 14500 }),
      );

      const resultado = await service.addContribution('goal-viagem', bruno, {
        amount: 500,
      });

      expect(resultado.currentAmount).toBe(15000);
      expect(resultado.status).toBe(GoalStatus.COMPLETED);
      expect(resultado.progress.isCompleted).toBe(true);
      expect(resultado.progress.progressPercentage).toBe(100);
    });

    it('registra a data do aporte informada pelo usuário', async () => {
      mockGoalRepository.findOne.mockResolvedValue(criarMeta());
      const data = new Date('2026-08-10T00:00:00.000Z');

      const resultado = await service.addContribution('goal-viagem', bruno, {
        amount: 200,
        date: data,
      });

      expect(resultado.lastContributionAt).toEqual(data);
    });

    it('permite que outro membro da família aporte na meta da casa', async () => {
      mockGoalRepository.findOne.mockResolvedValue(criarMeta());

      const resultado = await service.addContribution(
        'goal-viagem',
        giovanna,
        { amount: 300 },
      );

      expect(resultado.currentAmount).toBe(8300);
    });

    it('recusa aporte em meta cancelada', async () => {
      mockGoalRepository.findOne.mockResolvedValue(
        criarMeta({ status: GoalStatus.CANCELLED }),
      );

      await expect(
        service.addContribution('goal-viagem', bruno, { amount: 100 }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ==================== CRUD e escopo ====================

  describe('create', () => {
    it('associa a meta ao usuário e à família de quem criou', async () => {
      const resultado = await service.create(bruno, {
        name: 'Reserva de emergência',
        type: GoalType.EMERGENCY_FUND,
        targetAmount: 20000,
      });

      expect(resultado.userId).toBe(bruno.id);
      expect(resultado.familyId).toBe('family-casa');
      expect(resultado.currentAmount).toBe(0);
      expect(resultado.status).toBe(GoalStatus.ACTIVE);
    });

    it('já nasce concluída quando o valor atual informado cobre o objetivo', async () => {
      const resultado = await service.create(bruno, {
        name: 'Reserva de emergência',
        type: GoalType.EMERGENCY_FUND,
        targetAmount: 20000,
        currentAmount: 20000,
      });

      expect(resultado.status).toBe(GoalStatus.COMPLETED);
    });
  });

  describe('findOne', () => {
    it('devolve a meta com o progresso calculado', async () => {
      mockGoalRepository.findOne.mockResolvedValue(criarMeta());

      const resultado = await service.findOne('goal-viagem', bruno);

      expect(resultado.progress).toBeDefined();
      expect(resultado.progress.remainingAmount).toBe(7000);
    });

    it('lê no escopo da família, não apenas do próprio usuário', async () => {
      mockGoalRepository.findOne.mockResolvedValue(criarMeta());

      await service.findOne('goal-viagem', giovanna);

      const condicoes = mockGoalRepository.findOne.mock.calls[0][0].where;
      expect(mockFamiliesService.getMemberIds).toHaveBeenCalledWith(
        'family-casa',
      );
      expect(condicoes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ familyId: 'family-casa' }),
        ]),
      );
    });

    it('lança NotFoundException quando a meta não existe no escopo', async () => {
      mockGoalRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('inexistente', bruno)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update e remove', () => {
    it('reabre a meta quando o objetivo é aumentado acima do acumulado', async () => {
      mockGoalRepository.findOne.mockResolvedValue(
        criarMeta({ currentAmount: 15000, status: GoalStatus.COMPLETED }),
      );

      const resultado = await service.update('goal-viagem', bruno, {
        targetAmount: 20000,
      });

      expect(resultado.status).toBe(GoalStatus.ACTIVE);
      expect(resultado.progress.remainingAmount).toBe(5000);
    });

    it('respeita o status informado explicitamente', async () => {
      mockGoalRepository.findOne.mockResolvedValue(criarMeta());

      const resultado = await service.update('goal-viagem', bruno, {
        status: GoalStatus.CANCELLED,
      });

      expect(resultado.status).toBe(GoalStatus.CANCELLED);
    });

    it('impede que outro membro altere a meta que não cadastrou', async () => {
      mockGoalRepository.findOne.mockResolvedValue(criarMeta());

      await expect(
        service.update('goal-viagem', giovanna, { name: 'Outra viagem' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('impede que outro membro remova a meta que não cadastrou', async () => {
      mockGoalRepository.findOne.mockResolvedValue(criarMeta());

      await expect(service.remove('goal-viagem', giovanna)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockGoalRepository.softRemove).not.toHaveBeenCalled();
    });

    it('remove logicamente a meta do próprio criador', async () => {
      const meta = criarMeta();
      mockGoalRepository.findOne.mockResolvedValue(meta);

      await service.remove('goal-viagem', bruno);

      expect(mockGoalRepository.softRemove).toHaveBeenCalledWith(meta);
    });
  });

  // ==================== resumo ====================

  describe('getSummary', () => {
    it('agrega objetivo, acumulado e aportes das metas ativas e concluídas', async () => {
      mockGoalRepository.find.mockResolvedValue([
        criarMeta(), // 15.000 / 8.000, precisa 1.750, planejou 1.000
        criarMeta({
          id: 'goal-reserva',
          name: 'Reserva de emergência',
          type: GoalType.EMERGENCY_FUND,
          targetAmount: 10000,
          currentAmount: 10000,
          status: GoalStatus.COMPLETED,
          deadline: undefined,
          monthlyContribution: 500,
        }),
        criarMeta({
          id: 'goal-cancelada',
          name: 'Carro',
          type: GoalType.CAR,
          targetAmount: 50000,
          currentAmount: 1000,
          status: GoalStatus.CANCELLED,
        }),
      ]);

      const resumo = await service.getSummary(bruno);

      expect(resumo.totalGoals).toBe(3);
      expect(resumo.activeGoals).toBe(1);
      expect(resumo.completedGoals).toBe(1);
      expect(resumo.cancelledGoals).toBe(1);

      // A meta cancelada fica fora dos totais financeiros.
      expect(resumo.totalTargetAmount).toBe(25000);
      expect(resumo.totalCurrentAmount).toBe(18000);
      expect(resumo.totalRemainingAmount).toBe(7000);
      expect(resumo.overallProgressPercentage).toBe(72);

      // Aportes somam apenas as metas ATIVAS.
      expect(resumo.totalPlannedMonthlyContribution).toBe(1000);
      expect(resumo.totalRequiredMonthlyContribution).toBeGreaterThan(0);
      expect(resumo.monthlyContributionGap).toBeGreaterThan(0);
    });

    it('lista as metas em risco e o próximo prazo', async () => {
      mockGoalRepository.find.mockResolvedValue([
        criarMeta(), // aporte insuficiente
        criarMeta({
          id: 'goal-casa',
          name: 'Casa',
          type: GoalType.HOUSE,
          targetAmount: 30000,
          currentAmount: 1000,
          deadline: new Date('2026-01-10T00:00:00.000Z'), // vencida
          monthlyContribution: 100,
        }),
      ]);

      const resumo = await service.getSummary(bruno);

      expect(resumo.overdueGoals).toBe(1);
      expect(resumo.goalsAtRisk).toHaveLength(2);
      expect(resumo.goalsAtRisk.map((m) => m.id)).toEqual(
        expect.arrayContaining(['goal-viagem', 'goal-casa']),
      );
      expect(resumo.nextDeadline?.id).toBe('goal-casa');
    });

    it('devolve um resumo neutro quando não há metas cadastradas', async () => {
      mockGoalRepository.find.mockResolvedValue([]);

      const resumo = await service.getSummary(bruno);

      expect(resumo.totalGoals).toBe(0);
      expect(resumo.totalTargetAmount).toBe(0);
      expect(resumo.overallProgressPercentage).toBeNull();
      expect(resumo.goalsAtRisk).toEqual([]);
      expect(resumo.nextDeadline).toBeNull();
    });
  });

  describe('escopo sem família', () => {
    it('restringe a leitura ao próprio usuário quando ele não tem família', async () => {
      const semFamilia = { id: 'user-solo', familyId: undefined } as User;
      mockGoalRepository.find.mockResolvedValue([]);

      await service.findAll(semFamilia);

      const condicoes = mockGoalRepository.find.mock.calls[0][0].where;
      expect(mockFamiliesService.getMemberIds).not.toHaveBeenCalled();
      expect(condicoes).toHaveLength(1);
    });
  });
});
