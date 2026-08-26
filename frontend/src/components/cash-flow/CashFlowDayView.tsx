'use client';

import { useMemo } from 'react';
import { CashFlowDayDto } from '@/types/cash-flow';
import { formatBRL } from '@/utils/format';
import { AlertCircle, TrendingUp, TrendingDown } from 'lucide-react';

interface CashFlowDayViewProps {
  days: CashFlowDayDto[];
  minBalance?: number;
}

export function CashFlowDayView({
  days,
  minBalance = 2000,
}: CashFlowDayViewProps) {
  const sortedDays = useMemo(() => {
    return [...days].sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateA - dateB;
    });
  }, [days]);

  const getCriticalityClass = (day: CashFlowDayDto): string => {
    if (day.isCriticalDay) {
      return 'border-l-4 border-red-500 bg-red-50 dark:bg-red-950/20';
    }
    if (day.projectedBalance < minBalance) {
      return 'border-l-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20';
    }
    return 'border-l-4 border-green-500 bg-green-50 dark:bg-green-950/20';
  };

  return (
    <div className="space-y-3">
      <div className="hidden md:grid md:grid-cols-7 gap-2">
        {/* Header for desktop view */}
        <div className="text-xs font-semibold text-gray-600 dark:text-gray-400">
          Data
        </div>
        <div className="text-xs font-semibold text-gray-600 dark:text-gray-400">
          Saldo Inicial
        </div>
        <div className="text-xs font-semibold text-gray-600 dark:text-gray-400">
          Entradas
        </div>
        <div className="text-xs font-semibold text-gray-600 dark:text-gray-400">
          Saídas
        </div>
        <div className="text-xs font-semibold text-gray-600 dark:text-gray-400">
          Contas
        </div>
        <div className="text-xs font-semibold text-gray-600 dark:text-gray-400">
          Saldo Final
        </div>
        <div className="text-xs font-semibold text-gray-600 dark:text-gray-400">
          Status
        </div>
      </div>

      {sortedDays.map((day, idx) => {
        const dateObj = new Date(day.date);
        const dateStr = dateObj.toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
        });
        const dayName = dateObj.toLocaleDateString('pt-BR', {
          weekday: 'short',
        });

        return (
          <div
            key={`${day.date}-${idx}`}
            className={`rounded-lg p-4 ${getCriticalityClass(day)} transition-colors`}
          >
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              {/* Date */}
              <div className="md:flex-none w-20">
                <div className="text-sm font-bold text-gray-900 dark:text-white">
                  {dateStr}
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400 capitalize">
                  {dayName}
                </div>
              </div>

              {/* Desktop Grid View */}
              <div className="hidden md:contents">
                {/* Opening Balance */}
                <div className="text-sm">
                  <span className="text-gray-600 dark:text-gray-400">
                    {formatBRL(day.openingBalance)}
                  </span>
                </div>

                {/* Daily Income */}
                <div className="text-sm">
                  {day.dailyIncome > 0 ? (
                    <span className="text-green-600 dark:text-green-400 font-medium">
                      +{formatBRL(day.dailyIncome)}
                    </span>
                  ) : (
                    <span className="text-gray-500">-</span>
                  )}
                </div>

                {/* Daily Expenses */}
                <div className="text-sm">
                  {day.dailyExpenses > 0 ? (
                    <span className="text-red-600 dark:text-red-400 font-medium">
                      -{formatBRL(day.dailyExpenses)}
                    </span>
                  ) : (
                    <span className="text-gray-500">-</span>
                  )}
                </div>

                {/* Planned Accounts */}
                <div className="text-sm">
                  {day.plannedAccountsAmount > 0 ? (
                    <span className="text-orange-600 dark:text-orange-400 font-medium">
                      -{formatBRL(day.plannedAccountsAmount)}
                    </span>
                  ) : (
                    <span className="text-gray-500">-</span>
                  )}
                </div>

                {/* Closing Balance */}
                <div className="text-sm font-bold">
                  <span className="text-gray-900 dark:text-white">
                    {formatBRL(day.closingBalance)}
                  </span>
                </div>

                {/* Status Icon */}
                <div className="text-sm">
                  {day.isCriticalDay ? (
                    <div className="flex items-center gap-1">
                      <AlertCircle className="w-4 h-4 text-red-600" />
                      <span className="text-xs text-red-600 dark:text-red-400">
                        Crítico
                      </span>
                    </div>
                  ) : day.projectedBalance < minBalance ? (
                    <div className="flex items-center gap-1">
                      <TrendingDown className="w-4 h-4 text-yellow-600" />
                      <span className="text-xs text-yellow-600 dark:text-yellow-400">
                        Baixo
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <TrendingUp className="w-4 h-4 text-green-600" />
                      <span className="text-xs text-green-600 dark:text-green-400">
                        OK
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden flex-1 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">
                    Saldo Inicial:
                  </span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatBRL(day.openingBalance)}
                  </span>
                </div>

                {day.dailyIncome > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">
                      Entradas:
                    </span>
                    <span className="font-medium text-green-600 dark:text-green-400">
                      +{formatBRL(day.dailyIncome)}
                    </span>
                  </div>
                )}

                {day.dailyExpenses > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">
                      Saídas:
                    </span>
                    <span className="font-medium text-red-600 dark:text-red-400">
                      -{formatBRL(day.dailyExpenses)}
                    </span>
                  </div>
                )}

                {day.plannedAccountsAmount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">
                      Contas:
                    </span>
                    <span className="font-medium text-orange-600 dark:text-orange-400">
                      -{formatBRL(day.plannedAccountsAmount)}
                    </span>
                  </div>
                )}

                <div className="border-t border-gray-200 dark:border-gray-700 pt-2 flex justify-between">
                  <span className="font-semibold text-gray-900 dark:text-white">
                    Saldo Final:
                  </span>
                  <span className="font-bold text-gray-900 dark:text-white">
                    {formatBRL(day.closingBalance)}
                  </span>
                </div>

                {day.criticalDayReason && (
                  <div className="flex items-start gap-2 text-xs text-red-600 dark:text-red-400 bg-red-100/50 dark:bg-red-900/20 p-2 rounded">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>{day.criticalDayReason}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Transaction count badge */}
            {day.transactionCount > 0 && (
              <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                {day.transactionCount} transação{day.transactionCount !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
