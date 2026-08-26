'use client';

import { useState } from 'react';
import {
  AiAnomalyDto,
  AnomalySeverity,
  AnomalyType,
  ConfirmationStatus,
  DetectAnomaliesResultDto,
} from '@/types/ai';
import { formatDate, formatPercent } from '@/utils/format';
import {
  AlertCircle,
  Check,
  Eye,
  Loader2,
  RadioTower,
  Search,
  ShieldAlert,
  ThumbsUp,
} from 'lucide-react';

interface AnomaliesListProps {
  anomalies: AiAnomalyDto[];
  highSeverityCount?: number;
  mediumSeverityCount?: number;
  lowSeverityCount?: number;
  isLoading?: boolean;
  onConfirm?: (anomalyId: string, status: ConfirmationStatus) => Promise<unknown>;
  onFilterSeverity?: (severity?: AnomalySeverity) => void;
  /**
   * Dispara a varredura de anomalias e recarrega a lista.
   * O GET só LISTA o que já foi detectado — sem rodar a varredura a lista
   * permanece vazia mesmo havendo gastos fora do padrão.
   */
  onDetect?: () => Promise<DetectAnomaliesResultDto | undefined>;
}

const SEVERITY_LABELS: Record<AnomalySeverity, string> = {
  [AnomalySeverity.HIGH]: 'Alta',
  [AnomalySeverity.MEDIUM]: 'Média',
  [AnomalySeverity.LOW]: 'Baixa',
};

const TYPE_LABELS: Record<AnomalyType, string> = {
  [AnomalyType.UNUSUAL_AMOUNT]: '💰 Valor fora do padrão',
  [AnomalyType.DUPLICATE]: '🔀 Possível duplicidade',
  [AnomalyType.SPIKE]: '📈 Pico de gasto',
  [AnomalyType.PATTERN_BREAK]: '🔄 Quebra de padrão',
};

