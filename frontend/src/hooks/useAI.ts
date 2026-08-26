'use client';

import { useState, useCallback, useEffect } from 'react';
import { apiClient } from '@/lib/api';
import {
  AiAnomalyDto,
  AiForecastPeriod,
  BalanceProjectionResponseDto,
  ChatHistoryDto,
  ChatMessageResponseDto,
  ConfirmationStatus,
  DetectAnomaliesResultDto,
  ForecastDetailsDto,
  GetAnomaliesDto,
  ListCategoryForecastsDto,
  PatternDto,
  RecommendationDto,
  RecommendationImpactEstimateDto,
  SendChatMessageDto,
  SpendingProfileDto,
} from '@/types/ai';
import { getApiErrorMessage } from '@/utils/api-error';

/**
 * Mensagem exibida no chat do assistente financeiro.
 * `role` diferencia a pergunta do usuário da resposta da IA.
 */
export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date | string;
  sources?: string[];
  confidence?: number;
  followUpQuestions?: string[];
}

// ==================== CHAT ====================

interface UseAiChatState {
  messages: AiChatMessage[];
  suggestions: string[];
  isLoading: boolean;
  isSending: boolean;
  error: string | null;
}

/**
 * Hook do assistente financeiro (B.1)
 * Histórico, sugestões e envio de perguntas
 */
export function useAiChat() {
  const [state, setState] = useState<UseAiChatState>({
    messages: [],
    suggestions: [],
    isLoading: false,
    isSending: false,
    error: null,
  });

  const historyToMessages = (history: ChatHistoryDto[]): AiChatMessage[] =>
    history.flatMap(item => [
      {
        id: `${item.id}-question`,
        role: 'user' as const,
        content: item.question,
        createdAt: item.createdAt,
      },
      {
        id: item.id,
        role: 'assistant' as const,
        content: item.answer,
        createdAt: item.createdAt,
      },
    ]);

  const fetchHistory = useCallback(async (limit: number = 50, offset: number = 0) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const data = await apiClient.getAiChatHistory({ limit, offset });
      setState(prev => ({
        ...prev,
        messages: historyToMessages(data.messages || []),
        isLoading: false,
      }));
      return data;
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : 'Erro ao carregar o histórico do chat';
      setState(prev => ({ ...prev, error: errorMsg, isLoading: false }));
      throw err;
    }
  }, []);

  const fetchSuggestions = useCallback(async () => {
    try {
      const data = await apiClient.getAiChatSuggestions();
      setState(prev => ({ ...prev, suggestions: data.suggestions || [] }));
      return data;
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : 'Erro ao carregar sugestões de perguntas';
      setState(prev => ({ ...prev, error: errorMsg }));
      throw err;
    }
  }, []);

  const sendMessage = useCallback(async (dto: SendChatMessageDto) => {
    const question = dto.question.trim();
    if (!question) return null;

    const pendingId = `pending-${Date.now()}`;
    setState(prev => ({
      ...prev,
      isSending: true,
      error: null,
      messages: [
        ...prev.messages,
        {
          id: pendingId,
          role: 'user',
          content: question,
          createdAt: new Date().toISOString(),
        },
      ],
    }));

    try {
      const data: ChatMessageResponseDto = await apiClient.sendAiChatMessage({
        ...dto,
        question,
      });

      setState(prev => ({
        ...prev,
        isSending: false,
        messages: [
          ...prev.messages,
          {
            id: `${pendingId}-answer`,
            role: 'assistant',
            content: data.answer,
            createdAt: data.timestamp,
            sources: data.sources,
            confidence: data.confidence,
            followUpQuestions: data.followUpQuestions,
          },
        ],
      }));
      return data;
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : 'Erro ao enviar a pergunta para a IA';
      setState(prev => ({ ...prev, error: errorMsg, isSending: false }));
      throw err;
    }
  }, []);

  const deleteMessage = useCallback(async (messageId: string) => {
    try {
      await apiClient.deleteAiChatMessage(messageId);
      setState(prev => ({
        ...prev,
        messages: prev.messages.filter(
          message => message.id !== messageId && message.id !== `${messageId}-question`,
        ),
      }));
      return true;
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : 'Erro ao excluir a mensagem';
      setState(prev => ({ ...prev, error: errorMsg }));
      throw err;
    }
  }, []);

  const clearHistory = useCallback(async () => {
    try {
      await apiClient.clearAiChatHistory();
      setState(prev => ({ ...prev, messages: [] }));
      return true;
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : 'Erro ao limpar o histórico do chat';
      setState(prev => ({ ...prev, error: errorMsg }));
      throw err;
    }
  }, []);

  // Carga inicial de histórico e sugestões
  useEffect(() => {
    fetchHistory().catch(() => undefined);
    fetchSuggestions().catch(() => undefined);
  }, [fetchHistory, fetchSuggestions]);

  return {
    ...state,
    fetchHistory,
    fetchSuggestions,
    sendMessage,
    deleteMessage,
    clearHistory,
  };
}

// ==================== RECOMENDAÇÕES ====================

