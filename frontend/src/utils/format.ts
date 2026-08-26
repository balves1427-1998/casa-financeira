/**
 * Helpers de formatação no padrão brasileiro.
 *
 * Reexporta os formatadores de `formatters.ts` e expõe os atalhos
 * (`formatBRL`, `formatDateBR`) utilizados pelos componentes.
 */
export {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatPercent,
  formatNumber,
  formatDuration,
  truncate,
} from './formatters';

import { formatCurrency, formatDate } from './formatters';

/**
 * Formata um valor monetário no padrão brasileiro: R$ 0.000,00
 */
export function formatBRL(value: number | null | undefined): string {
  return formatCurrency(value);
}

/**
 * Formata uma data no padrão brasileiro: DD/MM/YYYY
 */
export function formatDateBR(date: string | Date | null | undefined): string {
  return formatDate(date);
}
