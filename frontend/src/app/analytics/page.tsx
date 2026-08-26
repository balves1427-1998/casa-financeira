'use client';

import { useAnalytics } from '@/hooks/useAnalytics';
import { SpendingPatternCard } from '@/components/analytics/SpendingPatternCard';
import { AnomaliesPanel } from '@/components/analytics/AnomaliesPanel';
import { ComparisonChart } from '@/components/analytics/ComparisonChart';
import { AlertCircle, TrendingUp, Zap } from 'lucide-react';

export default function AnalyticsPage() {
  const {
    summary,
    spendingPattern,
    anomalies,
    comparison,
    isLoading,
    error,
    getAnomalies,
    reviewAnomaly,
  } = useAnalytics();

  const handleReviewAnomaly = async (anomalyId: string, action: 'confirmed' | 'dismissed') => {
    try {
      await reviewAnomaly(anomalyId, { userAction: action });
      await getAnomalies();
    } catch (err) {
      console.error('Failed to review anomaly:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Análise Financeira Avançada
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Padrões de gastos, anomalias detectadas e comparações
          </p>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20 p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-red-900 dark:text-red-100">
              Erro ao carregar análises
            </h3>
            <p className="text-sm text-red-800 dark:text-red-200 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Quick Stats */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Total Spent This Month */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Gasto Este Mês</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {new Intl.NumberFormat('pt-BR', {
                style: 'currency',
                currency: 'BRL',
              }).format(summary.spendingPattern?.totalSpent || 0)}
            </p>
          </div>

          {/* Anomalies Detected */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Anomalias Detectadas</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                {summary.anomalies?.total || 0}
              </p>
              {summary.anomalies?.unreviewed > 0 && (
                <span className="text-xs font-medium px-2 py-1 rounded bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300">
                  {summary.anomalies.unreviewed} para revisar
                </span>
              )}
            </div>
          </div>

          {/* Trending Categories */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Categorias em Alta</p>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">
              {summary.trends?.topIncreasingCategories?.length || 0}
            </p>
          </div>

          {/* Trending Down */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Categorias em Baixa</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
              {summary.trends?.topDecreasingCategories?.length || 0}
            </p>
          </div>
        </div>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Spending Pattern (2 cols) */}
        <div className="lg:col-span-2">
          <SpendingPatternCard pattern={spendingPattern} isLoading={isLoading} />
        </div>

        {/* Right Column - Quick Comparison */}
        {comparison && (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Resumo Comparativo
            </h3>

            <div className="space-y-4">
              {/* Bruno */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">Bruno</span>
                  <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                    {comparison.brunoPercentage}%
                  </span>
                </div>
                <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 dark:bg-blue-400 transition-all"
                    style={{ width: `${comparison.brunoPercentage}%` }}
                  />
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  R$ {new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(comparison.totalSpentBruno)}
                </p>
              </div>

              {/* Giovanna */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">Giovanna</span>
                  <span className="text-sm font-semibold text-purple-600 dark:text-purple-400">
                    {comparison.giovannaPercentage}%
                  </span>
                </div>
                <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-600 dark:bg-purple-400 transition-all"
                    style={{ width: `${comparison.giovannaPercentage}%` }}
                  />
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  R$ {new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(comparison.totalSpentGiovanna)}
                </p>
              </div>

              {/* Difference */}
              <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Diferença</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  R$ {new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(comparison.difference)}
                </p>
              </div>
            </div>

            {comparison.insights.length > 0 && (
              <div className="mt-4 p-3 rounded bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900">
                <p className="text-xs font-medium text-blue-800 dark:text-blue-200 mb-2">
                  💡 Insights:
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  {comparison.insights[0]}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Anomalies */}
      <AnomaliesPanel
        anomalies={anomalies}
        isLoading={isLoading}
        onReview={handleReviewAnomaly}
      />

      {/* Full Comparison */}
      {comparison && <ComparisonChart comparison={comparison} isLoading={isLoading} />}

      {/* Tips Section */}
      <div className="rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border border-blue-200 dark:border-blue-900 p-6">
        <h3 className="font-semibold text-blue-900 dark:text-blue-100 flex items-center gap-2 mb-4">
          <Zap className="w-5 h-5" />
          Dicas para Análise Financeira
        </h3>
        <ul className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
          <li>
            • <strong>Revisar anomalias regularmente:</strong> Ajuda a identificar erros de classificação
            e novos padrões de gasto
          </li>
          <li>
            • <strong>Acompanhar tendências:</strong> Categorias em alta devem ser revistas para
            possíveis economias
          </li>
          <li>
            • <strong>Balancear divisão:</strong> Use a comparação Bruno x Giovanna para manter
            equidade nas despesas
          </li>
          <li>
            • <strong>Z-score &gt; 3:</strong> Indica anomalia muito significativa (99.7% fora do padrão)
          </li>
          <li>
            • <strong>Confirmar anomalias:</strong> Suas confirmações ajudam a melhorar a detecção
          </li>
        </ul>
      </div>
    </div>
  );
}
