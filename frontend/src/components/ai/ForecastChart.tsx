'use client';

import { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AiForecastPeriod,
  BalanceProjectionResponseDto,
  ForecastDetailsDto,
  ListCategoryForecastsDto,
} from '@/types/ai';
import { formatBRL, formatDate, formatPercent } from '@/utils/format';
import { AlertCircle, TrendingDown, TrendingUp } from 'lucide-react';

interface ForecastChartProps {
  balanceProjection: BalanceProjectionResponseDto | null;
  categoryForecasts?: ListCategoryForecastsDto | null;
  details?: ForecastDetailsDto | null;
  period: AiForecastPeriod;
  isLoading?: boolean;
  minimumSafetyBalance?: number;
  onPeriodChange?: (period: AiForecastPeriod) => void;
}

const PERIOD_OPTIONS: Array<{ value: AiForecastPeriod; label: string }> = [
  { value: AiForecastPeriod.NEXT_30_DAYS, label: '30 dias' },
  { value: AiForecastPeriod.NEXT_90_DAYS, label: '90 dias' },
  { value: AiForecastPeriod.NEXT_180_DAYS, label: '180 dias' },
  { value: AiForecastPeriod.NEXT_365_DAYS, label: '1 ano' },
];

/**
 * Paleta validada para gráficos (slots categóricos 1 e 2) e cores de status.
 * Os passos escuros são selecionados para a superfície escura, não invertidos.
 */
const CHART_COLORS = {
  light: {
    series1: '#2a78d6',
    series2: '#eb6834',
    grid: '#d8d8d4',
    axis: '#52514e',
    surface: '#ffffff',
  },
  dark: {
    series1: '#3987e5',
    series2: '#d95926',
    grid: '#3a3a38',
    axis: '#c3c2b7',
    surface: '#111827',
  },
  status: {
    warning: '#fab219',
    critical: '#d03b3b',
  },
};

/**
 * Detecta o tema ativo (Tailwind `darkMode: 'class'`) para colorir o gráfico.
 */
function useIsDarkMode(): boolean {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const update = () => setIsDark(root.classList.contains('dark'));

    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });

    return () => observer.disconnect();
  }, []);

  return isDark;
}

