'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import Link from 'next/link';

interface Category {
  id: string;
  name: string;
  parentCategoryId?: string;
  description?: string;
  type: 'income' | 'expense';
  color?: string;
  icon?: string;
  monthlyBudget?: number;
  isRecurring: boolean;
  displayOrder: number;
  subcategories?: Category[];
  createdAt: string;
  updatedAt: string;
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiClient.get('/categories');
      setCategories(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch categories');
      console.error('Error fetching categories:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredCategories = categories.filter((cat) => {
    if (filterType === 'all') return !cat.parentCategoryId;
    return cat.type === filterType && !cat.parentCategoryId;
  });

  const deleteCategory = async (id: string) => {
    if (!confirm('Deseja realmente deletar esta categoria?')) return;

    try {
      await apiClient.delete(`/categories/${id}`);
      setCategories(categories.filter((c) => c.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete category');
    }
  };

  const getTypeLabel = (type: string) => {
    return type === 'income' ? '💰 Receita' : '💸 Despesa';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Carregando categorias...</p>
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
            📂 Categorias
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Organize e gerencie suas categorias de receita e despesa
          </p>
        </div>
        <Link href="/categories/new">
          <Button variant="primary">➕ Nova Categoria</Button>
        </Link>
      </div>

      {error && (
        <div className="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-200 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Filter */}
      <Card>
        <div className="flex gap-2">
          <button
            onClick={() => setFilterType('all')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filterType === 'all'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            Todas (
            {categories.filter((c) => !c.parentCategoryId).length})
          </button>
          <button
            onClick={() => setFilterType('income')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filterType === 'income'
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            Receitas (
            {categories.filter((c) => c.type === 'income' && !c.parentCategoryId)
              .length}
            )
          </button>
          <button
            onClick={() => setFilterType('expense')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filterType === 'expense'
                ? 'bg-red-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            Despesas (
            {categories.filter((c) => c.type === 'expense' && !c.parentCategoryId)
              .length}
            )
          </button>
        </div>
      </Card>

      {/* Categories Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredCategories.length > 0 ? (
          filteredCategories.map((category) => (
            <Card key={category.id}>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">{category.icon || '📁'}</span>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                      {category.name}
                    </h3>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {getTypeLabel(category.type)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link href={`/categories/${category.id}`}>
                    <Button variant="secondary" className="text-sm">
                      ✏️ Editar
                    </Button>
                  </Link>
                  <button
                    onClick={() => deleteCategory(category.id)}
                    className="px-2 py-1 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded transition-colors"
                  >
                    🗑️
                  </button>
                </div>
              </div>

              {category.description && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  {category.description}
                </p>
              )}

              {category.monthlyBudget && (
                <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900 rounded-lg">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
                    Orçamento Mensal:
                  </p>
                  <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                    R$ {category.monthlyBudget.toLocaleString('pt-BR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </div>
              )}

              {category.isRecurring && (
                <div className="inline-block px-3 py-1 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded-full text-xs font-medium">
                  🔁 Recorrente
                </div>
              )}

              {category.subcategories && category.subcategories.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
                    Subcategorias ({category.subcategories.length})
                  </p>
                  <div className="space-y-1">
                    {category.subcategories.map((sub) => (
                      <div
                        key={sub.id}
                        className="text-sm text-gray-600 dark:text-gray-400 flex justify-between items-center"
                      >
                        <span>└ {sub.name}</span>
                        <button
                          onClick={() => deleteCategory(sub.id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          ))
        ) : (
          <Card className="col-span-full">
            <div className="text-center py-12">
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Nenhuma categoria encontrada
              </p>
              <Link href="/categories/new">
                <Button variant="primary">➕ Criar Primeira Categoria</Button>
              </Link>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
