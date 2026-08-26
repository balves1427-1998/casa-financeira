'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';

export interface Account {
  id: string;
  name: string;
  type: 'checking' | 'savings' | 'wallet' | 'digital' | 'credit_card';
  institution: string;
  balance: number;
  initialBalance: number;
  limit?: number;
  closingDay?: number;
  dueDay?: number;
  createdAt: string;
  updatedAt: string;
}

export const useAccounts = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch all accounts
  const fetchAccounts = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiClient.getAccounts();
      setAccounts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch accounts');
      console.error('Error fetching accounts:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch total balance
  const fetchTotalBalance = async () => {
    try {
      const data = await apiClient.getTotalBalance();
      setTotalBalance(data.totalBalance);
    } catch (err) {
      console.error('Error fetching total balance:', err);
    }
  };

  // Create account
  const createAccount = async (accountData: any) => {
    try {
      setError(null);
      const newAccount = await apiClient.createAccount(accountData);
      setAccounts([...accounts, newAccount]);
      await fetchTotalBalance();
      return newAccount;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create account';
      setError(errorMessage);
      throw err;
    }
  };

  // Update account
  const updateAccount = async (id: string, updateData: any) => {
    try {
      setError(null);
      const updated = await apiClient.updateAccount(id, updateData);
      setAccounts(accounts.map((acc) => (acc.id === id ? updated : acc)));
      await fetchTotalBalance();
      return updated;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update account';
      setError(errorMessage);
      throw err;
    }
  };

  // Delete account
  const deleteAccount = async (id: string) => {
    try {
      setError(null);
      await apiClient.deleteAccount(id);
      setAccounts(accounts.filter((acc) => acc.id !== id));
      await fetchTotalBalance();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete account';
      setError(errorMessage);
      throw err;
    }
  };

  // Get account by ID
  const getAccount = async (id: string) => {
    try {
      return await apiClient.getAccount(id);
    } catch (err) {
      console.error('Error fetching account:', err);
      throw err;
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchAccounts();
    fetchTotalBalance();
  }, []);

  return {
    accounts,
    totalBalance,
    isLoading,
    error,
    fetchAccounts,
    fetchTotalBalance,
    createAccount,
    updateAccount,
    deleteAccount,
    getAccount,
  };
};
