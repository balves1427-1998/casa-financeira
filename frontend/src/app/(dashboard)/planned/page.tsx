'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import Link from 'next/link';

interface PlannedAccount {
  id: string;
  description: string;
  category?: string;
  amount: number;
  dueDate: string;
  responsible: string;
  status: 'pending' | 'confirmed' | 'paid' | 'cancelled' | 'overdue';
  observation?: string;
  priority: number;
  isRecurring: boolean;
  frequency?: string;
  createdAt: string;
  updatedAt: string;
}

export default function PlannedPage() {
  const [planned, setPlanned] = useState<PlannedAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('pending');

  useEffect(() => {
    fetchPlanned();
  }, []);

  const fetchPlanned = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiClient.get('/planned-accounts');
      setPlanned(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch planned accounts');
      console.error('Error fetching planned accounts:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredPlanned = planned.filter((p) =>
    filterStatus === 'all' ? true : p.status === filterStatus,
  );

  const deletePlanned = async (id: string) => {
    if (!confirm('Deseja realmente deletar este planejamento?')) return;

    try {
      await apiClient.delete(`/planned-accounts/${id}`);
      setPlanned(planned.filter((p) => p.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete planned account');
    }
  };

  const markAsPaid = async (id: string) => {
    try {
      await apiClient.patch(`/planned-accounts/${id}/mark-as-paid`, {});
      setPlanned(
        planned.map((p) =>
          p.id === id ? { ...p, status: 'paid' as const } : p,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark as paid');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300';
      case 'confirmed':
        return 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300';
      case 'paid':
        return 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300';
      case 'cancelled':
        return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
      case 'overdue':
        return 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300';
      default:
        return 'bg-gray-100 dark:bg-gray-700';
    }
  };

  const getPriorityColor = (priority: number) => {
    switch (priority) {
      case 0:
        return 'text-gray-500';
      case 1:
        return 'text-yellow-500';
      case 2:
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  const getPriorityLabel = (priority: number) => {
    switch (priority) {
      case 0:
        return 'Baixa';
      case 1:
        return 'Normal';
      case 2:
        return 'Alta';
      default:
        return 'Normal';
    }
  };

  const getDaysUntilDue = (dueDate: string) => {
    const today = new Date();
    const due = new Date(dueDate);
    const diff = Math.ceil(
      (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );
    return diff;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Carregando planejamentos...</p>
        </div>
      </div>
    );
  }

  const statistics = {
    pending: planned.filter((p) => p.status === 'pending').length,
    confirmed: planned.filter((p) => p.status === 'confirmed').length,
    paid: planned.filter((p) => p.status === 'paid').length,
    overdue: planned.filter((p) => p.status === 'overdue').length,
  };

  const totalPending = planned
    .filter((p) => p.status === 'pending' || p.status === 'confirmed')
    .reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            📋 Contas Planejadas
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Organize e acompanhe suas despesas futuras
          </p>
        </div>
        <Link href="/planned/new">
          <Button variant="primary">➕ Nova Conta</Button>
        </Link>
      </div>

      {error && (
        <div className="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-200 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Pendentes</p>
          <p className="text-2xl font-bold text-yellow-600">{statistics.pending}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Confirmadas</p>
          <p className="text-2xl font-bold text-blue-600">{statistics.confirmed}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Pagas</p>
          <p className="text-2xl font-bold text-green-600">{statistics.paid}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Vencidas</p>
          <p className="text-2xl font-bold text-red-600">{statistics.overdue}</p>
        </Card>
      </div>

      {/* Total Pending */}
      <Card className="border-2 border-indigo-200 dark:border-indigo-800">
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
            Total a Pagar
          </p>
          <p className="text-3xl font-bold text-indigo-600">
            R$ {totalPending.toLocaleString('pt-BR', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
        </div>
      </Card>

      {/* Filter */}
      <Card>
        <div className="flex gap-2 flex-wrap">
          {['pending', 'confirmed', 'paid', 'overdue', 'all'].map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filterStatus === status
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {status === 'pending' && 'Pendentes'}
              {status === 'confirmed' && 'Confirmadas'}
              {status === 'paid' && 'Pagas'}
              {status === 'overdue' && 'Vencidas'}
              {status === 'all' && 'Todas'}
            </button>
          ))}
        </div>
      </Card>

      {/* List */}
      <div className="space-y-3">
        {filteredPlanned.length > 0 ? (
          filteredPlanned.map((account) => {
            const daysUntilDue = getDaysUntilDue(account.dueDate);
            return (
              <Card
                key={account.id}
                className="hover:shadow-lg transition-shadow"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                          {account.description}
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {account.category} • {account.responsible}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 items-center mt-2">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(
                          account.status,
                        )}`}
                      >
                        {account.status.toUpperCase()}
                      </span>

                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300`}
                      >
                        <span className={getPriorityColor(account.priority)}>
                          ★
                        </span>{' '}
                        {getPriorityLabel(account.priority)}
                      </span>

                      {account.isRecurring && (
                        <span className="px-3 py-1 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300">
                          🔁 {account.frequency}
                        </span>
                      )}

                      {daysUntilDue <= 3 && daysUntilDue >= 0 && (
                        <span className="px-3 py-1 rounded-full text-xs font-medium bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300">
                          ⚠️ Vence em {daysUntilDue} dias
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                      R${' '}
                      {account.amount.toLocaleString('pt-BR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>

                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                      Vence:{' '}
                      {new Date(account.dueDate).toLocaleDateString('pt-BR')}
                    </p>

                    <div className="flex gap-2">
                      {account.status === 'pending' && (
                        <button
                          onClick={() => markAsPaid(account.id)}
                          className="px-3 py-1 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded transition-colors"
                        >
                          ✓ Pagar
                        </button>
                      )}
                      <Link href={`/planned/${account.id}`}>
                        <Button variant="secondary" className="text-sm">
                          ✏️
                        </Button>
                      </Link>
                      <button
                        onClick={() => deletePlanned(account.id)}
                        className="px-3 py-1 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded transition-colors"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>

                {account.observation && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                    📝 {account.observation}
                  </p>
                )}
              </Card>
            );
          })
        ) : (
          <Card>
            <div className="text-center py-12">
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Nenhuma conta {filterStatus !== 'all' ? filterStatus : ''} encontrada
              </p>
              <Link href="/planned/new">
                <Button variant="primary">➕ Criar Primeira Conta</Button>
              </Link>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
