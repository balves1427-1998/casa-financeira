'use client';

import { useState, useCallback } from 'react';
import { apiClient } from '@/lib/api';

export interface MLPrediction {
  categoryId: string;
  categoryName: string;
  confidence: number;
  reasons: string[];
  alternativeSuggestions: Array<{
    categoryId: string;
    categoryName: string;
    confidence: number;
  }>;
}

export interface MLPattern {
  id: string;
  categoryId: string;
  categoryName: string;
  patternType: 'keyword' | 'regex' | 'establishment' | 'amount_range' | 'time_based' | 'multi_criteria';
  pattern: string;
  confidence: number;
  matchCount: number;
  lastMatchedAt?: string;
  status: 'auto' | 'approved' | 'rejected';
  description?: string;
}

export interface MLFeedback {
  totalFeedback: number;
  correctCount: number;
  incorrectCount: number;
  partialCount: number;
  accuracyRate: number;
  mostCorrectedCategories: Array<{
    categoryId: string;
    categoryName: string;
    correctionCount: number;
    percentage: number;
  }>;
  recentFeedback: Array<{
    id: string;
    description: string;
    suggestedCategory: string;
    correctCategory: string;
    feedbackType: string;
    createdAt: string;
  }>;
}

export const useMLClassifier = () => {
  const [prediction, setPrediction] = useState<MLPrediction | null>(null);
  const [patterns, setPatterns] = useState<MLPattern[]>([]);
  const [feedbackStats, setFeedbackStats] = useState<MLFeedback | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isTraining, setIsTraining] = useState(false);

  // Prever categoria para uma descrição
  const predict = useCallback(
    async (
      description: string,
      establishment?: string,
      amount?: number,
      date?: Date,
    ): Promise<MLPrediction> => {
      try {
        setIsLoading(true);
        setError(null);

        const params = new URLSearchParams();
        params.append('description', description);
        if (establishment) params.append('establishment', establishment);
        if (amount) params.append('amount', amount.toString());
        if (date) params.append('date', date.toISOString());

        const data = await apiClient.get(`/ml-classifier/predict?${params}`);
        setPrediction(data);
        return data;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Erro ao fazer previsão';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  // Registrar feedback sobre uma categorização
  const recordFeedback = useCallback(
    async (
      description: string,
      correctCategoryId: string,
      suggestedCategoryId?: string,
      feedbackType: 'correct' | 'incorrect' | 'partial' = 'incorrect',
      notes?: string,
      expenseId?: string,
    ) => {
      try {
        setIsLoading(true);
        setError(null);

        await apiClient.post('/ml-classifier/feedback', {
          description,
          correctCategoryId,
          suggestedCategoryId,
          feedbackType,
          notes,
          expenseId,
        });

        // Atualizar stats após novo feedback
        await fetchFeedbackStats();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Erro ao registrar feedback';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  // Obter estatísticas de feedback
  const fetchFeedbackStats = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiClient.get('/ml-classifier/feedback/stats');
      setFeedbackStats(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao buscar estatísticas';
      setError(errorMessage);
      console.error('Error fetching feedback stats:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Obter padrões aprendidos
  const fetchPatterns = useCallback(async (limit: number = 50) => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiClient.get(`/ml-classifier/patterns?limit=${limit}`);
      setPatterns(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao buscar padrões';
      setError(errorMessage);
      console.error('Error fetching patterns:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Aprovar padrão
  const approvePattern = useCallback(async (patternId: string) => {
    try {
      setIsLoading(true);
      setError(null);

      await apiClient.put(`/ml-classifier/patterns/${patternId}/approve`, {});

      // Recarregar padrões
      await fetchPatterns();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao aprovar padrão';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Rejeitar padrão
  const rejectPattern = useCallback(async (patternId: string) => {
    try {
      setIsLoading(true);
      setError(null);

      await apiClient.put(`/ml-classifier/patterns/${patternId}/reject`, {});

      // Recarregar padrões
      await fetchPatterns();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao rejeitar padrão';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Deletar padrão
  const deletePattern = useCallback(async (patternId: string) => {
    try {
      setIsLoading(true);
      setError(null);

      await apiClient.delete(`/ml-classifier/patterns/${patternId}`);

      // Recarregar padrões
      await fetchPatterns();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao deletar padrão';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Treinar modelo com histórico
  const trainModel = useCallback(async () => {
    try {
      setIsTraining(true);
      setError(null);

      const result = await apiClient.post('/ml-classifier/train', {});

      // Recarregar padrões e stats
      await fetchPatterns();
      await fetchFeedbackStats();

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao treinar modelo';
      setError(errorMessage);
      throw err;
    } finally {
      setIsTraining(false);
    }
  }, []);

  return {
    // State
    prediction,
    patterns,
    feedbackStats,
    isLoading,
    isTraining,
    error,

    // Methods
    predict,
    recordFeedback,
    fetchFeedbackStats,
    fetchPatterns,
    approvePattern,
    rejectPattern,
    deletePattern,
    trainModel,
  };
};
