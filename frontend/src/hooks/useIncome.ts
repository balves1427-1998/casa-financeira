'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import {
  CreateIncomeDto,
  IncomeDto,
  IncomeTypeBreakdownDto,
  RecurringMonthlyIncomeDto,
  UpdateIncomeDto,
} from '@/types/income';
import { getApiErrorMessage } from '@/utils/api-error';

interface UseIncomeState {
  incomes: IncomeDto[];
  /** Composição da renda por origem (`GET /incomes/type-breakdown`). */
  typeBreakdown: IncomeTypeBreakdownDto[];
  /** Renda mensal recorrente por responsável (`GET /incomes/recurring/monthly`). */
  recurringMonthly: RecurringMonthlyIncomeDto[];
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
}

/**
 * Hook de Receitas (item 3 do escopo).
 *
 * Substitui o antigo `useReceipts`: o módulo `receipts` foi REMOVIDO do backend
 * e as duas tabelas do mesmo conceito foram consolidadas em `incomes`.
 */
export function useIncome() {
  const [state, setState] = useState<UseIncomeState>({
    incomes: [],
    typeBreakdown: [],
    recurringMonthly: [],
    isLoading: false,
    isSaving: false,
    error: null,
  });

  const fetchIncomes = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const data = await apiClient.getIncomes();
      setState(prev => ({ ...prev, incomes: data || [], isLoading: false }));
      return data;
    } catch (err) {
      const errorMsg = getApiErrorMessage(err, 'Erro ao carregar as receitas');
      setState(prev => ({ ...prev, error: errorMsg, isLoading: false }));
      throw err;
    }
  }, []);

  const fetchTypeBreakdown = useCallback(async () => {
    try {
      const data = await apiClient.getIncomeTypeBreakdown();
      setState(prev => ({ ...prev, typeBreakdown: data || [] }));
      return data;
    } catch (err) {
      const errorMsg = getApiErrorMessage(
        err,
        'Erro ao carregar a composição das receitas',
      );
      setState(prev => ({ ...prev, error: errorMsg }));
      throw err;
    }
  }, []);

  const fetchRecurringMonthly = useCallback(async () => {
    try {
      const data = await apiClient.getRecurringMonthlyIncome();
      setState(prev => ({ ...prev, recurringMonthly: data || [] }));
      return data;
    } catch (err) {
      const errorMsg = getApiErrorMessage(
        err,
        'Erro ao carregar a renda recorrente mensal',
      );
      setState(prev => ({ ...prev, error: errorMsg }));
      throw err;
    }
  }, []);

  /**
   * Recarrega tudo que depende da lista.
   * O breakdown é calculado no backend, então uma criação/edição só aparece no
   * gráfico depois de refazer a consulta.
   */
  const refreshAll = useCallback(async () => {
    await Promise.all([
      fetchIncomes().catch(() => undefined),
      fetchTypeBreakdown().catch(() => undefined),
      fetchRecurringMonthly().catch(() => undefined),
    ]);
  }, [fetchIncomes, fetchTypeBreakdown, fetchRecurringMonthly]);

  const createIncome = useCallback(
    async (dto: CreateIncomeDto) => {
      setState(prev => ({ ...prev, isSaving: true, error: null }));
      try {
        const created = await apiClient.createIncome(dto);
        setState(prev => ({
          ...prev,
          incomes: [created, ...prev.incomes],
          isSaving: false,
        }));
        await Promise.all([
          fetchTypeBreakdown().catch(() => undefined),
          fetchRecurringMonthly().catch(() => undefined),
        ]);
        return created;
      } catch (err) {
        const errorMsg = getApiErrorMessage(err, 'Erro ao cadastrar a receita');
        setState(prev => ({ ...prev, error: errorMsg, isSaving: false }));
        throw new Error(errorMsg);
      }
    },
    [fetchTypeBreakdown, fetchRecurringMonthly],
  );

  const updateIncome = useCallback(
    async (id: string, dto: UpdateIncomeDto) => {
      setState(prev => ({ ...prev, isSaving: true, error: null }));
      try {
        const updated = await apiClient.updateIncome(id, dto);
        setState(prev => ({
          ...prev,
          incomes: prev.incomes.map(income => (income.id === id ? updated : income)),
          isSaving: false,
        }));
        await Promise.all([
          fetchTypeBreakdown().catch(() => undefined),
          fetchRecurringMonthly().catch(() => undefined),
        ]);
        return updated;
      } catch (err) {
        const errorMsg = getApiErrorMessage(err, 'Erro ao atualizar a receita');
        setState(prev => ({ ...prev, error: errorMsg, isSaving: false }));
        throw new Error(errorMsg);
      }
    },
    [fetchTypeBreakdown, fetchRecurringMonthly],
  );

  const deleteIncome = useCallback(
    async (id: string) => {
      setState(prev => ({ ...prev, isSaving: true, error: null }));
      try {
        await apiClient.deleteIncome(id);
        setState(prev => ({
          ...prev,
          incomes: prev.incomes.filter(income => income.id !== id),
          isSaving: false,
        }));
        await Promise.all([
          fetchTypeBreakdown().catch(() => undefined),
          fetchRecurringMonthly().catch(() => undefined),
        ]);
        return true;
      } catch (err) {
        const errorMsg = getApiErrorMessage(err, 'Erro ao excluir a receita');
        setState(prev => ({ ...prev, error: errorMsg, isSaving: false }));
        throw new Error(errorMsg);
      }
    },
    [fetchTypeBreakdown, fetchRecurringMonthly],
  );

  /** Total recebido no mês. Usado pelos KPIs do painel. */
  const getMonthlyTotal = useCallback(async (month: number, year: number) => {
    try {
      const data = await apiClient.getIncomesMonthlyTotal(month, year);
      return data?.total ?? 0;
    } catch (err) {
      const errorMsg = getApiErrorMessage(err, 'Erro ao calcular o total do mês');
      setState(prev => ({ ...prev, error: errorMsg }));
      throw new Error(errorMsg);
    }
  }, []);

  const getTotalByResponsible = useCallback(async (responsible: string) => {
    try {
      const data = await apiClient.getIncomesTotalByResponsible(responsible);
      return data?.total ?? 0;
    } catch (err) {
      const errorMsg = getApiErrorMessage(
        err,
        'Erro ao calcular o total do responsável',
      );
      setState(prev => ({ ...prev, error: errorMsg }));
      throw new Error(errorMsg);
    }
  }, []);

  const fetchByResponsible = useCallback(async (responsible: string) => {
    try {
      return await apiClient.getIncomesByResponsible(responsible);
    } catch (err) {
      const errorMsg = getApiErrorMessage(
        err,
        'Erro ao carregar as receitas do responsável',
      );
      setState(prev => ({ ...prev, error: errorMsg }));
      throw new Error(errorMsg);
    }
  }, []);

  const fetchByType = useCallback(async (type: string) => {
    try {
      return await apiClient.getIncomesByType(type);
    } catch (err) {
      const errorMsg = getApiErrorMessage(err, 'Erro ao carregar as receitas da origem');
      setState(prev => ({ ...prev, error: errorMsg }));
      throw new Error(errorMsg);
    }
  }, []);

  const fetchByDateRange = useCallback(async (startDate: Date, endDate: Date) => {
    try {
      return await apiClient.getIncomesByDateRange(startDate, endDate);
    } catch (err) {
      const errorMsg = getApiErrorMessage(err, 'Erro ao carregar as receitas do período');
      setState(prev => ({ ...prev, error: errorMsg }));
      throw new Error(errorMsg);
    }
  }, []);

  const fetchRecurring = useCallback(async () => {
    try {
      return await apiClient.getRecurringIncomes();
    } catch (err) {
      const errorMsg = getApiErrorMessage(err, 'Erro ao carregar as receitas recorrentes');
      setState(prev => ({ ...prev, error: errorMsg }));
      throw new Error(errorMsg);
    }
  }, []);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  // Carga inicial
  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  /**
   * Encerra ou retoma a recorrência da receita.
   *
   * A receita continua na lista — é dinheiro que entrou. O que muda é a
   * projeção das entradas dos próximos meses no Planejado.
   */
  const setIncomeRecurrence = useCallback(
    async (id: string, active: boolean) => {
      setState(prev => ({ ...prev, isSaving: true, error: null }));
      try {
        const atualizada = await apiClient.setIncomeRecurrence(id, active);
        setState(prev => ({
          ...prev,
          incomes: prev.incomes.map(i =>
            i.id === id ? { ...i, ...atualizada } : i,
          ),
          isSaving: false,
        }));
        return atualizada;
      } catch (err) {
        const errorMsg = getApiErrorMessage(err, 'Erro ao alterar a recorrência');
        setState(prev => ({ ...prev, error: errorMsg, isSaving: false }));
        throw new Error(errorMsg);
      }
    },
    [],
  );

  return {
    ...state,
    fetchIncomes,
    setIncomeRecurrence,
    fetchTypeBreakdown,
    fetchRecurringMonthly,
    refreshAll,
    createIncome,
    updateIncome,
    deleteIncome,
    getMonthlyTotal,
    getTotalByResponsible,
    fetchByResponsible,
    fetchByType,
    fetchByDateRange,
    fetchRecurring,
    clearError,
  };
}
