'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import {
  CreateCreditCardDto,
  UpdateCreditCardDto,
  toCreditCardAmount,
} from '@/types/credit-card';
import { getApiErrorMessage } from '@/utils/api-error';

export interface CreditCard {
  id: string;
  name: string;
  bank: string;
  cardNumber: string;
  limit: number;
  currentBalance: number;
  closingDay: number;
  dueDay: number;
  status: 'active' | 'inactive' | 'blocked' | 'expired';
  cardholderName?: string;
  cardType?: string;
  expiryDate?: string;
  accountId?: string;
  interestRate?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/** Resumo de `GET /credit-cards/utilization/total`, já com números. */
export interface CreditCardUtilization {
  totalCards: number;
  totalLimit: number;
  totalBalance: number;
  availableLimit: number;
  utilizationPercentage: number;
}

/**
 * Normaliza um registro vindo da API.
 *
 * `limit`, `currentBalance` e `interestRate` são colunas `decimal` do
 * PostgreSQL e chegam como STRING pelo driver `pg` (`"5000.00"`). Sem a
 * conversão, `currentBalance / limit` funcionaria por coerção mas
 * `limit.toLocaleString('pt-BR', …)` cairia no método de String e devolveria
 * "5000.00", fora do padrão R$ 0.000,00.
 */
function normalizeCard(raw: any): CreditCard {
  return {
    ...raw,
    limit: toCreditCardAmount(raw?.limit),
    currentBalance: toCreditCardAmount(raw?.currentBalance),
    closingDay: Number(raw?.closingDay ?? 0),
    dueDay: Number(raw?.dueDay ?? 0),
    interestRate:
      raw?.interestRate === null || raw?.interestRate === undefined
        ? undefined
        : toCreditCardAmount(raw.interestRate),
  } as CreditCard;
}

function normalizeUtilization(raw: any): CreditCardUtilization {
  return {
    totalCards: Number(raw?.totalCards ?? 0),
    totalLimit: toCreditCardAmount(raw?.totalLimit),
    totalBalance: toCreditCardAmount(raw?.totalBalance),
    availableLimit: toCreditCardAmount(raw?.availableLimit),
    utilizationPercentage: toCreditCardAmount(raw?.utilizationPercentage),
  };
}

export const useCreditCards = () => {
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [totalUtilization, setTotalUtilization] =
    useState<CreditCardUtilization | null>(null);
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
  const fetchCards = useCallback(async (options?: { silent?: boolean }) => {
    try {
      if (!options?.silent) setIsLoading(true);
      setError(null);
      const data = await apiClient.get('/credit-cards');
      const normalized: CreditCard[] = Array.isArray(data)
        ? data.map(normalizeCard)
        : [];
      setCards(normalized);
      return normalized;
    } catch (err) {
      setError(getApiErrorMessage(err, 'Erro ao carregar os cartões'));
      console.error('Error fetching credit cards:', err);
      return [] as CreditCard[];
    } finally {
      if (!options?.silent) setIsLoading(false);
    }
  }, []);

  // Fetch total utilization
  const fetchTotalUtilization = useCallback(async () => {
    try {
      const data = await apiClient.get('/credit-cards/utilization/total');
      setTotalUtilization(normalizeUtilization(data));
    } catch (err) {
      console.error('Error fetching total utilization:', err);
    }
  }, []);

  // Create credit card
  const createCard = useCallback(
    async (cardData: CreateCreditCardDto | any) => {
      try {
        setIsSaving(true);
        setError(null);
        const created = normalizeCard(
          await apiClient.post('/credit-cards', cardData),
        );
        setCards(prev => [...prev, created]);
        await fetchTotalUtilization();
        return created;
      } catch (err) {
        const errorMessage = getApiErrorMessage(err, 'Erro ao cadastrar o cartão');
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setIsSaving(false);
      }
    },
    [fetchTotalUtilization],
  );

  // Update credit card
  const updateCard = useCallback(
    async (id: string, updateData: UpdateCreditCardDto | any) => {
      try {
        setIsSaving(true);
        setError(null);
        const updated = normalizeCard(
          await apiClient.put(`/credit-cards/${id}`, updateData),
        );
        setCards(prev => prev.map(card => (card.id === id ? updated : card)));
        await fetchTotalUtilization();
        return updated;
      } catch (err) {
        const errorMessage = getApiErrorMessage(err, 'Erro ao atualizar o cartão');
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setIsSaving(false);
      }
    },
    [fetchTotalUtilization],
  );

  // Delete credit card
  const deleteCard = useCallback(
    async (id: string) => {
      try {
        setIsSaving(true);
        setError(null);
        await apiClient.delete(`/credit-cards/${id}`);
        setCards(prev => prev.filter(card => card.id !== id));
        await fetchTotalUtilization();
        return true;
      } catch (err) {
        const errorMessage = getApiErrorMessage(err, 'Erro ao excluir o cartão');
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setIsSaving(false);
      }
    },
    [fetchTotalUtilization],
  );

  // Get card utilization
  const getCardUtilization = useCallback(async (id: string) => {
    try {
      return await apiClient.get(`/credit-cards/${id}/utilization`);
    } catch (err) {
      console.error('Error fetching card utilization:', err);
      throw err;
    }
  }, []);

  // Get upcoming due dates
  const getUpcomingDueDates = useCallback(async () => {
    try {
      return await apiClient.get('/credit-cards/due-dates');
    } catch (err) {
      console.error('Error fetching upcoming due dates:', err);
      throw err;
    }
  }, []);

  // Update balance
  const updateBalance = useCallback(
    async (id: string, balance: number) => {
      try {
        setIsSaving(true);
        setError(null);
        const updated = normalizeCard(
          await apiClient.patch(`/credit-cards/${id}/balance`, { balance }),
        );
        setCards(prev => prev.map(card => (card.id === id ? updated : card)));
        await fetchTotalUtilization();
        return updated;
      } catch (err) {
        const errorMessage = getApiErrorMessage(
          err,
          'Erro ao atualizar o saldo do cartão',
        );
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setIsSaving(false);
      }
    },
    [fetchTotalUtilization],
  );

  const clearError = useCallback(() => setError(null), []);

  // Initial fetch
  useEffect(() => {
    fetchCards();
    fetchTotalUtilization();
  }, [fetchCards, fetchTotalUtilization]);

  return {
    cards,
    totalUtilization,
    isLoading,
    isSaving,
    error,
    fetchCards,
    fetchTotalUtilization,
    createCard,
    updateCard,
    deleteCard,
    getCardUtilization,
    getUpcomingDueDates,
    updateBalance,
    clearError,
  };
};
