'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import {
  CreateAccountDto,
  UpdateAccountDto,
  toAccountAmount,
} from '@/types/account';
import { getApiErrorMessage } from '@/utils/api-error';

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

/**
 * Normaliza um registro vindo da API.
 *
 * As colunas `decimal` do PostgreSQL chegam como STRING pelo driver `pg`
 * (`"3000.00"`), mas a interface promete `balance: number`. Sem a conversão,
 * `balance.toLocaleString('pt-BR', …)` cai no método de String e devolve
 * "3000.00" — sem separador de milhar e fora do padrão brasileiro.
 */
function normalizeAccount(raw: any): Account {
  return {
    ...raw,
    balance: toAccountAmount(raw?.balance),
    initialBalance: toAccountAmount(raw?.initialBalance),
    limit:
      raw?.limit === null || raw?.limit === undefined
        ? undefined
        : toAccountAmount(raw.limit),
    closingDay:
      raw?.closingDay === null || raw?.closingDay === undefined
        ? undefined
        : Number(raw.closingDay),
    dueDay:
      raw?.dueDay === null || raw?.dueDay === undefined
        ? undefined
        : Number(raw.dueDay),
  } as Account;
}

export const useAccounts = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [totalBalance, setTotalBalance] = useState(0);
  /**
   * De onde vem o saldo: quanto foi cadastrado, quanto os lançamentos moveram
   * e quanto se moveu sem apontar para conta nenhuma.
   */
  const [saldoDetalhado, setSaldoDetalhado] = useState({
    saldoInicial: 0,
    movimento: 0,
    semConta: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  /** `true` durante criação, edição ou exclusão — separado da carga da lista. */
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch all accounts
  const fetchAccounts = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiClient.getAccounts();
      const normalized: Account[] = Array.isArray(data) ? data.map(normalizeAccount) : [];
      setAccounts(normalized);
      return normalized;
    } catch (err) {
      setError(getApiErrorMessage(err, 'Erro ao carregar as contas'));
      console.error('Error fetching accounts:', err);
      return [] as Account[];
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch total balance
  const fetchTotalBalance = useCallback(async () => {
    try {
      const data = await apiClient.getTotalBalance();
      setTotalBalance(toAccountAmount(data?.totalBalance));
      setSaldoDetalhado({
        saldoInicial: toAccountAmount(data?.saldoInicial),
        movimento: toAccountAmount(data?.movimento),
        semConta: toAccountAmount(data?.semConta),
      });
    } catch (err) {
      console.error('Error fetching total balance:', err);
    }
  }, []);

  /** Recarrega a lista e o saldo consolidado (somado no backend). */
  const refreshAll = useCallback(async () => {
    await Promise.all([
      fetchAccounts().catch(() => undefined),
      fetchTotalBalance().catch(() => undefined),
    ]);
  }, [fetchAccounts, fetchTotalBalance]);

  // Create account
  const createAccount = useCallback(
    async (accountData: CreateAccountDto | any) => {
      try {
        setIsSaving(true);
        setError(null);
        const created = normalizeAccount(await apiClient.createAccount(accountData));
        setAccounts((prev) => [created, ...prev]);
        await fetchTotalBalance();
        return created;
      } catch (err) {
        const errorMessage = getApiErrorMessage(err, 'Erro ao cadastrar a conta');
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setIsSaving(false);
      }
    },
    [fetchTotalBalance],
  );

  // Update account
  const updateAccount = useCallback(
    async (id: string, updateData: UpdateAccountDto | any) => {
      try {
        setIsSaving(true);
        setError(null);
        const updated = normalizeAccount(await apiClient.updateAccount(id, updateData));
        setAccounts((prev) => prev.map((acc) => (acc.id === id ? updated : acc)));
        await fetchTotalBalance();
        return updated;
      } catch (err) {
        const errorMessage = getApiErrorMessage(err, 'Erro ao atualizar a conta');
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setIsSaving(false);
      }
    },
    [fetchTotalBalance],
  );

  // Delete account
  const deleteAccount = useCallback(
    async (id: string) => {
      try {
        setIsSaving(true);
        setError(null);
        await apiClient.deleteAccount(id);
        setAccounts((prev) => prev.filter((acc) => acc.id !== id));
        await fetchTotalBalance();
        return true;
      } catch (err) {
        const errorMessage = getApiErrorMessage(err, 'Erro ao excluir a conta');
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setIsSaving(false);
      }
    },
    [fetchTotalBalance],
  );

  // Get account by ID
  const getAccount = useCallback(async (id: string) => {
    try {
      return normalizeAccount(await apiClient.getAccount(id));
    } catch (err) {
      console.error('Error fetching account:', err);
      throw err;
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  // Initial fetch
  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  return {
    accounts,
    totalBalance,
    saldoDetalhado,
    isLoading,
    isSaving,
    error,
    fetchAccounts,
    fetchTotalBalance,
    refreshAll,
    createAccount,
    updateAccount,
    deleteAccount,
    getAccount,
    clearError,
  };
};
