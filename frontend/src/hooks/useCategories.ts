'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  toCategoryAmount,
} from '@/types/category';
import { getApiErrorMessage } from '@/utils/api-error';

export interface Category {
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

/**
 * Normaliza um registro vindo da API.
 *
 * `monthlyBudget` é uma coluna `decimal` do PostgreSQL e chega como STRING
 * pelo driver `pg` (`"1500.00"`), embora a interface prometa `number`. Sem a
 * conversão, somar orçamentos concatenaria strings e a formatação em
 * R$ 0.000,00 sairia errada.
 */
function normalizeCategory(raw: any): Category {
  return {
    ...raw,
    monthlyBudget:
      raw?.monthlyBudget === null || raw?.monthlyBudget === undefined
        ? undefined
        : toCategoryAmount(raw.monthlyBudget),
    displayOrder: Number(raw?.displayOrder ?? 0),
    isRecurring: Boolean(raw?.isRecurring),
    subcategories: Array.isArray(raw?.subcategories)
      ? raw.subcategories.map(normalizeCategory)
      : undefined,
  } as Category;
}

export const useCategories = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  /** `true` durante criação, edição ou exclusão — separado da carga da lista. */
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Carrega a lista.
   *
   * `silent` evita acender o `isLoading` quando a recarga acontece logo depois
   * de uma gravação — sem isso a tela piscaria o esqueleto a cada salvamento.
   */
  const fetchCategories = useCallback(
    async (type?: 'income' | 'expense', options?: { silent?: boolean }) => {
      try {
        if (!options?.silent) setIsLoading(true);
        setError(null);
        const url = type ? `/categories?type=${type}` : '/categories';
        const data = await apiClient.get(url);
        const normalized: Category[] = Array.isArray(data)
          ? data.map(normalizeCategory)
          : [];
        setCategories(normalized);
        return normalized;
      } catch (err) {
        setError(getApiErrorMessage(err, 'Erro ao carregar as categorias'));
        console.error('Error fetching categories:', err);
        return [] as Category[];
      } finally {
        if (!options?.silent) setIsLoading(false);
      }
    },
    [],
  );

  // Create category
  const createCategory = useCallback(
    async (categoryData: CreateCategoryDto | any) => {
      try {
        setIsSaving(true);
        setError(null);
        const created = normalizeCategory(
          await apiClient.post('/categories', categoryData),
        );
        setCategories(prev => [...prev, created]);
        // Recarrega para trazer a subcategoria já aninhada na categoria-mãe.
        await fetchCategories(undefined, { silent: true });
        return created;
      } catch (err) {
        const errorMessage = getApiErrorMessage(
          err,
          'Erro ao cadastrar a categoria',
        );
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setIsSaving(false);
      }
    },
    [fetchCategories],
  );

  // Update category
  const updateCategory = useCallback(
    async (id: string, updateData: UpdateCategoryDto | any) => {
      try {
        setIsSaving(true);
        setError(null);
        const updated = normalizeCategory(
          await apiClient.put(`/categories/${id}`, updateData),
        );
        setCategories(prev => prev.map(cat => (cat.id === id ? updated : cat)));
        await fetchCategories(undefined, { silent: true });
        return updated;
      } catch (err) {
        const errorMessage = getApiErrorMessage(
          err,
          'Erro ao atualizar a categoria',
        );
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setIsSaving(false);
      }
    },
    [fetchCategories],
  );

  // Delete category
  const deleteCategory = useCallback(
    async (id: string) => {
      try {
        setIsSaving(true);
        setError(null);
        await apiClient.delete(`/categories/${id}`);
        setCategories(prev => prev.filter(cat => cat.id !== id));
        await fetchCategories(undefined, { silent: true });
        return true;
      } catch (err) {
        const errorMessage = getApiErrorMessage(
          err,
          'Erro ao excluir a categoria',
        );
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setIsSaving(false);
      }
    },
    [fetchCategories],
  );

  // Get tree structure
  const fetchTreeStructure = useCallback(async () => {
    try {
      return await apiClient.get('/categories/tree');
    } catch (err) {
      console.error('Error fetching category tree:', err);
      throw err;
    }
  }, []);

  /**
   * Cria as categorias padrão do escopo.
   *
   * A rota do backend é `@Get('defaults/create')` — chamá-la com POST devolvia
   * 404, e por isso o atalho nunca funcionou na interface.
   */
  const createDefaults = useCallback(async () => {
    try {
      setIsSaving(true);
      setError(null);
      const data = await apiClient.get('/categories/defaults/create');
      const normalized: Category[] = Array.isArray(data)
        ? data.map(normalizeCategory)
        : [];
      setCategories(normalized);
      return normalized;
    } catch (err) {
      const errorMessage = getApiErrorMessage(
        err,
        'Erro ao criar as categorias padrão',
      );
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  }, []);

  // Get budget status
  const getBudgetStatus = useCallback(async () => {
    try {
      return await apiClient.get('/categories/budget-status');
    } catch (err) {
      console.error('Error fetching budget status:', err);
      throw err;
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  // Initial fetch
  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  return {
    categories,
    isLoading,
    isSaving,
    error,
    fetchCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    fetchTreeStructure,
    createDefaults,
    getBudgetStatus,
    clearError,
  };
};
