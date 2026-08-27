'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import {
  CreateExpenseDto,
  ExpenseCategoryBreakdownDto,
  UpdateExpenseDto,
  toExpenseAmount,
} from '@/types/expense';
import { getApiErrorMessage } from '@/utils/api-error';

export interface Expense {
  id: string;
  description: string;
  establishment?: string;
  amount: number;
  date: string;
  category: string;
  subcategory?: string;
  responsible: 'bruno' | 'giovanna';
  paymentMethod: 'cash' | 'debit' | 'credit' | 'transfer' | 'pix';
  accountId?: string;
  creditCardId?: string;
  isRecurring: boolean;
  frequency?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  installments?: number;
  currentInstallment?: number;
  observation?: string;
  origin: 'manual' | 'bank_statement' | 'credit_card' | 'import' | 'recurring';
  /** Se o dinheiro já saiu — distinto da data do lançamento. */
  isPaid: boolean;
  paidAt?: string | null;
  /** Conta do Planejado vinculada, quando a despesa é recorrente. */
  plannedAccountId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryBreakdown {
  category: string;
  total: string;
  count: string;
}

/**
 * Normaliza um registro vindo da API.
 *
 * As colunas `decimal` do PostgreSQL chegam como STRING pelo driver `pg`
 * (`"1200.00"`), mas a interface `Expense` promete `amount: number`. Sem esta
 * conversão, `soma + despesa.amount` concatena texto em vez de somar e os
 * totais saem errados por ordem de grandeza.
 */
function normalizeExpense(raw: any): Expense {
  return {
    ...raw,
    amount: toExpenseAmount(raw?.amount),
    installments:
      raw?.installments === null || raw?.installments === undefined
        ? undefined
        : Number(raw.installments),
    currentInstallment:
      raw?.currentInstallment === null || raw?.currentInstallment === undefined
        ? undefined
        : Number(raw.currentInstallment),
    // Registros anteriores à coluna vêm sem o campo: tratar `undefined` como
    // "não pago" evita que a lista mostre um estado indefinido.
    isPaid: Boolean(raw?.isPaid),
  } as Expense;
}

function normalizeExpenses(raw: any): Expense[] {
  return Array.isArray(raw) ? raw.map(normalizeExpense) : [];
}

export const useExpenses = () => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  /** Gastos agrupados por categoria (`GET /expenses/category-breakdown`). */
  const [categoryBreakdown, setCategoryBreakdown] = useState<
    ExpenseCategoryBreakdownDto[]
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  /** `true` durante criação, edição ou exclusão — separado da carga da lista. */
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch all expenses
  const fetchExpenses = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiClient.getExpenses();
      const normalized = normalizeExpenses(data);
      setExpenses(normalized);
      return normalized;
    } catch (err) {
      setError(getApiErrorMessage(err, 'Erro ao carregar as despesas'));
      console.error('Error fetching expenses:', err);
      return [] as Expense[];
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Get category breakdown
  const getCategoryBreakdown = useCallback(async (): Promise<CategoryBreakdown[]> => {
    try {
      return await apiClient.getExpensesCategoryBreakdown();
    } catch (err) {
      console.error('Error fetching category breakdown:', err);
      throw err;
    }
  }, []);

  /** Igual ao anterior, mas guarda o resultado no estado do hook. */
  const fetchCategoryBreakdown = useCallback(async () => {
    try {
      const data = await apiClient.getExpensesCategoryBreakdown();
      const lista: ExpenseCategoryBreakdownDto[] = Array.isArray(data) ? data : [];
      setCategoryBreakdown(lista);
      return lista;
    } catch (err) {
      setError(getApiErrorMessage(err, 'Erro ao carregar os gastos por categoria'));
      return [] as ExpenseCategoryBreakdownDto[];
    }
  }, []);

  /** Recarrega a lista e o agrupamento por categoria (calculado no backend). */
  const refreshAll = useCallback(async () => {
    await Promise.all([
      fetchExpenses().catch(() => undefined),
      fetchCategoryBreakdown().catch(() => undefined),
    ]);
  }, [fetchExpenses, fetchCategoryBreakdown]);

  // Create expense
  const createExpense = useCallback(
    async (expenseData: CreateExpenseDto | any) => {
      try {
        setIsSaving(true);
        setError(null);
        const created = normalizeExpense(await apiClient.createExpense(expenseData));
        setExpenses((prev) => [created, ...prev]);
        await fetchCategoryBreakdown().catch(() => undefined);
        return created;
      } catch (err) {
        const errorMessage = getApiErrorMessage(err, 'Erro ao cadastrar a despesa');
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setIsSaving(false);
      }
    },
    [fetchCategoryBreakdown],
  );

  // Update expense
  const updateExpense = useCallback(
    async (id: string, updateData: UpdateExpenseDto | any) => {
      try {
        setIsSaving(true);
        setError(null);
        const updated = normalizeExpense(await apiClient.updateExpense(id, updateData));
        setExpenses((prev) =>
          prev.map((expense) => (expense.id === id ? updated : expense)),
        );
        await fetchCategoryBreakdown().catch(() => undefined);
        return updated;
      } catch (err) {
        const errorMessage = getApiErrorMessage(err, 'Erro ao atualizar a despesa');
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setIsSaving(false);
      }
    },
    [fetchCategoryBreakdown],
  );

  // Delete expense
  const deleteExpense = useCallback(
    async (id: string) => {
      try {
        setIsSaving(true);
        setError(null);
        await apiClient.deleteExpense(id);
        setExpenses((prev) => prev.filter((expense) => expense.id !== id));
        await fetchCategoryBreakdown().catch(() => undefined);
        return true;
      } catch (err) {
        const errorMessage = getApiErrorMessage(err, 'Erro ao excluir a despesa');
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setIsSaving(false);
      }
    },
    [fetchCategoryBreakdown],
  );

  /**
   * Marca ou desmarca a despesa como paga.
   *
   * Atualiza só o registro afetado no estado — recarregar a lista inteira
   * faria a tela piscar a cada clique no ícone.
   */
  const setExpensePaid = useCallback(
    async (id: string, isPaid: boolean) => {
      try {
        setIsSaving(true);
        setError(null);
        const updated = normalizeExpense(await apiClient.setExpensePaid(id, isPaid));
        setExpenses((prev) =>
          prev.map((expense) => (expense.id === id ? updated : expense)),
        );
        return updated;
      } catch (err) {
        const errorMessage = getApiErrorMessage(
          err,
          'Erro ao alterar a situação de pagamento',
        );
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setIsSaving(false);
      }
    },
    [],
  );

  /**
   * Quantas contas a casa pagou no mês, e quanto somaram.
   *
   * A contagem é feita no backend porque ele enxerga todos os lançamentos da
   * família; contar sobre a lista carregada aqui daria um número menor sempre
   * que houvesse filtro aplicado.
   */
  const getPaidSummary = useCallback(async (month: number, year: number) => {
    try {
      const data = await apiClient.getExpensesPaidSummary(month, year);
      return {
        count: Number(data?.count) || 0,
        total: Number(data?.total) || 0,
      };
    } catch (err) {
      console.error('Error fetching paid summary:', err);
      return { count: 0, total: 0 };
    }
  }, []);

  // Fetch expenses by category
  const fetchByCategory = useCallback(async (category: string) => {
    try {
      setError(null);
      return normalizeExpenses(await apiClient.getExpensesByCategory(category));
    } catch (err) {
      console.error('Error fetching expenses by category:', err);
      throw err;
    }
  }, []);

  // Fetch expenses by responsible
  const fetchByResponsible = useCallback(
    async (responsible: 'bruno' | 'giovanna') => {
      try {
        setError(null);
        return normalizeExpenses(await apiClient.getExpensesByResponsible(responsible));
      } catch (err) {
        console.error('Error fetching expenses by responsible:', err);
        throw err;
      }
    },
    [],
  );

  // Fetch expenses by date range
  const fetchByDateRange = useCallback(async (startDate: string, endDate: string) => {
    try {
      setError(null);
      return normalizeExpenses(
        await apiClient.get(
          `/expenses/by-date-range?startDate=${startDate}&endDate=${endDate}`,
        ),
      );
    } catch (err) {
      console.error('Error fetching expenses by date range:', err);
      throw err;
    }
  }, []);

  // Fetch monthly total
  const getMonthlyTotal = useCallback(async (month: number, year: number) => {
    try {
      const data = await apiClient.getExpensesMonthlyTotal(month, year);
      return data.total;
    } catch (err) {
      console.error('Error fetching monthly total:', err);
      throw err;
    }
  }, []);

  // Fetch recurring expenses
  const fetchRecurring = useCallback(async () => {
    try {
      return normalizeExpenses(await apiClient.getExpensesRecurring());
    } catch (err) {
      console.error('Error fetching recurring expenses:', err);
      throw err;
    }
  }, []);

  // Fetch installments
  const fetchInstallments = useCallback(async (installmentNumber?: number) => {
    try {
      return normalizeExpenses(
        await apiClient.getExpensesInstallments(installmentNumber),
      );
    } catch (err) {
      console.error('Error fetching installments:', err);
      throw err;
    }
  }, []);

  // Get daily average
  const getDailyAverage = useCallback(async (days: number = 30) => {
    try {
      const data = await apiClient.getExpensesDailyAverage(days);
      return data.average;
    } catch (err) {
      console.error('Error fetching daily average:', err);
      throw err;
    }
  }, []);

  // Get total by category
  const getTotalByCategory = useCallback(async (category: string) => {
    try {
      const data = await apiClient.getExpensesTotalByCategory(category);
      return data.total;
    } catch (err) {
      console.error('Error fetching total by category:', err);
      throw err;
    }
  }, []);

  // Get total by responsible
  const getTotalByResponsible = useCallback(
    async (responsible: 'bruno' | 'giovanna') => {
      try {
        const data = await apiClient.getExpensesTotalByResponsible(responsible);
        return data.total;
      } catch (err) {
        console.error('Error fetching total by responsible:', err);
        throw err;
      }
    },
    [],
  );

  const clearError = useCallback(() => setError(null), []);

  // Initial fetch
  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  return {
    expenses,
    categoryBreakdown,
    isLoading,
    isSaving,
    error,
    fetchExpenses,
    fetchCategoryBreakdown,
    refreshAll,
    createExpense,
    updateExpense,
    deleteExpense,
    setExpensePaid,
    getPaidSummary,
    fetchByCategory,
    fetchByResponsible,
    fetchByDateRange,
    getMonthlyTotal,
    getCategoryBreakdown,
    fetchRecurring,
    fetchInstallments,
    getDailyAverage,
    getTotalByCategory,
    getTotalByResponsible,
    clearError,
  };
};
