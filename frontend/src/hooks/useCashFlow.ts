import { useState, useCallback, useEffect } from 'react';
import {
  CashFlowMonthDto,
  CashFlowSummaryDto,
  BestDayToShopDto,
  GetBestDayToShopDto,
} from '../types/cash-flow';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface UseCashFlowState {
  monthData: CashFlowMonthDto | null;
  summary: CashFlowSummaryDto | null;
  bestDayRecommendation: BestDayToShopDto | null;
  isLoading: boolean;
  error: string | null;
}

export function useCashFlow() {
  const [state, setState] = useState<UseCashFlowState>({
    monthData: null,
    summary: null,
    bestDayRecommendation: null,
    isLoading: false,
    error: null,
  });

  /**
   * Fetch cash flow for a specific month
   */
  const fetchMonthCashFlow = useCallback(
    async (month: number, year: number) => {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      try {
        const response = await fetch(
          `${API_BASE_URL}/cash-flow/${month}/${year}`,
          {
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
            },
          },
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch cash flow: ${response.statusText}`);
        }

        const data: CashFlowMonthDto = await response.json();
        setState(prev => ({
          ...prev,
          monthData: data,
          isLoading: false,
        }));
        return data;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error occurred';
        setState(prev => ({
          ...prev,
          error: errorMessage,
          isLoading: false,
        }));
        throw err;
      }
    },
    [],
  );

  /**
   * Fetch current month summary
   */
  const fetchSummary = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await fetch(`${API_BASE_URL}/cash-flow/summary/current`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch summary: ${response.statusText}`);
      }

      const data: CashFlowSummaryDto = await response.json();
      setState(prev => ({
        ...prev,
        summary: data,
        isLoading: false,
      }));
      return data;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Unknown error occurred';
      setState(prev => ({
        ...prev,
        error: errorMessage,
        isLoading: false,
      }));
      throw err;
    }
  }, []);

  /**
   * Get recommendation for best day to shop
   */
  const getBestDayToShop = useCallback(
    async (dto: GetBestDayToShopDto) => {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      try {
        const response = await fetch(`${API_BASE_URL}/cash-flow/best-day`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            desiredAmount: dto.desiredAmount,
            startDate: dto.startDate?.toISOString(),
            endDate: dto.endDate?.toISOString(),
            minimumBalanceThreshold: dto.minimumBalanceThreshold,
            onlyLowRisk: dto.onlyLowRisk,
          }),
        });

        if (!response.ok) {
          throw new Error(
            `Failed to get best day recommendation: ${response.statusText}`,
          );
        }

        const data: BestDayToShopDto = await response.json();
        setState(prev => ({
          ...prev,
          bestDayRecommendation: data,
          isLoading: false,
        }));
        return data;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error occurred';
        setState(prev => ({
          ...prev,
          error: errorMessage,
          isLoading: false,
        }));
        throw err;
      }
    },
    [],
  );

  /**
   * Auto-load current month data on mount
   */
  useEffect(() => {
    const now = new Date();
    fetchMonthCashFlow(now.getMonth() + 1, now.getFullYear());
    fetchSummary();
  }, [fetchMonthCashFlow, fetchSummary]);

  return {
    ...state,
    fetchMonthCashFlow,
    fetchSummary,
    getBestDayToShop,
  };
}
