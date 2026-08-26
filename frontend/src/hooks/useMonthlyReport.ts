'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import {
  MonthlyReport,
  MonthlyReportSummaryDto,
  ReportFormat,
} from '@/types/report';
import { getApiErrorMessage } from '@/utils/api-error';

interface UseMonthlyReportState {
  /** Relatório em tela (pré-visualização). `null` enquanto não carregou. */
  preview: MonthlyReport | null;
  /** Histórico de relatórios já gerados e gravados. */
  history: MonthlyReportSummaryDto[];
  /** Total do histórico no servidor (pode ser maior que `history.length`). */
  historyTotal: number;
  month: number;
  year: number;
  isLoading: boolean;
  isGenerating: boolean;
  isDeleting: boolean;
  /** Id do relatório cujo arquivo está sendo baixado, ou 'preview'. */
  downloadingKey: string | null;
  error: string | null;
}

/** Competência corrente — padrão do seletor e do botão de geração. */
function competenciaAtual(): { month: number; year: number } {
  const hoje = new Date();
  return { month: hoje.getMonth() + 1, year: hoje.getFullYear() };
}

/**
 * Dispara o download de um Blob no navegador.
 *
 * O object URL é REVOGADO logo depois: cada `createObjectURL` prende o blob na
 * memória da aba até ser revogado, e um relatório em PDF/XLSX não é pequeno.
 * O `<a>` fica fora do fluxo do documento e é removido em seguida.
 */
function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Hook do Relatório Mensal (item 28 do escopo).
 *
 * A pré-visualização vem de `GET /reports/monthly/preview`: é só leitura, não
 * grava nada e não gera arquivo. Só o botão "Gerar Relatório do Mês"
 * (`POST /reports/monthly`) persiste o relatório e escreve PDF, XLSX e CSV.
 *
 * REGRA 27: o hook NÃO normaliza nem preenche nada. `hasData: false`, seções
 * com `available: false` e variações `null` chegam à tela como o backend
 * mandou — inventar um zero aqui esconderia do usuário a falta de dados.
 */
export function useMonthlyReport(initialMonth?: number, initialYear?: number) {
  const inicial = competenciaAtual();

  const [state, setState] = useState<UseMonthlyReportState>({
    preview: null,
    history: [],
    historyTotal: 0,
    month: initialMonth ?? inicial.month,
    year: initialYear ?? inicial.year,
    isLoading: false,
    isGenerating: false,
    isDeleting: false,
    downloadingKey: null,
    error: null,
  });

  /** Carrega a pré-visualização de uma competência. */
  const fetchPreview = useCallback(async (month: number, year: number) => {
    setState(prev => ({
      ...prev,
      month,
      year,
      isLoading: true,
      error: null,
    }));
    try {
      const data = await apiClient.previewMonthlyReport(month, year);
      setState(prev => ({ ...prev, preview: data, isLoading: false }));
      return data;
    } catch (err) {
      const errorMsg = getApiErrorMessage(err, 'Erro ao carregar o relatório do mês');
      // O relatório antigo sai da tela: manter o mês anterior visível com o
      // seletor já em outra competência seria mostrar um número errado.
      setState(prev => ({
        ...prev,
        preview: null,
        error: errorMsg,
        isLoading: false,
      }));
      throw new Error(errorMsg);
    }
  }, []);

  const fetchHistory = useCallback(async (limit = 20, offset = 0) => {
    try {
      const data = await apiClient.listMonthlyReports(limit, offset);
      setState(prev => ({
        ...prev,
        history: data?.reports || [],
        historyTotal: data?.total ?? 0,
      }));
      return data;
    } catch (err) {
      const errorMsg = getApiErrorMessage(
        err,
        'Erro ao carregar o histórico de relatórios',
      );
      setState(prev => ({ ...prev, error: errorMsg }));
      throw new Error(errorMsg);
    }
  }, []);

  /**
   * "Gerar Relatório do Mês": persiste o relatório e escreve os três arquivos.
   * O histórico é recarregado porque o registro novo precisa aparecer nele.
   */
  const generateReport = useCallback(
    async (month: number, year: number, formats?: ReportFormat[]) => {
      setState(prev => ({ ...prev, isGenerating: true, error: null }));
      try {
        const criado = await apiClient.generateMonthlyReport({
          month,
          year,
          ...(formats && formats.length > 0 ? { formats } : {}),
        });
        setState(prev => ({ ...prev, isGenerating: false }));
        await fetchHistory().catch(() => undefined);
        return criado;
      } catch (err) {
        const errorMsg = getApiErrorMessage(err, 'Erro ao gerar o relatório do mês');
        setState(prev => ({ ...prev, error: errorMsg, isGenerating: false }));
        throw new Error(errorMsg);
      }
    },
    [fetchHistory],
  );

  /**
   * Baixa um arquivo já gerado e entrega ao navegador.
   *
   * `fallbackName` é usado quando o `Content-Disposition` não é exposto pelo
   * CORS — sem ele o navegador salvaria o arquivo com o nome da rota.
   */
  const downloadReport = useCallback(
    async (id: string, format: ReportFormat, fallbackName?: string) => {
      setState(prev => ({ ...prev, downloadingKey: `${id}:${format}`, error: null }));
      try {
        const { blob, fileName } = await apiClient.downloadMonthlyReport(id, format);
        saveBlob(blob, fileName || fallbackName || `relatorio.${format}`);
        setState(prev => ({ ...prev, downloadingKey: null }));
        return true;
      } catch (err) {
        const errorMsg = getApiErrorMessage(err, 'Erro ao baixar o arquivo do relatório');
        setState(prev => ({ ...prev, error: errorMsg, downloadingKey: null }));
        throw new Error(errorMsg);
      }
    },
    [],
  );

  const deleteReport = useCallback(async (id: string) => {
    setState(prev => ({ ...prev, isDeleting: true, error: null }));
    try {
      await apiClient.deleteMonthlyReport(id);
      setState(prev => ({
        ...prev,
        history: prev.history.filter(item => item.id !== id),
        historyTotal: Math.max(prev.historyTotal - 1, 0),
        isDeleting: false,
      }));
      return true;
    } catch (err) {
      const errorMsg = getApiErrorMessage(err, 'Erro ao excluir o relatório');
      setState(prev => ({ ...prev, error: errorMsg, isDeleting: false }));
      throw new Error(errorMsg);
    }
  }, []);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  // Carga inicial: pré-visualização da competência escolhida + histórico.
  useEffect(() => {
    const mes = initialMonth ?? competenciaAtual().month;
    const ano = initialYear ?? competenciaAtual().year;
    fetchPreview(mes, ano).catch(() => undefined);
    fetchHistory().catch(() => undefined);
  }, [fetchPreview, fetchHistory, initialMonth, initialYear]);

  return {
    ...state,
    fetchPreview,
    fetchHistory,
    generateReport,
    downloadReport,
    deleteReport,
    clearError,
  };
}
