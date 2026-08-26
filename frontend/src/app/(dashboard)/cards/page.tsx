'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import Link from 'next/link';

interface CreditCard {
  id: string;
  name: string;
  bank: string;
  cardNumber: string;
  limit: number;
  currentBalance: number;
  closingDay: number;
  dueDay: number;
  status: 'active' | 'inactive' | 'blocked' | 'expired';
  cardType?: string;
  expiryDate?: string;
  interestRate?: number;
  createdAt: string;
  updatedAt: string;
}

export default function CreditCardsPage() {
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [utilization, setUtilization] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCards();
  }, []);

  const fetchCards = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [cardsData, utilizationData] = await Promise.all([
        apiClient.get('/credit-cards'),
        apiClient.get('/credit-cards/utilization/total'),
      ]);
      setCards(cardsData);
      setUtilization(utilizationData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch credit cards');
      console.error('Error fetching credit cards:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteCard = async (id: string) => {
    if (!confirm('Deseja realmente deletar este cartão?')) return;

    try {
      await apiClient.delete(`/credit-cards/${id}`);
      setCards(cards.filter((c) => c.id !== id));
      await fetchCards(); // Refresh utilization
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete card');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300';
      case 'inactive':
        return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
      case 'blocked':
        return 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300';
      case 'expired':
        return 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300';
      default:
        return 'bg-gray-100 dark:bg-gray-700';
    }
  };

  const getUtilizationColor = (percentage: number) => {
    if (percentage < 50) return 'bg-green-500';
    if (percentage < 80) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Carregando cartões...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            💳 Cartões de Crédito
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Gerencia seus cartões de crédito e limite disponível
          </p>
        </div>
        <Link href="/cards/new">
          <Button variant="primary">➕ Novo Cartão</Button>
        </Link>
      </div>

      {error && (
        <div className="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-200 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Total Utilization */}
      {utilization && (
        <Card className="border-2 border-indigo-200 dark:border-indigo-800">
          <Card.Header>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Utilização Total de Crédito
            </h2>
          </Card.Header>
          <div className="pt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                  Total de Limite
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  R$ {utilization.totalLimit.toLocaleString('pt-BR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                  Saldo Utilizado
                </p>
                <p className="text-2xl font-bold text-red-600">
                  R$ {utilization.totalBalance.toLocaleString('pt-BR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                  Limite Disponível
                </p>
                <p className="text-2xl font-bold text-green-600">
                  R$ {utilization.availableLimit.toLocaleString('pt-BR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                  Percentual Utilizado
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {utilization.utilizationPercentage.toFixed(1)}%
                </p>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all ${getUtilizationColor(
                  utilization.utilizationPercentage,
                )}`}
                style={{
                  width: `${Math.min(utilization.utilizationPercentage, 100)}%`,
                }}
              ></div>
            </div>
          </div>
        </Card>
      )}

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {cards.length > 0 ? (
          cards.map((card) => (
            <Card key={card.id} className="relative overflow-hidden">
              {/* Card Background Effect */}
              <div className="absolute inset-0 opacity-10 bg-gradient-to-br from-indigo-500 to-purple-500"></div>

              <div className="relative">
                {/* Header */}
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                      {card.name}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {card.bank} • {card.cardType || 'Crédito'}
                    </p>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(
                      card.status,
                    )}`}
                  >
                    {card.status}
                  </span>
                </div>

                {/* Card Number */}
                <p className="text-sm text-gray-600 dark:text-gray-400 font-mono mb-4">
                  •••• •••• •••• {card.cardNumber}
                </p>

                {/* Utilization */}
                <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-blue-900 dark:text-blue-200">
                      Limite Utilizado
                    </span>
                    <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                      {(
                        ((card.currentBalance / card.limit) * 100) || 0
                      ).toFixed(1)}
                      %
                    </span>
                  </div>
                  <div className="w-full bg-blue-200 dark:bg-blue-700 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${getUtilizationColor(
                        (card.currentBalance / card.limit) * 100,
                      )}`}
                      style={{
                        width: `${Math.min(
                          (card.currentBalance / card.limit) * 100,
                          100,
                        )}%`,
                      }}
                    ></div>
                  </div>
                </div>

                {/* Balance Info */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      Limite
                    </p>
                    <p className="font-bold text-gray-900 dark:text-white">
                      R$ {card.limit.toLocaleString('pt-BR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      Usado
                    </p>
                    <p className="font-bold text-red-600">
                      R$ {card.currentBalance.toLocaleString('pt-BR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                </div>

                {/* Due Info */}
                <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900 rounded-lg">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-yellow-900 dark:text-yellow-200 text-xs">
                        Fechamento
                      </p>
                      <p className="font-bold text-yellow-700 dark:text-yellow-300">
                        Dia {card.closingDay}
                      </p>
                    </div>
                    <div>
                      <p className="text-yellow-900 dark:text-yellow-200 text-xs">
                        Vencimento
                      </p>
                      <p className="font-bold text-yellow-700 dark:text-yellow-300">
                        Dia {card.dueDay}
                      </p>
                    </div>
                  </div>
                </div>

                {card.interestRate && (
                  <div className="text-xs text-gray-600 dark:text-gray-400 mb-4">
                    Taxa de juros: {card.interestRate}% a.m.
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  <Link href={`/cards/${card.id}`} className="flex-1">
                    <Button variant="secondary" className="w-full text-sm">
                      ✏️ Editar
                    </Button>
                  </Link>
                  <button
                    onClick={() => deleteCard(card.id)}
                    className="px-3 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded transition-colors"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </Card>
          ))
        ) : (
          <Card className="col-span-full">
            <div className="text-center py-12">
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Nenhum cartão cadastrado
              </p>
              <Link href="/cards/new">
                <Button variant="primary">➕ Adicionar Cartão</Button>
              </Link>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
