import { PdfParserService } from '../services/pdf-parser.service';

/**
 * Leitura de fatura de cartão.
 *
 * POR QUE ESTE ARQUIVO EXISTE
 * ---------------------------
 * Uma fatura real do Nubank foi importada e o sistema encontrou **zero
 * lançamentos**, respondendo 201 como se tivesse dado certo. O parser só
 * entendia datas `DD/MM/AAAA`, e faturas brasileiras escrevem `07 JUL` — sem
 * ano, que só aparece no cabeçalho.
 *
 * O texto abaixo reproduz a ESTRUTURA daquela fatura (valores e nomes
 * trocados), com cada armadilha que ela trazia:
 *
 *  1. data sem ano (`07 JUL`) e ciclo que atravessa a virada do mês;
 *  2. sinal de menos tipográfico (U+2212) nos estornos;
 *  3. linhas de RESUMO com data e valor, que não são lançamentos;
 *  4. valor numa linha SEPARADA quando a compra tem detalhamento;
 *  5. linhas de detalhe citando vários valores no meio do caminho;
 *  6. `R$ 0,00` de saldo remanescente;
 *  7. máscara do cartão (`•••• 8424`) grudada na descrição;
 *  8. parcelas (`Parcela 2/3`).
 *
 * A asserção que mais vale: a soma dos lançamentos extraídos tem que bater com
 * o subtotal que a própria fatura declara. É o único jeito de saber que nada
 * foi perdido e nada foi contado duas vezes.
 */
