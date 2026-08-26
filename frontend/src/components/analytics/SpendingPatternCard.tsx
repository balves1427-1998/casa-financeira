'use client';

import { SpendingPatternDto } from '@/types/analytics';
import { formatBRL } from '@/utils/format';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';

interface SpendingPatternCardProps {
  pattern: SpendingPatternDto | null;
  isLoading?: boolean;
}

export function SpendingPatternCard({
  pattern,
  isLoading = false,
}: SpendingPatternCardProps) {
  if (isLoading || !pattern) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
          <div className="grid grid-cols-2 gap-4">
            <div className="h-20 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-20 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        </div>
      </div>
    );
  }

  const getTrendColor = (change?: number) => {
    if (!change) return 'text-gray-600 dark:text-gray-400';
    return change > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400';
  };

  const getTrendIcon = (change?: number) => {
    if (!change) return null;
    return change > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />;
  };

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Padrão de Gastos
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {pattern.month}/{pattern.year}
          </p>
        </div>
        {pattern.pattern && (
          <span className="px-3 py-1 rounded-full text-sm font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">
            {pattern.pattern === 'daily'
              ? '📅 Diário'
              : pattern.pattern === 'weekly'
                ? '📊 Semanal'
                : pattern.pattern === 'monthly'
                  ? '💰 Mensal'
                  : '🔄 Irregular'}
          </span>
        )}
      </div>

      {/* Main statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {/* Total Spent */}
        <div className="rounded-lg bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-950/30 dark:to-red-900/20 p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Gasto</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {formatBRL(pattern.totalSpent)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
            {pattern.transactionCount} transações
          </p>
        </div>

        {/* Average Transaction */}
        <div className="rounded-lg bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20 p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Transação Média</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {formatBRL(pattern.averageTransaction)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
            Mediana: {formatBRL(pattern.medianTransaction)}
          </p>
        </div>

        {/* Min/Max */}
        <div className="rounded-lg bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-950/30 dark:to-green-900/20 p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Min / Max</p>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              Min: {formatBRL(pattern.minTransaction)}
            </p>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              Max: {formatBRL(pattern.maxTransaction)}
            </p>
          </div>
        </div>

        {/* Active Days */}
        <div className="rounded-lg bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-950/30 dark:to-purple-900/20 p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Dias Ativos</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {pattern.activeDays}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
            σ: {pattern.standardDeviation.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Comparisons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Month over Month */}
        {pattern.monthOverMonthChange !== undefined && (
          <div className="flex items-center justify-between p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">vs. Mês Anterior</p>
              <p className={`text-xl font-bold flex items-center gap-2 ${getTrendColor(pattern.monthOverMonthChange)}`}>
                {pattern.monthOverMonthChange > 0 ? '+' : ''}
                {pattern.monthOverMonthChange.toFixed(1)}%
                {getTrendIcon(pattern.monthOverMonthChange)}
              </p>
            </div>
          </div>
        )}

        {/* Deviation from Average */}
        {pattern.deviationFromAverage !== undefined && (
          <div className="flex items-center justify-between p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">vs. Média (6 meses)</p>
              <p className={`text-xl font-bold flex items-center gap-2 ${getTrendColor(pattern.deviationFromAverage)}`}>
                {pattern.deviationFromAverage > 0 ? '+' : ''}
                {pattern.deviationFromAverage.toFixed(1)}%
                {getTrendIcon(pattern.deviationFromAverage)}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Insights */}
      {pattern.insights && pattern.insights.length > 0 && (
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm font-semibold text-gray-900 dark:text-white mb-3">💡 Insights</p>
          <ul className="space-y-2">
            {pattern.insights.map((insight, idx) => (
              <li key={idx} className="text-sm text-gray-600 dark:text-gray-400">
                • {insight}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Most Expensive Day of Week */}
      {pattern.dayOfWeekAnalysis && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Dia mais caro da semana:{' '}
            <span className="font-semibold text-gray-900 dark:text-white">
              {pattern.dayOfWeekAnalysis.mostExpensiveDay.charAt(0).toUpperCase() +
                pattern.dayOfWeekAnalysis.mostExpensiveDay.slice(1)}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
