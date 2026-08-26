/**
 * Formatação brasileira (item 25 do escopo do projeto).
 *
 * Implementação manual em vez de `Intl.NumberFormat`: o ICU do Node devolve um
 * ESPAÇO NÃO SEPARÁVEL (U+00A0) entre "R$" e o número, que vira um caractere
 * estranho no CSV aberto no Excel e quebra qualquer comparação de string nos
 * testes. Aqui o resultado é sempre exatamente `R$ 1.234,56`.
 */

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const MESES_CURTOS = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

/** Insere o separador de milhar (ponto) na parte inteira. */
function separarMilhar(inteiro: string): string {
  return inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** `1234.5` → `R$ 1.234,50`; `-90` → `-R$ 90,00`. */
export function formatarReal(valor: number | null | undefined): string {
  const numero = Number(valor);

  if (!Number.isFinite(numero)) {
    return 'R$ 0,00';
  }

  const negativo = numero < 0;
  const [inteiro, decimais] = Math.abs(numero).toFixed(2).split('.');

  return `${negativo ? '-' : ''}R$ ${separarMilhar(inteiro)},${decimais}`;
}

/** `1234.5` → `1.234,50` (sem o símbolo da moeda, para células numéricas). */
export function formatarNumero(valor: number | null | undefined, casas = 2): string {
  const numero = Number(valor);

  if (!Number.isFinite(numero)) {
    return (0).toFixed(casas).replace('.', ',');
  }

  const negativo = numero < 0;
  const [inteiro, decimais] = Math.abs(numero).toFixed(casas).split('.');
  const parteDecimal = decimais ? `,${decimais}` : '';

  return `${negativo ? '-' : ''}${separarMilhar(inteiro)}${parteDecimal}`;
}

/**
 * `12.345` → `12,35%`.
 *
 * `null` vira `—` de propósito: percentual desconhecido não é 0% (regra 27).
 */
export function formatarPercentual(
  valor: number | null | undefined,
  casas = 2,
): string {
  if (valor === null || valor === undefined || !Number.isFinite(Number(valor))) {
    return '—';
  }

  return `${formatarNumero(Number(valor), casas)}%`;
}

/** Data no formato `DD/MM/YYYY`. */
export function formatarData(data: Date | string | null | undefined): string {
  if (!data) {
    return '—';
  }

  const d = data instanceof Date ? data : new Date(data);

  if (Number.isNaN(d.getTime())) {
    return '—';
  }

  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');

  return `${dia}/${mes}/${d.getFullYear()}`;
}

/** Data e hora no formato `DD/MM/YYYY HH:mm`. */
export function formatarDataHora(data: Date | string | null | undefined): string {
  if (!data) {
    return '—';
  }

  const d = data instanceof Date ? data : new Date(data);

  if (Number.isNaN(d.getTime())) {
    return '—';
  }

  const hora = String(d.getHours()).padStart(2, '0');
  const minuto = String(d.getMinutes()).padStart(2, '0');

  return `${formatarData(d)} ${hora}:${minuto}`;
}

/** `(8, 2026)` → `Agosto de 2026`. */
export function formatarMesAno(mes: number, ano: number): string {
  const nome = MESES[mes - 1] ?? String(mes);
  return `${nome} de ${ano}`;
}

/** `'2026-08'` → `ago/2026`. */
export function formatarMesCurto(chave: string): string {
  const [ano, mes] = chave.split('-');
  const indice = Number(mes) - 1;
  const nome = MESES_CURTOS[indice] ?? mes;

  return `${nome}/${ano}`;
}

/** Rótulo legível de uma variação: `+R$ 320,00 (+12,50%)`. */
export function formatarVariacao(
  absoluta: number,
  percentual: number | null,
): string {
  const sinal = absoluta > 0 ? '+' : '';
  const valor = `${sinal}${formatarReal(absoluta)}`;

  if (percentual === null) {
    return `${valor} (sem base de comparação)`;
  }

  const sinalPercentual = percentual > 0 ? '+' : '';
  return `${valor} (${sinalPercentual}${formatarPercentual(percentual)})`;
}
