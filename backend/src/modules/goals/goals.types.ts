import { Goal, GoalStatus, GoalType } from './entities/goal.entity';

/**
 * Progresso calculado de uma meta.
 *
 * Campos que só fazem sentido em certas situações são `null` — e não zero — de
 * propósito: "aporte necessário desconhecido" e "aporte necessário R$ 0,00" são
 * coisas diferentes, e o front precisa distinguir para não exibir número
 * inventado.
 */
export interface GoalProgress {
  /** Percentual concluído (0–100), limitado a 100. `null` se o objetivo for zero. */
  progressPercentage: number | null;
  targetAmount: number;
  currentAmount: number;
  /** Quanto ainda falta guardar. Nunca negativo. */
  remainingAmount: number;
  isCompleted: boolean;

  deadline: Date | null;
  /** Meses cheios entre hoje e o prazo. `null` sem prazo; `0` se vence hoje ou já venceu. */
  monthsRemaining: number | null;
  /** Prazo já passou e a meta não foi concluída. */
  isOverdue: boolean;

  /** Aporte mensal necessário para bater a meta no prazo (restante ÷ meses restantes). */
  requiredMonthlyContribution: number | null;
  /** Aporte mensal que o usuário planejou. */
  plannedMonthlyContribution: number | null;
  /** O aporte planejado dá conta do necessário? `null` quando falta informação. */
  isPlannedContributionSufficient: boolean | null;
  /** Quanto falta no aporte planejado para alcançar o necessário. */
  monthlyContributionGap: number | null;

  /** Meses até concluir mantendo o aporte planejado. */
  projectedMonthsToComplete: number | null;
  /** Data prevista de conclusão no ritmo atual (estimativa em meses cheios). */
  projectedCompletionDate: Date | null;
  /**
   * No ritmo atual, a meta é atingida até o prazo? `null` quando falta
   * informação. Comparado em MESES (projetados × restantes), a mesma unidade do
   * aporte necessário — usar a data exata daria respostas contraditórias.
   */
  willMeetDeadline: boolean | null;

  /** Resumo em português do que os números acima significam. */
  message: string;
}

/** Meta acompanhada do seu progresso calculado — formato devolvido pela API. */
export interface GoalWithProgress extends Goal {
  progress: GoalProgress;
}

/** Meta em risco: prazo vencido ou aporte planejado insuficiente. */
export interface GoalAtRisk {
  id: string;
  name: string;
  type: GoalType;
  reason: string;
}

/** Visão agregada de todas as metas da família. */
export interface GoalsSummary {
  totalGoals: number;
  activeGoals: number;
  completedGoals: number;
  cancelledGoals: number;

  /** Totais consideram metas ativas e concluídas — canceladas ficam de fora. */
  totalTargetAmount: number;
  totalCurrentAmount: number;
  totalRemainingAmount: number;
  /** Progresso agregado (acumulado ÷ objetivo). `null` se não houver objetivo. */
  overallProgressPercentage: number | null;

  /** Somatórios apenas das metas ATIVAS — são as que ainda exigem dinheiro. */
  totalPlannedMonthlyContribution: number;
  totalRequiredMonthlyContribution: number;
  /** Diferença entre o que precisa ser aportado por mês e o que está planejado. */
  monthlyContributionGap: number;

  overdueGoals: number;
  goalsAtRisk: GoalAtRisk[];
  nextDeadline: { id: string; name: string; deadline: Date } | null;
}

export { GoalStatus, GoalType };
