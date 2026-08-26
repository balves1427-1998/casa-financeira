'use client';

import { useState } from 'react';
import { useAiAnalysis, useAiChat, useAiForecasts, useAiRecommendations } from '@/hooks/useAI';
import { ChatAssistant } from '@/components/ai/ChatAssistant';
import { RecommendationsList } from '@/components/ai/RecommendationsList';
import { AnomaliesList } from '@/components/ai/AnomaliesList';
import { ForecastChart } from '@/components/ai/ForecastChart';
import { AnomalySeverity } from '@/types/ai';
import { formatBRL, formatPercent } from '@/utils/format';
import {
  AlertCircle,
  Bot,
  Lightbulb,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-react';

type TabType = 'chat' | 'recommendations' | 'anomalies' | 'forecasts';

const TABS: Array<{ id: TabType; label: string; icon: typeof Bot }> = [
  { id: 'chat', label: 'Assistente', icon: Bot },
  { id: 'recommendations', label: 'Recomendações', icon: Lightbulb },
  { id: 'anomalies', label: 'Anomalias', icon: ShieldAlert },
  { id: 'forecasts', label: 'Previsões', icon: TrendingUp },
];

export default function AiPage() {
  const [activeTab, setActiveTab] = useState<TabType>('chat');

  const chat = useAiChat();
  const recommendations = useAiRecommendations();
  const analysis = useAiAnalysis();
  const forecasts = useAiForecasts();

  const error = chat.error || recommendations.error || analysis.error || forecasts.error;

  const handleFilterSeverity = (severity?: AnomalySeverity) => {
    analysis.fetchAnomalies({ severity }).catch(() => undefined);
  };

  /**
   * Dispara a varredura de anomalias. O GET só lista o que já foi detectado,
   * então sem este gatilho a aba fica permanentemente vazia.
   */
  const handleDetectAnomalies = () => analysis.detectAnomalies();

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Inteligência Financeira
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Assistente com IA, recomendações, anomalias e previsões da casa
          </p>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20 p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-red-900 dark:text-red-100">
              Erro ao carregar a inteligência financeira
            </h3>
            <p className="text-sm text-red-800 dark:text-red-200 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            Recomendações ativas
          </p>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {recommendations.total}
            </p>
            {recommendations.highPriorityCount > 0 && (
              <span className="text-xs font-medium px-2 py-1 rounded bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300">
                {recommendations.highPriorityCount} de alta prioridade
              </span>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            Economia potencial
          </p>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">
            {formatBRL(recommendations.impactEstimate?.totalPotentialSavings || 0)}
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            Anomalias detectadas
          </p>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
              {analysis.anomalies.length}
            </p>
            {analysis.highSeverityCount > 0 && (
              <span className="text-xs font-medium px-2 py-1 rounded bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300">
                {analysis.highSeverityCount} graves
              </span>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            Saldo mínimo projetado
          </p>
          <p
            className={`text-2xl font-bold ${
              (forecasts.balanceProjection?.minimumProjectedBalance ?? 0) < 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-gray-900 dark:text-white'
            }`}
          >
            {forecasts.balanceProjection
              ? formatBRL(forecasts.balanceProjection.minimumProjectedBalance)
              : '—'}
          </p>
        </div>
      </div>

      {/* Insights automáticos */}
      {analysis.insights.length > 0 && (
        <div className="rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border border-blue-200 dark:border-blue-900 p-6">
          <h3 className="font-semibold text-blue-900 dark:text-blue-100 flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5" />
            Insights automáticos
          </h3>
          <ul className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
            {analysis.insights.slice(0, 5).map(insight => (
              <li key={insight}>• {insight}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Navegação por abas */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex flex-wrap gap-2 -mb-px">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-700 dark:text-blue-300'
                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:border-gray-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Conteúdo das abas */}
      {activeTab === 'chat' && (
        <ChatAssistant
          messages={chat.messages}
          suggestions={chat.suggestions}
          isLoading={chat.isLoading}
          isSending={chat.isSending}
          onSend={chat.sendMessage}
          onClearHistory={chat.clearHistory}
        />
      )}

      {activeTab === 'recommendations' && (
        <RecommendationsList
          recommendations={recommendations.recommendations}
          impactEstimate={recommendations.impactEstimate}
          isLoading={recommendations.isLoading}
          onDismiss={recommendations.dismissRecommendation}
          onApply={recommendations.applyRecommendation}
          onRegenerate={recommendations.regenerateRecommendations}
        />
      )}

      {activeTab === 'anomalies' && (
        <div className="space-y-6">
          <AnomaliesList
            anomalies={analysis.anomalies}
            highSeverityCount={analysis.highSeverityCount}
            mediumSeverityCount={analysis.mediumSeverityCount}
            lowSeverityCount={analysis.lowSeverityCount}
            isLoading={analysis.isLoading}
            onConfirm={analysis.confirmAnomaly}
            onFilterSeverity={handleFilterSeverity}
            onDetect={handleDetectAnomalies}
          />

          {/* Perfil de gastos */}
          {analysis.spendingProfile && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Perfil de gastos da casa
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                    Média diária
                  </p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white mt-1">
                    {formatBRL(analysis.spendingProfile.averageDailySpend)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                    Média mensal
                  </p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white mt-1">
                    {formatBRL(analysis.spendingProfile.averageMonthlySpend)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                    Maior categoria
                  </p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white mt-1">
                    {analysis.spendingProfile.topCategory}
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {formatPercent(analysis.spendingProfile.topCategoryPercentage, 1)} do total
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                    Previsibilidade
                  </p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white mt-1">
                    {formatPercent(analysis.spendingProfile.predictability * 100, 0)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Padrões identificados */}
          {analysis.patterns.length > 0 && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Padrões identificados
              </h3>
              <div className="space-y-3">
                {analysis.patterns.slice(0, 6).map(pattern => (
                  <div
                    key={pattern.id}
                    className="rounded border border-gray-200 dark:border-gray-700 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm text-gray-900 dark:text-white font-medium">
                        {pattern.name || pattern.description}
                      </p>
                      <span className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        {pattern.frequency}
                      </span>
                    </div>
                    {pattern.recommendation && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                        💡 {pattern.recommendation}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'forecasts' && (
        <ForecastChart
          balanceProjection={forecasts.balanceProjection}
          categoryForecasts={forecasts.categoryForecasts}
          details={forecasts.details}
          period={forecasts.period}
          isLoading={forecasts.isLoading}
          onPeriodChange={forecasts.changePeriod}
        />
      )}

      {/* Tips Section */}
      <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 p-4">
        <h3 className="font-semibold text-blue-900 dark:text-blue-100 flex items-center gap-2 mb-3">
          <Zap className="w-5 h-5" />
          Como aproveitar melhor a IA
        </h3>
        <ul className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
          <li>
            • <strong>Pergunte com contexto:</strong> escolha o período e o responsável antes
            de enviar a pergunta
          </li>
          <li>
            • <strong>Classifique as anomalias:</strong> suas respostas ensinam o sistema a
            detectar melhor os gastos fora do padrão
          </li>
          <li>
            • <strong>Revise as recomendações:</strong> descartar as que não fazem sentido
            melhora as próximas sugestões
          </li>
          <li>
            • <strong>Confira as previsões antes de compras grandes:</strong> os dias críticos
            indicam quando o saldo fica apertado
          </li>
          <li>
            • <strong>A IA usa apenas os seus dados:</strong> quando não houver informação
            suficiente, ela informa claramente
          </li>
        </ul>
      </div>
    </div>
  );
}
