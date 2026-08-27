/**
 * Tipos do módulo de Despesas (`expenses`).
 *
 * Espelham os DTOs reais do backend em:
 * backend/src/modules/expenses/dtos/create-expense.dto.ts
 * backend/src/modules/expenses/entities/expense.entity.ts
 */

/** Formas de pagamento aceitas pelo backend (`enum PaymentMethod`). */
export enum PaymentMethod {
  CASH = 'cash',
  DEBIT = 'debit',
  CREDIT = 'credit',
  TRANSFER = 'transfer',
  PIX = 'pix',
}

/** Origem do lançamento (`enum ExpenseOrigin`). */
export enum ExpenseOrigin {
  MANUAL = 'manual',
  BANK_STATEMENT = 'bank_statement',
  CREDIT_CARD = 'credit_card',
  IMPORT = 'import',
  RECURRING = 'recurring',
}

/** Periodicidade de uma despesa recorrente (`enum RecurrenceFrequency`). */
export enum RecurrenceFrequency {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  [PaymentMethod.CASH]: 'Dinheiro',
  [PaymentMethod.DEBIT]: 'Débito',
  [PaymentMethod.CREDIT]: 'Crédito',
  [PaymentMethod.TRANSFER]: 'Transferência',
  [PaymentMethod.PIX]: 'Pix',
};

export const PAYMENT_METHOD_OPTIONS: Array<{
  value: PaymentMethod;
  label: string;
}> = Object.values(PaymentMethod).map(value => ({
  value,
  label: PAYMENT_METHOD_LABELS[value],
}));

export const EXPENSE_FREQUENCY_LABELS: Record<string, string> = {
  [RecurrenceFrequency.DAILY]: 'Diária',
  [RecurrenceFrequency.WEEKLY]: 'Semanal',
  [RecurrenceFrequency.MONTHLY]: 'Mensal',
  [RecurrenceFrequency.YEARLY]: 'Anual',
};

export const EXPENSE_FREQUENCY_OPTIONS: Array<{
  value: RecurrenceFrequency;
  label: string;
}> = Object.values(RecurrenceFrequency).map(value => ({
  value,
  label: EXPENSE_FREQUENCY_LABELS[value],
}));

export const EXPENSE_ORIGIN_LABELS: Record<string, string> = {
  [ExpenseOrigin.MANUAL]: 'Manual',
  [ExpenseOrigin.BANK_STATEMENT]: 'Extrato bancário',
  [ExpenseOrigin.CREDIT_CARD]: 'Fatura de cartão',
  [ExpenseOrigin.IMPORT]: 'Importação',
  [ExpenseOrigin.RECURRING]: 'Recorrente',
};

/**
 * Categorias padrão do escopo, usadas como sugestão quando o usuário ainda não
 * cadastrou as próprias. O backend grava a categoria como texto livre.
 */
export const DEFAULT_EXPENSE_CATEGORIES = [
  'Moradia',
  'Alimentação',
  'Supermercado',
  'Transporte',
  'Combustível',
  'Saúde',
  'Educação',
  'Lazer',
  'Compras',
  'Assinaturas',
  'Viagem',
  'Pets',
  'Impostos',
  'Seguros',
  'Investimentos',
  'Dívidas',
  'Outros',
];

/** Despesa retornada pela API. */
export interface ExpenseDto {
  id: string;
  userId?: string;
  accountId?: string | null;
  creditCardId?: string | null;
  description: string;
  establishment?: string | null;
  /**
   * Colunas `decimal` do PostgreSQL podem chegar como string no driver `pg`.
   * As telas devem passar por `toExpenseAmount` antes de somar.
   */
  amount: number | string;
  date: Date | string;
  category: string;
  subcategory?: string | null;
  /** `bruno`, `giovanna` ou outro responsável cadastrado. */
  responsible: string;
  paymentMethod: PaymentMethod | string;
  isRecurring: boolean;
  frequency?: RecurrenceFrequency | string | null;
  installments?: number | null;
  currentInstallment?: number | null;
  observation?: string | null;
  origin?: ExpenseOrigin | string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

/** Corpo de `POST /expenses`. */
export interface CreateExpenseDto {
  description: string;
  establishment?: string;
  /** Precisa ser maior ou igual a 0,01 (validado no backend). */
  amount: number;
  /** Enviado em ISO — o backend converte com `new Date(value)`. */
  date: string;
  category: string;
  subcategory?: string;
  responsible: string;
  paymentMethod: PaymentMethod;
  /** UUID da conta — o backend valida com `@IsUUID()`. */
  accountId?: string;
  /** UUID do cartão de crédito. */
  creditCardId?: string;
  isRecurring?: boolean;
  frequency?: RecurrenceFrequency;
  installments?: number;
  currentInstallment?: number;
  observation?: string;
  origin?: ExpenseOrigin;
}

/** Corpo de `PUT /expenses/:id` — todos os campos opcionais. */
export type UpdateExpenseDto = Partial<CreateExpenseDto>;

/** Resposta de `GET /expenses/category-breakdown`. */
export interface ExpenseCategoryBreakdownDto {
  category: string;
  total: number | string;
  count: number | string;
}

/**
 * Converte com segurança um valor monetário vindo da API.
 *
 * Sem isso, `decimal` serializado como string faria `a + b` concatenar
 * ("1000" + "500" = "1000500") em vez de somar.
 */
export function toExpenseAmount(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
