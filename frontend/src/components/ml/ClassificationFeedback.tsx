'use client';

import { useState } from 'react';
import { useMLClassifier } from '@/hooks/useMLClassifier';

interface ClassificationFeedbackProps {
  transactionId?: string;
  description: string;
  suggestedCategoryId?: string;
  suggestedCategoryName?: string;
  actualCategoryId: string;
  actualCategoryName: string;
  onFeedbackRecorded?: () => void;
  isLoading?: boolean;
}

export function ClassificationFeedback({
  transactionId,
  description,
  suggestedCategoryId,
  suggestedCategoryName,
  actualCategoryId,
  actualCategoryName,
  onFeedbackRecorded,
  isLoading = false,
}: ClassificationFeedbackProps) {
  const { recordFeedback, isLoading: isFeedbackLoading } = useMLClassifier();
  const [isExpanded, setIsExpanded] = useState(false);
  const [feedbackNotes, setFeedbackNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  const isCorrect = suggestedCategoryId === actualCategoryId;

  const handleRecordFeedback = async () => {
    try {
      setIsSubmitting(true);
      await recordFeedback(
        description,
        actualCategoryId,
        suggestedCategoryId,
        isCorrect ? 'correct' : 'incorrect',
        feedbackNotes,
        transactionId,
      );
      setFeedbackSubmitted(true);
      setFeedbackNotes('');
      onFeedbackRecorded?.();

      // Fechar após 2 segundos
      setTimeout(() => {
        setIsExpanded(false);
        setFeedbackSubmitted(false);
      }, 2000);
    } catch (error) {
      console.error('Error recording feedback:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full">
      {!isExpanded ? (
        <button
          onClick={() => setIsExpanded(true)}
          className="w-full text-left p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
          disabled={isLoading}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-blue-900 dark:text-blue-300">
              {isCorrect ? '✅ Classificação correta' : '❓ Verificar classificação'}
            </span>
            <span className="text-xs text-blue-700 dark:text-blue-400">
              Sugerido: {suggestedCategoryName} → Atual: {actualCategoryName}
            </span>
          </div>
        </button>
      ) : (
        <div className="w-full p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg space-y-4">
          {/* Mostrar previsão do modelo */}
          <div>
            <h4 className="font-semibold text-sm text-blue-900 dark:text-blue-300 mb-2">
              Análise da Classificação
            </h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-gray-700 dark:text-gray-400">Descrição:</span>
                <span className="font-mono text-gray-900 dark:text-gray-100">{description}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-700 dark:text-gray-400">Sugerido pelo modelo:</span>
                <span className="inline-block bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 px-2 py-1 rounded text-xs">
                  {suggestedCategoryName}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-700 dark:text-gray-400">Categoria atual:</span>
                <span className="inline-block bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 px-2 py-1 rounded text-xs">
                  {actualCategoryName}
                </span>
              </div>
              {isCorrect && (
                <div className="p-2 bg-green-100 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded text-xs text-green-800 dark:text-green-400">
                  ✓ O modelo acertou a categorização!
                </div>
              )}
              {!isCorrect && (
                <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded text-xs text-yellow-800 dark:text-yellow-400">
                  ℹ️ Você corrigiu a categorização. Isso ajuda o modelo a aprender!
                </div>
              )}
            </div>
          </div>

          {/* Notas opcionais */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-400 mb-2">
              Por que essa categorização? (Opcional)
            </label>
            <textarea
              value={feedbackNotes}
              onChange={(e) => setFeedbackNotes(e.target.value)}
              placeholder="Ex: Essa é uma despesa com supermercado, não uma compra geral..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm placeholder-gray-500 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={2}
              disabled={isSubmitting}
            />
          </div>

          {/* Botões de ação */}
          {!feedbackSubmitted ? (
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setIsExpanded(false)}
                disabled={isSubmitting}
                className="px-3 py-2 text-sm bg-gray-300 hover:bg-gray-400 text-gray-800 font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleRecordFeedback}
                disabled={isSubmitting || isFeedbackLoading}
                className="px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'Enviando...' : 'Registrar Feedback'}
              </button>
            </div>
          ) : (
            <div className="p-3 bg-green-100 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg text-sm text-green-800 dark:text-green-400">
              ✓ Feedback registrado com sucesso! O modelo vai aprender com isso.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
