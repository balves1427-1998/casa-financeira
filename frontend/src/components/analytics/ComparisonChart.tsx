'use client';

import { BrunoGiovannaComparisonDto } from '@/types/analytics';
import { formatBRL } from '@/utils/format';
import { BarChart3, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';

interface ComparisonChartProps {
  comparison: BrunoGiovannaComparisonDto | null;
  isLoading?: boolean;
}

export function ComparisonChart({
  comparison,
  isLoading = false,
}: ComparisonChartProps) {
  if (isLoading || !comparison) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
          <div className="h-40 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      </div>
    );
  }

  const getTrendColor = (trend: string) => {
    return trend === 'increasing'
      ? 'text-red-600 dark:text-red-400'
      : trend === 'decreasing'
        ? 'text-green-600 dark:text-green-400'
        : 'text-gray-600 dark:text-gray-400';
  };

  const getTrendIcon = (trend: string) => {
    if (trend === 'increasing') {
      return <TrendingUp className="w-4 h-4" />;
    } else if (trend === 'decreasing') {
      return <TrendingDown className="w-4 h-4" />;
    }
    return null;
  };

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <BarChart3 className="w-5 h-5" />
          Bruno vs Giovanna
        </h3>
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {comparison.period}
        </span>
      </div>

      {/* Overall comparison */}
      <div className="mb-6 p-4 rounded-lg bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30">
        <div className="grid grid-cols-3 gap-4 text-center">
          {/* Bruno */}
          <div>
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-2">BRUNO</p>
            <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">
              {formatBRL(comparison.totalSpentBruno)}
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-400 mt-2">
              {comparison.brunoPercentage}%
            </p>
          </div>

          {/* Total */}
          <div className="border-l-2 border-r-2 border-blue-200 dark:border-blue-800">
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">TOTAL</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {formatBRL(comparison.totalSpentTogether)}
            </p>
            <p className="text-xs text-gray-700 dark:text-gray-400 mt-2">
              {comparison.transactionCountBruno + comparison.transactionCountGiovanna} transações
            </p>
          </div>

          {/* Giovanna */}
          <div>
            <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 mb-2">
              GIOVANNA
            </p>
            <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">
              {formatBRL(comparison.totalSpentGiovanna)}
            </p>
            <p className="text-xs text-purple-700 dark:text-purple-400 mt-2">
              {comparison.giovannaPercentage}%
            </p>
          </div>
        </div>
      </div>

      {/* Difference */}
      <div className="mb-6 p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Diferença</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">
              {formatBRL(comparison.difference)}
            </p>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {comparison.totalSpentBruno > comparison.totalSpentGiovanna ? 'Bruno' : 'Giovanna'} gastou
            mais
          </p>
        </div>
      </div>

      {/* Trends */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className={`p-4 rounded-lg border ${
          comparison.trends.bruno === 'increasing'
            ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20'
            : comparison.trends.bruno === 'decreasing'
              ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20'
              : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50'
        }`}>
          <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
            Bruno
            <span className={`flex items-center gap-1 text-sm ${getTrendColor(comparison.trends.bruno)}`}>
              {getTrendIcon(comparison.trends.bruno)}
              {comparison.trends.bruno === 'increasing'
                ? 'Aumentando'
                : comparison.trends.bruno === 'decreasing'
                  ? 'Diminuindo'
                  : 'Estável'}
            </span>
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Transações: {comparison.transactionCountBruno}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Média: {formatBRL(comparison.averageTransactionBruno)}
          </p>
        </div>

        <div className={`p-4 rounded-lg border ${
          comparison.trends.giovanna === 'increasing'
            ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20'
            : comparison.trends.giovanna === 'decreasing'
              ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20'
              : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50'
        }`}>
          <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
            Giovanna
            <span className={`flex items-center gap-1 text-sm ${getTrendColor(comparison.trends.giovanna)}`}>
              {getTrendIcon(comparison.trends.giovanna)}
              {comparison.trends.giovanna === 'increasing'
                ? 'Aumentando'
                : comparison.trends.giovanna === 'decreasing'
                  ? 'Diminuindo'
                  : 'Estável'}
            </span>
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Transações: {comparison.transactionCountGiovanna}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Média: {formatBRL(comparison.averageTransactionGiovanna)}
          </p>
        </div>
      </div>

      {/* Category comparison */}
      {comparison.categoryComparison.length > 0 && (
        <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            Gastos por Categoria
          </h4>

          <div className="space-y-3">
            {comparison.categoryComparison.slice(0, 5).map((cat, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-gray-900 dark:text-white">
                    {cat.categoryName}
                  </span>
                  <span className="text-gray-600 dark:text-gray-400">
                    {formatBRL(cat.brunoSpent + cat.giovannaSpent)}
                  </span>
                </div>

                <div className="flex gap-2 h-2">
                  {/* Bruno bar */}
                  <div className="flex-1 rounded-full bg-blue-100 dark:bg-blue-900/30 overflow-hidden">
                    <div
                      className="h-full bg-blue-600 dark:bg-blue-400"
                      style={{
                        width: `${cat.brunoPercentage}%`,
                      }}
                    />
                  </div>

                  {/* Giovanna bar */}
                  <div className="flex-1 rounded-full bg-purple-100 dark:bg-purple-900/30 overflow-hidden">
                    <div
                      className="h-full bg-purple-600 dark:bg-purple-400"
                      style={{
                        width: `${cat.giovannaPercentage}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
                  <span>Bruno: {formatBRL(cat.brunoSpent)}</span>
                  <span>Giovanna: {formatBRL(cat.giovannaSpent)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Insights */}
      {comparison.insights.length > 0 && (
        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm font-semibold text-gray-900 dark:text-white mb-3">📊 Insights</p>
          <ul className="space-y-2">
            {comparison.insights.map((insight, idx) => (
              <li key={idx} className="text-sm text-gray-600 dark:text-gray-400">
                • {insight}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
