'use client';

import { useState, useEffect } from 'react';
import { useCashFlow } from '@/hooks/useCashFlow';
import { CashFlowDayView } from '@/components/cash-flow/CashFlowDayView';
import { CriticalDaysPanel } from '@/components/cash-flow/CriticalDaysPanel';
import { ShoppingRecommendation } from '@/components/cash-flow/ShoppingRecommendation';
import { formatBRL } from '@/utils/format';
import {
  Calendar,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { GetBestDayToShopDto } from '@/types/cash-flow';

export default function CashFlowPage() {
  const {
    monthData,
    bestDayRecommendation,
    isLoading,
    error,
    fetchMonthCashFlow,
    getBestDayToShop,
  } = useCashFlow();

  const [currentMonth, setCurrentMonth] = useState<number>(
    new Date().getMonth() + 1,
  );
  const [currentYear, setCurrentYear] = useState<number>(new Date().getFullYear());
  const [desiredAmount, setDesiredAmount] = useState<number>(1000);
  const [isLoadingRecommendation, setIsLoadingRecommendation] =
    useState<boolean>(false);

  // Fetch data when month/year changes
  useEffect(() => {
    fetchMonthCashFlow(currentMonth, currentYear);
  }, [currentMonth, currentYear, fetchMonthCashFlow]);

  const handlePreviousMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const handleGetRecommendation = async () => {
    setIsLoadingRecommendation(true);
    try {
      const dto: GetBestDayToShopDto = {
        desiredAmount,
        startDate: new Date(currentYear, currentMonth - 1, 1),
        endDate: new Date(currentYear, currentMonth, 0),
        minimumBalanceThreshold: 2000,
      };
      await getBestDayToShop(dto);
    } catch (err) {
      console.error('Error getting recommendation:', err);
    } finally {
      setIsLoadingRecommendation(false);
    }
  };

  const monthName = new Date(currentYear, currentMonth - 1).toLocaleDateString(
    'pt-BR',
    { month: 'long', year: 'numeric' },
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Fluxo de Caixa
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Acompanhe seu saldo diário e planeje suas compras
          </p>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20 p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-red-900 dark:text-red-100">
              Erro ao carregar dados
            </h3>
            <p className="text-sm text-red-800 dark:text-red-200 mt-1">
              {error}
            </p>
          </div>
        </div>
      )}

      {/* Month Navigation */}
      <div className="flex items-center justify-between bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <button
          onClick={handlePreviousMonth}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          aria-label="Mês anterior"
        >
          <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </button>

        <div className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
          <Calendar className="w-5 h-5 text-blue-600" />
          <span className="capitalize">{monthName}</span>
        </div>

        <button
          onClick={handleNextMonth}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          aria-label="Próximo mês"
        >
          <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </button>
      </div>

      {/* Summary Cards */}
      {monthData && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Opening Balance */}
          <div className="rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-4">
            <div className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Saldo Inicial
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white mt-2">
              {formatBRL(monthData.openingBalance)}
            </div>
          </div>

          {/* Total Income */}
          <div className="rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 p-4">
            <div className="text-sm font-medium text-green-700 dark:text-green-400 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Entradas
            </div>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400 mt-2">
              {formatBRL(monthData.totalIncome)}
            </div>
          </div>

          {/* Total Expenses */}
          <div className="rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 p-4">
            <div className="text-sm font-medium text-red-700 dark:text-red-400 flex items-center gap-2">
              <TrendingDown className="w-4 h-4" />
              Saídas
            </div>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400 mt-2">
              -{formatBRL(monthData.totalExpenses)}
            </div>
          </div>

          {/* Closing Balance */}
          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 p-4">
            <div className="text-sm font-medium text-blue-700 dark:text-blue-400">
              Saldo Final
            </div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-2">
              {formatBRL(monthData.closingBalance)}
            </div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && !monthData && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-12 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">
              Carregando dados do fluxo de caixa...
            </p>
          </div>
        </div>
      )}

      {/* Main Content */}
      {monthData && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Daily View - Takes 2 cols on large screens */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Saldo Diário
            </h2>
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <CashFlowDayView days={monthData.days} minBalance={2000} />
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Average Daily Expenses */}
            <div className="rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-4">
              <div className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Média Diária
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white mt-2">
                {formatBRL(monthData.avgDailyExpenses)}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                {monthData.days.length} dias no mês
              </p>
            </div>

            {/* Days with Low Balance */}
            {monthData.daysWithLowBalance !== undefined && (
              <div className="rounded-lg bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900 p-4">
                <div className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
                  Dias com Baixo Saldo
                </div>
                <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400 mt-2">
                  {monthData.daysWithLowBalance}
                </div>
                <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-2">
                  abaixo de R$ 2.000
                </p>
              </div>
            )}

            {/* Critical Days Count */}
            <div className="rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 p-4">
              <div className="text-sm font-medium text-red-700 dark:text-red-400">
                Dias Críticos
              </div>
              <div className="text-2xl font-bold text-red-600 dark:text-red-400 mt-2">
                {monthData.criticalDays.length}
              </div>
              <p className="text-xs text-red-700 dark:text-red-400 mt-2">
                com alto volume de pagamentos
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Critical Days Panel */}
      {monthData && monthData.criticalDays.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <CriticalDaysPanel criticalDays={monthData.criticalDays} />
        </div>
      )}

      {/* Shopping Recommendation Section */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Recomendação de Compras
        </h2>

        <div className="space-y-4">
          {/* Input */}
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Quanto você gostaria de gastar?
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 dark:text-gray-400">
                  R$
                </span>
                <input
                  type="number"
                  value={desiredAmount}
                  onChange={e =>
                    setDesiredAmount(Math.max(0, parseInt(e.target.value) || 0))
                  }
                  className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  min="0"
                  step="100"
                />
              </div>
            </div>
            <div className="flex items-end">
              <button
                onClick={handleGetRecommendation}
                disabled={isLoadingRecommendation}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
              >
                {isLoadingRecommendation ? 'Analisando...' : 'Analisar'}
              </button>
            </div>
          </div>

          {/* Recommendation */}
          <ShoppingRecommendation
            recommendation={bestDayRecommendation}
            isLoading={isLoadingRecommendation}
          />
        </div>
      </div>

      {/* Tips Section */}
      <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 p-4">
        <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-3">
          💡 Dicas para Melhorar seu Fluxo de Caixa
        </h3>
        <ul className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
          <li>
            • Evite fazer compras grandes nos dias críticos (com muitos
            pagamentos)
          </li>
          <li>
            • Mantenha sempre um saldo mínimo de segurança (recomendado: R$
            2.000)
          </li>
          <li>
            • Acompanhe seus gastos diários para identificar padrões de
            consumo
          </li>
          <li>
            • Organize seus pagamentos para evitar concentração em um único dia
          </li>
        </ul>
      </div>
    </div>
  );
}
