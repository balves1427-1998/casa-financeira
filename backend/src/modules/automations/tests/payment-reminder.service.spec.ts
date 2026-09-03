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
 * Lembretes e alertas de vencimento.
 *
 * A REGRA: avisar o responsável três dias antes do vencimento e continuar
 * avisando — duas vezes por dia — até a conta ser marcada como paga,
 * sinalizando quando entra em atraso.
 *
 * O que estes testes fixam, e por quê:
 *  - a JANELA de contas avisadas (nem cedo demais, nem depois do teto);
 *  - que só um envio BEM-SUCEDIDO consome a janela do dia — uma falha de SMTP
 *    não pode custar o aviso;
 *  - que o alerta na aplicação sai mesmo sem e-mail configurado, para o aviso
 *    nunca depender de um canal só;
 *  - que o e-mail de atraso é distinto do lembrete comum.
 *
 * O que faz os avisos PARAREM não é testado aqui e sim no filtro da consulta:
 * contas `paid` e `cancelled` ficam fora da busca. Está coberto ponta a ponta.
 */
describe('PaymentReminderService', () => {
  let service: PaymentReminderService;

  const HOJE = new Date('2026-09-01T12:00:00.000Z');

  const usuario = {
    id: 'user-bruno',
    name: 'Bruno Alves',
    email: 'bruno@casa.com',
    familyId: 'familia-casa',
  } as User;

  const conta = (extra: Partial<PlannedAccount> = {}): PlannedAccount =>
    ({
      id: 'planned-internet',
      userId: usuario.id,
      description: 'Internet',
      amount: 120,
      dueDate: new Date('2026-09-04T00:00:00.000Z'),
      responsible: 'bruno',
      category: 'Moradia',
      status: 'pending',
      type: 'expense',
      ...extra,
    }) as PlannedAccount;

  /** QueryBuilder falso: guarda as condições para inspeção. */
  const criarQueryBuilder = () => {
    const qb: any = { state: { conditions: [] as string[], many: [] as any[] } };
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

  let plannedQb: any;
  let despesaQb: any;

  const mockReminderRepository: any = {
    find: jest.fn(async () => []),
    create: jest.fn((dados: any) => ({ ...dados })),
    save: jest.fn(async (dados: any) => ({ id: 'reminder-1', ...dados })),
  };

  const mockPlannedRepository: any = {
    createQueryBuilder: jest.fn(() => plannedQb),
  };

  // O aviso passou a cobrir também DESPESA não paga: a primeira ocorrência de
  // uma recorrente não vira conta planejada, e sem isto ela vencia calada.
  const mockExpenseRepository: any = {
    createQueryBuilder: jest.fn(() => despesaQb),
  };

  const mockUserRepository: any = {
    findOne: jest.fn(async () => usuario),
    find: jest.fn(async () => [usuario]),
  };

  const mockEmailService: any = {
    smtpConfigurado: true,
    sendEmail: jest.fn(async () => ({ success: true })),
  };

  const mockAlertService: any = {
    createAlert: jest.fn(async () => ({})),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    plannedQb = criarQueryBuilder();
    despesaQb = criarQueryBuilder();
    mockEmailService.smtpConfigurado = true;
    mockReminderRepository.find.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentReminderService,
        {
          provide: getRepositoryToken(PaymentReminder),
          useValue: mockReminderRepository,
        },
        {
          provide: getRepositoryToken(PlannedAccount),
          useValue: mockPlannedRepository,
        },
        {
          provide: getRepositoryToken(Expense),
          useValue: mockExpenseRepository,
        },
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
        { provide: EmailService, useValue: mockEmailService },
        { provide: AlertService, useValue: mockAlertService },
      ],
    }).compile();

    service = module.get<PaymentReminderService>(PaymentReminderService);
  });

  describe('quais contas entram no aviso', () => {
    it('busca apenas contas a PAGAR ainda em aberto', async () => {
      await service.dispatch('morning', HOJE);

      const condicoes = plannedQb.state.conditions.join(' | ');

      // Entrada prevista (salário) não é cobrança.
      expect(condicoes).toContain("planned.type = 'expense'");
      // `paid` e `cancelled` de fora: é isso que ENCERRA a série de avisos.
      expect(condicoes).toContain(
        "planned.status IN ('pending', 'confirmed', 'overdue')",
      );
      expect(condicoes).toContain('planned.dueDate BETWEEN :inicio AND :fim');
    });

    it('não envia nada quando não há conta na janela', async () => {
      plannedQb.state.many = [];

      const resultado = await service.dispatch('morning', HOJE);

      expect(resultado.lembretesEnviados).toBe(0);
      expect(mockEmailService.sendEmail).not.toHaveBeenCalled();
    });
  });

  describe('conteúdo do aviso', () => {
    it('avisa com o prazo certo três dias antes', async () => {
      plannedQb.state.many = [conta()];

      await service.dispatch('morning', HOJE);

      const enviado = mockEmailService.sendEmail.mock.calls[0][1] as any;

      expect(enviado.subject).toContain('Vence em 3 dias');
      expect(enviado.subject).toContain('Internet');
      expect(enviado.templateName).toBe('payment-reminder');
      expect(enviado.templateData.emAtraso).toBe(false);
      expect(enviado.templateData.diasAteVencer).toBe(3);
    });

    it('diz "vence hoje" no dia do vencimento', async () => {
      plannedQb.state.many = [
        conta({ dueDate: new Date('2026-09-01T00:00:00.000Z') }),
      ];

      await service.dispatch('morning', HOJE);

      const enviado = mockEmailService.sendEmail.mock.calls[0][1] as any;

      expect(enviado.subject).toContain('Vence hoje');
      expect(enviado.templateData.venceHoje).toBe(true);
    });

    it('sinaliza ATRASO quando o vencimento já passou', async () => {
      plannedQb.state.many = [
        conta({ dueDate: new Date('2026-08-27T00:00:00.000Z') }),
      ];

      await service.dispatch('morning', HOJE);

      const enviado = mockEmailService.sendEmail.mock.calls[0][1] as any;

      expect(enviado.subject).toContain('Em atraso há 5 dias');
      expect(enviado.templateData.emAtraso).toBe(true);
      expect(enviado.templateData.diasEmAtraso).toBe(5);

      // O alerta na aplicação acompanha a gravidade.
      const alerta = mockAlertService.createAlert.mock.calls[0][0] as any;
      expect(alerta.severity).toBe('critical');
    });

    it('usa singular quando falta apenas um dia', async () => {
      plannedQb.state.many = [
        conta({ dueDate: new Date('2026-09-02T00:00:00.000Z') }),
      ];

      await service.dispatch('morning', HOJE);

      const enviado = mockEmailService.sendEmail.mock.calls[0][1] as any;
      expect(enviado.subject).toContain('Vence em 1 dia');
      expect(enviado.subject).not.toContain('1 dias');
    });
  });

  describe('destinatário', () => {
    it('envia para o membro da família cujo nome bate com o responsável', async () => {
      const giovanna = {
        id: 'user-giovanna',
        name: 'Giovanna Inacio',
        email: 'giovanna@casa.com',
        familyId: 'familia-casa',
      } as User;

      mockUserRepository.find.mockResolvedValue([usuario, giovanna]);
      plannedQb.state.many = [conta({ responsible: 'giovanna' })];

      await service.dispatch('morning', HOJE);

      const enviado = mockEmailService.sendEmail.mock.calls[0][1] as any;
      expect(enviado.recipient).toBe('giovanna@casa.com');
    });

    it('cai para quem cadastrou quando o responsável não é membro', async () => {
      mockUserRepository.find.mockResolvedValue([usuario]);
      plannedQb.state.many = [conta({ responsible: 'fulano' })];

      await service.dispatch('morning', HOJE);

      // Melhor chegar a alguém da casa do que a ninguém.
      const enviado = mockEmailService.sendEmail.mock.calls[0][1] as any;
      expect(enviado.recipient).toBe('bruno@casa.com');
    });
  });

  describe('idempotência e retentativa', () => {
    it('não reenvia quando o aviso da janela JÁ FOI entregue', async () => {
      plannedQb.state.many = [conta()];
      mockReminderRepository.find.mockResolvedValue([
        { plannedAccountId: 'planned-internet', emailSent: true },
      ]);

      const resultado = await service.dispatch('morning', HOJE);

      expect(resultado.jaEnviados).toBe(1);
      expect(resultado.lembretesEnviados).toBe(0);
      expect(mockEmailService.sendEmail).not.toHaveBeenCalled();
    });

    it('TENTA DE NOVO quando a tentativa anterior falhou', async () => {
      plannedQb.state.many = [conta()];
      mockReminderRepository.find.mockResolvedValue([
        {
          id: 'reminder-anterior',
          plannedAccountId: 'planned-internet',
          emailSent: false,
          failureReason: 'SMTP fora do ar',
        },
      ]);

      const resultado = await service.dispatch('morning', HOJE);

      // Uma falha de transporte não pode consumir o aviso do dia.
      expect(resultado.lembretesEnviados).toBe(1);
      expect(mockEmailService.sendEmail).toHaveBeenCalled();
      // E reaproveita o registro, senão o índice único recusaria a inserção.
      expect(mockReminderRepository.create).not.toHaveBeenCalled();
    });

    it('registra o motivo quando o envio falha', async () => {
      plannedQb.state.many = [conta()];
      mockEmailService.sendEmail.mockRejectedValueOnce(
        new Error('conexão recusada'),
      );

      const resultado = await service.dispatch('morning', HOJE);

      expect(resultado.falhas).toBe(1);

      const gravado = mockReminderRepository.save.mock.calls.at(-1)![0] as any;
      expect(gravado.emailSent).toBe(false);
      expect(gravado.failureReason).toContain('conexão recusada');
    });
  });

  describe('o aviso não depende de um canal só', () => {
    it('cria o alerta na aplicação mesmo quando o e-mail falha', async () => {
      plannedQb.state.many = [conta()];
      mockEmailService.sendEmail.mockRejectedValueOnce(new Error('sem SMTP'));

      await service.dispatch('morning', HOJE);

      expect(mockAlertService.createAlert).toHaveBeenCalled();
      const alerta = mockAlertService.createAlert.mock.calls[0][0] as any;
      expect(alerta.type).toBe('account_due');
      expect(alerta.relatedEntityId).toBe('planned-internet');
    });

    it('informa no resultado que o SMTP não está configurado', async () => {
      mockEmailService.smtpConfigurado = false;
      plannedQb.state.many = [];

      const resultado = await service.dispatch('morning', HOJE);

      // É o que permite ao usuário descobrir por que nada chegou.
      expect(resultado.smtpConfigurado).toBe(false);
    });
  });
});
