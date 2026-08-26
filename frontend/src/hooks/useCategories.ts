'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';

export interface Category {
  id: string;
  name: string;
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

export const useCategories = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch all categories
  const fetchCategories = async (type?: 'income' | 'expense') => {
    try {
      setIsLoading(true);
      setError(null);
      const url = type ? `/categories?type=${type}` : '/categories';
      const data = await apiClient.get(url);
      setCategories(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch categories';
      setError(errorMessage);
      console.error('Error fetching categories:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Create category
  const createCategory = async (categoryData: any) => {
    try {
      setError(null);
      const newCategory = await apiClient.post('/categories', categoryData);
      setCategories([...categories, newCategory]);
      return newCategory;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create category';
      setError(errorMessage);
      throw err;
    }
  };

  // Update category
  const updateCategory = async (id: string, updateData: any) => {
    try {
      setError(null);
      const updated = await apiClient.put(`/categories/${id}`, updateData);
      setCategories(
        categories.map((cat) =>
          cat.id === id ? updated : cat,
        ),
      );
      return updated;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update category';
      setError(errorMessage);
      throw err;
    }
  };

  // Delete category
  const deleteCategory = async (id: string) => {
    try {
      setError(null);
      await apiClient.delete(`/categories/${id}`);
      setCategories(categories.filter((cat) => cat.id !== id));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete category';
      setError(errorMessage);
      throw err;
    }
  };

  // Get tree structure
  const fetchTreeStructure = async () => {
    try {
      return await apiClient.get('/categories/tree');
    } catch (err) {
      console.error('Error fetching category tree:', err);
      throw err;
    }
  };

  // Create default categories
  const createDefaults = async () => {
    try {
      const categories = await apiClient.post('/categories/defaults/create', {});
      setCategories(categories);
      return categories;
    } catch (err) {
      console.error('Error creating default categories:', err);
      throw err;
    }
  };

  // Get budget status
  const getBudgetStatus = async () => {
    try {
      return await apiClient.get('/categories/budget-status');
    } catch (err) {
      console.error('Error fetching budget status:', err);
      throw err;
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchCategories();
  }, []);

  return {
    categories,
    isLoading,
    error,
    fetchCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    fetchTreeStructure,
    createDefaults,
    getBudgetStatus,
  };
};
