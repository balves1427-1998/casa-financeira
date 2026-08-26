'use client';

import { useEffect, useState } from 'react';
import { useCustomRules } from '@/hooks/useCustomRules';

export function RuleStatsPanel() {
  const { stats, isLoading, fetchStats } = useCustomRules();
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (isExpanded) {
      fetchStats();
    }
  }, [isExpanded, fetchStats]);

  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="w-full text-left p-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors"
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-indigo-900 dark:text-indigo-300">
            📊 Estatísticas de Regras
          </span>
          {stats && (
            <span className="text-xs text-indigo-700 dark:text-indigo-400">
              {stats.totalRules} regras
            </span>
          )}
        </div>
      </button>
    );
  }

  if (isLoading && !stats) {
    return (
      <div className="w-full p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg">
        <div className="text-center py-4">
          <div className="inline-block animate-spin">⏳</div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Carregando estatísticas...
          </p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="w-full p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Nenhuma estatística disponível
        </p>
      </div>
    );
  }

  return (
    <div className="w-full p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="p-3 bg-white dark:bg-gray-900 rounded-lg">
          <div className="text-xs text-gray-600 dark:text-gray-400">Total</div>
          <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
            {stats.totalRules}
          </div>
        </div>
        <div className="p-3 bg-white dark:bg-gray-900 rounded-lg">
          <div className="text-xs text-gray-600 dark:text-gray-400">Ativas</div>
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
            {stats.activeRules}
          </div>
        </div>
        <div className="p-3 bg-white dark:bg-gray-900 rounded-lg">
          <div className="text-xs text-gray-600 dark:text-gray-400">
            Inativas
          </div>
          <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">
            {stats.inactiveRules}
          </div>
        </div>
        <div className="p-3 bg-white dark:bg-gray-900 rounded-lg">
          <div className="text-xs text-gray-600 dark:text-gray-400">Taxa</div>
          <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
            {(stats.successRate * 100).toFixed(0)}%
          </div>
        </div>
      </div>

      {/* By Match Type */}
      <div className="space-y-2">
        <h4 className="font-semibold text-sm text-indigo-900 dark:text-indigo-300">
          Por Tipo de Correspondência
        </h4>
        <div className="grid grid-cols-3 gap-2">
          <div className="p-2 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700 text-center">
            <div className="text-xs text-gray-600 dark:text-gray-400">🔤 Palavra-chave</div>
            <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {stats.byMatchType.keyword}
            </div>
          </div>
          <div className="p-2 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700 text-center">
            <div className="text-xs text-gray-600 dark:text-gray-400">🔍 Regex</div>
            <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {stats.byMatchType.regex}
            </div>
          </div>
          <div className="p-2 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700 text-center">
            <div className="text-xs text-gray-600 dark:text-gray-400">✓ Exata</div>
            <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {stats.byMatchType.exact}
            </div>
          </div>
        </div>
      </div>

      {/* By Category */}
      {stats.byCategory.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-semibold text-sm text-indigo-900 dark:text-indigo-300">
            Por Categoria
          </h4>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {stats.byCategory.map(cat => (
              <div
                key={cat.categoryId}
                className="p-2 bg-white dark:bg-gray-900 rounded text-sm flex items-center justify-between"
              >
                <span className="text-gray-900 dark:text-gray-100">
                  {cat.categoryName}
                </span>
                <span className="inline-block bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-400 px-2 py-1 rounded text-xs font-medium">
                  {cat.ruleCount}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Most Used */}
      {stats.mostUsed.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-semibold text-sm text-indigo-900 dark:text-indigo-300">
            ⭐ Mais Utilizadas
          </h4>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {stats.mostUsed.map(rule => (
              <div
                key={rule.ruleId}
                className="p-2 bg-white dark:bg-gray-900 rounded text-sm"
              >
                <div className="flex items-center justify-between mb-1">
                  <code className="font-mono text-gray-900 dark:text-gray-100">
                    {rule.pattern}
                  </code>
                  <span className="text-xs text-gray-600 dark:text-gray-400">
                    {rule.usageCount}x
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
                  <span>
                    {rule.matchType === 'keyword'
                      ? '🔤'
                      : rule.matchType === 'regex'
                        ? '🔍'
                        : '✓'}{' '}
                    {rule.matchType}
                  </span>
                  {rule.lastUsedAt && (
                    <span>
                      Último: {new Date(rule.lastUsedAt).toLocaleDateString('pt-BR')}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Close Button */}
      <button
        onClick={() => setIsExpanded(false)}
        className="w-full px-3 py-2 text-sm bg-gray-300 hover:bg-gray-400 text-gray-800 font-medium rounded-lg transition-colors"
      >
        Fechar
      </button>
    </div>
  );
}
