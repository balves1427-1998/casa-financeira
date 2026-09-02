import { PlannedAccountsService } from '../planned-accounts.service';

/**
 * Confirmar uma ENTRADA prevista.
 *
 * O que o usuário relatou: no Planejado, uma entrada só oferecia "Pagar", e
 * confirmar não somava nada nas receitas. A metade visível era o rótulo; a
 * metade invisível estava aqui — quando a entrada tinha sido cadastrada sem
 * conta de destino, o serviço desistia em SILÊNCIO: o card virava "pago" e
 * receita nenhuma era criada. Nada na tela dizia que o valor tinha sumido.
 *
 * O segundo ponto que estes testes fixam é a DATA. Gravar sempre "hoje" jogava
 * o salário que caiu dia 5 para o dia em que você lembrou de registrar — e, no
 * virar do mês, para a competência errada.
 */
describe('PlannedAccountsService — confirmar entrada', () => {
  const montar = (conta: any, contas: any[] = []) => {
    const receitasCriadas: any[] = [];
    const despesasCriadas: any[] = [];

    const service = new PlannedAccountsService(
      {
        findOne: async () => conta,
        save: async (c: any) => c,
      } as any,
      {
        findOne: async () => null,
        create: (d: any) => d,
        save: async (d: any) => {
          despesasCriadas.push(d);
          return d;
        },
      } as any,
      {
        findOne: async () => null,
        create: (d: any) => d,
        save: async (d: any) => {
          receitasCriadas.push(d);
          return d;
        },
      } as any,
      { findOne: async () => contas[0] ?? null } as any,
      { getMemberIds: async () => ['user-1'] } as any,
      { sincronizarTodas: async () => undefined } as any,
    );

    return { service, receitasCriadas, despesasCriadas };
  };

  const usuario: any = { id: 'user-1', familyId: null };

  const entrada = (extra: any = {}) => ({
    id: 'plan-1',
    userId: 'user-1',
    type: 'income',
    description: 'Salário Bruno',
    category: 'salary',
    amount: '8500.00',
    responsible: 'bruno',
    status: 'pending',
    accountId: 'conta-1',
    dueDate: new Date('2026-09-05T12:00:00'),
    ...extra,
  });

  it('confirmar uma entrada cria a receita real', async () => {
    const { service, receitasCriadas } = montar(entrada());

    await service.markAsPaid('plan-1', usuario);

    expect(receitasCriadas).toHaveLength(1);
    expect(receitasCriadas[0].amount).toBe('8500.00');
    expect(receitasCriadas[0].accountId).toBe('conta-1');
    expect(receitasCriadas[0].plannedAccountId).toBe('plan-1');
  });

  it('a receita entra na DATA informada, não na de hoje', async () => {
    const { service, receitasCriadas } = montar(entrada());
    const caiuNoDia5 = new Date('2026-09-05T12:00:00');

    const salva = await service.markAsPaid('plan-1', usuario, caiuNoDia5);

    expect(salva.paymentDate).toEqual(caiuNoDia5);
    expect(receitasCriadas[0].date).toEqual(caiuNoDia5);
  });

  it('entrada sem conta de destino cai na conta padrão — e não some', async () => {
    const { service, receitasCriadas } = montar(entrada({ accountId: null }), [
      { id: 'conta-unica' },
    ]);

    await service.markAsPaid('plan-1', usuario);

    expect(receitasCriadas).toHaveLength(1);
    expect(receitasCriadas[0].accountId).toBe('conta-unica');
  });

  it('sem nenhuma conta cadastrada, confirma mas avisa no log', async () => {
    const { service, receitasCriadas } = montar(entrada({ accountId: null }), []);

    const salva = await service.markAsPaid('plan-1', usuario);

    // A confirmação é um fato do usuário e não pode ser desfeita por isso.
    expect(salva.status).toBe('paid');
    expect(receitasCriadas).toHaveLength(0);
  });

  it('uma SAÍDA continua virando despesa paga, na data informada', async () => {
    const { service, despesasCriadas } = montar(
      entrada({ type: 'expense', category: 'Moradia', amount: '1800.00' }),
    );
    const pagouDia3 = new Date('2026-09-03T12:00:00');

    await service.markAsPaid('plan-1', usuario, pagouDia3);

    expect(despesasCriadas).toHaveLength(1);
    expect(despesasCriadas[0].isPaid).toBe(true);
    expect(despesasCriadas[0].date).toEqual(pagouDia3);
    expect(despesasCriadas[0].paidAt).toEqual(pagouDia3);
  });

  it('confirmar de novo não duplica nada', async () => {
    const { service, receitasCriadas } = montar(entrada({ status: 'paid' }));

    await service.markAsPaid('plan-1', usuario);

    expect(receitasCriadas).toHaveLength(0);
  });

  it('fatura de cartão confirmada NÃO vira despesa', async () => {
    // As compras já estão lançadas uma a uma; somar o total dobraria o mês.
    const { service, despesasCriadas } = montar(
      entrada({
        type: 'expense',
        creditCardId: 'card-1',
        invoiceCompetencia: '2026-08',
      }),
    );

    await service.markAsPaid('plan-1', usuario);

    expect(despesasCriadas).toHaveLength(0);
  });
});
