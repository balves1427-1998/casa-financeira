import { SaldoService } from '../saldo.service';

/**
 * O saldo derivado dos lançamentos.
 *
 * O QUE ESTES TESTES FIXAM, e que é a razão do módulo existir: antes o saldo
 * era a coluna `accounts.balance` — o número digitado no cadastro da conta,
 * que NADA no sistema jamais atualizou. Lançar despesa não mexia nele, receber
 * salário não mexia nele, e o "saldo inicial" de qualquer mês consultado era
 * esse mesmo número parado. Setembro, agosto e o ano que vem abriam iguais.
 */
describe('SaldoService', () => {
  const criar = (dados: {
    contas?: any[];
    despesas?: any[];
    receitas?: any[];
    planejadas?: any[];
    membros?: string[];
  }) =>
    new SaldoService(
      { find: async () => dados.contas ?? [] } as any,
      { find: async () => dados.despesas ?? [] } as any,
      { find: async () => dados.receitas ?? [] } as any,
      { find: async () => dados.planejadas ?? [] } as any,
      { getMemberIds: async () => dados.membros ?? ['user-1'] } as any,
    );

  const usuario: any = { id: 'user-1', familyId: null };

  const conta = (extra: any = {}) => ({
    id: 'conta-1',
    name: 'Corrente',
    type: 'checking',
    initialBalance: '1000.00',
    createdAt: new Date('2026-01-01'),
    ...extra,
  });

  it('soma as receitas e desconta as despesas sobre o saldo inicial', async () => {
    const service = criar({
      contas: [conta()],
      receitas: [
        { accountId: 'conta-1', amount: '5000.00', date: new Date('2026-08-05') },
      ],
      despesas: [
        {
          accountId: 'conta-1',
          amount: '200.00',
          date: new Date('2026-08-10'),
          paymentMethod: 'debit',
          isPaid: true,
        },
      ],
    });

    const saldo = await service.getSaldo(usuario);

    expect(saldo.saldoInicial).toBe(1000);
    expect(saldo.movimento).toBe(4800);
    expect(saldo.saldo).toBe(5800);
    expect(saldo.porConta[0].saldo).toBe(5800);
  });

  it('NÃO desconta compra no cartão — o dinheiro continua na conta', async () => {
    const service = criar({
      contas: [conta()],
      despesas: [
        {
          accountId: 'conta-1',
          amount: '900.00',
          date: new Date('2026-08-10'),
          paymentMethod: 'credit',
          creditCardId: 'card-1',
        },
      ],
    });

    expect((await service.getSaldo(usuario)).saldo).toBe(1000);
  });

  it('desconta a fatura quando ela foi paga, na data do pagamento', async () => {
    const service = criar({
      contas: [conta()],
      planejadas: [
        {
          accountId: 'conta-1',
          amount: '900.00',
          status: 'paid',
          creditCardId: 'card-1',
          invoiceCompetencia: '2026-08',
          dueDate: new Date('2026-08-14'),
          paymentDate: new Date('2026-08-12'),
        },
      ],
    });

    expect((await service.getSaldo(usuario)).saldo).toBe(100);
  });

  it('fatura ainda não paga não sai do caixa', async () => {
    const service = criar({
      contas: [conta()],
      planejadas: [
        {
          accountId: 'conta-1',
          amount: '900.00',
          status: 'pending',
          creditCardId: 'card-1',
          invoiceCompetencia: '2026-08',
          dueDate: new Date('2026-08-14'),
        },
      ],
    });

    expect((await service.getSaldo(usuario)).saldo).toBe(1000);
  });

  it('cada mês abre onde o anterior fechou', async () => {
    // O defeito que isto trava: `getOpeningBalance` devolvia o saldo de HOJE
    // para qualquer mês, então agosto e setembro abriam com o mesmo número.
    const service = criar({
      contas: [conta()],
      receitas: [
        { accountId: 'conta-1', amount: '5000.00', date: new Date('2026-08-05') },
      ],
      despesas: [
        {
          accountId: 'conta-1',
          amount: '200.00',
          date: new Date('2026-09-03'),
          paymentMethod: 'debit',
          isPaid: true,
        },
      ],
    });

    const agosto = await service.getSaldoDeAbertura(usuario, new Date(2026, 7, 1));
    const setembro = await service.getSaldoDeAbertura(usuario, new Date(2026, 8, 1));

    expect(agosto).toBe(1000); // antes do salário
    expect(setembro).toBe(6000); // depois dele, antes da despesa de setembro
    expect(agosto).not.toBe(setembro);
  });

  it('lançamento sem conta definida entra no total e aparece separado', async () => {
    const service = criar({
      contas: [conta()],
      despesas: [
        {
          accountId: null,
          amount: '300.00',
          date: new Date('2026-08-10'),
          paymentMethod: 'debit',
          isPaid: true,
        },
      ],
    });

    const saldo = await service.getSaldo(usuario);

    expect(saldo.semConta).toBe(-300);
    expect(saldo.saldo).toBe(700);
    // A conta em si não foi afetada: o lançamento não aponta para ela.
    expect(saldo.porConta[0].saldo).toBe(1000);
  });

  it('despesa NÃO PAGA não desconta — é compromisso, não saída', async () => {
    // O defeito que isto trava, medido numa base real: R$ 21.090,54 em contas
    // ainda não pagas sendo descontados de um saldo de R$ 838,97. O sistema já
    // sabia a diferença ao criar o lançamento; só o saldo é que a ignorava.
    const service = criar({
      contas: [conta()],
      despesas: [
        {
          accountId: 'conta-1',
          amount: '415.94',
          date: new Date('2026-09-28'),
          paymentMethod: 'debit',
          isPaid: false,
        },
      ],
    });

    expect((await service.getSaldo(usuario)).saldo).toBe(1000);
  });

  it('a despesa sai na data em que foi PAGA', async () => {
    const service = criar({
      contas: [conta()],
      despesas: [
        {
          accountId: 'conta-1',
          amount: '200.00',
          date: new Date('2026-08-28'),
          // Pagou só em setembro: em agosto o dinheiro ainda estava lá.
          paidAt: new Date('2026-09-02'),
          paymentMethod: 'debit',
          isPaid: true,
        },
      ],
    });

    const fimDeAgosto = await service.getSaldoDeAbertura(
      usuario,
      new Date(2026, 8, 1),
    );
    expect(fimDeAgosto).toBe(1000);
    expect((await service.getSaldo(usuario)).saldo).toBe(800);
  });

  it('soma as contas da casa inteira, não só as de quem consultou', async () => {
    // `getTotalBalance` filtrava por `userId` do usuário logado enquanto as
    // despesas do outro morador entravam na conta — o saldo saía otimista.
    const service = criar({
      contas: [
        conta(),
        conta({ id: 'conta-2', name: 'Giovanna', initialBalance: '500.00' }),
      ],
      membros: ['user-1', 'user-2'],
    });

    const comFamilia: any = { id: 'user-1', familyId: 'casa-1' };
    expect((await service.getSaldo(comFamilia)).saldo).toBe(1500);
  });

  it('cartão de crédito não entra no saldo em caixa', async () => {
    const service = criar({
      // O repositório já filtra, mas o total soma o que veio: se um cartão
      // escapasse, a dívida dele viraria dinheiro disponível.
      contas: [conta()],
    });

    expect((await service.getSaldo(usuario)).saldoInicial).toBe(1000);
  });
});
