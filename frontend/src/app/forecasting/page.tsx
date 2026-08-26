'use client';

import { useState, useCallback } from 'react';
import { useForecasting } from '@/hooks/useForecasting';
import { ForecastSummaryCards } from '@/components/forecasting/ForecastSummaryCards';
import { ForecastProjection } from '@/components/forecasting/ForecastProjection';
import { SensitivityAnalysis } from '@/components/forecasting/SensitivityAnalysis';
import { ForecastPeriod, GenerateForecastDto } from '@/types/forecasting';
import { formatBRL } from '@/utils/format';
import { AlertCircle, TrendingUp, Zap } from 'lucide-react';

export default function ForecastingPage() {
  const {
    summary,
    sensivityAnalysis,
    isLoading,
    error,
    generateForecast,
    analyzeSensitivity,
  } = useForecasting();

  const [selectedPeriod, setSelectedPeriod] = useState<ForecastPeriod>(
    ForecastPeriod.MEDIUM,
  );
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerateForecast = useCallback(
    async (period: ForecastPeriod) => {
      setIsGenerating(true);
      setSelectedPeriod(period);
      try {
        const dto: GenerateForecastDto = {
          period,
          minimumBalanceThreshold: 2000,
        };
        await generateForecast(dto);
      } catch (err) {
        console.error('Error generating forecast:', err);
      } finally {
        setIsGenerating(false);
      }
    },
    [generateForecast],
  );

  const handleAnalyzeSensitivity = useCallback(
    async (
      period: ForecastPeriod,
      variable: 'income' | 'expenses' | 'both',
      change: number,
    ) => {
      try {
        await analyzeSensitivity(period, variable, change);
      } catch (err) {
        console.error('Error analyzing sensitivity:', err);
      }
    },
    [analyzeSensitivity],
  );

  const selectedForecast =
    selectedPeriod === ForecastPeriod.SHORT
      ? summary?.forecast30Days
      : selectedPeriod === ForecastPeriod.MEDIUM
        ? summary?.forecast90Days
        : summary?.forecast365Days;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Previsões Financeiras
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Projete seu fluxo de caixa para os próximos 30, 90 ou 365 dias
          </p>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20 p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-red-900 dark:text-red-100">
              Erro ao carregar previsões
            </h3>
            <p className="text-sm text-red-800 dark:text-red-200 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Current Balance */}
      {summary && (
        <div className="rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/20 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-blue-700 dark:text-blue-300">
                Saldo Atual
              </h3>
              <p className="text-3xl font-bold text-blue-900 dark:text-blue-100 mt-1">
                {formatBRL(summary.currentBalance)}
              </p>
            </div>
            <TrendingUp className="w-12 h-12 text-blue-600 dark:text-blue-400 opacity-50" />
          </div>
        </div>
      )}

      {/* Generate Forecast Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { period: ForecastPeriod.SHORT, label: '30 Dias', icon: '📅' },
          { period: ForecastPeriod.MEDIUM, label: '90 Dias', icon: '📊' },
          { period: ForecastPeriod.LONG, label: '1 Ano', icon: '📈' },
        ].map(({ period, label, icon }) => (
          <button
            key={period}
            onClick={() => handleGenerateForecast(period)}
            disabled={isGenerating}
            className={`p-4 rounded-lg border-2 transition-all font-medium ${
              selectedPeriod === period
                ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300'
                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:border-blue-400'
            } disabled:opacity-50`}
          >
            <span className="text-2xl mb-2 block">{icon}</span>
            {label}
            {isGenerating && selectedPeriod === period && (
              <div className="animate-spin inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full ml-2" />
            )}
          </button>
        ))}
      </div>

      {/* Loading State */}
      {isLoading && !selectedForecast && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-12 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">
              Gerando previsão financeira...
            </p>
          </div>
        </div>
      )}

      {/* Forecast Summary Cards */}
      {summary && (
        <ForecastSummaryCards
          forecast30={summary.forecast30Days}
          forecast90={summary.forecast90Days}
          forecast365={summary.forecast365Days}
          isLoading={isLoading}
        />
      )}

      {/* Detailed Projection */}
      {selectedForecast && (
        <ForecastProjection
          forecast={selectedForecast}
          minBalanceThreshold={2000}
        />
      )}

      {/* Sensitivity Analysis */}
      {selectedForecast && (
        <SensitivityAnalysis
          analysis={sensivityAnalysis}
          isLoading={isLoading}
          onAnalyze={handleAnalyzeSensitivity}
        />
      )}

      {/* Breakdown Details */}
      {selectedForecast && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Income and Expenses */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Receitas e Despesas Projetadas
            </h3>
            <div className="space-y-4">
              <div className="border-l-4 border-green-500 pl-4">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Receitas Projetadas
                </div>
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {formatBRL(selectedForecast.projectedIncome)}
                </div>
              </div>

              <div className="border-l-4 border-red-500 pl-4">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Despesas Projetadas
                </div>
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {formatBRL(selectedForecast.projectedExpenses)}
                </div>
              </div>

              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">
                    Saldo Líquido
                  </span>
                  <span className="font-bold text-gray-900 dark:text-white">
                    {formatBRL(
                      selectedForecast.projectedIncome -
                        selectedForecast.projectedExpenses,
                    )}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Expense Breakdown */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Detalhamento de Despesas
            </h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-600 dark:text-gray-400">
                    Despesas Fixas
                  </span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatBRL(selectedForecast.fixedExpenses)}
                  </span>
                </div>
                <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-orange-500"
                    style={{
                      width: `${(selectedForecast.fixedExpenses / selectedForecast.projectedExpenses) * 100}%`,
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-600 dark:text-gray-400">
                    Despesas Variáveis
                  </span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatBRL(selectedForecast.variableExpenses)}
                  </span>
                </div>
                <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-500"
                    style={{
                      width: `${(selectedForecast.variableExpenses / selectedForecast.projectedExpenses) * 100}%`,
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-600 dark:text-gray-400">
                    Parcelamentos
                  </span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatBRL(selectedForecast.installmentPayments)}
                  </span>
                </div>
                <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500"
                    style={{
                      width: `${(selectedForecast.installmentPayments / selectedForecast.projectedExpenses) * 100}%`,
                    }}
                  />
                </div>
              </div>

              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <div className="flex justify-between font-bold">
                  <span className="text-gray-900 dark:text-white">Total</span>
                  <span className="text-gray-900 dark:text-white">
                    {formatBRL(selectedForecast.projectedExpenses)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tips Section */}
      <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 p-4">
        <h3 className="font-semibold text-blue-900 dark:text-blue-100 flex items-center gap-2 mb-3">
          <Zap className="w-5 h-5" />
          Dicas para Planejar Melhor
        </h3>
        <ul className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
          <li>
            • Use as previsões para identificar períodos críticos e planejar com antecedência
          </li>
          <li>
            • Teste diferentes cenários (±10%, ±20%) para entender sua margem de segurança
          </li>
          <li>
            • Mantenha uma reserva de emergência maior que o saldo mínimo projetado
          </li>
          <li>
            • Revise suas previsões mensalmente para melhorar a precisão
          </li>
          <li>
            • Use a análise de sensibilidade para planejar aumentos de renda ou redução de despesas
          </li>
        </ul>
      </div>
    </div>
  );
}
