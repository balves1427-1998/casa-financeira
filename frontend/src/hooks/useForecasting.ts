import { useState, useCallback, useEffect } from 'react';
import {
  ForecastDto,
  ForecastSummaryDto,
  GenerateForecastDto,
  ForecastPeriod,
  SensitivityAnalysisDto,
} from '../types/forecasting';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface UseForecastingState {
  summary: ForecastSummaryDto | null;
  currentForecast: ForecastDto | null;
  sensivityAnalysis: SensitivityAnalysisDto[] | null;
  isLoading: boolean;
  error: string | null;
}

export function useForecasting() {
  const [state, setState] = useState<UseForecastingState>({
    summary: null,
    currentForecast: null,
    sensivityAnalysis: null,
    isLoading: false,
    error: null,
  });

  /**
   * Generate forecast for a specific period
   */
  const generateForecast = useCallback(
    async (dto: GenerateForecastDto) => {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      try {
        const response = await fetch(`${API_BASE_URL}/forecasting/generate`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            period: dto.period,
            startDate: dto.startDate?.toISOString(),
            minimumBalanceThreshold: dto.minimumBalanceThreshold,
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to generate forecast: ${response.statusText}`);
        }

        const data: ForecastDto = await response.json();
        setState(prev => ({
          ...prev,
          currentForecast: data,
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
   * Get forecast summary for all periods
   */
  const fetchForecastSummary = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await fetch(`${API_BASE_URL}/forecasting/summary`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch forecast summary: ${response.statusText}`);
      }

      const data: ForecastSummaryDto = await response.json();
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
   * Analyze sensitivity to income/expense changes
   */
  const analyzeSensitivity = useCallback(
    async (
      period: ForecastPeriod,
      variable: 'income' | 'expenses' | 'both',
      percentageChange: number,
    ) => {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      try {
        const params = new URLSearchParams({
          period,
          variable,
          percentageChange: percentageChange.toString(),
        });

        const response = await fetch(
          `${API_BASE_URL}/forecasting/sensitivity?${params}`,
          {
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
            },
          },
        );

        if (!response.ok) {
          throw new Error(
            `Failed to analyze sensitivity: ${response.statusText}`,
          );
        }

        const data: SensitivityAnalysisDto[] = await response.json();
        setState(prev => ({
          ...prev,
          sensivityAnalysis: data,
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
   * Auto-load summary on mount
   */
  useEffect(() => {
    fetchForecastSummary();
  }, [fetchForecastSummary]);

  return {
    ...state,
    generateForecast,
    fetchForecastSummary,
    analyzeSensitivity,
  };
}
