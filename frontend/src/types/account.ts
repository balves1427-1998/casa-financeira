/**
 * Tipos do módulo de Contas (`accounts`).
 *
 * Espelham os DTOs reais do backend em:
 * backend/src/modules/accounts/dtos/create-account.dto.ts
 * backend/src/modules/accounts/entities/account.entity.ts
 */

/** Tipos de conta aceitos pelo backend (`enum AccountType`). */
export enum AccountType {
  CHECKING = 'checking',
  SAVINGS = 'savings',
  WALLET = 'wallet',
  DIGITAL = 'digital',
  CREDIT_CARD = 'credit_card',
}

export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  [AccountType.CHECKING]: 'Conta corrente',
  [AccountType.SAVINGS]: 'Conta poupança',
  [AccountType.WALLET]: 'Carteira',
  [AccountType.DIGITAL]: 'Conta digital',
  [AccountType.CREDIT_CARD]: 'Cartão de crédito',
};

export const ACCOUNT_TYPE_OPTIONS: Array<{ value: AccountType; label: string }> =
  Object.values(AccountType).map(value => ({
    value,
    label: ACCOUNT_TYPE_LABELS[value],
  }));

/**
 * Corpo de `POST /accounts`.
 *
 * ATENÇÃO: `balance` NÃO faz parte do DTO — o saldo é derivado pelo backend a
 * partir de `initialBalance` e dos lançamentos. Enviar `balance` faz o
 * ValidationPipe (`forbidNonWhitelisted`) devolver 400.
 */
export interface CreateAccountDto {
  name: string;
  type: AccountType;
  institution: string;
  initialBalance?: number;
  limit?: number;
  closingDay?: number;
  dueDay?: number;
}

/**
 * Corpo de `PUT /accounts/:id`.
 *
 * O `UpdateAccountDto` do backend também não aceita `initialBalance` nem
 * `balance`: o saldo inicial é definido apenas na criação.
 */
export interface UpdateAccountDto {
  name?: string;
  type?: AccountType;
  institution?: string;
  limit?: number;
  closingDay?: number;
  dueDay?: number;
}

/**
 * Converte com segurança um valor monetário vindo da API.
 * Colunas `decimal` do PostgreSQL podem chegar como string no driver `pg`.
 */
export function toAccountAmount(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
