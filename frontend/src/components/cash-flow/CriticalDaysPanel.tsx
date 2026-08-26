'use client';

import { AlertCircle, AlertTriangle } from 'lucide-react';
import { formatBRL } from '@/utils/format';

interface CriticalDay {
  date: Date | string;
  reason: string;
  totalPayments: number;
}

interface CriticalDaysPanelProps {
  criticalDays: CriticalDay[];
  title?: string;
}

export function CriticalDaysPanel({
  criticalDays,
  title = 'Dias Críticos',
}: CriticalDaysPanelProps) {
  if (!criticalDays || criticalDays.length === 0) {
    return (
      <div className="rounded-lg border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/20 p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h3 className="font-semibold text-green-900 dark:text-green-100">
              Ótima notícia!
            </h3>
            <p className="text-sm text-green-700 dark:text-green-300 mt-1">
              Não há dias críticos previstos para este mês.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const formatDate = (date: Date | string): string => {
    const dateObj = new Date(date);
    return dateObj.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    });
  };

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
        <AlertCircle className="w-5 h-5 text-red-600" />
        {title}
      </h3>

      <div className="space-y-2">
        {criticalDays.map((day, idx) => (
          <div
            key={`critical-${idx}`}
            className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20 p-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="font-bold text-red-900 dark:text-red-100 text-lg">
                    {formatDate(day.date)}
                  </span>
                  <span className="text-xs text-red-700 dark:text-red-300 capitalize">
                    {new Date(day.date).toLocaleDateString('pt-BR', {
                      weekday: 'long',
                    })}
                  </span>
                </div>
                <p className="text-sm text-red-700 dark:text-red-300 mt-2">
                  {day.reason}
                </p>
              </div>
              <div className="flex-shrink-0 text-right">
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {formatBRL(day.totalPayments)}
                </div>
                <div className="text-xs text-red-600 dark:text-red-400">
                  em pagamentos
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 p-4 text-sm text-amber-800 dark:text-amber-200">
        <p className="font-medium mb-2">💡 Sugestão:</p>
        <p>
          Evite fazer compras grandes nesses dias. Considere antecipar compras
          necessárias para dias mais seguros.
        </p>
      </div>
    </div>
  );
}