describe('PdfParserService — fatura de cartão', () => {
  const service = new PdfParserService();

  /** `extractTransactions` é privado: o caminho público exige um PDF binário. */
  const extrair = (texto: string) =>
    (service as any).extractTransactions(texto) as Array<{
      date: string;
      description: string;
      amount: number;
      type: 'debit' | 'credit';
      installmentCurrent?: number;
      installmentTotal?: number;
    }>;

  const FATURA = [
    'Olá, Bruno.',
    'Esta é a sua fatura de agosto, no valor de R$ 1.000,00',
    'Data de vencimento: 14 AGO 2026',
    'Período vigente: 07 JUL a 07 AGO',
    'Limite total do cartão de crédito: R$ 5.000,00',
    '',
    'RESUMO DA FATURA ATUAL',
    'Fatura anterior R$ 1.982,32',
    'Pagamento recebido −R$ 1.982,32',
    'Total de compras de todos os cartões, 07 JUL a 07 AGO R$ 900,00',
    'Total a pagar R$ 1.000,00',
    'Pagamento mínimo para não ficar em atraso R$ 426,35',
    '',
    'PRÓXIMAS FATURAS',
    'Fechamento da próxima fatura 07 SET 2026',
    'Saldo em aberto da próxima fatura R$ 563,96',
    '',
    'TRANSAÇÕES DE 07 JUL A 07 AGO',
    'Fulano de Tal R$ 900,00',
    '07 JUL •••• 8098 Livraria Central - Parcela 2/3 R$ 100,00',
    '10 JUL •••• 8424 Padaria da Esquina R$ 50,00',
    '14 JUL IOF de volta de Servico Exterior −R$ 4,00',
    '15 JUL •••• 7437 Servico Exterior',
    'BRL 110.00 = USD 21.47',
    'Conversão: BRL 5.25 = USD 1 = R$ 5,25',
    'R$ 254,00',
    '30 DEZ •••• 8424 Compra do ciclo anterior R$ 100,00',
    '02 AGO Mercado Municipal R$ 400,00',
    '',
    'Pagamentos e Financiamentos -R$ 865,95',
    '08 JUL Pagamento em 08 JUL −R$ 1.982,32',
    '14 JUL Saldo restante da fatura anterior R$ 0,00',
    '16 JUL Beltrano Silva',
    'Total a pagar: R$ 100,00 (valor da transação de R$ 90,00 + R$ 4,00 de IOF +',
    'R$ 6,00 de juros).',
    'R$ 100,00',
  ].join('\n');

  it('extrai os lançamentos que a fatura realmente tem', () => {
    const t = extrair(FATURA);
    const descricoes = t.map((x) => x.description);

    expect(descricoes).toEqual([
      'Livraria Central - Parcela 2/3',
      'Padaria da Esquina',
      'IOF de volta de Servico Exterior',
      'Servico Exterior',
      'Compra do ciclo anterior',
      'Mercado Municipal',
      'Beltrano Silva',
    ]);
  });

  it('confere com o subtotal declarado pela própria fatura', () => {
    const t = extrair(FATURA);
    const liquido = t.reduce(
      (soma, x) => soma + (x.type === 'credit' ? -x.amount : x.amount),
      0,
    );

    // 100 + 50 − 4 + 254 + 100 + 400 + 100
    expect(Number(liquido.toFixed(2))).toBe(1000);
  });

  describe('as armadilhas, uma a uma', () => {
    it('data sem ano usa o ano do cabeçalho da fatura', () => {
      const t = extrair(FATURA);
      expect(t.find((x) => x.description === 'Padaria da Esquina')?.date).toBe(
        '2026-07-10',
      );
    });

    it('ciclo que vira o ano: DEZ numa fatura de AGO é do ano anterior', () => {
      const t = extrair(FATURA);
      // Sem isto a compra iria para dezembro/2026 — quatro meses no futuro —
      // e sumiria de qualquer relatório do período.
      expect(
        t.find((x) => x.description === 'Compra do ciclo anterior')?.date,
      ).toBe('2025-12-30');
    });

    it('menos tipográfico (−) marca estorno, não despesa', () => {
      const t = extrair(FATURA);
      const estorno = t.find((x) => x.description.startsWith('IOF de volta'));
      expect(estorno?.type).toBe('credit');
      expect(estorno?.amount).toBe(4);
    });

    it('IGNORA as linhas de resumo, que têm data e valor mas não são compra', () => {
      const t = extrair(FATURA);
      const juntas = t.map((x) => x.description).join(' | ');

      // Esta é a que dobraria a fatura: ela RESUME as compras.
      expect(juntas).not.toMatch(/Total de compras/i);
      expect(juntas).not.toMatch(/Pagamento recebido/i);
      expect(juntas).not.toMatch(/Pagamento em/i);
      expect(juntas).not.toMatch(/Saldo em aberto/i);
    });

    it('acha o valor quando ele cai numa linha separada', () => {
      const t = extrair(FATURA);
      const internacional = t.find((x) => x.description === 'Servico Exterior');

      // R$ 254,00 estava três linhas abaixo, depois do detalhe de câmbio.
      expect(internacional?.amount).toBe(254);
    });

    it('não confunde os valores citados na linha de detalhe', () => {
      const t = extrair(FATURA);
      const financiado = t.find((x) => x.description === 'Beltrano Silva');

      // A linha de detalhe cita 100,00 / 90,00 / 4,00 / 6,00. O certo é o
      // total cobrado, que vem sozinho na linha seguinte.
      expect(financiado?.amount).toBe(100);
    });

    it('descarta lançamento de R$ 0,00', () => {
      const t = extrair(FATURA);
      expect(
        t.some((x) => x.description.includes('Saldo restante')),
      ).toBe(false);
    });

    it('tira a máscara do cartão da descrição', () => {
      const t = extrair(FATURA);
      expect(t.map((x) => x.description).join(' ')).not.toMatch(/8424|••••/);
    });

    it('captura o número da parcela', () => {
      const t = extrair(FATURA);
      const parcelada = t.find((x) => x.description.includes('Livraria'));
      expect(parcelada?.installmentCurrent).toBe(2);
      expect(parcelada?.installmentTotal).toBe(3);
    });

    it('lançamento sem parcela não ganha campo de parcela', () => {
      const t = extrair(FATURA);
      const avulsa = t.find((x) => x.description === 'Padaria da Esquina');
      expect(avulsa?.installmentTotal).toBeUndefined();
    });
  });

  describe('extrato bancário continua funcionando', () => {
    it('lê data numérica com ano', () => {
      const t = extrair(
        ['05/08/2026 COMPRA SUPERMERCADO R$ 250,00', '06/08/2026 SALARIO R$ 8.500,00'].join('\n'),
      );

      expect(t).toHaveLength(2);
      expect(t[0].date).toBe('2026-08-05');
      // O dia da data não pode virar o valor: "05/08/2026" já valeu R$ 5,00.
      expect(t[0].amount).toBe(250);
      expect(t[1].date).toBe('2026-08-06');
    });
  });
});
