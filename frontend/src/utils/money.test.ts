import { lerCampoMoeda, paraCampoMoeda } from './money';

/**
 * O caso relatado, primeiro de todos: editar R$ 100,50 devolvia R$ 10.050,00.
 *
 * A cadeia do defeito era o campo ser preenchido com o texto do banco
 * ("100.50") e a leitura remover todos os pontos por assumir milhar. O teste
 * que importa não é o de cada função isolada, e sim o CICLO: escrever no campo
 * e ler de volta tem que devolver o mesmo dinheiro.
 */
describe('valores monetários nos formulários', () => {
  describe('o ciclo editar → gravar preserva o valor', () => {
    const valores = [100.5, 12, 0.99, 1234.56, 10050, 8500, 1.05, 999999.99];

    it.each(valores)('R$ %s sobrevive a uma edição', valor => {
      expect(lerCampoMoeda(paraCampoMoeda(valor))).toBe(valor);
    });

    it('o caso relatado: 100,50 não vira 10.050,00', () => {
      const doBanco = '100.50'; // string, como vem de uma coluna decimal
      const noCampo = paraCampoMoeda(doBanco);

      expect(noCampo).toBe('100,50');
      expect(lerCampoMoeda(noCampo)).toBe(100.5);
    });
  });

  describe('paraCampoMoeda escreve em pt-BR', () => {
    it('sempre com duas casas', () => {
      expect(paraCampoMoeda(100.5)).toBe('100,50');
      expect(paraCampoMoeda(12)).toBe('12,00');
    });

    it('com separador de milhar', () => {
      expect(paraCampoMoeda(1234.56)).toBe('1.234,56');
      expect(paraCampoMoeda(1234567.8)).toBe('1.234.567,80');
    });

    it('aceita string vinda da API', () => {
      expect(paraCampoMoeda('100.50')).toBe('100,50');
    });

    it('vazio para valor ausente — não escreve "0,00" num campo em branco', () => {
      expect(paraCampoMoeda(null)).toBe('');
      expect(paraCampoMoeda(undefined)).toBe('');
      expect(paraCampoMoeda('')).toBe('');
    });
  });

  describe('lerCampoMoeda entende as duas convenções', () => {
    it('o que o usuário digita', () => {
      expect(lerCampoMoeda('100,50')).toBe(100.5);
      expect(lerCampoMoeda('1.234,56')).toBe(1234.56);
      expect(lerCampoMoeda('1234,56')).toBe(1234.56);
      expect(lerCampoMoeda('89')).toBe(89);
    });

    it('o que vem da API, com ponto decimal', () => {
      // Aqui estava o erro: estes viravam 10050 e 1005.
      expect(lerCampoMoeda('100.50')).toBe(100.5);
      expect(lerCampoMoeda('100.5')).toBe(100.5);
    });

    it('ponto como MILHAR quando não pode ser decimal', () => {
      // Três dígitos depois do ponto não é centavo.
      expect(lerCampoMoeda('1.234')).toBe(1234);
      expect(lerCampoMoeda('1.234.567')).toBe(1234567);
    });

    it('tolera R$ e espaços colados de outro lugar', () => {
      expect(lerCampoMoeda('R$ 1.234,56')).toBe(1234.56);
      expect(lerCampoMoeda('  89,90 ')).toBe(89.9);
    });

    it('aceita número direto', () => {
      expect(lerCampoMoeda(100.5)).toBe(100.5);
    });

    it('negativo', () => {
      expect(lerCampoMoeda('-100,50')).toBe(-100.5);
    });

    it('NaN quando não há número — quem chama decide a mensagem', () => {
      expect(lerCampoMoeda('')).toBeNaN();
      expect(lerCampoMoeda('abc')).toBeNaN();
      expect(lerCampoMoeda(null)).toBeNaN();
      expect(lerCampoMoeda('12a3')).toBeNaN();
    });

    it('arredonda para centavos', () => {
      expect(lerCampoMoeda('10,999')).toBe(11);
    });
  });
});
