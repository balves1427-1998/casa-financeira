'use client';

import { useState } from 'react';
import { AnomalyDto } from '@/types/analytics';
import { formatBRL } from '@/utils/format';
import { AlertCircle, Check, X, Eye } from 'lucide-react';

interface AnomaliesPanelProps {
  anomalies: AnomalyDto[];
  isLoading?: boolean;
  onReview?: (anomalyId: string, action: 'confirmed' | 'dismissed') => Promise<void>;
}

export function AnomaliesPanel({
  anomalies,
  isLoading = false,
  onReview,
}: AnomaliesPanelProps) {
  const [selectedAnomalyId, setSelectedAnomalyId] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 border-red-300 dark:border-red-700';
      case 'high':
        return 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200 border-orange-300 dark:border-orange-700';
      case 'medium':
        return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 border-yellow-300 dark:border-yellow-700';
      case 'low':
        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 border-blue-300 dark:border-blue-700';
      default:
        return 'bg-gray-100 dark:bg-gray-900/30 text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-700';
    }
  };

  const getAnomalyTypeLabel = (type: string) => {
    const labels: { [key: string]: string } = {
      spike: '📈 Pico de Gasto',
      pattern_change: '🔄 Mudança de Padrão',
      duplicate: '🔀 Possível Duplicação',
      suspicious: '⚠️ Transação Suspeita',
      unusual_merchant: '🏪 Novo Estabelecimento',
      frequency_increase: '📊 Aumento de Frequência',
    };
    return labels[type] || type;
  };

  const handleReview = async (anomalyId: string, action: 'confirmed' | 'dismissed') => {
    if (!onReview) return;
    setReviewingId(anomalyId);
    try {
      await onReview(anomalyId, action);
      setSelectedAnomalyId(null);
    } finally {
      setReviewingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (anomalies.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
        <div className="text-center py-8">
          <Check className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
            Nenhuma anomalia detectada
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            Seus gastos estão dentro do padrão esperado.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-orange-600" />
          Anomalias Detectadas
        </h3>
        <span className="px-3 py-1 rounded-full text-sm font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300">
          {anomalies.length} anomalias
        </span>
      </div>

      <div className="space-y-4">
        {anomalies.map(anomaly => (
          <div
            key={anomaly.id}
            className={`rounded-lg border p-4 cursor-pointer transition-colors ${
              selectedAnomalyId === anomaly.id
                ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/30'
                : `border-gray-200 dark:border-gray-700 ${getSeverityColor(anomaly.severity).split(' ')[0]}`
            }`}
            onClick={() => setSelectedAnomalyId(selectedAnomalyId === anomaly.id ? null : anomaly.id)}
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-2">
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-white">
                  {getAnomalyTypeLabel(anomaly.anomalyType)}
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {anomaly.description}
                </p>
              </div>
              <span className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap ml-2 ${getSeverityColor(anomaly.severity)}`}>
                {anomaly.severity === 'critical'
                  ? 'Crítico'
                  : anomaly.severity === 'high'
                    ? 'Alto'
                    : anomaly.severity === 'medium'
                      ? 'Médio'
                      : 'Baixo'}
              </span>
            </div>

            {/* Values */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-3 text-sm">
              <div>
                <p className="text-gray-600 dark:text-gray-400">Detectado</p>
                <p className="font-semibold text-gray-900 dark:text-white">
                  {formatBRL(anomaly.detectedValue)}
                </p>
              </div>
              <div>
                <p className="text-gray-600 dark:text-gray-400">Esperado</p>
                <p className="font-semibold text-gray-900 dark:text-white">
                  {formatBRL(anomaly.expectedValue)}
                </p>
              </div>
              <div>
                <p className="text-gray-600 dark:text-gray-400">Desvio</p>
                <p className="font-semibold text-red-600 dark:text-red-400">
                  {anomaly.deviationPercentage.toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-gray-600 dark:text-gray-400">Z-Score</p>
                <p className="font-semibold text-gray-900 dark:text-white">
                  {anomaly.zscore.toFixed(2)}σ
                </p>
              </div>
            </div>

            {/* Expanded Details */}
            {selectedAnomalyId === anomaly.id && (
              <div className="pt-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
                {anomaly.merchantName && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    <span className="font-semibold">Estabelecimento:</span> {anomaly.merchantName}
                  </p>
                )}

                {anomaly.anomalyDate && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    <span className="font-semibold">Data:</span>{' '}
                    {new Date(anomaly.anomalyDate).toLocaleDateString('pt-BR')}
                  </p>
                )}

                {anomaly.recommendation && (
                  <div className="p-3 rounded bg-blue-50 dark:bg-blue-950/20">
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      💡 {anomaly.recommendation}
                    </p>
                  </div>
                )}

                {/* Review Actions */}
                {!anomaly.isReviewed && (
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => handleReview(anomaly.id, 'confirmed')}
                      disabled={reviewingId === anomaly.id}
                      className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium rounded transition-colors flex items-center justify-center gap-2"
                    >
                      <Check className="w-4 h-4" />
                      Confirmar
                    </button>
                    <button
                      onClick={() => handleReview(anomaly.id, 'dismissed')}
                      disabled={reviewingId === anomaly.id}
                      className="flex-1 px-3 py-2 bg-gray-400 hover:bg-gray-500 disabled:opacity-50 text-white text-sm font-medium rounded transition-colors flex items-center justify-center gap-2"
                    >
                      <X className="w-4 h-4" />
                      Descartar
                    </button>
                  </div>
                )}

                {anomaly.isReviewed && (
                  <div className="p-3 rounded bg-green-50 dark:bg-green-950/20 text-sm text-green-800 dark:text-green-200">
                    ✓ Revisada - Ação: {anomaly.userAction}
                  </div>
                )}
              </div>
            )}

            {/* Show expand icon if not expanded */}
            {selectedAnomalyId !== anomaly.id && (
              <div className="flex justify-center">
                <Eye className="w-4 h-4 text-gray-400" />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Info */}
      <div className="mt-4 p-3 rounded bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900 text-xs text-blue-800 dark:text-blue-200">
        <p className="font-medium mb-1">💡 Como interpretar:</p>
        <ul className="space-y-1">
          <li>• <strong>Crítico:</strong> Requer revisão imediata</li>
          <li>• <strong>Alto:</strong> Possível erro ou gasto incomum</li>
          <li>• <strong>Médio:</strong> Desvio significativo do padrão</li>
          <li>• <strong>Baixo:</strong> Pequeno desvio, possível novo hábito</li>
        </ul>
      </div>
    </div>
  );
}
