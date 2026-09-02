import { CashFlowService } from '../services/cash-flow.service';

/**
 * Extrato do Fluxo de Caixa.
 *
 * A REGRA, dita pelo usuário: "é uma visão de extrato, não uma projeção" — o
 * que está sendo pago e entrando, com o saldo até aquele dia no topo.
 *
 * O ponto que estes testes fixam, e que é a diferença entre um extrato certo e
 * um errado: **compra no cartão não moveu a conta**. O dinheiro continua lá até
 * a fatura ser paga. Mostrar as compras aqui faria o saldo do topo deixar de
 * bater com o saldo do banco — e um extrato que não bate não serve para nada.
 */
describe('CashFlowService — extrato', () => {
  const criar = (dados: {
    despesas?: any[];
    receitas?: any[];
    planejadas?: any[];
    saldo?: number;
  }) => {
    const service = new CashFlowService(
      { findOne: async () => null } as any, // snapshots
      { find: async () => dados.despesas ?? [] } as any,
      { find: async () => dados.receitas ?? [] } as any,
      { find: async () => dados.planejadas ?? [] } as any,
      {} as any, // cartões
      {} as any, // contas
      { getMemberIds: async () => ['user-1'] } as any,
      // O saldo de abertura passou a vir do SaldoService, derivado do que
      // aconteceu antes do mês — e não mais da coluna `accounts.balance`.
      {
        getSaldoTotal: async () => dados.saldo ?? 0,
        getSaldoDeAbertura: async () => dados.saldo ?? 0,
      } as any,
    );

    return service;
  };

  const usuario: any = { id: 'user-1', familyId: null };

  const despesa = (extra: any = {}) => ({
    date: new Date('2026-08-10T12:00:00'),
    description: 'Mercado',
    amount: 200,
    category: 'Supermercado',
    responsible: 'bruno',
    paymentMethod: 'debit',
    ...extra,
  });

  it('lista o que entrou e saiu, com o saldo correndo', async () => {
    const service = criar({
      saldo: 1000,
      receitas: [
        {
          date: new Date('2026-08-05T12:00:00'),
          description: 'Salário',
          amount: 5000,
          responsible: 'bruno',
        },
      ],
      despesas: [despesa()],
    });

    const e = await service.getStatement(usuario, 8, 2026);

    expect(e.movimentos).toHaveLength(2);
    // Ordem cronológica, como num extrato.
    expect(e.movimentos[0].descricao).toBe('Salário');
    expect(e.movimentos[0].saldoApos).toBe(6000);
    expect(e.movimentos[1].descricao).toBe('Mercado');
    expect(e.movimentos[1].saldoApos).toBe(5800);

    expect(e.totalEntradas).toBe(5000);
    expect(e.totalSaidas).toBe(200);
    expect(e.closingBalance).toBe(5800);
  });

  it('NÃO mostra compra no cartão — o dinheiro ainda está na conta', async () => {
    const service = criar({
      saldo: 1000,
      despesas: [
        despesa(),
        despesa({
          description: 'Compra no cartão',
          amount: 900,
          paymentMethod: 'credit',
          creditCardId: 'card-1',
        }),
      ],
    });

    const e = await service.getStatement(usuario, 8, 2026);

    const descricoes = e.movimentos.map((m) => m.descricao);
    expect(descricoes).toContain('Mercado');
    expect(descricoes).not.toContain('Compra no cartão');
    // O saldo tem que refletir só o que saiu da conta.
    expect(e.closingBalance).toBe(800);
  });

  it('mostra a FATURA quando ela foi paga, na data do pagamento', async () => {
    const service = criar({
      saldo: 5000,
      planejadas: [
        {
          description: 'Fatura Nubank',
          amount: 1200,
          dueDate: new Date('2026-08-14T12:00:00'),
          // Pagou adiantado: o dinheiro saiu no dia 12, não no vencimento.
          paymentDate: new Date('2026-08-12T12:00:00'),
          status: 'paid',
          creditCardId: 'card-1',
          invoiceCompetencia: '2026-08',
          responsible: 'bruno',
        },
      ],
    });

    const e = await service.getStatement(usuario, 8, 2026);

    expect(e.movimentos).toHaveLength(1);
    expect(e.movimentos[0].origem).toBe('fatura');
    expect(e.movimentos[0].date.getDate()).toBe(12);
    expect(e.closingBalance).toBe(3800);
  });

  it('fatura ainda NÃO paga fica de fora — extrato é o que aconteceu', async () => {
    const service = criar({
      saldo: 5000,
      planejadas: [
        {
          description: 'Fatura Nubank',
          amount: 1200,
          dueDate: new Date('2026-08-14T12:00:00'),
          status: 'pending',
          creditCardId: 'card-1',
          invoiceCompetencia: '2026-08',
        },
      ],
    });

    const e = await service.getStatement(usuario, 8, 2026);

    expect(e.movimentos).toHaveLength(0);
    expect(e.closingBalance).toBe(5000);
  });

  it('conta planejada comum, mesmo paga, não duplica', async () => {
    // Ao ser marcada como paga ela JÁ virou despesa real — que entra pelo
    // repositório de despesas. Contá-la aqui também descontaria duas vezes.
    const service = criar({
      saldo: 5000,
      despesas: [despesa({ description: 'Aluguel', amount: 1800 })],
      planejadas: [
        {
          description: 'Aluguel',
          amount: 1800,
          dueDate: new Date('2026-08-05T12:00:00'),
          paymentDate: new Date('2026-08-05T12:00:00'),
          status: 'paid',
          // Sem invoiceCompetencia: não é fatura de cartão.
        },
      ],
    });

    const e = await service.getStatement(usuario, 8, 2026);

    expect(e.movimentos).toHaveLength(1);
    expect(e.closingBalance).toBe(3200);
  });

  it('recusa competência inválida', async () => {
    const service = criar({});
    await expect(service.getStatement(usuario, 13, 2026)).rejects.toThrow();
  });
});
