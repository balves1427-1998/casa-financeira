'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';

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
  cardType?: string;
  expiryDate?: string;
  interestRate?: number;
  createdAt: string;
  updatedAt: string;
}

export const useCreditCards = () => {
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [totalUtilization, setTotalUtilization] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch all credit cards
  const fetchCards = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiClient.get('/credit-cards');
      setCards(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch credit cards';
      setError(errorMessage);
      console.error('Error fetching credit cards:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch total utilization
  const fetchTotalUtilization = async () => {
    try {
      const data = await apiClient.get('/credit-cards/utilization/total');
      setTotalUtilization(data);
    } catch (err) {
      console.error('Error fetching total utilization:', err);
    }
  };

  // Create credit card
  const createCard = async (cardData: any) => {
    try {
      setError(null);
      const newCard = await apiClient.post('/credit-cards', cardData);
      setCards([...cards, newCard]);
      await fetchTotalUtilization();
      return newCard;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create credit card';
      setError(errorMessage);
      throw err;
    }
  };

  // Update credit card
  const updateCard = async (id: string, updateData: any) => {
    try {
      setError(null);
      const updated = await apiClient.put(`/credit-cards/${id}`, updateData);
      setCards(cards.map((card) => (card.id === id ? updated : card)));
      await fetchTotalUtilization();
      return updated;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update credit card';
      setError(errorMessage);
      throw err;
    }
  };

  // Delete credit card
  const deleteCard = async (id: string) => {
    try {
      setError(null);
      await apiClient.delete(`/credit-cards/${id}`);
      setCards(cards.filter((card) => card.id !== id));
      await fetchTotalUtilization();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete credit card';
      setError(errorMessage);
      throw err;
    }
  };

  // Get card utilization
  const getCardUtilization = async (id: string) => {
    try {
      return await apiClient.get(`/credit-cards/${id}/utilization`);
    } catch (err) {
      console.error('Error fetching card utilization:', err);
      throw err;
    }
  };

  // Get upcoming due dates
  const getUpcomingDueDates = async () => {
    try {
      return await apiClient.get('/credit-cards/due-dates');
    } catch (err) {
      console.error('Error fetching upcoming due dates:', err);
      throw err;
    }
  };

  // Update balance
  const updateBalance = async (id: string, balance: number) => {
    try {
      const updated = await apiClient.patch(`/credit-cards/${id}/balance`, {
        balance,
      });
      setCards(cards.map((card) => (card.id === id ? updated : card)));
      await fetchTotalUtilization();
      return updated;
    } catch (err) {
      console.error('Error updating balance:', err);
      throw err;
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchCards();
    fetchTotalUtilization();
  }, []);

  return {
    cards,
    totalUtilization,
    isLoading,
    error,
    fetchCards,
    fetchTotalUtilization,
    createCard,
    updateCard,
    deleteCard,
    getCardUtilization,
    getUpcomingDueDates,
    updateBalance,
  };
};
