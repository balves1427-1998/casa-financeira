'use client';

import { useEffect, useState } from 'react';
import { useMLClassifier } from '@/hooks/useMLClassifier';

interface MLPatternsPanelProps {
  onPatternApproved?: () => void;
}

export function MLPatternsPanel({ onPatternApproved }: MLPatternsPanelProps) {
  const {
    patterns,
    feedbackStats,
    isLoading,
    isTraining,
    fetchPatterns,
    fetchFeedbackStats,
    approvePattern,
    rejectPattern,
    deletePattern,
    trainModel,
  } = useMLClassifier();

  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (isExpanded) {
      fetchPatterns();
      fetchFeedbackStats();
    }
  }, [isExpanded]);

  const handleApprovePattern = async (patternId: string) => {
    try {
      await approvePattern(patternId);
      onPatternApproved?.();
    } catch (error) {
      console.error('Error approving pattern:', error);
    }
  };

  const handleRejectPattern = async (patternId: string) => {
    try {
      await rejectPattern(patternId);
    } catch (error) {
      console.error('Error rejecting pattern:', error);
    }
  };

  const handleDeletePattern = async (patternId: string) => {
    try {
      await deletePattern(patternId);
    } catch (error) {
      console.error('Error deleting pattern:', error);
    }
  };

  const handleTrainModel = async () => {
    try {
      await trainModel();
    } catch (error) {
      console.error('Error training model:', error);
    }
  };

  const getPatternTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      keyword: '🔤 Palavra-chave',
      regex: '🔍 Expressão regular',
      establishment: '🏪 Estabelecimento',
      amount_range: '💰 Faixa de valor',
      time_based: '📅 Baseado em data',
      multi_criteria: '🎯 Multi-critério',
    };
    return labels[type] || type;
  };

  const getStatusBadgeColor = (status: string): string => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'rejected':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      default:
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
    }
  };

  return (
    <div className="w-full">
      {!isExpanded ? (
        <button
          onClick={() => setIsExpanded(true)}
          className="w-full text-left p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-purple-900 dark:text-purple-300">
              🧠 Padrões de ML Aprendidos
            </span>
            <span className="text-xs text-purple-700 dark:text-purple-400">
              {patterns.length} padrões
            </span>
          </div>
        </button>
      ) : (
        <div className="w-full p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg space-y-4">
          {/* Feedback Stats */}
          {feedbackStats && (
            <div className="p-3 bg-white dark:bg-gray-900 rounded-lg space-y-2">
              <h4 className="font-semibold text-sm text-purple-900 dark:text-purple-300">
                📊 Estatísticas do Modelo
              </h4>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Total de feedback:</span>
                  <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    {feedbackStats.totalFeedback}
                  </div>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Taxa de acurácia:</span>
                  <div className="text-lg font-bold text-green-600 dark:text-green-400">
                    {(feedbackStats.accuracyRate * 100).toFixed(1)}%
                  </div>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Classificações corretas:</span>
                  <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    {feedbackStats.correctCount}
                  </div>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Classificações incorretas:</span>
                  <div className="text-lg font-bold text-orange-600 dark:text-orange-400">
                    {feedbackStats.incorrectCount}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Train Model Button */}
          <button
            onClick={handleTrainModel}
            disabled={isTraining || isLoading}
            className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {isTraining ? '🔄 Treinando modelo...' : '🚀 Treinar modelo com histórico'}
          </button>

          {/* Patterns List */}
          <div className="space-y-2">
            <h4 className="font-semibold text-sm text-purple-900 dark:text-purple-300">
              Padrões Detectados ({patterns.length})
            </h4>

            {isLoading ? (
              <div className="text-center py-4">
                <div className="inline-block animate-spin">⏳</div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Carregando padrões...</p>
              </div>
            ) : patterns.length === 0 ? (
              <div className="p-3 bg-white dark:bg-gray-900 rounded-lg text-sm text-gray-600 dark:text-gray-400 text-center">
                Nenhum padrão aprendido ainda. Registre feedback para começar o treinamento!
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto space-y-2">
                {patterns.slice(0, 20).map((pattern) => (
                  <div
                    key={pattern.id}
                    className="p-2 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-semibold text-gray-900 dark:text-gray-100">
                        {pattern.pattern}
                      </span>
                      <span className={`px-2 py-1 rounded text-xs ${getStatusBadgeColor(pattern.status)}`}>
                        {pattern.status === 'approved' ? '✓' : pattern.status === 'rejected' ? '✗' : '◯'}{' '}
                        {pattern.status}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-gray-600 dark:text-gray-400">
                      <span>{getPatternTypeLabel(pattern.patternType)}</span>
                      <span>📁 {pattern.categoryName}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span>Confiança: {(pattern.confidence * 100).toFixed(0)}%</span>
                      <span>Matches: {pattern.matchCount}</span>
                    </div>

                    {pattern.lastMatchedAt && (
                      <div className="text-gray-500 dark:text-gray-500">
                        Último uso: {new Date(pattern.lastMatchedAt).toLocaleDateString('pt-BR')}
                      </div>
                    )}

                    {/* Ações */}
                    <div className="flex gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                      {pattern.status !== 'approved' && (
                        <button
                          onClick={() => handleApprovePattern(pattern.id)}
                          className="flex-1 px-2 py-1 bg-green-100 hover:bg-green-200 text-green-800 dark:bg-green-900/30 dark:hover:bg-green-900/50 dark:text-green-400 rounded text-xs font-medium"
                          disabled={isLoading}
                        >
                          ✓ Aprovar
                        </button>
                      )}
                      {pattern.status !== 'rejected' && (
                        <button
                          onClick={() => handleRejectPattern(pattern.id)}
                          className="flex-1 px-2 py-1 bg-red-100 hover:bg-red-200 text-red-800 dark:bg-red-900/30 dark:hover:bg-red-900/50 dark:text-red-400 rounded text-xs font-medium"
                          disabled={isLoading}
                        >
                          ✗ Rejeitar
                        </button>
                      )}
                      <button
                        onClick={() => handleDeletePattern(pattern.id)}
                        className="flex-1 px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-800 dark:bg-gray-900/30 dark:hover:bg-gray-900/50 dark:text-gray-400 rounded text-xs font-medium"
                        disabled={isLoading}
                      >
                        🗑️ Deletar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Fechar painel */}
          <button
            onClick={() => setIsExpanded(false)}
            className="w-full px-3 py-2 text-sm bg-gray-300 hover:bg-gray-400 text-gray-800 font-medium rounded-lg transition-colors"
          >
            Fechar
          </button>
        </div>
      )}
    </div>
  );
}
