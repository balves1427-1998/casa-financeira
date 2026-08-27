'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useAccounts } from '@/hooks/useAccounts';
import { useExpenses } from '@/hooks/useExpenses';
import { useIncome } from '@/hooks/useIncome';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import Link from 'next/link';

interface KPIData {
  currentBalance: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  projectedBalance: number;
  recurringExpenses: number;
  upcomingPayments: number;
  expensesLastMonth: number;
  incomeLastMonth: number;
  highestExpenseCategory: { category: string; amount: number };
  dailyAverage: number;
  /** Contas efetivamente pagas no mês (quantidade e soma). */
  paidThisMonth: { count: number; total: number };
  /** Lançamentos do mês que ainda não foram marcados como pagos. */
  pendingThisMonth: { count: number; total: number };
}

export default function DashboardPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { accounts, totalBalance, isLoading: accountsLoading } = useAccounts();
  const {
    expenses,
    getDailyAverage,
    getMonthlyTotal: getExpenseMonthlyTotal,
    getCategoryBreakdown,
    getPaidSummary,
  } = useExpenses();
  const { incomes, getMonthlyTotal: getIncomeMonthlyTotal } = useIncome();
  const [kpiData, setKpiData] = useState<KPIData>({
    currentBalance: 0,
    monthlyIncome: 0,
    monthlyExpenses: 0,
    projectedBalance: 0,
    recurringExpenses: 0,
    upcomingPayments: 0,
    expensesLastMonth: 0,
    incomeLastMonth: 0,
    highestExpenseCategory: { category: '', amount: 0 },
    dailyAverage: 0,
    paidThisMonth: { count: 0, total: 0 },
    pendingThisMonth: { count: 0, total: 0 },
  });
  const [isLoadingKPI, setIsLoadingKPI] = useState(true);

  // Calculate KPIs
  useEffect(() => {
    const calculateKPIs = async () => {
      try {
        setIsLoadingKPI(true);
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();
        const lastMonth = currentMonth === 1 ? 12 : currentMonth - 1;
        const lastMonthYear = currentMonth === 1 ? currentYear - 1 : currentYear;

        // Get monthly totals
        const monthlyExpenses = await getExpenseMonthlyTotal(currentMonth, currentYear);
        const monthlyIncome = await getIncomeMonthlyTotal(currentMonth, currentYear);
        const lastMonthExpenses = await getExpenseMonthlyTotal(lastMonth, lastMonthYear);
        const lastMonthIncome = await getIncomeMonthlyTotal(lastMonth, lastMonthYear);

        // Get category breakdown
        const breakdown = await getCategoryBreakdown();
        const highestCategory = breakdown.length > 0 ? breakdown[0] : null;

        // Get daily average
        const dailyAvg = await getDailyAverage(30);

        // Calculate recurring expenses
        const recurringExpenses = expenses
          .filter((e) => e.isRecurring)
          .reduce((sum, e) => sum + e.amount, 0);

        // Calculate upcoming payments (next 7 days)
        const today = new Date();
        const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
        const upcomingExpenses = expenses.filter((e) => {
          const expenseDate = new Date(e.date);
          return expenseDate >= today && expenseDate <= nextWeek;
        });
        const upcomingPayments = upcomingExpenses.reduce((sum, e) => sum + e.amount, 0);

        // Contas pagas no mês. A contagem vem do backend, que enxerga TODOS os
        // lançamentos da família — a lista carregada aqui pode estar filtrada
        // ou paginada, e contar sobre ela daria um número menor que o real.
        const paidThisMonth = await getPaidSummary(currentMonth, currentYear);

        // O pendente é a diferença: o que o mês registrou menos o que já saiu.
        const lancamentosDoMes = expenses.filter((e) => {
          const data = new Date(e.date);
          return (
            data.getMonth() + 1 === currentMonth &&
            data.getFullYear() === currentYear
          );
        });
        const pendentes = lancamentosDoMes.filter((e) => !e.isPaid);

        setKpiData({
          currentBalance: totalBalance,
          monthlyIncome,
          monthlyExpenses,
          projectedBalance: totalBalance + monthlyIncome - monthlyExpenses,
          recurringExpenses,
          upcomingPayments,
          expensesLastMonth: lastMonthExpenses,
          incomeLastMonth: lastMonthIncome,
          highestExpenseCategory: {
            category: highestCategory?.category || 'N/A',
            amount: parseFloat(highestCategory?.total ?? '0') || 0,
          },
          dailyAverage: dailyAvg,
          paidThisMonth,
          pendingThisMonth: {
            count: pendentes.length,
            total: pendentes.reduce((soma, e) => soma + e.amount, 0),
          },
        });
      } catch (error) {
        console.error('Error calculating KPIs:', error);
      } finally {
        setIsLoadingKPI(false);
      }
    };

    // Precisa rodar mesmo sem contas cadastradas: é `calculateKPIs` que desliga
    // o estado de carregamento, então exigir `accounts.length > 0` prendia todo
    // usuário recém-cadastrado num spinner infinito.
    if (!authLoading && !accountsLoading) {
      calculateKPIs();
    }
  }, [authLoading, accountsLoading, accounts, expenses, incomes]);

  const isLoading = authLoading || accountsLoading || isLoadingKPI;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Carregando dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Bem-vindo, {user?.name}! 👋
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Aqui está um resumo das suas finanças
        </p>
      </div>

      {/* Main KPIs Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Current Balance */}
        <Card>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 font-medium mb-1">
                Saldo Atual
              </p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">
                R$ {kpiData.currentBalance.toLocaleString('pt-BR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>
            <div className="text-3xl">💰</div>
          </div>
        </Card>

        {/* Receitas do mês */}
        <Card>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 font-medium mb-1">
                Receitas (Mês)
              </p>
              <p className="text-3xl font-bold text-green-600">
                R$ {kpiData.monthlyIncome.toLocaleString('pt-BR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>
            <div className="text-3xl">📈</div>
          </div>
        </Card>

        {/* Monthly Expenses */}
        <Card>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 font-medium mb-1">
                Despesas (Mês)
              </p>
              <p className="text-3xl font-bold text-red-600">
                R$ {kpiData.monthlyExpenses.toLocaleString('pt-BR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>
            <div className="text-3xl">📉</div>
          </div>
        </Card>

        {/* Projected Balance */}
        <Card>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 font-medium mb-1">
                Saldo Projetado
              </p>
              <p
                className={`text-3xl font-bold ${
                  kpiData.projectedBalance >= 0
                    ? 'text-green-600'
                    : 'text-red-600'
                }`}
              >
                R$ {kpiData.projectedBalance.toLocaleString('pt-BR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>
            <div className="text-3xl">🎯</div>
          </div>
        </Card>
      </div>

      {/* Situação das contas do mês */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Contas pagas no mês */}
        <Card>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 font-medium mb-1">
                Contas Pagas no Mês
              </p>
              <p className="text-3xl font-bold text-green-600">
                {kpiData.paidThisMonth.count}
                <span className="text-base font-medium text-gray-500 dark:text-gray-400">
                  {kpiData.paidThisMonth.count === 1 ? ' conta' : ' contas'}
                </span>
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                R${' '}
                {kpiData.paidThisMonth.total.toLocaleString('pt-BR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{' '}
                já saíram do caixa
              </p>
            </div>
            <div className="text-3xl">✅</div>
          </div>
        </Card>

        {/* Ainda pendentes */}
        <Card>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 font-medium mb-1">
                Ainda a Pagar no Mês
              </p>
              <p className="text-3xl font-bold text-amber-600">
                {kpiData.pendingThisMonth.count}
                <span className="text-base font-medium text-gray-500 dark:text-gray-400">
                  {kpiData.pendingThisMonth.count === 1 ? ' conta' : ' contas'}
                </span>
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                R${' '}
                {kpiData.pendingThisMonth.total.toLocaleString('pt-BR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{' '}
                em aberto ·{' '}
                <Link href="/despesas" className="text-indigo-600 underline">
                  marcar como paga
                </Link>
              </p>
            </div>
            <div className="text-3xl">🕒</div>
          </div>
        </Card>
      </div>

      {/* Secondary KPIs Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Recurring Expenses */}
        <Card>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400 font-medium mb-1">
              Despesas Fixas/Mês
            </p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              R$ {kpiData.recurringExpenses.toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          </div>
        </Card>

        {/* Upcoming Payments */}
        <Card>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400 font-medium mb-1">
              Próximos 7 Dias
            </p>
            <p className="text-2xl font-bold text-orange-600">
              R$ {kpiData.upcomingPayments.toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          </div>
        </Card>

        {/* Highest Expense Category */}
        <Card>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400 font-medium mb-1">
              Maior Categoria
            </p>
            <p className="text-lg font-bold text-gray-900 dark:text-white mb-1">
              {kpiData.highestExpenseCategory.category}
            </p>
            <p className="text-xl text-indigo-600 font-semibold">
              R$ {kpiData.highestExpenseCategory.amount.toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          </div>
        </Card>

        {/* Daily Average */}
        <Card>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400 font-medium mb-1">
              Média Diária
            </p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              R$ {kpiData.dailyAverage.toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          </div>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="border-2 border-indigo-200 dark:border-indigo-800">
        <Card.Header>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Ações Rápidas
          </h2>
        </Card.Header>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4">
          <Link href="/despesas">
            <Button variant="primary" className="w-full">
              ➕ Nova Despesa
            </Button>
          </Link>
          <Link href="/receitas">
            <Button variant="primary" className="w-full">
              ➕ Nova Receita
            </Button>
          </Link>
          <Link href="/despesas">
            <Button variant="secondary" className="w-full">
              📊 Ver Despesas
            </Button>
          </Link>
          <Link href="/contas">
            <Button variant="secondary" className="w-full">
              🏦 Contas
            </Button>
          </Link>
        </div>
      </Card>

      {/* Accounts Overview */}
      <Card>
        <Card.Header>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Suas Contas
          </h2>
        </Card.Header>
        <div className="space-y-3 pt-4">
          {accounts.length > 0 ? (
            accounts.map((account) => (
              <div
                key={account.id}
                className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
              >
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {account.name}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {account.institution} • {account.type}
                  </p>
                </div>
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  R$ {account.balance.toLocaleString('pt-BR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
              </div>
            ))
          ) : (
            <p className="text-gray-600 dark:text-gray-400">
              Nenhuma conta cadastrada. Crie uma para começar!
            </p>
          )}
          <Link href="/contas">
            <Button variant="secondary" className="w-full">
              ➕ Adicionar Conta
            </Button>
          </Link>
        </div>
      </Card>

      {/* Comparison with Last Month */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <Card.Header>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Comparativo de Receitas
            </h2>
          </Card.Header>
          <div className="pt-4 space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Este Mês</span>
              <span className="font-bold text-green-600">
                R$ {kpiData.monthlyIncome.toLocaleString('pt-BR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Mês Passado</span>
              <span className="font-bold text-gray-900 dark:text-white">
                R$ {kpiData.incomeLastMonth.toLocaleString('pt-BR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
            <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Variação</span>
                <span
                  className={`font-bold ${
                    kpiData.monthlyIncome >= kpiData.incomeLastMonth
                      ? 'text-green-600'
                      : 'text-red-600'
                  }`}
                >
                  {(
                    (((kpiData.monthlyIncome - kpiData.incomeLastMonth) /
                      kpiData.incomeLastMonth) *
                      100) || 0
                  ).toFixed(1)}
                  %
                </span>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <Card.Header>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Comparativo de Despesas
            </h2>
          </Card.Header>
          <div className="pt-4 space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Este Mês</span>
              <span className="font-bold text-red-600">
                R$ {kpiData.monthlyExpenses.toLocaleString('pt-BR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Mês Passado</span>
              <span className="font-bold text-gray-900 dark:text-white">
                R$ {kpiData.expensesLastMonth.toLocaleString('pt-BR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
            <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Variação</span>
                <span
                  className={`font-bold ${
                    kpiData.monthlyExpenses <= kpiData.expensesLastMonth
                      ? 'text-green-600'
                      : 'text-red-600'
                  }`}
                >
                  {(
                    (((kpiData.monthlyExpenses - kpiData.expensesLastMonth) /
                      kpiData.expensesLastMonth) *
                      100) || 0
                  ).toFixed(1)}
                  %
                </span>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