interface UseAiRecommendationsState {
  recommendations: RecommendationDto[];
  total: number;
  highPriorityCount: number;
  mediumPriorityCount: number;
  lowPriorityCount: number;
  impactEstimate: RecommendationImpactEstimateDto | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook de recomendações automáticas (B.2)
 */
export function useAiRecommendations() {
  const [state, setState] = useState<UseAiRecommendationsState>({
    recommendations: [],
    total: 0,
    highPriorityCount: 0,
    mediumPriorityCount: 0,
    lowPriorityCount: 0,
    impactEstimate: null,
    isLoading: false,
    error: null,
  });

  const fetchRecommendations = useCallback(async (includeDismissed: boolean = false) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const data = await apiClient.getAiRecommendations({ includeDismissed });
      setState(prev => ({
        ...prev,
        recommendations: data.recommendations || [],
        total: data.total || 0,
        highPriorityCount: data.highPriorityCount || 0,
        mediumPriorityCount: data.mediumPriorityCount || 0,
        lowPriorityCount: data.lowPriorityCount || 0,
        isLoading: false,
      }));
      return data;
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : 'Erro ao carregar as recomendações';
      setState(prev => ({ ...prev, error: errorMsg, isLoading: false }));
      throw err;
    }
  }, []);

  const fetchImpactEstimate = useCallback(async () => {
    try {
      const data = await apiClient.getAiRecommendationsImpactEstimate();
      setState(prev => ({ ...prev, impactEstimate: data }));
      return data;
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : 'Erro ao estimar o impacto das recomendações';
      setState(prev => ({ ...prev, error: errorMsg }));
      throw err;
    }
  }, []);

  const dismissRecommendation = useCallback(async (recommendationId: string) => {
    try {
      await apiClient.updateAiRecommendation(recommendationId, { isDismissed: true });
      setState(prev => ({
        ...prev,
        recommendations: prev.recommendations.filter(item => item.id !== recommendationId),
        total: Math.max(prev.total - 1, 0),
      }));
      return true;
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : 'Erro ao descartar a recomendação';
      setState(prev => ({ ...prev, error: errorMsg }));
      throw err;
    }
  }, []);

  const applyRecommendation = useCallback(
    async (recommendationId: string, notes?: string) => {
      try {
        return await apiClient.applyAiRecommendation(recommendationId, { notes });
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : 'Erro ao aplicar a recomendação';
        setState(prev => ({ ...prev, error: errorMsg }));
        throw err;
      }
    },
    [],
  );

  const regenerateRecommendations = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const data = await apiClient.regenerateAiRecommendations();
      await fetchRecommendations();
      return data;
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : 'Erro ao regerar as recomendações';
      setState(prev => ({ ...prev, error: errorMsg, isLoading: false }));
      throw err;
    }
  }, [fetchRecommendations]);

  useEffect(() => {
    fetchRecommendations().catch(() => undefined);
    fetchImpactEstimate().catch(() => undefined);
  }, [fetchRecommendations, fetchImpactEstimate]);

  return {
    ...state,
    fetchRecommendations,
    fetchImpactEstimate,
    dismissRecommendation,
    applyRecommendation,
    regenerateRecommendations,
  };
}

// ==================== ANÁLISE COMPORTAMENTAL ====================