export function ForecastChart({
  balanceProjection,
  categoryForecasts,
  details,
  period,
  isLoading = false,
  minimumSafetyBalance = 2000,
  onPeriodChange,
}: ForecastChartProps) {
  const isDark = useIsDarkMode();
  const colors = isDark ? CHART_COLORS.dark : CHART_COLORS.light;

  const balanceData = (balanceProjection?.projections || []).map(projection => ({
    date: projection.date,
    label: formatDate(projection.date),
    saldo: projection.projectedBalance,
    isRiskyDay: projection.isRiskyDay,
    riskReason: projection.riskReason,
  }));

  const categoryData = (categoryForecasts?.forecasts || []).slice(0, 10).map(forecast => ({
    categoria: forecast.categoryName,
    atual: forecast.currentSpending,
    previsto: forecast.predictedSpending,
    variacao: forecast.percentageChange,
  }));

  const tooltipStyle = {
    backgroundColor: colors.surface,
    border: `1px solid ${colors.grid}`,
    borderRadius: '0.5rem',
    color: colors.axis,
    fontSize: '0.75rem',
  };

  if (isLoading && !balanceProjection) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-12 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">
            Calculando as previsões financeiras...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Seletor de período */}
      {onPeriodChange && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {PERIOD_OPTIONS.map(option => (
            <button
              key={option.value}
              onClick={() => onPeriodChange(option.value)}
              className={`p-3 rounded-lg border-2 transition-all text-sm font-medium ${
                period === option.value
                  ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:border-blue-400'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      {/* Indicadores */}
      {balanceProjection && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Saldo atual</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {formatBRL(balanceProjection.currentBalance)}
            </p>
          </div>

          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              Saldo mínimo projetado
            </p>
            <p
              className={`text-2xl font-bold ${
                balanceProjection.minimumProjectedBalance < 0
                  ? 'text-red-600 dark:text-red-400'
                  : balanceProjection.minimumProjectedBalance < minimumSafetyBalance
                    ? 'text-orange-600 dark:text-orange-400'
                    : 'text-green-600 dark:text-green-400'
              }`}
            >
              {formatBRL(balanceProjection.minimumProjectedBalance)}
            </p>
          </div>

          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              Saldo máximo projetado
            </p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {formatBRL(balanceProjection.maximumProjectedBalance)}
            </p>
          </div>

          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              Confiança do modelo
            </p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {details ? formatPercent(details.confidence * 100, 0) : '—'}
            </p>
          </div>
        </div>
      )}

      {/* Alerta de risco */}
      {balanceProjection?.hasNegativeBalanceRisk && (
        <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20 p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-red-900 dark:text-red-100">
              Risco de saldo negativo
            </h3>
            <p className="text-sm text-red-800 dark:text-red-200 mt-1">
              {balanceProjection.daysUntilNegativeBalance !== undefined
                ? `O saldo pode ficar negativo em ${balanceProjection.daysUntilNegativeBalance} dias.`
                : 'O saldo pode ficar negativo dentro do período projetado.'}{' '}
              Considere antecipar receitas ou adiar pagamentos não essenciais.
            </p>
          </div>
        </div>
      )}

      {/* Projeção de saldo */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
          Projeção de saldo
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Saldo projetado dia a dia, com a linha do saldo mínimo de segurança (
          {formatBRL(minimumSafetyBalance)}).
        </p>

        {balanceData.length === 0 ? (
          <p className="text-center text-gray-600 dark:text-gray-400 py-12">
            Nenhuma projeção disponível para o período selecionado.
          </p>
        ) : (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={balanceData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <defs>
                  <linearGradient id="saldoGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colors.series1} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={colors.series1} stopOpacity={0.02} />
                  </linearGradient>
                </defs>

                <CartesianGrid
                  stroke={colors.grid}
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fill: colors.axis, fontSize: 11 }}
                  stroke={colors.grid}
                  minTickGap={24}
                />
                <YAxis
                  tick={{ fill: colors.axis, fontSize: 11 }}
                  stroke={colors.grid}
                  width={90}
                  tickFormatter={(value: any) => formatBRL(Number(value))}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value: any) => [formatBRL(Number(value)), 'Saldo projetado']}
                  labelFormatter={(label: any) => `Data: ${label}`}
                />

                <ReferenceLine
                  y={0}
                  stroke={CHART_COLORS.status.critical}
                  strokeWidth={2}
                  label={{
                    value: 'Saldo zero',
                    position: 'insideTopRight',
                    fill: CHART_COLORS.status.critical,
                    fontSize: 11,
                  }}
                />
                <ReferenceLine
                  y={minimumSafetyBalance}
                  stroke={CHART_COLORS.status.warning}
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  label={{
                    value: 'Reserva mínima',
                    position: 'insideBottomRight',
                    fill: colors.axis,
                    fontSize: 11,
                  }}
                />

                <Area
                  type="monotone"
                  dataKey="saldo"
                  name="Saldo projetado"
                  stroke={colors.series1}
                  strokeWidth={2}
                  fill="url(#saldoGradient)"
                  activeDot={{ r: 5, strokeWidth: 2, stroke: colors.surface }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Dias de risco */}
        {balanceData.some(item => item.isRiskyDay) && (
          <div className="mt-4 p-3 rounded bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900">
            <p className="text-xs font-medium text-amber-800 dark:text-amber-200 mb-2">
              ⚠️ Dias críticos identificados
            </p>
            <ul className="space-y-1">
              {balanceData
                .filter(item => item.isRiskyDay)
                .slice(0, 5)
                .map(item => (
                  <li
                    key={String(item.date)}
                    className="text-xs text-amber-700 dark:text-amber-300"
                  >
                    <strong>{item.label}</strong> — {formatBRL(item.saldo)}
                    {item.riskReason ? ` · ${item.riskReason}` : ''}
                  </li>
                ))}
            </ul>
          </div>
        )}
      </div>

      {/* Previsão por categoria */}
      {categoryData.length > 0 && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                Gasto atual x previsto por categoria
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Comparação entre o gasto do período atual e a previsão do modelo.
              </p>
            </div>

            {categoryForecasts && (
              <div className="text-right">
                <p className="text-xs text-gray-600 dark:text-gray-400">Variação total</p>
                <p
                  className={`text-lg font-bold flex items-center gap-1 ${
                    categoryForecasts.totalPercentageChange > 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-green-600 dark:text-green-400'
                  }`}
                >
                  {categoryForecasts.totalPercentageChange > 0 ? (
                    <TrendingUp className="w-4 h-4" />
                  ) : (
                    <TrendingDown className="w-4 h-4" />
                  )}
                  {formatPercent(categoryForecasts.totalPercentageChange, 1)}
                </p>
              </div>
            )}
          </div>

          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={categoryData}
                layout="vertical"
                margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
                barGap={2}
              >
                <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fill: colors.axis, fontSize: 11 }}
                  stroke={colors.grid}
                  tickFormatter={(value: any) => formatBRL(Number(value))}
                />
                <YAxis
                  type="category"
                  dataKey="categoria"
                  tick={{ fill: colors.axis, fontSize: 11 }}
                  stroke={colors.grid}
                  width={130}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  cursor={{ fill: colors.grid, fillOpacity: 0.25 }}
                  formatter={(value: any, name: any) => [formatBRL(Number(value)), name]}
                />
                <Legend wrapperStyle={{ fontSize: '0.75rem', color: colors.axis }} />

                <Bar
                  dataKey="atual"
                  name="Gasto atual"
                  fill={colors.series1}
                  radius={[0, 4, 4, 0]}
                />
                <Bar
                  dataKey="previsto"
                  name="Gasto previsto"
                  fill={colors.series2}
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Detalhes do modelo */}
      {details && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Principais conclusões
            </h3>
            {details.keyInsights.length === 0 ? (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Nenhuma conclusão gerada para este período.
              </p>
            ) : (
              <ul className="space-y-2">
                {details.keyInsights.map(insight => (
                  <li
                    key={insight}
                    className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300"
                  >
                    <span className="text-blue-600 dark:text-blue-400 mt-0.5">→</span>
                    <span>{insight}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Base da previsão
            </h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-600 dark:text-gray-400">Modelo utilizado</dt>
                <dd className="font-medium text-gray-900 dark:text-white">
                  {details.modelUsed}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600 dark:text-gray-400">Acurácia do modelo</dt>
                <dd className="font-medium text-gray-900 dark:text-white">
                  {formatPercent(details.modelAccuracy, 1)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600 dark:text-gray-400">Média prevista</dt>
                <dd className="font-medium text-gray-900 dark:text-white">
                  {formatBRL(details.averagePredicted)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600 dark:text-gray-400">Próxima atualização</dt>
                <dd className="font-medium text-gray-900 dark:text-white">
                  {formatDate(details.nextUpdateAt)}
                </dd>
              </div>
            </dl>

            {details.assumptions.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                  Premissas consideradas
                </p>
                <ul className="space-y-1">
                  {details.assumptions.map(assumption => (
                    <li
                      key={assumption}
                      className="text-xs text-gray-600 dark:text-gray-400"
                    >
                      • {assumption}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
