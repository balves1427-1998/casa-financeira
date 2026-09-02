import { CashFlowService } from '../services/cash-flow.service';

/**
 * O texto dos dias críticos.
 *
 * Apareceu na verificação do deploy: a tela mostrava
 * "R$ 1000.00 em pagamentos" ao lado do mesmo valor já formatado como
 * "R$ 1.000,00". O texto vinha pronto do backend, montado com `toFixed(2)` —
 * ponto decimal, sem separador de milhar, contra o item 25 do escopo, que
 * manda usar R$ 0.000,00 em todo valor exibido.
 */
describe('CashFlowService — texto dos dias críticos', () => {
  const criar = (planejadas: any[]) =>
    new CashFlowService(
      { findOne: async () => null } as any,
      { find: async () => [] } as any,
      { find: async () => [] } as any,
      { find: async () => planejadas } as any,
      { find: async () => [] } as any,
      {} as any,
      { getMemberIds: async () => ['user-1'] } as any,
      {
        getSaldoTotal: async () => 3000,
        getSaldoDeAbertura: async () => 3000,
      } as any,
    );

  const usuario: any = { id: 'user-1', familyId: null };

  it('escreve o valor em formato brasileiro', async () => {
    const service = criar([
      {
        description: 'Aluguel',
        amount: 1000,
        dueDate: new Date(2026, 8, 10, 12),
        status: 'pending',
        type: 'expense',
      },
    ]);

    const mes = await service.getMonthCashFlow(usuario, 9, 2026);
    const critico = mes.criticalDays[0];

    expect(critico).toBeDefined();
    expect(critico.reason).toContain('R$ 1.000,00');
    expect(critico.reason).not.toContain('1000.00');
  });

  it('milhares acima de mil também são agrupados', async () => {
    const service = criar([
      {
        description: 'Parcela',
        amount: 12345.6,
        dueDate: new Date(2026, 8, 15, 12),
        status: 'pending',
        type: 'expense',
      },
    ]);

    const mes = await service.getMonthCashFlow(usuario, 9, 2026);

    expect(mes.criticalDays[0].reason).toContain('R$ 12.345,60');
  });
});
