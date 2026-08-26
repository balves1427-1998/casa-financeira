/**
 * Tipos do módulo de Receitas (`incomes`).
 *
 * Espelham os DTOs reais do backend em:
 * backend/src/modules/income/dtos/income.dto.ts
 * backend/src/modules/income/entities/income.entity.ts
 *
 * ATENÇÃO: o antigo módulo `receipts` FOI REMOVIDO do backend — as duas tabelas
 * que representavam o mesmo conceito foram consolidadas em `incomes`. Nenhuma
 * tela deve mais chamar `/receipts`.
 */

/** Origens de receita aceitas pelo backend (`enum IncomeType`). */
export enum IncomeType {
  SALARY = 'salary',
  OVERTIME = 'overtime',
  FREELANCE = 'freelance',
  REIMBURSEMENT = 'reimbursement',
  BONUS = 'bonus',
  COMMISSION = 'commission',
  PIX = 'pix',
  TRANSFER = 'transfer',
  INVESTMENT = 'investment',
  OTHER = 'other',
}

/** Periodicidade de uma receita recorrente (`enum IncomeFrequency`). */
export enum IncomeFrequency {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

/** Rótulos em português das origens de receita. */
export const INCOME_TYPE_LABELS: Record<string, string> = {
  [IncomeType.SALARY]: 'Salário',
  [IncomeType.OVERTIME]: 'Hora extra',
  [IncomeType.FREELANCE]: 'Freelance',
  [IncomeType.REIMBURSEMENT]: 'Reembolso',
  [IncomeType.BONUS]: 'Bonificação',
  [IncomeType.COMMISSION]: 'Comissão',
  [IncomeType.PIX]: 'Pix recebido',
  [IncomeType.TRANSFER]: 'Transferência recebida',
  [IncomeType.INVESTMENT]: 'Investimentos',
  [IncomeType.OTHER]: 'Outros',
};

/** Ordem de exibição das origens nos seletores. */
export const INCOME_TYPE_OPTIONS: Array<{ value: IncomeType; label: string }> =
  Object.values(IncomeType).map(value => ({
    value,
    label: INCOME_TYPE_LABELS[value],
  }));

export const INCOME_FREQUENCY_LABELS: Record<string, string> = {
  [IncomeFrequency.DAILY]: 'Diária',
  [IncomeFrequency.WEEKLY]: 'Semanal',
  [IncomeFrequency.MONTHLY]: 'Mensal',
  [IncomeFrequency.YEARLY]: 'Anual',
};

export const INCOME_FREQUENCY_OPTIONS: Array<{
  value: IncomeFrequency;
  label: string;
}> = Object.values(IncomeFrequency).map(value => ({
  value,
  label: INCOME_FREQUENCY_LABELS[value],
}));

/** Conta de destino resumida, quando o backend faz o join. */
export interface IncomeAccountDto {
  id: string;
  name: string;
  institution?: string;
  type?: string;
}

/** Receita retornada pela API. */
export interface IncomeDto {
  id: string;
  userId: string;
  accountId: string;
  description: string;
  /** Texto livre na entidade, mas validado contra `IncomeType` na escrita. */
  type: IncomeType | string;
  /**
   * Colunas `decimal` do PostgreSQL podem chegar como string no driver `pg`.
   * As telas devem passar por `toIncomeAmount` antes de somar.
   */
  amount: number | string;
  date: Date | string;
  /** `bruno`, `giovanna` ou outro responsável cadastrado. */
  responsible: string;
  isRecurring: boolean;
  frequency?: IncomeFrequency | string | null;
  observation?: string | null;
  account?: IncomeAccountDto | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/** Corpo de `POST /incomes`. */
export interface CreateIncomeDto {
  description: string;
  type: IncomeType;
  /** Precisa ser maior que zero (validado no backend). */
  amount: number;
  /** Enviado em ISO — o backend converte com `new Date(value)`. */
  date: string;
  /** UUID v4 da conta em que o dinheiro entrou. */
  accountId: string;
  responsible: string;
  isRecurring?: boolean;
  frequency?: IncomeFrequency;
  observation?: string;
}

/** Corpo de `PUT /incomes/:id` — todos os campos opcionais. */
export type UpdateIncomeDto = Partial<CreateIncomeDto>;

/** Resposta de `GET /incomes/type-breakdown`. */
export interface IncomeTypeBreakdownDto {
  type: string;
  total: number | string;
  count: number | string;
}

/** Resposta de `GET /incomes/recurring/monthly`. */
export interface RecurringMonthlyIncomeDto {
  responsible: string;
  monthlyAmount: number;
}

/** Resposta de `GET /incomes/monthly/:month/:year`. */
export interface IncomeMonthlyTotalDto {
  month: number;
  year: number;
  total: number;
}

/** Resposta de `GET /incomes/total-by-responsible/:responsible`. */
export interface IncomeTotalByResponsibleDto {
  responsible: string;
  total: number;
}

/**
 * Converte com segurança um valor monetário vindo da API.
 *
 * Sem isso, `decimal` serializado como string faria `a + b` concatenar
 * ("1000" + "500" = "1000500") em vez de somar.
 */
export function toIncomeAmount(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
