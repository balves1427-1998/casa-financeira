'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import {
  CategorySplitDto,
  SetSplitRuleDto,
  SettlementDto,
  SplitPeriod,
  SplitRuleDto,
  SplitSummaryDto,
} from '@/types/split';
import { getApiErrorMessage } from '@/utils/api-error';

interface UseSplitState {
  summary: SplitSummaryDto | null;
  settlement: SettlementDto | null;
  byCategory: CategorySplitDto[];
  rule: SplitRuleDto | null;
  period: SplitPeriod;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
}

/**
 * Hook do painel de Divisão Bruno × Giovanna (item 15 do escopo).
 *
 * O escopo (família) vem do usuário autenticado no backend — nenhuma rota
 * recebe id de família, então aqui só se controla o PERÍODO.
 *
 * Salvar a regra de rateio recarrega o acerto de contas: mudar de EQUAL para
 * INCOME_PROPORTIONAL muda quem deve a quem, e a resposta nova é a única fonte
 * de `appliedMode`/`fallbackApplied` — os avisos de fallback não podem ser
 * inferidos no front.
 */
export function useSplit(initialPeriod: SplitPeriod = SplitPeriod.THIS_MONTH) {
  const [state, setState] = useState<UseSplitState>({
    summary: null,
    settlement: null,
    byCategory: [],
    rule: null,
    period: initialPeriod,
    isLoading: false,
    isSaving: false,
    error: null,
  });

  const fetchSummary = useCallback(async (period: SplitPeriod) => {
    try {
      const data = await apiClient.getSplitSummary(period);
      setState(prev => ({ ...prev, summary: data }));
      return data;
    } catch (err) {
      const errorMsg = getApiErrorMessage(err, 'Erro ao carregar a divisão de despesas');
      setState(prev => ({ ...prev, error: errorMsg }));
      throw err;
    }
  }, []);

  const fetchSettlement = useCallback(async (period: SplitPeriod) => {
    try {
      const data = await apiClient.getSplitSettlement(period);
      setState(prev => ({ ...prev, settlement: data }));
      return data;
    } catch (err) {
      const errorMsg = getApiErrorMessage(err, 'Erro ao carregar o acerto de contas');
      setState(prev => ({ ...prev, error: errorMsg }));
      throw err;
    }
  }, []);

  const fetchByCategory = useCallback(async (period: SplitPeriod) => {
    try {
      const data = await apiClient.getSplitByCategory(period);
      setState(prev => ({ ...prev, byCategory: data || [] }));
      return data;
    } catch (err) {
      const errorMsg = getApiErrorMessage(err, 'Erro ao carregar a divisão por categoria');
      setState(prev => ({ ...prev, error: errorMsg }));
      throw err;
    }
  }, []);

  const fetchRule = useCallback(async () => {
    try {
      const data = await apiClient.getSplitRule();
      setState(prev => ({ ...prev, rule: data }));
      return data;
    } catch (err) {
      const errorMsg = getApiErrorMessage(err, 'Erro ao carregar a regra de rateio');
      setState(prev => ({ ...prev, error: errorMsg }));
      throw err;
    }
  }, []);

  const changePeriod = useCallback(
    async (period: SplitPeriod) => {
      setState(prev => ({ ...prev, period, isLoading: true, error: null }));
      await Promise.all([
        fetchSummary(period).catch(() => undefined),
        fetchSettlement(period).catch(() => undefined),
        fetchByCategory(period).catch(() => undefined),
      ]);
      setState(prev => ({ ...prev, isLoading: false }));
    },
    [fetchSummary, fetchSettlement, fetchByCategory],
  );

  /**
   * Salva a regra e recarrega o acerto de contas com ela aplicada.
   *
   * O backend valida a soma dos percentuais do modo CUSTOM e responde 400 com
   * a soma encontrada — `getApiErrorMessage` repassa esse texto à tela.
   */
  const saveRule = useCallback(
    async (dto: SetSplitRuleDto) => {
      setState(prev => ({ ...prev, isSaving: true, error: null }));
      try {
        const saved = await apiClient.setSplitRule(dto);
        setState(prev => ({ ...prev, rule: saved, isSaving: false }));
        // O acerto depende da regra: precisa vir do servidor de novo para que
        // `appliedMode` e `fallbackApplied` reflitam o modo recém-salvo.
        await Promise.all([
          fetchSettlement(state.period).catch(() => undefined),
          fetchSummary(state.period).catch(() => undefined),
        ]);
        return saved;
      } catch (err) {
        const errorMsg = getApiErrorMessage(err, 'Erro ao salvar a regra de rateio');
        setState(prev => ({ ...prev, error: errorMsg, isSaving: false }));
        throw new Error(errorMsg);
      }
    },
    [fetchSettlement, fetchSummary, state.period],
  );

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  // Carga inicial
  useEffect(() => {
    fetchRule().catch(() => undefined);
  }, [fetchRule]);

  useEffect(() => {
    changePeriod(initialPeriod);
    // `changePeriod` é estável (useCallback); o efeito roda na montagem e a
    // cada troca do período inicial.
  }, [changePeriod, initialPeriod]);

  return {
    ...state,
    fetchSummary,
    fetchSettlement,
    fetchByCategory,
    fetchRule,
    changePeriod,
    saveRule,
    clearError,
  };
}
