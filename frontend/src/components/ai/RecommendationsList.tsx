'use client';

import { useState } from 'react';
import {
  RecommendationDto,
  RecommendationImpactEstimateDto,
  RecommendationPeriod,
  RecommendationPriority,
  RecommendationType,
} from '@/types/ai';
import { formatBRL, formatDate } from '@/utils/format';
import { Check, Lightbulb, PiggyBank, RefreshCw, Sparkles, X } from 'lucide-react';

interface RecommendationsListProps {
  recommendations: RecommendationDto[];
  impactEstimate?: RecommendationImpactEstimateDto | null;
  isLoading?: boolean;
  onDismiss?: (recommendationId: string) => Promise<unknown>;
  onApply?: (recommendationId: string) => Promise<unknown>;
  onRegenerate?: () => Promise<unknown>;
}

const PRIORITY_LABELS: Record<RecommendationPriority, string> = {
  [RecommendationPriority.HIGH]: 'Alta',
  [RecommendationPriority.MEDIUM]: 'Média',
  [RecommendationPriority.LOW]: 'Baixa',
};

const TYPE_LABELS: Record<RecommendationType, string> = {
  [RecommendationType.CATEGORY_HIGH]: '📊 Categoria acima do normal',
  [RecommendationType.PATTERN]: '🔄 Padrão de gasto',
  [RecommendationType.DUPLICATE]: '🔀 Possível duplicidade',
  [RecommendationType.UNUSED_SUB]: '📺 Assinatura sem uso',
  [RecommendationType.OPPORTUNITY]: '💡 Oportunidade de economia',
  [RecommendationType.CONSOLIDATION]: '🧾 Consolidação de dívidas',
  [RecommendationType.GOAL_OPTIMIZATION]: '🎯 Otimização de metas',
};

const PERIOD_LABELS: Record<RecommendationPeriod, string> = {
  [RecommendationPeriod.MONTHLY]: 'por mês',
  [RecommendationPeriod.QUARTERLY]: 'por trimestre',
  [RecommendationPeriod.ANNUAL]: 'por ano',
};

export function RecommendationsList({
  recommendations,
  impactEstimate,
  isLoading = false,
  onDismiss,
  onApply,
  onRegenerate,
}: RecommendationsListProps) {
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const getPriorityColor = (priority: RecommendationPriority) => {
    switch (priority) {
      case RecommendationPriority.HIGH:
        return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 border-red-300 dark:border-red-700';
      case RecommendationPriority.MEDIUM:
        return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 border-yellow-300 dark:border-yellow-700';
      case RecommendationPriority.LOW:
        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 border-blue-300 dark:border-blue-700';
      default:
        return 'bg-gray-100 dark:bg-gray-900/30 text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-700';
    }
  };

  const handleAction = async (
    recommendationId: string,
    action: 'apply' | 'dismiss',
  ) => {
    setProcessingId(recommendationId);
    try {
      if (action === 'apply' && onApply) {
        await onApply(recommendationId);
      }
      if (action === 'dismiss' && onDismiss) {
        await onDismiss(recommendationId);
      }
    } catch (err) {
      console.error('Erro ao processar a recomendação:', err);
    } finally {
      setProcessingId(null);
    }
  };

  const handleRegenerate = async () => {
    if (!onRegenerate) return;
    setIsRegenerating(true);
    try {
      await onRegenerate();
    } catch (err) {
      console.error('Erro ao regerar recomendações:', err);
    } finally {
      setIsRegenerating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map(index => (
            <div key={index} className="h-28 bg-gray-200 dark:bg-gray-700 rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Estimativa de impacto */}
      {impactEstimate && (
        <div className="rounded-lg border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/20 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-medium text-green-700 dark:text-green-300 flex items-center gap-2">
                <PiggyBank className="w-4 h-4" />
                Economia potencial estimada
              </h3>
              <p className="text-3xl font-bold text-green-900 dark:text-green-100 mt-1">
                {formatBRL(impactEstimate.totalPotentialSavings)}
              </p>
              <p className="text-xs text-green-800 dark:text-green-200 mt-2">
                {impactEstimate.percentageOfEasyActions.toFixed(0)}% das ações são de fácil
                execução
              </p>
            </div>

            {onRegenerate && (
              <button
                onClick={handleRegenerate}
                disabled={isRegenerating}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded border border-green-300 dark:border-green-800 text-green-800 dark:text-green-200 hover:bg-green-100 dark:hover:bg-green-900/30 disabled:opacity-50 transition-colors"
              >
                <RefreshCw
                  className={`w-4 h-4 ${isRegenerating ? 'animate-spin' : ''}`}
                />
                Atualizar
              </button>
            )}
          </div>
        </div>
      )}

      {/* Lista */}
      {recommendations.length === 0 ? (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
          <div className="text-center py-8">
            <Check className="w-12 h-12 text-green-500 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
              Nenhuma recomendação pendente
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Suas finanças estão organizadas. Continue assim!
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-yellow-500" />
              Recomendações da IA
            </h3>
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">
              {recommendations.length} recomendações
            </span>
          </div>

          <div className="space-y-4">
            {recommendations.map(recommendation => (
              <div
                key={recommendation.id}
                className="rounded-lg border border-gray-200 dark:border-gray-700 p-4"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      {TYPE_LABELS[recommendation.type] || recommendation.type}
                    </p>
                    <h4 className="font-semibold text-gray-900 dark:text-white mt-1">
                      {recommendation.title}
                    </h4>
                  </div>
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap border ${getPriorityColor(recommendation.priority)}`}
                  >
                    {PRIORITY_LABELS[recommendation.priority] || recommendation.priority}
                  </span>
                </div>

                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {recommendation.description}
                </p>

                {recommendation.potentialSavings !== undefined &&
                  recommendation.potentialSavings > 0 && (
                    <p className="mt-3 text-sm font-semibold text-green-600 dark:text-green-400">
                      Economia estimada: {formatBRL(recommendation.potentialSavings)}{' '}
                      {PERIOD_LABELS[recommendation.period] || ''}
                    </p>
                  )}

                {/* Scores */}
                <div className="grid grid-cols-3 gap-3 mt-4">
                  {[
                    { label: 'Relevância', value: recommendation.relevance, color: 'bg-blue-600' },
                    { label: 'Impacto', value: recommendation.impact, color: 'bg-purple-600' },
                    { label: 'Facilidade', value: recommendation.ease, color: 'bg-green-600' },
                  ].map(score => (
                    <div key={score.label}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-600 dark:text-gray-400">
                          {score.label}
                        </span>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {score.value}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${score.color}`}
                          style={{ width: `${Math.min(Math.max(score.value, 0), 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Gerada em {formatDate(recommendation.createdAt)}
                  </span>

                  <div className="flex gap-2">
                    {onApply && (
                      <button
                        onClick={() => handleAction(recommendation.id, 'apply')}
                        disabled={processingId === recommendation.id}
                        className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded transition-colors flex items-center gap-2"
                      >
                        <Sparkles className="w-4 h-4" />
                        Aplicar
                      </button>
                    )}
                    {onDismiss && (
                      <button
                        onClick={() => handleAction(recommendation.id, 'dismiss')}
                        disabled={processingId === recommendation.id}
                        className="px-3 py-2 bg-gray-400 hover:bg-gray-500 disabled:opacity-50 text-white text-sm font-medium rounded transition-colors flex items-center gap-2"
                      >
                        <X className="w-4 h-4" />
                        Descartar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
