import { useState, useCallback, useEffect } from 'react';
import { apiClient } from '../lib/api';
import {
  CashFlowMonthDto,
  CashFlowSummaryDto,
  BestDayToShopDto,
  GetBestDayToShopDto,
} from '../types/cash-flow';

/**
 * Hook do Fluxo de Caixa.
 *
 * CORREÇÃO: a versão anterior chamava `fetch` direto com
 * `credentials: 'include'`, esperando um cookie de sessão. Esta API autentica
 * por JWT no header `Authorization` — o cookie nunca existiu. Toda chamada
 * voltava 401 e a tela mostrava "erro ao carregar dados / Failed to fetch cash
 * flow:" sem indicar a causa.
 *
 * Passando pelo `apiClient` (axios), o token entra pelo interceptor, o 401
 * redireciona para o login em vez de virar texto de erro, e a mensagem
 * apresentada ao usuário passa a ser a do backend, em português.
 */
interface UseCashFlowState {
  monthData: CashFlowMonthDto | null;
  summary: CashFlowSummaryDto | null;
  bestDayRecommendation: BestDayToShopDto | null;
  isLoading: boolean;
  error: string | null;
}

/** Extrai a mensagem do backend; cai para um texto legível se não houver. */
function mensagemDeErro(err: unknown, fallback: string): string {
  const resposta = (err as { response?: { data?: { message?: unknown } } })
    ?.response?.data?.message;

  if (Array.isArray(resposta)) {
    return resposta.join(', ');
  }

  if (typeof resposta === 'string') {
    return resposta;
  }

  return fallback;
}

export function useCashFlow() {
  const [state, setState] = useState<UseCashFlowState>({
    monthData: null,
    summary: null,
    bestDayRecommendation: null,
    isLoading: false,
    error: null,
  });

  /** Fluxo de caixa de um mês específico. */
  const fetchMonthCashFlow = useCallback(
    async (month: number, year: number) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const data = await apiClient.getCashFlowMonth(month, year);
        setState((prev) => ({ ...prev, monthData: data, isLoading: false }));
        return data as CashFlowMonthDto;
      } catch (err) {
        setState((prev) => ({
          ...prev,
          error: mensagemDeErro(
            err,
            'Não foi possível carregar o fluxo de caixa do mês.',
          ),
          isLoading: false,
        }));
        throw err;
      }
    },
    [],
  );

  /** Resumo do mês corrente. */
  const fetchSummary = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const data = await apiClient.getCashFlowSummary();
      setState((prev) => ({ ...prev, summary: data, isLoading: false }));
      return data as CashFlowSummaryDto;
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: mensagemDeErro(
          err,
          'Não foi possível carregar o resumo do fluxo de caixa.',
        ),
        isLoading: false,
      }));
      throw err;
    }
  }, []);

  /** Recomendação de melhor dia para comprar. */
  const getBestDayToShop = useCallback(async (dto: GetBestDayToShopDto) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const data = await apiClient.getCashFlowBestDay({
        desiredAmount: dto.desiredAmount,
        startDate: dto.startDate?.toISOString(),
        endDate: dto.endDate?.toISOString(),
        minimumBalanceThreshold: dto.minimumBalanceThreshold,
        onlyLowRisk: dto.onlyLowRisk,
      });
      setState((prev) => ({
        ...prev,
        bestDayRecommendation: data,
        isLoading: false,
      }));
      return data as BestDayToShopDto;
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: mensagemDeErro(
          err,
          'Não foi possível calcular o melhor dia para a compra.',
        ),
        isLoading: false,
      }));
      throw err;
    }
  }, []);

  /**
   * Carga inicial.
   *
   * As promessas são resolvidas com `catch` vazio de propósito: o estado de
   * erro já foi preenchido dentro de cada função, e deixar a rejeição escapar
   * de um `useEffect` derruba o componente com "unhandled rejection".
   */
  useEffect(() => {
    const now = new Date();
    fetchMonthCashFlow(now.getMonth() + 1, now.getFullYear()).catch(() => {});
    fetchSummary().catch(() => {});
  }, [fetchMonthCashFlow, fetchSummary]);

  return {
    ...state,
    fetchMonthCashFlow,
    fetchSummary,
    getBestDayToShop,
  };
}
