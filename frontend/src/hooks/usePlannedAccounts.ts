'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';

export interface PlannedAccount {
  id: string;
  description: string;
  category?: string;
  amount: number;
  dueDate: string;
  responsible: string;
  status: 'pending' | 'confirmed' | 'paid' | 'cancelled' | 'overdue';
  observation?: string;
  priority: number;
  isRecurring: boolean;
  frequency?: string;
  createdAt: string;
  updatedAt: string;
}

export const usePlannedAccounts = () => {
  const [planned, setPlanned] = useState<PlannedAccount[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch all planned accounts
  const fetchPlanned = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiClient.get('/planned-accounts');
      setPlanned(data);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to fetch planned accounts';
      setError(errorMessage);
      console.error('Error fetching planned accounts:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Create planned account
  const createPlanned = async (plannedData: any) => {
    try {
      setError(null);
      const newPlanned = await apiClient.post('/planned-accounts', plannedData);
      setPlanned([...planned, newPlanned]);
      return newPlanned;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to create planned account';
      setError(errorMessage);
      throw err;
    }
  };

  // Update planned account
  const updatePlanned = async (id: string, updateData: any) => {
    try {
      setError(null);
      const updated = await apiClient.put(`/planned-accounts/${id}`, updateData);
      setPlanned(
        planned.map((p) =>
          p.id === id ? updated : p,
        ),
      );
      return updated;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to update planned account';
      setError(errorMessage);
      throw err;
    }
  };

  // Delete planned account
  const deletePlanned = async (id: string) => {
    try {
      setError(null);
      await apiClient.delete(`/planned-accounts/${id}`);
      setPlanned(planned.filter((p) => p.id !== id));
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to delete planned account';
      setError(errorMessage);
      throw err;
    }
  };

  // Fetch upcoming planned accounts
  const fetchUpcoming = async (days: number = 30) => {
    try {
      return await apiClient.get(`/planned-accounts/upcoming?days=${days}`);
    } catch (err) {
      console.error('Error fetching upcoming:', err);
      throw err;
    }
  };

  // Fetch overdue planned accounts
  const fetchOverdue = async () => {
    try {
      return await apiClient.get('/planned-accounts/overdue');
    } catch (err) {
      console.error('Error fetching overdue:', err);
      throw err;
    }
  };

  // Get upcoming alerts
  const getUpcomingAlerts = async () => {
    try {
      return await apiClient.get('/planned-accounts/alerts');
    } catch (err) {
      console.error('Error fetching alerts:', err);
      throw err;
    }
  };

  // Get monthly plan
  const getMonthlyPlan = async (month: number, year: number) => {
    try {
      return await apiClient.get(`/planned-accounts/monthly/${month}/${year}`);
    } catch (err) {
      console.error('Error fetching monthly plan:', err);
      throw err;
    }
  };

  // Get total by responsible
  const getTotalByResponsible = async (
    responsible: string,
    status?: string,
  ) => {
    try {
      const url = `/planned-accounts/total-by-responsible/${responsible}${
        status ? `?status=${status}` : ''
      }`;
      return await apiClient.get(url);
    } catch (err) {
      console.error('Error fetching total by responsible:', err);
      throw err;
    }
  };

  // Mark as paid
  const markAsPaid = async (id: string) => {
    try {
      const updated = await apiClient.patch(`/planned-accounts/${id}/mark-as-paid`, {});
      setPlanned(
        planned.map((p) =>
          p.id === id ? { ...p, status: 'paid' as const } : p,
        ),
      );
      return updated;
    } catch (err) {
      console.error('Error marking as paid:', err);
      throw err;
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchPlanned();
  }, []);

  return {
    planned,
    isLoading,
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
  };
};
