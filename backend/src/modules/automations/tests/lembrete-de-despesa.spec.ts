import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PaymentReminderService } from '../services/payment-reminder.service';
import { PaymentReminder } from '../entities/payment-reminder.entity';
import { PlannedAccount } from '../../planned-accounts/entities/planned-account.entity';
import { Expense } from '../../expenses/entities/expense.entity';
import { User } from '../../users/entities/user.entity';
import { EmailService } from '../services/email.service';
import { AlertService } from '../services/alert.service';

/**
 * O aviso de uma DESPESA ainda não paga.
 *
 * O CASO REAL QUE ORIGINOU ISTO
 * -----------------------------
 * Uma pessoa cadastrou catorze contas da casa como despesas recorrentes — Luz
 * dia 28, Água dia 28, Celular dia 25 — e não recebeu um único lembrete. A
 * causa: a projeção da série começa na ocorrência SEGUINTE, então o Planejado
 * dela só tinha outubro em diante, e o disparo, que olhava apenas o Planejado,
 * não enxergava nada vencendo no mês corrente. As catorze contas venceriam em
 * silêncio.
 *
 * Duplicá-las no Planejado resolveria o aviso e quebraria outra coisa: o mesmo
 * compromisso apareceria duas vezes em "a pagar no mês". A correção é avisar
 * sobre a despesa onde ela já está.
 */
describe('PaymentReminderService — despesa não paga', () => {
  let service: PaymentReminderService;
  let plannedQb: any;
  let despesaQb: any;

  const HOJE = new Date('2026-09-26T12:00:00.000Z');

  const usuario = {
    id: 'user-giovanna',
    name: 'Giovanna Raquel Inácio',
    email: 'giovanna@casa.com',
    familyId: 'familia-casa',
  } as User;

  const criarQueryBuilder = (retorno: any[] = []) => {
    const qb: any = { state: { conditions: [] as string[], many: retorno } };
    qb.where = jest.fn((c: string) => {
      qb.state.conditions.push(c);
      return qb;
    });
    qb.andWhere = jest.fn((c: string) => {
      qb.state.conditions.push(c);
      return qb;
    });
    qb.orderBy = jest.fn(() => qb);
    qb.getMany = jest.fn(async () => qb.state.many);
    return qb;
  };

  const despesaLuz = (extra: any = {}) =>
    ({
      id: 'despesa-luz',
      userId: usuario.id,
      description: 'Luz',
      amount: '415.94',
      date: new Date('2026-09-28T00:00:00.000Z'),
      dueDate: new Date('2026-09-28T00:00:00.000Z'),
      responsible: 'giovanna',
      category: 'Moradia',
      paymentMethod: 'debit',
      isPaid: false,
      ...extra,
    }) as unknown as Expense;

  const mockReminderRepository: any = {
    find: jest.fn(async () => []),
    create: jest.fn((dados: any) => ({ ...dados })),
    save: jest.fn(async (dados: any) => ({ id: 'reminder-1', ...dados })),
  };

  const mockEmailService: any = {
    smtpConfigurado: true,
    sendEmail: jest.fn(async () => ({ success: true })),
  };

  const montar = async (despesas: any[], planejadas: any[] = []) => {
    jest.clearAllMocks();
    mockReminderRepository.find.mockResolvedValue([]);
    plannedQb = criarQueryBuilder(planejadas);
    despesaQb = criarQueryBuilder(despesas);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentReminderService,
        {
          provide: getRepositoryToken(PaymentReminder),
          useValue: mockReminderRepository,
        },
        {
          provide: getRepositoryToken(PlannedAccount),
          useValue: { createQueryBuilder: () => plannedQb },
        },
        {
          provide: getRepositoryToken(Expense),
          useValue: { createQueryBuilder: () => despesaQb },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: async () => usuario,
            find: async () => [usuario],
          },
        },
        { provide: EmailService, useValue: mockEmailService },
        { provide: AlertService, useValue: { createAlert: async () => ({}) } },
      ],
    }).compile();

    service = module.get(PaymentReminderService);
    return service;
  };

  it('avisa sobre a despesa que vence e ainda não foi paga', async () => {
    await montar([despesaLuz()]);

    const r = await service.dispatch('morning', HOJE);

    expect(r.lembretesEnviados).toBe(1);
    expect(mockEmailService.sendEmail).toHaveBeenCalledTimes(1);

    const [, email] = mockEmailService.sendEmail.mock.calls[0];
    expect(email.recipient).toBe('giovanna@casa.com');
    expect(email.subject).toContain('Luz');
    expect(email.relatedEntityType).toBe('expense');
  });

  it('a busca exclui o que já foi pago e a compra no cartão', async () => {
    await montar([]);
    await service.dispatch('morning', HOJE);

    const condicoes = despesaQb.state.conditions.join(' | ');

    expect(condicoes).toContain('expense.isPaid = false');
    // Compra no cartão não vence sozinha: vence dentro da fatura, que já entra
    // como conta planejada. Avisar as duas cobraria o mesmo dinheiro em dobro.
    expect(condicoes).toContain('credit');
    expect(condicoes).toContain('COALESCE(expense.dueDate, expense.date)');
  });

  it('o registro aponta para a DESPESA, não para uma conta planejada', async () => {
    await montar([despesaLuz()]);
    await service.dispatch('morning', HOJE);

    const gravado = mockReminderRepository.create.mock.calls[0][0];
    expect(gravado.expenseId).toBe('despesa-luz');
    expect(gravado.plannedAccountId).toBeNull();
  });

  it('não reenvia quando o aviso do dia já saiu para aquela despesa', async () => {
    await montar([despesaLuz()]);
    mockReminderRepository.find.mockResolvedValue([
      {
        id: 'reminder-antigo',
        expenseId: 'despesa-luz',
        plannedAccountId: null,
        emailSent: true,
      },
    ]);

    const r = await service.dispatch('morning', HOJE);

    expect(r.jaEnviados).toBe(1);
    expect(mockEmailService.sendEmail).not.toHaveBeenCalled();
  });

  it('planejado e despesa convivem no mesmo disparo, em ordem de vencimento', async () => {
    const planejada = {
      id: 'planned-aluguel',
      userId: usuario.id,
      description: 'Aluguel',
      amount: 1800,
      dueDate: new Date('2026-09-27T00:00:00.000Z'),
      responsible: 'giovanna',
      category: 'Moradia',
    };

    await montar([despesaLuz()], [planejada]);

    const r = await service.dispatch('morning', HOJE);

    expect(r.contasAvaliadas).toBe(2);
    expect(r.lembretesEnviados).toBe(2);

    // O que vence antes é avisado antes.
    const assuntos = mockEmailService.sendEmail.mock.calls.map(
      (c: any[]) => c[1].subject,
    );
    expect(assuntos[0]).toContain('Aluguel');
    expect(assuntos[1]).toContain('Luz');
  });

  it('o e-mail diz quantos dias faltam, contando da data de vencimento', async () => {
    await montar([despesaLuz()]);
    await service.dispatch('morning', HOJE);

    const [, email] = mockEmailService.sendEmail.mock.calls[0];
    // 26/09 → 28/09 são dois dias.
    expect(email.templateData.diasAteVencer).toBe(2);
  });
});
