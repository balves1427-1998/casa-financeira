'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import {
  CreatePlannedAccountDto,
  UpdatePlannedAccountDto,
  toPlannedAmount,
} from '@/types/planned-account';
import { getApiErrorMessage } from '@/utils/api-error';

export interface PlannedAccount {
  id: string;
  description: string;
  category?: string;
  amount: number;
  dueDate: string;
  responsible: string;
  accountId?: string;
  creditCardId?: string;
  status: 'pending' | 'confirmed' | 'paid' | 'cancelled' | 'overdue';
  observation?: string;
  priority: number;
  isRecurring: boolean;
  frequency?: string;
  /**
   * Despesa recorrente que projetou esta ocorrência.
   * Nulo nas contas cadastradas à mão.
   */
  recurringExpenseId?: string | null;
  paymentDate?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Normaliza um registro vindo da API.
 *
 * `amount` é uma coluna `decimal` do PostgreSQL e chega como STRING pelo
 * driver `pg` (`"1800.00"`). Sem a conversão, `sum + p.amount` concatenaria
 * strings em vez de somar — o "Total a Pagar" sairia como "01800.00".
 */
function normalizePlanned(raw: any): PlannedAccount {
  return {
    ...raw,
    amount: toPlannedAmount(raw?.amount),
    priority: Number(raw?.priority ?? 0),
    isRecurring: Boolean(raw?.isRecurring),
  } as PlannedAccount;
}

export const usePlannedAccounts = () => {
  const [planned, setPlanned] = useState<PlannedAccount[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  /** `true` durante criação, edição ou exclusão — separado da carga da lista. */
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Carrega a lista.
   *
   * `silent` evita acender o `isLoading` numa recarga logo após uma gravação —
   * sem isso a tela piscaria o esqueleto a cada salvamento.
   */
  const fetchPlanned = useCallback(async (options?: { silent?: boolean }) => {
    try {
      if (!options?.silent) setIsLoading(true);
      setError(null);
      const data = await apiClient.get('/planned-accounts');
      const normalized: PlannedAccount[] = Array.isArray(data)
        ? data.map(normalizePlanned)
        : [];
      setPlanned(normalized);
      return normalized;
    } catch (err) {
      setError(getApiErrorMessage(err, 'Erro ao carregar as contas planejadas'));
      console.error('Error fetching planned accounts:', err);
      return [] as PlannedAccount[];
    } finally {
      if (!options?.silent) setIsLoading(false);
    }
  }, []);

  // Create planned account
  const createPlanned = useCallback(
    async (plannedData: CreatePlannedAccountDto | any) => {
      try {
        setIsSaving(true);
        setError(null);
        const created = normalizePlanned(
          await apiClient.post('/planned-accounts', plannedData),
        );
        setPlanned(prev => [...prev, created]);
        return created;
      } catch (err) {
        const errorMessage = getApiErrorMessage(
          err,
          'Erro ao cadastrar a conta planejada',
        );
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setIsSaving(false);
      }
    },
    [],
  );

  // Update planned account
  const updatePlanned = useCallback(
    async (id: string, updateData: UpdatePlannedAccountDto | any) => {
      try {
        setIsSaving(true);
        setError(null);
        const updated = normalizePlanned(
          await apiClient.put(`/planned-accounts/${id}`, updateData),
        );
        setPlanned(prev => prev.map(p => (p.id === id ? updated : p)));
        return updated;
      } catch (err) {
        const errorMessage = getApiErrorMessage(
          err,
          'Erro ao atualizar a conta planejada',
        );
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setIsSaving(false);
      }
    },
    [],
  );

  // Delete planned account
  const deletePlanned = useCallback(async (id: string) => {
    try {
      setIsSaving(true);
      setError(null);
      await apiClient.delete(`/planned-accounts/${id}`);
      setPlanned(prev => prev.filter(p => p.id !== id));
      return true;
    } catch (err) {
      const errorMessage = getApiErrorMessage(
        err,
        'Erro ao excluir a conta planejada',
      );
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  }, []);

  // Fetch upcoming planned accounts
  const fetchUpcoming = useCallback(async (days: number = 30) => {
    try {
      const data = await apiClient.get(`/planned-accounts/upcoming?days=${days}`);
      return Array.isArray(data) ? data.map(normalizePlanned) : [];
    } catch (err) {
      console.error('Error fetching upcoming:', err);
      throw err;
    }
  }, []);

  // Fetch overdue planned accounts
  const fetchOverdue = useCallback(async () => {
    try {
      const data = await apiClient.get('/planned-accounts/overdue');
      return Array.isArray(data) ? data.map(normalizePlanned) : [];
    } catch (err) {
      console.error('Error fetching overdue:', err);
      throw err;
    }
  }, []);

  // Get upcoming alerts
  const getUpcomingAlerts = useCallback(async () => {
    try {
      return await apiClient.get('/planned-accounts/alerts');
    } catch (err) {
      console.error('Error fetching alerts:', err);
      throw err;
    }
  }, []);

  // Get monthly plan
  const getMonthlyPlan = useCallback(async (month: number, year: number) => {
    try {
      return await apiClient.get(`/planned-accounts/monthly/${month}/${year}`);
    } catch (err) {
      console.error('Error fetching monthly plan:', err);
      throw err;
    }
  }, []);

  // Get total by responsible
  const getTotalByResponsible = useCallback(
    async (responsible: string, status?: string) => {
      try {
        const url = `/planned-accounts/total-by-responsible/${responsible}${
          status ? `?status=${status}` : ''
        }`;
        return await apiClient.get(url);
      } catch (err) {
        console.error('Error fetching total by responsible:', err);
        throw err;
      }
    },
    [],
  );

  // Mark as paid
  const markAsPaid = useCallback(async (id: string) => {
    try {
      setIsSaving(true);
      setError(null);
      const updated = normalizePlanned(
        await apiClient.patch(`/planned-accounts/${id}/mark-as-paid`, {}),
      );
      setPlanned(prev => prev.map(p => (p.id === id ? updated : p)));
      return updated;
    } catch (err) {
      const errorMessage = getApiErrorMessage(
        err,
        'Erro ao marcar a conta como paga',
      );
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  // Initial fetch
  useEffect(() => {
    fetchPlanned();
  }, [fetchPlanned]);

  return {
    planned,
    isLoading,
    isSaving,
    error,
    fetchPlanned,
    createPlanned,
    updatePlanned,
    deletePlanned,
    fetchUpcoming,
    fetchOverdue,
    getUpcomingAlerts,
    getMonthlyPlan,
    getTotalByResponsible,
    markAsPaid,
    clearError,
  };
};
