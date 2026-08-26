'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import {
  AddContributionDto,
  CreateGoalDto,
  GoalDto,
  GoalStatus,
  GoalsSummaryDto,
  UpdateGoalDto,
} from '@/types/goal';
import { getApiErrorMessage } from '@/utils/api-error';

interface UseGoalsState {
  goals: GoalDto[];
  summary: GoalsSummaryDto | null;
  /** Filtro de status atualmente aplicado (`undefined` = todas). */
  statusFilter: GoalStatus | undefined;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
}

/**
 * Hook de Metas Financeiras (item 19 do escopo).
 *
 * Toda meta já chega com o bloco `progress` calculado pelo backend — a tela
 * apenas desenha, nunca refaz as contas. Depois de um aporte, o resumo é
 * recarregado porque os agregados (aporte necessário, metas em risco) mudam.
 */
export function useGoals(initialStatus?: GoalStatus) {
  const [state, setState] = useState<UseGoalsState>({
    goals: [],
    summary: null,
    statusFilter: initialStatus,
    isLoading: false,
    isSaving: false,
    error: null,
  });

  const fetchGoals = useCallback(async (status?: GoalStatus) => {
    setState(prev => ({ ...prev, isLoading: true, error: null, statusFilter: status }));
    try {
      const data = await apiClient.getGoals(status);
      setState(prev => ({ ...prev, goals: data || [], isLoading: false }));
      return data;
    } catch (err) {
      const errorMsg = getApiErrorMessage(err, 'Erro ao carregar as metas');
      setState(prev => ({ ...prev, error: errorMsg, isLoading: false }));
      throw err;
    }
  }, []);

  const fetchSummary = useCallback(async () => {
    try {
      const data = await apiClient.getGoalsSummary();
      setState(prev => ({ ...prev, summary: data }));
      return data;
    } catch (err) {
      const errorMsg = getApiErrorMessage(err, 'Erro ao carregar o resumo das metas');
      setState(prev => ({ ...prev, error: errorMsg }));
      throw err;
    }
  }, []);

  const createGoal = useCallback(
    async (dto: CreateGoalDto) => {
      setState(prev => ({ ...prev, isSaving: true, error: null }));
      try {
        const created = await apiClient.createGoal(dto);
        setState(prev => ({
          ...prev,
          goals: [created, ...prev.goals],
          isSaving: false,
        }));
        await fetchSummary().catch(() => undefined);
        return created;
      } catch (err) {
        const errorMsg = getApiErrorMessage(err, 'Erro ao criar a meta');
        setState(prev => ({ ...prev, error: errorMsg, isSaving: false }));
        throw new Error(errorMsg);
      }
    },
    [fetchSummary],
  );

  const updateGoal = useCallback(
    async (id: string, dto: UpdateGoalDto) => {
      setState(prev => ({ ...prev, isSaving: true, error: null }));
      try {
        const updated = await apiClient.updateGoal(id, dto);
        setState(prev => ({
          ...prev,
          goals: prev.goals.map(goal => (goal.id === id ? updated : goal)),
          isSaving: false,
        }));
        await fetchSummary().catch(() => undefined);
        return updated;
      } catch (err) {
        const errorMsg = getApiErrorMessage(err, 'Erro ao atualizar a meta');
        setState(prev => ({ ...prev, error: errorMsg, isSaving: false }));
        throw new Error(errorMsg);
      }
    },
    [fetchSummary],
  );

  /** Registra um aporte. A resposta já traz o progresso recalculado. */
  const addContribution = useCallback(
    async (id: string, dto: AddContributionDto) => {
      setState(prev => ({ ...prev, isSaving: true, error: null }));
      try {
        const updated = await apiClient.addGoalContribution(id, dto);
        setState(prev => ({
          ...prev,
          goals: prev.goals.map(goal => (goal.id === id ? updated : goal)),
          isSaving: false,
        }));
        await fetchSummary().catch(() => undefined);
        return updated;
      } catch (err) {
        const errorMsg = getApiErrorMessage(err, 'Erro ao registrar o aporte');
        setState(prev => ({ ...prev, error: errorMsg, isSaving: false }));
        throw new Error(errorMsg);
      }
    },
    [fetchSummary],
  );

  const deleteGoal = useCallback(
    async (id: string) => {
      setState(prev => ({ ...prev, isSaving: true, error: null }));
      try {
        await apiClient.deleteGoal(id);
        setState(prev => ({
          ...prev,
          goals: prev.goals.filter(goal => goal.id !== id),
          isSaving: false,
        }));
        await fetchSummary().catch(() => undefined);
        return true;
      } catch (err) {
        const errorMsg = getApiErrorMessage(err, 'Erro ao excluir a meta');
        setState(prev => ({ ...prev, error: errorMsg, isSaving: false }));
        throw new Error(errorMsg);
      }
    },
    [fetchSummary],
  );

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  // Carga inicial
  useEffect(() => {
    fetchGoals(initialStatus).catch(() => undefined);
    fetchSummary().catch(() => undefined);
  }, [fetchGoals, fetchSummary, initialStatus]);

  return {
    ...state,
    fetchGoals,
    fetchSummary,
    createGoal,
    updateGoal,
    addContribution,
    deleteGoal,
    clearError,
  };
}
