/**
 * Tipos do módulo de Cartões de Crédito (`credit-cards`).
 *
 * Espelham os DTOs reais do backend em:
 * backend/src/modules/credit-cards/dtos/create-credit-card.dto.ts
 * backend/src/modules/credit-cards/entities/credit-card.entity.ts
 */

/** Situações aceitas pelo backend (`enum CreditCardStatus`). */
export enum CreditCardStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  BLOCKED = 'blocked',
  EXPIRED = 'expired',
}

export const CREDIT_CARD_STATUS_LABELS: Record<string, string> = {
  [CreditCardStatus.ACTIVE]: 'Ativo',
  [CreditCardStatus.INACTIVE]: 'Inativo',
  [CreditCardStatus.BLOCKED]: 'Bloqueado',
  [CreditCardStatus.EXPIRED]: 'Vencido',
};

export const CREDIT_CARD_STATUS_OPTIONS: Array<{
  value: CreditCardStatus;
  label: string;
}> = Object.values(CreditCardStatus).map(value => ({
  value,
  label: CREDIT_CARD_STATUS_LABELS[value],
}));

/** Bandeiras sugeridas — o backend grava `cardType` como texto livre. */
export const CARD_TYPE_SUGGESTIONS = [
  'Visa',
  'Mastercard',
  'Elo',
  'American Express',
  'Hipercard',
];

/**
 * O backend valida os últimos dígitos com `@Matches(/^\d{4}$/)`.
 * Nunca peça nem armazene o número completo do cartão.
 */
export const CARD_NUMBER_PATTERN = /^\d{4}$/;

/**
 * Corpo de `POST /credit-cards`.
 *
 * ATENÇÃO: o `ValidationPipe` global roda com `whitelist` +
 * `forbidNonWhitelisted`. Enviar qualquer chave fora desta lista devolve 400 —
 * inclusive `currentBalance`, que é derivado pelo backend a partir das
 * despesas lançadas no cartão.
 */
export interface CreateCreditCardDto {
  name: string;
  bank: string;
  cardNumber: string;
  limit: number;
  closingDay: number;
  dueDay: number;
  status?: CreditCardStatus;
  cardholderName?: string | null;
  cardType?: string | null;
  expiryDate?: string;
  accountId?: string;
  interestRate?: number | null;
  notes?: string | null;
}

/**
 * Corpo de `PUT /credit-cards/:id`.
 *
 * O `UpdateCreditCardDto` do backend é MENOR que o de criação: não aceita
 * `bank`, `cardNumber`, `cardType`, `expiryDate` nem `accountId`. Esses dados
 * identificam o plástico e só podem ser definidos no cadastro.
 */
export interface UpdateCreditCardDto {
  name?: string;
  limit?: number;
  status?: CreditCardStatus;
  closingDay?: number;
  dueDay?: number;
  cardholderName?: string | null;
  interestRate?: number | null;
  notes?: string | null;
}

/**
 * Converte com segurança um valor numérico vindo da API.
 * `limit`, `currentBalance` e `interestRate` são colunas `decimal` no Postgres
 * e chegam como string (`"5000.00"`) pelo driver `pg`.
 */
export function toCreditCardAmount(
  value: number | string | null | undefined,
): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
