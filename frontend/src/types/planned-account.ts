/**
 * Tipos do módulo de Contas Planejadas (`planned-accounts`).
 *
 * Espelham os DTOs reais do backend em:
 * backend/src/modules/planned-accounts/dtos/create-planned-account.dto.ts
 * backend/src/modules/planned-accounts/entities/planned-account.entity.ts
 */

/** Situações aceitas pelo backend (`enum PlannedAccountStatus`). */
export enum PlannedAccountStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  PAID = 'paid',
  CANCELLED = 'cancelled',
  OVERDUE = 'overdue',
}

export const PLANNED_STATUS_LABELS: Record<string, string> = {
  [PlannedAccountStatus.PENDING]: 'Previsto',
  [PlannedAccountStatus.CONFIRMED]: 'Confirmado',
  [PlannedAccountStatus.PAID]: 'Pago',
  [PlannedAccountStatus.CANCELLED]: 'Cancelado',
  [PlannedAccountStatus.OVERDUE]: 'Vencido',
};

export const PLANNED_STATUS_OPTIONS: Array<{
  value: PlannedAccountStatus;
  label: string;
}> = Object.values(PlannedAccountStatus).map(value => ({
  value,
  label: PLANNED_STATUS_LABELS[value],
}));

/**
 * O mesmo status, dito na língua de uma ENTRADA.
 *
 * No banco entrada e saída compartilham o status `paid` — e o Planejado
 * mostrava "Pago" e um botão "Pagar" em cima do salário, que é o oposto do que
 * acontece. O status não muda; muda a palavra.
 */
export const PLANNED_STATUS_LABELS_INCOME: Record<string, string> = {
  ...PLANNED_STATUS_LABELS,
  [PlannedAccountStatus.PAID]: 'Recebido',
  [PlannedAccountStatus.OVERDUE]: 'Atrasado',
};

/** Rótulo do status conforme o tipo do compromisso. */
export function rotuloDeStatus(status: string, tipo?: string): string {
  const mapa =
    tipo === 'income' ? PLANNED_STATUS_LABELS_INCOME : PLANNED_STATUS_LABELS;
  return mapa[status] || status;
}

/** Periodicidade de uma conta recorrente (`enum RecurrenceFrequency`). */
export enum PlannedFrequency {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

export const PLANNED_FREQUENCY_LABELS: Record<string, string> = {
  [PlannedFrequency.DAILY]: 'Diária',
  [PlannedFrequency.WEEKLY]: 'Semanal',
  [PlannedFrequency.MONTHLY]: 'Mensal',
  [PlannedFrequency.YEARLY]: 'Anual',
};

export const PLANNED_FREQUENCY_OPTIONS: Array<{
  value: PlannedFrequency;
  label: string;
}> = Object.values(PlannedFrequency).map(value => ({
  value,
  label: PLANNED_FREQUENCY_LABELS[value],
}));

/** Prioridade: o backend aceita apenas 0, 1 ou 2 (`@Min(0) @Max(2)`). */
export const PLANNED_PRIORITY_LABELS: Record<number, string> = {
  0: 'Baixa',
  1: 'Normal',
  2: 'Alta',
};

export const PLANNED_PRIORITY_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: 'Baixa' },
  { value: 1, label: 'Normal' },
  { value: 2, label: 'Alta' },
];

/** Responsáveis aceitos pelo backend (`@IsEnum(['bruno', 'giovanna'])`). */
export const PLANNED_RESPONSIBLE_OPTIONS = [
  { value: 'bruno', label: 'Bruno' },
  { value: 'giovanna', label: 'Giovanna' },
];

/**
 * Corpo de `POST /planned-accounts`.
 *
 * ATENÇÃO: `accountId` e `creditCardId` são validados com `@IsUUID()` — string
 * vazia devolve 400. Omita a chave quando o usuário não escolher nada.
 */
export interface CreatePlannedAccountDto {
  description: string;
  amount: number;
  dueDate: string;
  responsible: string;
  category?: string | null;
  accountId?: string;
  creditCardId?: string;
  isRecurring?: boolean;
  frequency?: PlannedFrequency;
  status?: PlannedAccountStatus;
  observation?: string | null;
  priority?: number;
}

/**
 * Corpo de `PUT /planned-accounts/:id`.
 *
 * O `UpdatePlannedAccountDto` do backend é MENOR que o de criação: não aceita
 * `responsible`, `accountId`, `creditCardId`, `isRecurring` nem `frequency`.
 * Com `forbidNonWhitelisted`, enviar qualquer um deles devolve 400.
 */
export interface UpdatePlannedAccountDto {
  description?: string;
  category?: string | null;
  amount?: number;
  dueDate?: string;
  status?: PlannedAccountStatus;
  observation?: string | null;
  priority?: number;
}

/**
 * Converte com segurança um valor monetário vindo da API.
 * A coluna `amount` é `decimal` no Postgres e chega como string (`"1800.00"`).
 */
export function toPlannedAmount(
  value: number | string | null | undefined,
): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