export function AnomaliesList({
  anomalies,
  highSeverityCount = 0,
  mediumSeverityCount = 0,
  lowSeverityCount = 0,
  isLoading = false,
  onConfirm,
  onFilterSeverity,
  onDetect,
}: AnomaliesListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<AnomalySeverity | 'ALL'>('ALL');
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionMessage, setDetectionMessage] = useState<string | null>(null);
  const [detectionError, setDetectionError] = useState<string | null>(null);

  const getSeverityColor = (severity: AnomalySeverity) => {
    switch (severity) {
      case AnomalySeverity.HIGH:
        return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 border-red-300 dark:border-red-700';
      case AnomalySeverity.MEDIUM:
        return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 border-yellow-300 dark:border-yellow-700';
      case AnomalySeverity.LOW:
        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 border-blue-300 dark:border-blue-700';
      default:
        return 'bg-gray-100 dark:bg-gray-900/30 text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-700';
    }
  };

  const handleFilter = (severity: AnomalySeverity | 'ALL') => {
    setSeverityFilter(severity);
    onFilterSeverity?.(severity === 'ALL' ? undefined : severity);
  };

  const handleDetect = async () => {
    if (!onDetect) return;
    setIsDetecting(true);
    setDetectionMessage(null);
    setDetectionError(null);
    try {
      const result = await onDetect();
      const detected = result?.detected ?? 0;

      setDetectionMessage(
        detected === 0
          ? 'Varredura concluída: nenhum gasto fora do padrão foi encontrado no período analisado.'
          : detected === 1
            ? 'Varredura concluída: 1 anomalia encontrada.'
            : `Varredura concluída: ${detected} anomalias encontradas.`,
      );
    } catch (err) {
      console.error('Erro ao detectar anomalias:', err);
      setDetectionError(
        err instanceof Error
          ? err.message
          : 'Não foi possível executar a varredura de anomalias.',
      );
    } finally {
      setIsDetecting(false);
    }
  };

  const handleConfirm = async (anomalyId: string, status: ConfirmationStatus) => {
    if (!onConfirm) return;
    setProcessingId(anomalyId);
    try {
      await onConfirm(anomalyId, status);
      setExpandedId(null);
    } catch (err) {
      console.error('Erro ao classificar a anomalia:', err);
    } finally {
      setProcessingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map(index => (
            <div key={index} className="h-24 bg-gray-200 dark:bg-gray-700 rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Resumo por severidade */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Severidade alta</p>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">
            {highSeverityCount}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Severidade média</p>
          <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
            {mediumSeverityCount}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Severidade baixa</p>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {lowSeverityCount}
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-orange-600" />
            Gastos fora do padrão
          </h3>

          {/* Filtro de severidade + gatilho da varredura */}
          <div className="flex flex-wrap items-center gap-2">
            {onDetect && (
              <button
                onClick={handleDetect}
                disabled={isDetecting}
                className="px-3 py-1.5 rounded text-xs font-medium bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors flex items-center gap-1.5"
              >
                {isDetecting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Search className="w-3.5 h-3.5" />
                )}
                {isDetecting ? 'Detectando...' : 'Detectar anomalias'}
              </button>
            )}

            {(['ALL', AnomalySeverity.HIGH, AnomalySeverity.MEDIUM, AnomalySeverity.LOW] as const).map(
              option => (
                <button
                  key={option}
                  onClick={() => handleFilter(option)}
                  className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
                    severityFilter === option
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300'
                      : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-blue-400'
                  }`}
                >
                  {option === 'ALL' ? 'Todas' : SEVERITY_LABELS[option]}
                </button>
              ),
            )}
          </div>
        </div>

        {/* Resultado da última varredura */}
        {detectionMessage && (
          <div className="mb-4 rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/20 p-3 flex items-start gap-2">
            <RadioTower className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-blue-800 dark:text-blue-200">{detectionMessage}</p>
          </div>
        )}

        {detectionError && (
          <div className="mb-4 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20 p-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800 dark:text-red-200">{detectionError}</p>
          </div>
        )}

        {anomalies.length === 0 ? (
          <div className="text-center py-8">
            <Check className="w-12 h-12 text-green-500 mx-auto mb-3" />
            <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
              Nenhuma anomalia na lista
            </h4>
            <p className="text-gray-600 dark:text-gray-400 max-w-xl mx-auto">
              Esta lista mostra apenas o que já foi detectado em varreduras
              anteriores. Clique em <strong>&quot;Detectar anomalias&quot;</strong> para
              analisar os lançamentos do período e encontrar gastos fora do padrão.
            </p>
            {onDetect && (
              <button
                onClick={handleDetect}
                disabled={isDetecting}
                className="mt-4 px-4 py-2 rounded-lg text-sm font-medium bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors inline-flex items-center gap-2"
              >
                {isDetecting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                {isDetecting ? 'Detectando...' : 'Detectar anomalias'}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {anomalies.map(anomaly => (
              <div
                key={anomaly.id}
                className={`rounded-lg border p-4 cursor-pointer transition-colors ${
                  expandedId === anomaly.id
                    ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/30'
                    : 'border-gray-200 dark:border-gray-700'
                }`}
                onClick={() =>
                  setExpandedId(expandedId === anomaly.id ? null : anomaly.id)
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white">
                      {TYPE_LABELS[anomaly.anomalyType] || anomaly.anomalyType}
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {anomaly.reason}
                    </p>
                  </div>
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap border ${getSeverityColor(anomaly.severity)}`}
                  >
                    {SEVERITY_LABELS[anomaly.severity] || anomaly.severity}
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 my-3 text-sm">
                  <div>
                    <p className="text-gray-600 dark:text-gray-400">Score de anomalia</p>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {formatPercent(anomaly.anomalyScore * 100, 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-600 dark:text-gray-400">Detectada em</p>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {formatDate(anomaly.createdAt)}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-600 dark:text-gray-400">Lançamento</p>
                    <p className="font-mono text-xs text-gray-700 dark:text-gray-300 truncate">
                      {anomaly.transactionId}
                    </p>
                  </div>
                </div>

                {expandedId === anomaly.id && (
                  <div className="pt-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
                    {anomaly.suggestedAction && (
                      <div className="p-3 rounded bg-blue-50 dark:bg-blue-950/20">
                        <p className="text-sm text-blue-800 dark:text-blue-200">
                          💡 {anomaly.suggestedAction}
                        </p>
                      </div>
                    )}

                    {onConfirm && (
                      <div className="flex flex-col sm:flex-row gap-2">
                        <button
                          onClick={event => {
                            event.stopPropagation();
                            handleConfirm(anomaly.id, ConfirmationStatus.NORMAL);
                          }}
                          disabled={processingId === anomaly.id}
                          className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium rounded transition-colors flex items-center justify-center gap-2"
                        >
                          <Check className="w-4 h-4" />
                          É normal
                        </button>
                        <button
                          onClick={event => {
                            event.stopPropagation();
                            handleConfirm(anomaly.id, ConfirmationStatus.UNUSUAL_BUT_OK);
                          }}
                          disabled={processingId === anomaly.id}
                          className="flex-1 px-3 py-2 bg-yellow-500 hover:bg-yellow-600 disabled:opacity-50 text-white text-sm font-medium rounded transition-colors flex items-center justify-center gap-2"
                        >
                          <ThumbsUp className="w-4 h-4" />
                          Incomum, mas correto
                        </button>
                        <button
                          onClick={event => {
                            event.stopPropagation();
                            handleConfirm(anomaly.id, ConfirmationStatus.FRAUDULENT);
                          }}
                          disabled={processingId === anomaly.id}
                          className="flex-1 px-3 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium rounded transition-colors flex items-center justify-center gap-2"
                        >
                          <AlertCircle className="w-4 h-4" />
                          Não reconheço
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {expandedId !== anomaly.id && (
                  <div className="flex justify-center">
                    <Eye className="w-4 h-4 text-gray-400" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
