'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';

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
  createdAt: string;
  updatedAt: string;
}

export interface CategoryBreakdown {
  category: string;
  total: string;
  count: string;
}

export const useExpenses = () => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch all expenses
  const fetchExpenses = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiClient.get('/expenses');
      setExpenses(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch expenses';
      setError(errorMessage);
      console.error('Error fetching expenses:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Create expense
  const createExpense = async (expenseData: any) => {
    try {
      setError(null);
      const newExpense = await apiClient.post('/expenses', expenseData);
      setExpenses([...expenses, newExpense]);
      return newExpense;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create expense';
      setError(errorMessage);
      throw err;
    }
  };

  // Update expense
  const updateExpense = async (id: string, updateData: any) => {
    try {
      setError(null);
      const updated = await apiClient.put(`/expenses/${id}`, updateData);
      setExpenses(expenses.map((expense) => (expense.id === id ? updated : expense)));
      return updated;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update expense';
      setError(errorMessage);
      throw err;
    }
  };

  // Delete expense
  const deleteExpense = async (id: string) => {
    try {
      setError(null);
      await apiClient.delete(`/expenses/${id}`);
      setExpenses(expenses.filter((expense) => expense.id !== id));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete expense';
      setError(errorMessage);
      throw err;
    }
  };

  // Fetch expenses by category
  const fetchByCategory = async (category: string) => {
    try {
      setError(null);
      return await apiClient.get(`/expenses/by-category/${category}`);
    } catch (err) {
      console.error('Error fetching expenses by category:', err);
      throw err;
    }
  };

  // Fetch expenses by responsible
  const fetchByResponsible = async (responsible: 'bruno' | 'giovanna') => {
    try {
      setError(null);
      return await apiClient.get(`/expenses/by-responsible/${responsible}`);
    } catch (err) {
      console.error('Error fetching expenses by responsible:', err);
      throw err;
    }
  };

  // Fetch expenses by date range
  const fetchByDateRange = async (startDate: string, endDate: string) => {
    try {
      setError(null);
      return await apiClient.get(
        `/expenses/by-date-range?startDate=${startDate}&endDate=${endDate}`,
      );
    } catch (err) {
      console.error('Error fetching expenses by date range:', err);
      throw err;
    }
  };

  // Fetch monthly total
  const getMonthlyTotal = async (month: number, year: number) => {
    try {
      const data = await apiClient.get(`/expenses/monthly/${month}/${year}`);
      return data.total;
    } catch (err) {
      console.error('Error fetching monthly total:', err);
      throw err;
    }
  };

  // Get category breakdown
  const getCategoryBreakdown = async (): Promise<CategoryBreakdown[]> => {
    try {
      return await apiClient.get('/expenses/category-breakdown');
    } catch (err) {
      console.error('Error fetching category breakdown:', err);
      throw err;
    }
  };

  // Fetch recurring expenses
  const fetchRecurring = async () => {
    try {
      return await apiClient.get('/expenses/recurring');
    } catch (err) {
      console.error('Error fetching recurring expenses:', err);
      throw err;
    }
  };

  // Fetch installments
  const fetchInstallments = async (installmentNumber?: number) => {
    try {
      const url =
        installmentNumber !== undefined
          ? `/expenses/installments?installmentNumber=${installmentNumber}`
          : '/expenses/installments';
      return await apiClient.get(url);
    } catch (err) {
      console.error('Error fetching installments:', err);
      throw err;
    }
  };

  // Get daily average
  const getDailyAverage = async (days: number = 30) => {
    try {
      const data = await apiClient.get(`/expenses/daily-average?days=${days}`);
      return data.average;
    } catch (err) {
      console.error('Error fetching daily average:', err);
      throw err;
    }
  };

  // Get total by category
  const getTotalByCategory = async (category: string) => {
    try {
      const data = await apiClient.get(`/expenses/total-by-category/${category}`);
      return data.total;
    } catch (err) {
      console.error('Error fetching total by category:', err);
      throw err;
    }
  };

  // Get total by responsible
  const getTotalByResponsible = async (responsible: 'bruno' | 'giovanna') => {
    try {
      const data = await apiClient.get(`/expenses/total-by-responsible/${responsible}`);
      return data.total;
    } catch (err) {
      console.error('Error fetching total by responsible:', err);
      throw err;
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchExpenses();
  }, []);

  return {
    expenses,
    isLoading,
    error,
    fetchExpenses,
    createExpense,
    updateExpense,
    deleteExpense,
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
  };
};
