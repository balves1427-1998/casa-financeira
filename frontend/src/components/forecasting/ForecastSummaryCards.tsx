'use client';

import { ForecastDto } from '@/types/forecasting';
import { formatBRL } from '@/utils/format';
import {
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Calendar,
} from 'lucide-react';

interface ForecastSummaryCardsProps {
  forecast30?: ForecastDto;
  forecast90?: ForecastDto;
  forecast365?: ForecastDto;
  isLoading?: boolean;
}

export function ForecastSummaryCards({
  forecast30,
  forecast90,
  forecast365,
  isLoading = false,
}: ForecastSummaryCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <div
            key={i}
            className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6"
          >
            <div className="animate-pulse space-y-4">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
              <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
              <div className="space-y-2">
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded" />
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-5/6" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  const cards = [
    { forecast: forecast30, title: 'Próximos 30 dias', period: '1 mês' },
    { forecast: forecast90, title: 'Próximos 90 dias', period: '3 meses' },
    { forecast: forecast365, title: 'Próximo ano', period: '1 ano' },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {cards.map((card, idx) => {
        if (!card.forecast) {
          return (
            <div
              key={idx}
              className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 p-6 flex items-center justify-center"
            >
              <div className="text-center">
                <Calendar className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {card.title}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                  Gere previsão para visualizar
                </p>
              </div>
            </div>
          );
        }

        const isPositive = card.forecast.projectedEndBalance >= card.forecast.initialBalance;
        const change = card.forecast.projectedEndBalance - card.forecast.initialBalance;
        const changePercent = (change / card.forecast.initialBalance) * 100;
        const hasRisk = card.forecast.hasNegativeRisk || card.forecast.daysWithLowBalance > 0;

        return (
          <div
            key={idx}
            className={`rounded-lg border p-6 transition-colors ${
              hasRisk
                ? 'border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20'
                : isPositive
                  ? 'border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/20'
                  : 'border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20'
            }`}
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  {card.title}
                </h3>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  {card.period}
                </p>
              </div>
              {hasRisk ? (
                <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              ) : isPositive ? (
                <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
              ) : (
                <TrendingDown className="w-5 h-5 text-red-600 dark:text-red-400" />
              )}
            </div>

            {/* Projected Balance */}
            <div className="mb-4">
              <div className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                Saldo Projetado
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {formatBRL(card.forecast.projectedEndBalance)}
              </div>
              <div
                className={`text-sm font-medium mt-1 ${
                  isPositive
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {isPositive ? '+' : ''}{formatBRL(change)} ({changePercent.toFixed(1)}%)
              </div>
            </div>

            {/* Key Metrics */}
            <div className="space-y-2 border-t border-opacity-20 pt-4 border-current">
              {/* Min Balance */}
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">
                  Saldo Mínimo
                </span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {formatBRL(card.forecast.minProjectedBalance)}
                </span>
              </div>

              {/* Days Low Balance */}
              {card.forecast.daysWithLowBalance > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">
                    Dias com Saldo Baixo
                  </span>
                  <span className="font-medium text-amber-600 dark:text-amber-400">
                    {card.forecast.daysWithLowBalance}
                  </span>
                </div>
              )}

              {/* Confidence */}
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">
                  Confiança
                </span>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 transition-all"
                      style={{ width: `${card.forecast.confidence * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    {Math.round(card.forecast.confidence * 100)}%
                  </span>
                </div>
              </div>

              {/* Risk Status */}
              {card.forecast.hasNegativeRisk && (
                <div className="flex items-start gap-2 text-xs text-red-700 dark:text-red-300 bg-red-100/50 dark:bg-red-900/20 p-2 rounded mt-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>
                    Risco de saldo negativo em{' '}
                    {card.forecast.negativeRiskDate
                      ? new Date(card.forecast.negativeRiskDate).toLocaleDateString(
                          'pt-BR',
                        )
                      : 'data desconhecida'}
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