interface UseAiAnalysisState {
  anomalies: AiAnomalyDto[];
  highSeverityCount: number;
  mediumSeverityCount: number;
  lowSeverityCount: number;
  patterns: PatternDto[];
  spendingProfile: SpendingProfileDto | null;
  insights: string[];
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook de análise comportamental e anomalias (B.3)
 */
export function useAiAnalysis() {
  const [state, setState] = useState<UseAiAnalysisState>({
    anomalies: [],
    highSeverityCount: 0,
    mediumSeverityCount: 0,
    lowSeverityCount: 0,
    patterns: [],
    spendingProfile: null,
    insights: [],
    isLoading: false,
    error: null,
  });

  const fetchAnomalies = useCallback(async (dto?: GetAnomaliesDto) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const data = await apiClient.getAiAnomalies(dto);
      setState(prev => ({
        ...prev,
        anomalies: data.anomalies || [],
        highSeverityCount: data.highSeverityCount || 0,
        mediumSeverityCount: data.mediumSeverityCount || 0,
        lowSeverityCount: data.lowSeverityCount || 0,
        isLoading: false,
      }));
      return data;
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : 'Erro ao carregar as anomalias';
      setState(prev => ({ ...prev, error: errorMsg, isLoading: false }));
      throw err;
    }
  }, []);

  /**
   * Dispara a varredura de anomalias do período e recarrega a lista.
   *
   * `getAiAnomalies` apenas LISTA o que já foi detectado; sem este gatilho a
   * varredura nunca roda e a lista fica eternamente vazia.
   */
  const detectAnomalies = useCallback(
    async (period: string = 'LAST_6_MONTHS'): Promise<DetectAnomaliesResultDto> => {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      try {
        const data = await apiClient.detectAnomalies(period);
        await fetchAnomalies();
        return data;
      } catch (err) {
        const errorMsg = getApiErrorMessage(err, 'Erro ao detectar as anomalias');
        setState(prev => ({ ...prev, error: errorMsg, isLoading: false }));
        throw new Error(errorMsg);
      }
    },
    [fetchAnomalies],
  );

  const confirmAnomaly = useCallback(
    async (anomalyId: string, status: ConfirmationStatus, notes?: string) => {
      try {
        const data = await apiClient.confirmAiAnomaly(anomalyId, { status, notes });
        setState(prev => ({
          ...prev,
          anomalies: prev.anomalies.filter(anomaly => anomaly.id !== anomalyId),
        }));
        return data;
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : 'Erro ao classificar a anomalia';
        setState(prev => ({ ...prev, error: errorMsg }));
        throw err;
      }
    },
    [],
  );

  const fetchPatterns = useCallback(async (frequency?: string) => {
    try {
      const data = await apiClient.getAiPatterns({ frequency });
      setState(prev => ({ ...prev, patterns: data.patterns || [] }));
      return data;
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : 'Erro ao carregar os padrões de gasto';
      setState(prev => ({ ...prev, error: errorMsg }));
      throw err;
    }
  }, []);

  const fetchSpendingProfile = useCallback(async (period?: string) => {
    try {
      const data = await apiClient.getAiSpendingProfile(period);
      setState(prev => ({ ...prev, spendingProfile: data }));
      return data;
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : 'Erro ao carregar o perfil de gastos';
      setState(prev => ({ ...prev, error: errorMsg }));
      throw err;
    }
  }, []);

  const fetchInsights = useCallback(async () => {
    try {
      const data = await apiClient.getAiInsights();
      setState(prev => ({ ...prev, insights: data.insights || [] }));
      return data;
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : 'Erro ao carregar os insights';
      setState(prev => ({ ...prev, error: errorMsg }));
      throw err;
    }
  }, []);

  useEffect(() => {
    fetchAnomalies().catch(() => undefined);
    fetchPatterns().catch(() => undefined);
    fetchSpendingProfile().catch(() => undefined);
    fetchInsights().catch(() => undefined);
  }, [fetchAnomalies, fetchPatterns, fetchSpendingProfile, fetchInsights]);

  return {
    ...state,
    fetchAnomalies,
    detectAnomalies,
    confirmAnomaly,
    fetchPatterns,
    fetchSpendingProfile,
    fetchInsights,
  };
}

// ==================== PREVISÕES ====================

interface UseAiForecastsState {
  balanceProjection: BalanceProjectionResponseDto | null;
  categoryForecasts: ListCategoryForecastsDto | null;
  details: ForecastDetailsDto | null;
  period: AiForecastPeriod;
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook de previsões financeiras (B.4)
 */
export function useAiForecasts(
  initialPeriod: AiForecastPeriod = AiForecastPeriod.NEXT_90_DAYS,
) {
  const [state, setState] = useState<UseAiForecastsState>({
    balanceProjection: null,
    categoryForecasts: null,
    details: null,
    period: initialPeriod,
    isLoading: false,
    error: null,
  });

  const fetchBalanceProjection = useCallback(async (period: AiForecastPeriod) => {
    setState(prev => ({ ...prev, isLoading: true, error: null, period }));
    try {
      const data = await apiClient.getAiBalanceProjection(period, true);
      setState(prev => ({ ...prev, balanceProjection: data, isLoading: false }));
      return data;
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : 'Erro ao carregar a projeção de saldo';
      setState(prev => ({ ...prev, error: errorMsg, isLoading: false }));
      throw err;
    }
  }, []);

  const fetchCategoryForecasts = useCallback(async (period: AiForecastPeriod) => {
    try {
      const data = await apiClient.getAiForecastByCategory({ period });
      setState(prev => ({ ...prev, categoryForecasts: data }));
      return data;
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : 'Erro ao carregar a previsão por categoria';
      setState(prev => ({ ...prev, error: errorMsg }));
      throw err;
    }
  }, []);

  const fetchDetails = useCallback(async (period: AiForecastPeriod) => {
    try {
      const data = await apiClient.getAiForecastDetails(period);
      setState(prev => ({ ...prev, details: data }));
      return data;
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : 'Erro ao carregar os detalhes da previsão';
      setState(prev => ({ ...prev, error: errorMsg }));
      throw err;
    }
  }, []);

  const changePeriod = useCallback(
    async (period: AiForecastPeriod) => {
      await Promise.all([
        fetchBalanceProjection(period).catch(() => undefined),
        fetchCategoryForecasts(period).catch(() => undefined),
        fetchDetails(period).catch(() => undefined),
      ]);
    },
    [fetchBalanceProjection, fetchCategoryForecasts, fetchDetails],
  );

  useEffect(() => {
    changePeriod(initialPeriod);
  }, [changePeriod, initialPeriod]);

  return {
    ...state,
    fetchBalanceProjection,
    fetchCategoryForecasts,
    fetchDetails,
    changePeriod,
  };
}
