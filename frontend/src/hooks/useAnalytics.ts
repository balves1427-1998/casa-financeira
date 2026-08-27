'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  SpendingPatternDto,
  AnomalyDto,
  CategoryTrendAnalysisDto,
  BrunoGiovannaComparisonDto,
  AnalyticsSummaryDto,
  GetSpendingPatternDto,
  GetAnomaliesDto,
  ReviewAnomalyDto,
} from '@/types/analytics';
import { authFetch } from '../lib/api';

interface UseAnalyticsState {
  spendingPattern: SpendingPatternDto | null;
  anomalies: AnomalyDto[];
  categoryTrends: { [key: string]: CategoryTrendAnalysisDto };
  comparison: BrunoGiovannaComparisonDto | null;
  summary: AnalyticsSummaryDto | null;
  isLoading: boolean;
  error: string | null;
}

export function useAnalytics() {
  const [state, setState] = useState<UseAnalyticsState>({
    spendingPattern: null,
    anomalies: [],
    categoryTrends: {},
    comparison: null,
    summary: null,
    isLoading: false,
    error: null,
  });

  // ==================== SPENDING PATTERNS ====================

  const getSpendingPattern = useCallback(async (dto?: GetSpendingPatternDto) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const params = new URLSearchParams();
      if (dto?.month) params.append('month', dto.month.toString());
      if (dto?.year) params.append('year', dto.year.toString());
      if (dto?.categoryId) params.append('categoryId', dto.categoryId);

      const response = await authFetch(`/analytics/spending-pattern?${params}`, {
        headers: {
        },
      });

      if (!response.ok) throw new Error('Failed to fetch spending pattern');
      const data = await response.json();

      setState(prev => ({
        ...prev,
        spendingPattern: data,
        isLoading: false,
      }));
      return data;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setState(prev => ({ ...prev, error: errorMsg, isLoading: false }));
      throw err;
    }
  }, []);

  // ==================== ANOMALIES ====================

  const getAnomalies = useCallback(async (dto?: GetAnomaliesDto) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const params = new URLSearchParams();
      if (dto?.anomalyType) params.append('anomalyType', dto.anomalyType);
      if (dto?.severity) params.append('severity', dto.severity);
      if (dto?.month) params.append('month', dto.month.toString());
      if (dto?.year) params.append('year', dto.year.toString());
      if (dto?.status) params.append('status', dto.status);

      const response = await authFetch(`/analytics/anomalies?${params}`, {
        headers: {
        },
      });

      if (!response.ok) throw new Error('Failed to fetch anomalies');
      const data = await response.json();

      setState(prev => ({
        ...prev,
        anomalies: Array.isArray(data) ? data : [],
        isLoading: false,
      }));
      return data;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setState(prev => ({ ...prev, error: errorMsg, isLoading: false }));
      throw err;
    }
  }, []);

  const reviewAnomaly = useCallback(
    async (anomalyId: string, dto: ReviewAnomalyDto) => {
      try {
        const response = await authFetch(`/analytics/anomalies/${anomalyId}/review`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(dto),
        });

        if (!response.ok) throw new Error('Failed to review anomaly');

        // Refresh anomalies list
        await getAnomalies();

        return true;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        setState(prev => ({ ...prev, error: errorMsg }));
        throw err;
      }
    },
    [getAnomalies],
  );

  // ==================== TRENDS ====================

  const getCategoryTrends = useCallback(async (categoryId: string, months: number = 6) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const params = new URLSearchParams();
      params.append('months', months.toString());

      const response = await authFetch(`/analytics/trends/${categoryId}?${params}`, {
        headers: {
        },
      });

      if (!response.ok) throw new Error('Failed to fetch category trends');
      const data = await response.json();

      setState(prev => ({
        ...prev,
        categoryTrends: {
          ...prev.categoryTrends,
          [categoryId]: data,
        },
        isLoading: false,
      }));
      return data;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setState(prev => ({ ...prev, error: errorMsg, isLoading: false }));
      throw err;
    }
  }, []);

  // ==================== COMPARISONS ====================

  const getComparison = useCallback(async (month?: number, year?: number) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const params = new URLSearchParams();
      if (month) params.append('month', month.toString());
      if (year) params.append('year', year.toString());

      const response = await authFetch(`/analytics/comparison?${params}`, {
        headers: {
        },
      });

      if (!response.ok) throw new Error('Failed to fetch comparison');
      const data = await response.json();

      setState(prev => ({
        ...prev,
        comparison: data,
        isLoading: false,
      }));
      return data;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setState(prev => ({ ...prev, error: errorMsg, isLoading: false }));
      throw err;
    }
  }, []);

  // ==================== SUMMARY ====================

  const getSummary = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await authFetch(`/analytics/summary`, {
        headers: {
        },
      });

      if (!response.ok) throw new Error('Failed to fetch analytics summary');
      const data = await response.json();

      setState(prev => ({
        ...prev,
        summary: data,
        spendingPattern: data.spendingPattern,
        anomalies: data.anomalies?.recentAnomalies || [],
        comparison: data.comparison,
        isLoading: false,
      }));
      return data;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setState(prev => ({ ...prev, error: errorMsg, isLoading: false }));
      throw err;
    }
  }, []);

  // Auto-load summary on mount
  useEffect(() => {
    getSummary();
  }, [getSummary]);

  return {
    ...state,
    getSpendingPattern,
    getAnomalies,
    reviewAnomaly,
    getCategoryTrends,
    getComparison,
    getSummary,
  };
}
