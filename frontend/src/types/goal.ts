/**
 * Tipos do módulo de Metas Financeiras (`goals`).
 *
 * Espelham o backend em:
 * backend/src/modules/goals/goals.types.ts
 * backend/src/modules/goals/dtos/goal.dto.ts
 * backend/src/modules/goals/entities/goal.entity.ts
 *
 * Vários campos de `GoalProgress` são `null` DE PROPÓSITO — "aporte necessário
 * desconhecido" e "aporte necessário R$ 0,00" são coisas diferentes. A tela
 * precisa distinguir para não exibir número inventado (regra 27 do projeto).
 */

export enum GoalType {
  EMERGENCY_FUND = 'EMERGENCY_FUND',
  TRAVEL = 'TRAVEL',
  CAR = 'CAR',
  HOUSE = 'HOUSE',
  INVESTMENT = 'INVESTMENT',
  OTHER = 'OTHER',
}

export enum GoalStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export const GOAL_TYPE_LABELS: Record<string, string> = {
  [GoalType.EMERGENCY_FUND]: 'Reserva de emergência',
  [GoalType.TRAVEL]: 'Viagem',
  [GoalType.CAR]: 'Carro',
  [GoalType.HOUSE]: 'Casa',
  [GoalType.INVESTMENT]: 'Investimentos',
  [GoalType.OTHER]: 'Outros',
};

export const GOAL_TYPE_ICONS: Record<string, string> = {
  [GoalType.EMERGENCY_FUND]: '🛟',
  [GoalType.TRAVEL]: '✈️',
  [GoalType.CAR]: '🚗',
  [GoalType.HOUSE]: '🏠',
  [GoalType.INVESTMENT]: '📈',
  [GoalType.OTHER]: '🎯',
};

export const GOAL_TYPE_OPTIONS: Array<{ value: GoalType; label: string }> =
  Object.values(GoalType).map(value => ({
    value,
    label: GOAL_TYPE_LABELS[value],
  }));

export const GOAL_STATUS_LABELS: Record<string, string> = {
  [GoalStatus.ACTIVE]: 'Ativa',
  [GoalStatus.COMPLETED]: 'Concluída',
  [GoalStatus.CANCELLED]: 'Cancelada',
};

/** Progresso calculado pelo backend e devolvido junto de toda meta. */
export interface GoalProgressDto {
  /** Percentual concluído (0–100), limitado a 100. `null` se o objetivo for zero. */
  progressPercentage: number | null;
  targetAmount: number;
  currentAmount: number;
  /** Quanto ainda falta guardar. Nunca negativo. */
  remainingAmount: number;
  isCompleted: boolean;

  deadline: Date | string | null;
  /** Meses cheios até o prazo. `null` sem prazo; `0` se vence hoje ou já venceu. */
  monthsRemaining: number | null;
  isOverdue: boolean;

  /** Aporte mensal necessário para bater a meta no prazo. */
  requiredMonthlyContribution: number | null;
  /** Aporte mensal que o usuário planejou. */
  plannedMonthlyContribution: number | null;
  /** O planejado dá conta do necessário? `null` quando falta informação. */
  isPlannedContributionSufficient: boolean | null;
  /** Quanto falta no aporte planejado para alcançar o necessário. */
  monthlyContributionGap: number | null;

  projectedMonthsToComplete: number | null;
  projectedCompletionDate: Date | string | null;
  /** No ritmo atual, a meta é atingida até o prazo? `null` sem informação. */
  willMeetDeadline: boolean | null;

  /** Resumo em português do que os números acima significam. */
  message: string;
}

/** Meta acompanhada do progresso calculado — formato devolvido pela API. */
export interface GoalDto {
  id: string;
  familyId?: string | null;
  userId: string;
  name: string;
  type: GoalType | string;
  targetAmount: number | string;
  currentAmount: number | string;
  deadline?: Date | string | null;
  monthlyContribution?: number | string | null;
  description?: string | null;
  status: GoalStatus | string;
  lastContributionAt?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  progress: GoalProgressDto;
}

/** Meta em risco: prazo vencido ou aporte planejado insuficiente. */
export interface GoalAtRiskDto {
  id: string;
  name: string;
  type: GoalType | string;
  reason: string;
}

/** Resposta de `GET /goals/summary`. */
export interface GoalsSummaryDto {
  totalGoals: number;
  activeGoals: number;
  completedGoals: number;
  cancelledGoals: number;

  /** Totais consideram metas ativas e concluídas — canceladas ficam de fora. */
  totalTargetAmount: number;
  totalCurrentAmount: number;
  totalRemainingAmount: number;
  /** Progresso agregado. `null` se não houver objetivo. */
  overallProgressPercentage: number | null;

  /** Somatórios apenas das metas ATIVAS. */
  totalPlannedMonthlyContribution: number;
  totalRequiredMonthlyContribution: number;
  monthlyContributionGap: number;

  overdueGoals: number;
  goalsAtRisk: GoalAtRiskDto[];
  nextDeadline: { id: string; name: string; deadline: Date | string } | null;
}

/** Corpo de `POST /goals`. */
export interface CreateGoalDto {
  name: string;
  type: GoalType;
  /** Precisa ser maior que zero. */
  targetAmount: number;
  currentAmount?: number;
  /** ISO — o backend converte com `new Date(value)`. */
  deadline?: string;
  /** Aporte mensal PLANEJADO (o necessário é calculado pelo backend). */
  monthlyContribution?: number;
  description?: string;
}

/** Corpo de `PUT /goals/:id`. */
export interface UpdateGoalDto {
  name?: string;
  type?: GoalType;
  targetAmount?: number;
  currentAmount?: number;
  deadline?: string;
  monthlyContribution?: number;
  description?: string;
  status?: GoalStatus;
}

/** Corpo de `POST /goals/:id/contributions`. */
export interface AddContributionDto {
  /** Precisa ser maior que zero. */
  amount: number;
  /** ISO. Opcional — o backend assume a data de hoje. */
  date?: string;
}

/**
 * Converte com segurança um valor monetário vindo da API.
 * Colunas `decimal` chegam como string no driver `pg`.
 */
export function toGoalAmount(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
