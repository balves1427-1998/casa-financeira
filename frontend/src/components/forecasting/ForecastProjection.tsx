'use client';

import { ForecastDto } from '@/types/forecasting';
import { formatBRL } from '@/utils/format';
import { AlertCircle, TrendingUp } from 'lucide-react';

interface ForecastProjectionProps {
  forecast: ForecastDto | undefined;
  minBalanceThreshold?: number;
}

export function ForecastProjection({
  forecast,
  minBalanceThreshold = 2000,
}: ForecastProjectionProps) {
  if (!forecast) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 p-8 flex items-center justify-center">
        <div className="text-center">
          <TrendingUp className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400 font-medium">
            Nenhuma previsão disponível
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
            Gere uma previsão para visualizar a projeção
          </p>
        </div>
      </div>
    );
  }

  if (!forecast.detailedProjections || forecast.detailedProjections.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-8">
        <p className="text-center text-gray-600 dark:text-gray-400">
          Dados de projeção não disponíveis
        </p>
      </div>
    );
  }

  const projections = forecast.detailedProjections;
  const maxBalance = Math.max(...projections.map(p => p.projectedBalance), minBalanceThreshold * 1.5);
  const minBalance = Math.min(...projections.map(p => p.projectedBalance), 0);
  const range = maxBalance - minBalance;

  // Sample every nth point for better visualization
  const sampleSize = Math.ceil(projections.length / 20);
  const sampledProjections = projections.filter((_, idx) => idx % sampleSize === 0 || idx === projections.length - 1);

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Projeção de Saldo
      </h3>

      {/* Chart Container */}
      <div className="relative h-64 mb-4">
        {/* Y-axis labels */}
        <div className="absolute left-0 top-0 bottom-0 w-16 text-right pr-2 space-y-0 flex flex-col justify-between text-xs text-gray-500 dark:text-gray-400">
          <div>{formatBRL(maxBalance)}</div>
          <div>{formatBRL(maxBalance / 2)}</div>
          <div>{formatBRL(minBalanceThreshold)}</div>
          <div>{formatBRL(0)}</div>
          <div>{formatBRL(minBalance)}</div>
        </div>

        {/* Minimum balance line */}
        <div className="absolute left-16 right-0 top-[75%] h-0.5 bg-orange-300 dark:bg-orange-600/50 opacity-50" />

        {/* Chart area */}
        <svg
          viewBox={`0 0 ${sampledProjections.length * 10} 256`}
          className="w-full h-full ml-16"
          preserveAspectRatio="none"
        >
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((percent, idx) => (
            <line
              key={`grid-${idx}`}
              x1="0"
              y1={256 * percent}
              x2={sampledProjections.length * 10}
              y2={256 * percent}
              stroke="currentColor"
              className="text-gray-200 dark:text-gray-700"
              strokeWidth="1"
              strokeDasharray="4"
              opacity="0.5"
            />
          ))}

          {/* Minimum balance reference */}
          <line
            x1="0"
            y1={(1 - (minBalanceThreshold - minBalance) / range) * 256}
            x2={sampledProjections.length * 10}
            y2={(1 - (minBalanceThreshold - minBalance) / range) * 256}
            stroke="rgb(253, 168, 52)"
            strokeWidth="2"
            strokeDasharray="6"
            opacity="0.3"
          />

          {/* Path line */}
          <polyline
            points={sampledProjections
              .map((proj, idx) => {
                const y = 256 * (1 - (proj.projectedBalance - minBalance) / range);
                return `${idx * 10},${y}`;
              })
              .join(' ')}
            fill="none"
            stroke="rgb(59, 130, 246)"
            strokeWidth="3"
          />

          {/* Area fill */}
          <polygon
            points={`0,256 ${sampledProjections
              .map((proj, idx) => {
                const y = 256 * (1 - (proj.projectedBalance - minBalance) / range);
                return `${idx * 10},${y}`;
              })
              .join(' ')} ${sampledProjections.length * 10},256`}
            fill="rgb(59, 130, 246)"
            opacity="0.1"
          />

          {/* Points */}
          {sampledProjections.map((proj, idx) => {
            const y = 256 * (1 - (proj.projectedBalance - minBalance) / range);
            const isAtRisk = proj.projectedBalance < 0;
            const isLow = proj.projectedBalance < minBalanceThreshold;

            return (
              <circle
                key={`point-${idx}`}
                cx={idx * 10}
                cy={y}
                r="4"
                fill={isAtRisk ? 'rgb(239, 68, 68)' : isLow ? 'rgb(249, 115, 22)' : 'rgb(59, 130, 246)'}
              />
            );
          })}
        </svg>
      </div>

      {/* Legend and info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-gray-200 dark:border-gray-700 pt-4">
        {/* Start balance */}
        <div>
          <div className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
            Saldo Inicial
          </div>
          <div className="text-lg font-bold text-gray-900 dark:text-white mt-1">
            {formatBRL(forecast.initialBalance)}
          </div>
        </div>

        {/* Minimum projected */}
        <div>
          <div className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
            Saldo Mínimo Projetado
          </div>
          <div className={`text-lg font-bold mt-1 ${
            forecast.minProjectedBalance < 0
              ? 'text-red-600 dark:text-red-400'
              : forecast.minProjectedBalance < minBalanceThreshold
                ? 'text-orange-600 dark:text-orange-400'
                : 'text-green-600 dark:text-green-400'
          }`}>
            {formatBRL(forecast.minProjectedBalance)}
          </div>
        </div>

        {/* End balance */}
        <div>
          <div className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
            Saldo Final Projetado
          </div>
          <div className={`text-lg font-bold mt-1 ${
            forecast.projectedEndBalance >= forecast.initialBalance
              ? 'text-green-600 dark:text-green-400'
              : 'text-red-600 dark:text-red-400'
          }`}>
            {formatBRL(forecast.projectedEndBalance)}
          </div>
        </div>
      </div>

      {/* Warnings */}
      {forecast.hasNegativeRisk && (
        <div className="mt-4 flex items-start gap-3 p-3 rounded bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-700 dark:text-red-300">
            <p className="font-medium">Risco de saldo negativo</p>
            <p className="text-xs mt-1">
              Seu saldo pode ficar negativo em{' '}
              {forecast.negativeRiskDate
                ? new Date(forecast.negativeRiskDate).toLocaleDateString('pt-BR')
                : 'data desconhecida'}.
              Considere aumentar receitas ou reduzir despesas.
            </p>
          </div>
        </div>
      )}

      {forecast.daysWithLowBalance > 0 && (
        <div className="mt-2 flex items-start gap-3 p-3 rounded bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900">
          <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-700 dark:text-amber-300">
            <p className="font-medium">Saldo baixo projetado</p>
            <p className="text-xs mt-1">
              Você terá {forecast.daysWithLowBalance} dias com saldo abaixo de R$ 2.000.
              Considere planejar suas despesas.
            </p>
          </div>
        </div>
      )}

      {/* Recommendations */}
      {forecast.recommendations && forecast.recommendations.length > 0 && (
        <div className="mt-4 space-y-2">
          <h4 className="font-semibold text-gray-900 dark:text-white text-sm">
            Recomendações
          </h4>
          <ul className="space-y-1">
            {forecast.recommendations.map((rec, idx) => (
              <li
                key={idx}
                className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300"
              >
                <span className="text-blue-600 dark:text-blue-400 mt-0.5">→</span>
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
