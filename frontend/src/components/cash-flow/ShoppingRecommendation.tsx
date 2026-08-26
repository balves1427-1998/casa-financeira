'use client';

import { useState } from 'react';
import { AlertCircle, CheckCircle, ShoppingCart } from 'lucide-react';
import { BestDayToShopDto } from '@/types/cash-flow';
import { formatBRL } from '@/utils/format';

interface ShoppingRecommendationProps {
  recommendation: BestDayToShopDto | null;
  isLoading?: boolean;
}

export function ShoppingRecommendation({
  recommendation,
  isLoading = false,
}: ShoppingRecommendationProps) {
  const [desiredAmount, setDesiredAmount] = useState<string>('1000');

  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-center h-24">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      </div>
    );
  }

  if (!recommendation) {
    return null;
  }

  const formatDate = (date: Date | string): string => {
    const dateObj = new Date(date);
    return dateObj.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    });
  };

  const isRisky = recommendation.isRiskyForDesiredAmount;
  const recommendationEmoji = isRisky ? '⚠️' : '🟢';
  const borderColor = isRisky
    ? 'border-amber-200 dark:border-amber-900'
    : 'border-green-200 dark:border-green-900';
  const bgColor = isRisky
    ? 'bg-amber-50 dark:bg-amber-950/20'
    : 'bg-green-50 dark:bg-green-950/20';
  const textColor = isRisky
    ? 'text-amber-900 dark:text-amber-100'
    : 'text-green-900 dark:text-green-100';

  return (
    <div className="space-y-4">
      {/* Main Recommendation Card */}
      <div
        className={`rounded-lg border ${borderColor} ${bgColor} p-6 transition-colors`}
      >
        <div className="flex items-start gap-4">
          <div className="text-4xl">{recommendationEmoji}</div>
          <div className="flex-1">
            <h3 className={`text-lg font-semibold ${textColor} mb-2`}>
              {recommendation.reason}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              {/* Date Range */}
              <div>
                <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">
                  Período Recomendado
                </div>
                <div className="text-sm font-medium text-gray-900 dark:text-white mt-1">
                  {formatDate(recommendation.recommendedStartDate)} até{' '}
                  {formatDate(recommendation.recommendedEndDate)}
                </div>
              </div>

              {/* Projected Balance */}
              <div>
                <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">
                  Saldo Projetado
                </div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                  {formatBRL(recommendation.projectedBalance)}
                </div>
              </div>

              {/* Safe Spending Limit */}
              <div>
                <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">
                  Limite Seguro
                </div>
                <div className="text-lg font-semibold text-blue-600 dark:text-blue-400 mt-1">
                  {formatBRL(recommendation.safeSpendingLimit)}
                </div>
              </div>

              {/* Risk Status */}
              <div>
                <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">
                  Status
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {isRisky ? (
                    <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  ) : (
                    <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                  )}
                  <span className={`font-medium ${textColor}`}>
                    {isRisky ? 'Risco Identificado' : 'Seguro'}
                  </span>
                </div>
              </div>
            </div>

            {recommendation.riskReason && (
              <div className="mt-4 p-3 rounded bg-white/50 dark:bg-black/20 border border-amber-200 dark:border-amber-800">
                <p className="text-sm text-amber-900 dark:text-amber-100">
                  ⚠️ {recommendation.riskReason}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Days to Avoid */}
      {recommendation.daysToAvoid && recommendation.daysToAvoid.length > 0 && (
        <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/10 p-4">
          <h4 className="font-semibold text-red-900 dark:text-red-100 flex items-center gap-2 mb-3">
            <AlertCircle className="w-4 h-4" />
            Dias a Evitar
          </h4>
          <div className="space-y-2">
            {recommendation.daysToAvoid.slice(0, 3).map((day, idx) => (
              <div
                key={idx}
                className="flex justify-between text-sm text-red-800 dark:text-red-200"
              >
                <span>
                  <strong>{formatDate(day.date)}</strong> - {day.reason}
                </span>
                <span className="font-medium">
                  {formatBRL(day.paymentAmount || 0)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Shopping Simulator */}
      <div className="rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/10 p-4">
        <h4 className="font-semibold text-blue-900 dark:text-blue-100 flex items-center gap-2 mb-3">
          <ShoppingCart className="w-4 h-4" />
          Simular Compra
        </h4>
        <div className="space-y-2">
          <input
            type="number"
            value={desiredAmount}
            onChange={e => setDesiredAmount(e.target.value)}
            className="w-full px-3 py-2 rounded border border-blue-200 dark:border-blue-800 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
            placeholder="Valor desejado"
            min="0"
            step="100"
          />
          <div className="text-sm text-blue-800 dark:text-blue-200">
            <p className="font-medium">
              Saldo após compra de{' '}
              <strong>{formatBRL(parseInt(desiredAmount) || 0)}</strong>:
            </p>
            <p className="text-lg font-bold mt-1">
              {formatBRL(
                Math.max(
                  0,
                  recommendation.projectedBalance - (parseInt(desiredAmount) || 0),
                ),
              )}
            </p>
            {Math.max(
              0,
              recommendation.projectedBalance - (parseInt(desiredAmount) || 0),
            ) < 2000 && (
              <p className="text-amber-700 dark:text-amber-300 text-xs mt-1">
                ⚠️ Você ficaria abaixo do saldo mínimo recomendado (R$ 2.000)
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
