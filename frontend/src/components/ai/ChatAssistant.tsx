'use client';

import { useEffect, useRef, useState } from 'react';
import { AiChatMessage } from '@/hooks/useAI';
import { ChatPeriod, ChatUser, SendChatMessageDto } from '@/types/ai';
import { formatDateTime, formatPercent } from '@/utils/format';
import { Bot, Loader2, Send, Sparkles, Trash2, User } from 'lucide-react';

interface ChatAssistantProps {
  messages: AiChatMessage[];
  suggestions: string[];
  isLoading?: boolean;
  isSending?: boolean;
  onSend: (dto: SendChatMessageDto) => Promise<unknown>;
  onClearHistory?: () => Promise<unknown>;
}

const PERIOD_OPTIONS: Array<{ value: ChatPeriod; label: string }> = [
  { value: ChatPeriod.THIS_MONTH, label: 'Este mês' },
  { value: ChatPeriod.LAST_MONTH, label: 'Mês passado' },
  { value: ChatPeriod.LAST_3_MONTHS, label: 'Últimos 3 meses' },
  { value: ChatPeriod.LAST_6_MONTHS, label: 'Últimos 6 meses' },
  { value: ChatPeriod.LAST_12_MONTHS, label: 'Últimos 12 meses' },
  { value: ChatPeriod.THIS_YEAR, label: 'Este ano' },
];

const USER_OPTIONS: Array<{ value: ChatUser; label: string }> = [
  { value: ChatUser.BOTH, label: 'Bruno e Giovanna' },
  { value: ChatUser.BRUNO, label: 'Bruno' },
  { value: ChatUser.GIOVANNA, label: 'Giovanna' },
];

export function ChatAssistant({
  messages,
  suggestions,
  isLoading = false,
  isSending = false,
  onSend,
  onClearHistory,
}: ChatAssistantProps) {
  const [question, setQuestion] = useState('');
  const [period, setPeriod] = useState<ChatPeriod>(ChatPeriod.THIS_MONTH);
  const [focusUser, setFocusUser] = useState<ChatUser>(ChatUser.BOTH);
  const [isClearing, setIsClearing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isSending]);

  const handleSend = async (text?: string) => {
    const content = (text ?? question).trim();
    if (!content || isSending) return;

    setQuestion('');
    try {
      await onSend({
        question: content,
        context: { period, focusUser },
      });
    } catch (err) {
      console.error('Erro ao enviar pergunta ao assistente:', err);
    }
  };

  const handleClearHistory = async () => {
    if (!onClearHistory) return;
    setIsClearing(true);
    try {
      await onClearHistory();
    } catch (err) {
      console.error('Erro ao limpar histórico:', err);
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex flex-col h-[640px]">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
            <Bot className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Assistente Financeiro
            </h3>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Respostas baseadas apenas nos seus dados registrados
            </p>
          </div>
        </div>

        {onClearHistory && messages.length > 0 && (
          <button
            onClick={handleClearHistory}
            disabled={isClearing}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Limpar
          </button>
        )}
      </div>

      {/* Filtros de contexto */}
      <div className="flex flex-col sm:flex-row gap-3 p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Período
          </label>
          <select
            value={period}
            onChange={event => setPeriod(event.target.value as ChatPeriod)}
            className="w-full px-3 py-2 text-sm rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            {PERIOD_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Responsável
          </label>
          <select
            value={focusUser}
            onChange={event => setFocusUser(event.target.value as ChatUser)}
            className="w-full px-3 py-2 text-sm rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            {USER_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoading && messages.length === 0 && (
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map(index => (
              <div key={index} className="h-16 bg-gray-200 dark:bg-gray-700 rounded" />
            ))}
          </div>
        )}

        {!isLoading && messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center py-8">
            <Sparkles className="w-12 h-12 text-blue-500 mb-3" />
            <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
              Pergunte sobre as suas finanças
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md">
              O assistente responde utilizando exclusivamente os lançamentos, contas e
              previsões registrados no sistema.
            </p>
          </div>
        )}

        {messages.map(message => (
          <div
            key={message.id}
            className={`flex gap-3 ${
              message.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            {message.role === 'assistant' && (
              <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
            )}

            <div
              className={`max-w-[80%] rounded-lg p-3 ${
                message.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>

              <p
                className={`text-[11px] mt-2 ${
                  message.role === 'user'
                    ? 'text-blue-100'
                    : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                {formatDateTime(message.createdAt)}
              </p>

              {/* Fontes e confiança */}
              {message.role === 'assistant' &&
                ((message.sources && message.sources.length > 0) ||
                  message.confidence !== undefined) && (
                  <div className="mt-3 pt-2 border-t border-gray-200 dark:border-gray-700 flex flex-wrap items-center gap-2">
                    {message.sources?.map(source => (
                      <span
                        key={source}
                        className="px-2 py-0.5 rounded text-[11px] font-medium bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700"
                      >
                        {source}
                      </span>
                    ))}
                    {message.confidence !== undefined && (
                      <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">
                        Confiança: {formatPercent(message.confidence * 100, 0)}
                      </span>
                    )}
                  </div>
                )}

              {/* Perguntas de follow-up */}
              {message.role === 'assistant' &&
                message.followUpQuestions &&
                message.followUpQuestions.length > 0 && (
                  <div className="mt-3 space-y-1">
                    <p className="text-[11px] font-medium text-gray-600 dark:text-gray-400">
                      Continue perguntando:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {message.followUpQuestions.map(followUp => (
                        <button
                          key={followUp}
                          onClick={() => handleSend(followUp)}
                          disabled={isSending}
                          className="px-2 py-1 rounded text-[11px] font-medium bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900 hover:bg-blue-100 dark:hover:bg-blue-900/40 disabled:opacity-50 transition-colors"
                        >
                          {followUp}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
            </div>

            {message.role === 'user' && (
              <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4 text-gray-600 dark:text-gray-300" />
              </div>
            )}
          </div>
        ))}

        {isSending && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="rounded-lg p-3 bg-gray-100 dark:bg-gray-800 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400" />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Analisando os seus dados...
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Sugestões */}
      {suggestions.length > 0 && messages.length === 0 && (
        <div className="px-4 pb-2">
          <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
            Sugestões de perguntas
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestions.slice(0, 6).map(suggestion => (
              <button
                key={suggestion}
                onClick={() => handleSend(suggestion)}
                disabled={isSending}
                className="px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Campo de envio */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex gap-2">
          <input
            type="text"
            value={question}
            onChange={event => setQuestion(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ex.: Quanto gastei com alimentação este mês?"
            disabled={isSending}
            className="flex-1 px-3 py-2 text-sm rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 disabled:opacity-50"
          />
          <button
            onClick={() => handleSend()}
            disabled={isSending || question.trim() === ''}
            className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium flex items-center gap-2 transition-colors"
          >
            {isSending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}
