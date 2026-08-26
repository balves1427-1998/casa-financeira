'use client';

import { useState } from 'react';
import { SensitivityAnalysisDto, ForecastPeriod } from '@/types/forecasting';
import { formatBRL } from '@/utils/format';
import { AlertCircle, Zap } from 'lucide-react';

interface SensitivityAnalysisProps {
  analysis: SensitivityAnalysisDto[] | null;
  isLoading?: boolean;
  onAnalyze?: (
    period: ForecastPeriod,
    variable: 'income' | 'expenses' | 'both',
    change: number,
  ) => Promise<void>;
}

export function SensitivityAnalysis({
  analysis,
  isLoading = false,
  onAnalyze,
}: SensitivityAnalysisProps) {
  const [selectedVariable, setSelectedVariable] = useState<
    'income' | 'expenses' | 'both'
  >('both');
  const [selectedChange, setSelectedChange] = useState<number>(10);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleAnalyze = async (period: ForecastPeriod) => {
    if (!onAnalyze) return;
    setIsAnalyzing(true);
    try {
      await onAnalyze(period, selectedVariable, selectedChange);
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (!analysis || analysis.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
          <Zap className="w-5 h-5 text-yellow-600" />
          Análise de Sensibilidade
        </h3>
        <div className="text-center py-8">
          <p className="text-gray-600 dark:text-gray-400">
            Simule diferentes cenários para entender o impacto no seu fluxo de caixa
          </p>
        </div>
      </div>
    );
  }

  const getRiskColor = (risk: 'low' | 'medium' | 'high') => {
    switch (risk) {
      case 'low':
        return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 border-green-300 dark:border-green-700';
      case 'medium':
        return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 border-yellow-300 dark:border-yellow-700';
      case 'high':
        return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 border-red-300 dark:border-red-700';
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
        <Zap className="w-5 h-5 text-yellow-600" />
        Análise de Sensibilidade
      </h3>

      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Veja como mudanças nas receitas ou despesas impactariam seu fluxo de caixa
      </p>

      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
        {/* Variable selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Variável
          </label>
          <select
            value={selectedVariable}
            onChange={e =>
              setSelectedVariable(
                e.target.value as 'income' | 'expenses' | 'both',
              )
            }
            disabled={isAnalyzing}
            className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm disabled:opacity-50"
          >
            <option value="both">Renda e Despesas</option>
            <option value="income">Apenas Renda</option>
            <option value="expenses">Apenas Despesas</option>
          </select>
        </div>

        {/* Change percentage */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Variação (%)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="-50"
              max="50"
              step="5"
              value={selectedChange}
              onChange={e => setSelectedChange(parseInt(e.target.value))}
              disabled={isAnalyzing}
              className="flex-1"
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-12">
              {selectedChange > 0 ? '+' : ''}{selectedChange}%
            </span>
          </div>
        </div>

        {/* Action */}
        <div className="flex items-end">
          <button
            onClick={() => handleAnalyze(ForecastPeriod.MEDIUM)}
            disabled={isAnalyzing || isLoading}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded font-medium transition-colors"
          >
            {isAnalyzing ? 'Analisando...' : 'Analisar'}
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="space-y-4">
        {analysis.map((scenario, idx) => (
          <div
            key={idx}
            className={`rounded-lg border p-4 ${getRiskColor(scenario.riskLevel)}`}
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div>
                <h4 className="font-semibold">
                  {scenario.variable === 'both'
                    ? 'Renda e Despesas'
                    : scenario.variable === 'income'
                      ? 'Renda'
                      : 'Despesas'}{' '}
                  {scenario.percentageChange > 0 ? '+' : ''}{scenario.percentageChange}%
                </h4>
                <p className="text-xs opacity-75 mt-1">
                  Nível de Risco:{' '}
                  {scenario.riskLevel === 'low'
                    ? 'Baixo'
                    : scenario.riskLevel === 'medium'
                      ? 'Médio'
                      : 'Alto'}
                </p>
              </div>
              {scenario.riskLevel === 'high' && (
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
              )}
            </div>

            {/* Balances */}
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div>
                <div className="text-xs opacity-75 uppercase font-medium">
                  30 dias
                </div>
                <div className="text-lg font-bold mt-1">
                  {formatBRL(scenario.projectedBalance30Days)}
                </div>
              </div>
              <div>
                <div className="text-xs opacity-75 uppercase font-medium">
                  90 dias
                </div>
                <div className="text-lg font-bold mt-1">
                  {formatBRL(scenario.projectedBalance90Days)}
                </div>
              </div>
              <div>
                <div className="text-xs opacity-75 uppercase font-medium">
                  365 dias
                </div>
                <div className="text-lg font-bold mt-1">
                  {formatBRL(scenario.projectedBalance365Days)}
                </div>
              </div>
            </div>

            {/* Insights */}
            {scenario.insights && scenario.insights.length > 0 && (
              <div className="border-t border-current border-opacity-20 pt-3 space-y-1">
                {scenario.insights.map((insight, insightIdx) => (
                  <p key={insightIdx} className="text-xs leading-relaxed">
                    • {insight}
                  </p>
                ))}
              </div>
            )}

            {/* Negative Risk Warning */}
            {scenario.becomesNegative && scenario.negativeDate && (
              <div className="mt-3 pt-3 border-t border-current border-opacity-20">
                <p className="text-xs font-medium">
                  ⚠️ Saldo negativo em{' '}
                  {new Date(scenario.negativeDate).toLocaleDateString('pt-BR')}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Info */}
      <div className="mt-4 p-3 rounded bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900 text-xs text-blue-800 dark:text-blue-200">
        <p className="font-medium mb-1">💡 Como usar:</p>
        <p>
          Selecione uma variável (renda, despesas ou ambas), ajuste a variação desejada e
          clique em "Analisar" para ver como diferentes cenários impactariam seu fluxo de caixa.
        </p>
      </div>
    </div>
  );
}
