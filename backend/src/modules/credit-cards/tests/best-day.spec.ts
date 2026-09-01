import { CardStatementService } from '../services/card-statement.service';

/**
 * Melhor dia para comprar no cartão.
 *
 * A REGRA, dita pelo usuário: a recomendação aponta SEMPRE para depois do
 * fechamento. "Se minha fatura fecha dia 07 e hoje estamos no dia 01, o melhor
 * dia para eu realizar compras é após o dia 07."
 *
 * A versão anterior só recomendava esperar quando faltavam 5 dias ou menos
 * para fechar. Com fechamento no dia 07, quem consultasse no dia 01 ouvia
 * "compre hoje" — e perdia um mês inteiro de prazo, que é exatamente o que
 * esta tela existe para evitar.
 *
 * A única exceção legítima é o ciclo que ACABOU de abrir: aí hoje já é o
 * melhor dia, porque a compra de hoje só será cobrada dali a dois meses.
 */
describe('CardStatementService — melhor dia para comprar', () => {
  // Fecha dia 07, vence dia 14 — o cartão do exemplo do usuário.
  const cartao: any = {
    id: 'card-1',
    userId: 'user-1',
    name: 'Nubank',
    closingDay: 7,
    dueDay: 14,
    limit: 5000,
  };

  const service = new CardStatementService(
    { findOne: async () => cartao } as any,
    {} as any,
    { getMemberIds: async () => ['user-1'] } as any,
  );

  const usuario: any = { id: 'user-1', familyId: null };

  const consultar = (dia: string) =>
    service.getBestDayToBuy('card-1', usuario, new Date(`${dia}T12:00:00`));

  it('no dia 01, com fechamento no dia 07, manda ESPERAR', async () => {
    const r: any = await consultar('2026-09-01');

    expect(r.shouldWait).toBe(true);
    expect(r.daysUntilClosing).toBe(6);
    // O dia seguinte ao fechamento.
    expect(new Date(r.bestDate).getDate()).toBe(8);
    expect(r.recommendation).toContain('08/09/2026');
  });

  it('avisa quantos dias faltam para a fatura fechar', async () => {
    const r: any = await consultar('2026-09-01');
    expect(r.closingNotice).toBe(
      'Faltam 6 dias para a fatura atual fechar (07/09/2026).',
    );
  });

  it('no dia do fechamento, avisa que fecha HOJE e ainda manda esperar', async () => {
    const r: any = await consultar('2026-09-07');

    expect(r.closingNotice).toBe('A fatura atual fecha HOJE.');
    // Comprar hoje ainda cai na fatura que fecha hoje: esperar um dia joga a
    // compra para a fatura seguinte.
    expect(r.shouldWait).toBe(true);
  });

  it('na véspera, o aviso fala em "amanhã"', async () => {
    const r: any = await consultar('2026-09-06');
    expect(r.closingNotice).toContain('amanhã');
  });

  it('no dia seguinte ao fechamento, HOJE é o melhor dia', async () => {
    const r: any = await consultar('2026-09-08');

    // O ciclo acabou de abrir — não há nada a ganhar esperando.
    expect(r.shouldWait).toBe(false);
    expect(r.recommendation).toMatch(/hoje é o melhor momento/i);
  });

  it('esperar rende mais prazo do que comprar hoje', async () => {
    const r: any = await consultar('2026-09-01');

    expect(r.daysToPayIfWait).toBeGreaterThan(r.daysToPayIfBuyToday);
    expect(r.extraDaysIfWait).toBe(r.daysToPayIfWait - r.daysToPayIfBuyToday);
    // Um ciclo mensal inteiro de ganho, não dois ou três dias.
    expect(r.extraDaysIfWait).toBeGreaterThanOrEqual(25);
  });

  it('cartão que fecha dia 28 e vence dia 5 não inverte as datas', async () => {
    cartao.closingDay = 28;
    cartao.dueDay = 5;

    const r: any = await consultar('2026-09-20');

    // O vencimento tem que cair DEPOIS do fechamento, no mês seguinte.
    expect(new Date(r.dueDate).getTime()).toBeGreaterThan(
      new Date(r.closingDate).getTime(),
    );
    expect(r.shouldWait).toBe(true);

    cartao.closingDay = 7;
    cartao.dueDay = 14;
  });
});
