/**
 * Leitura e escrita de valores monetários nos formulários.
 *
 * O BUG QUE ISTO RESOLVE
 * ----------------------
 * Editar uma despesa de R$ 100,50 devolvia R$ 10.050,00 — o valor era
 * multiplicado por 100 e ninguém percebia até conferir o extrato.
 *
 * A cadeia era esta: o banco devolve `amount` como STRING ("100.50", porque
 * colunas `decimal` do TypeORM vêm como texto); o formulário preenchia o campo
 * com esse texto; e na hora de gravar, a leitura removia **todos os pontos**
 * por considerá-los separador de milhar. "100.50" virava "10050".
 *
 * O erro dependia até dos zeros à direita: R$ 100,50 virava R$ 10.050,00, mas
 * R$ 100,5 viraria R$ 1.005,00. Um bug que muda de tamanho conforme o valor é
 * ainda mais difícil de reconhecer no meio de uma lista.
 *
 * A correção tem duas metades, e as duas precisam existir:
 *  - `paraCampoMoeda` escreve no campo já em pt-BR ("100,50");
 *  - `lerCampoMoeda` entende as duas convenções ao ler, porque o texto pode vir
 *    do usuário, do banco ou de um valor colado de qualquer lugar.
 */

/**
 * Número → texto do campo, em pt-BR e sempre com centavos.
 *
 * `100.5` → `"100,50"` · `1234.5` → `"1.234,50"`
 */
export function paraCampoMoeda(
  valor: number | string | null | undefined,
): string {
  if (valor === null || valor === undefined || valor === '') return '';

  const numero = typeof valor === 'number' ? valor : Number(valor);
  if (!Number.isFinite(numero)) return '';

  return numero.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Texto do campo → número.
 *
 * Aceita o que o usuário digita ("1.234,56", "1234,56", "R$ 89,90") e também o
 * que vem da API ("100.50"). Devolve `NaN` quando não há número — quem chama
 * decide a mensagem de erro.
 *
 * A REGRA DE DESEMPATE, que é onde mora o bug antigo:
 *  - havendo vírgula, ela é o separador decimal e todo ponto é milhar;
 *  - sem vírgula, um ÚNICO ponto seguido de 1 ou 2 dígitos é decimal
 *    ("100.5", "100.50"), porque nenhum separador de milhar tem esse formato;
 *  - qualquer outro ponto é milhar ("1.234", "1.234.567").
 */
export function lerCampoMoeda(texto: string | number | null | undefined): number {
  if (typeof texto === 'number') return Number.isFinite(texto) ? texto : NaN;
  if (texto === null || texto === undefined) return NaN;

  const limpo = String(texto)
    .replace(/R\$/gi, '')
    .replace(/\s/g, '')
    .trim();

  if (!limpo) return NaN;

  const negativo = limpo.startsWith('-');
  const semSinal = negativo ? limpo.slice(1) : limpo;

  if (!/^[\d.,]+$/.test(semSinal)) return NaN;

  let normalizado: string;

  if (semSinal.includes(',')) {
    // "1.234,56" → "1234.56"
    normalizado = semSinal.replace(/\./g, '').replace(',', '.');
  } else if (/^\d+\.\d{1,2}$/.test(semSinal)) {
    // "100.5" / "100.50" — decimal, não milhar.
    normalizado = semSinal;
  } else {
    // "1.234" / "1.234.567" — milhar.
    normalizado = semSinal.replace(/\./g, '');
  }

  const numero = Number(normalizado);
  if (!Number.isFinite(numero)) return NaN;

  // Centavos são o limite: valor com mais casas é erro de digitação.
  return negativo ? -Number(numero.toFixed(2)) : Number(numero.toFixed(2));
}
