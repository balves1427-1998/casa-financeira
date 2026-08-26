'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';

export interface ClassificationRule {
  id: string;
  keyword: string;
  category: string;
  subcategory?: string;
  matchType: 'keyword' | 'regex' | 'exact';
  priority: number;
  isActive: boolean;
  timesApplied: number;
  bank?: string;
  merchant?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClassificationResult {
  category: string;
  subcategory?: string;
  confidence: number;
  ruleId: string;
}

export const useClassificationRules = () => {
  const [rules, setRules] = useState<ClassificationRule[]>([]);
  const [defaultRules, setDefaultRules] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch all custom rules
  const fetchRules = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiClient.get('/classification-rules');
      setRules(data);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to fetch classification rules';
      setError(errorMessage);
      console.error('Error fetching rules:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch default rules
  const fetchDefaultRules = async () => {
    try {
      const data = await apiClient.get('/classification-rules/defaults');
      setDefaultRules(data);
    } catch (err) {
      console.error('Error fetching default rules:', err);
    }
  };

  // Create custom rule
  const createRule = async (ruleData: any) => {
    try {
      setError(null);
      const newRule = await apiClient.post('/classification-rules', ruleData);
      setRules([...rules, newRule]);
      return newRule;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to create classification rule';
      setError(errorMessage);
      throw err;
    }
  };

  // Update rule
  const updateRule = async (id: string, updateData: any) => {
    try {
      setError(null);
      const updated = await apiClient.put(`/classification-rules/${id}`, updateData);
      setRules(
        rules.map((r) =>
          r.id === id ? updated : r,
        ),
      );
      return updated;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to update classification rule';
      setError(errorMessage);
      throw err;
    }
  };

  // Delete rule
  const deleteRule = async (id: string) => {
    try {
      setError(null);
      await apiClient.delete(`/classification-rules/${id}`);
      setRules(rules.filter((r) => r.id !== id));
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to delete classification rule';
      setError(errorMessage);
      throw err;
    }
  };

  // Classify a transaction
  const classify = async (
    description: string,
    amount?: number,
  ): Promise<ClassificationResult | null> => {
    try {
      return await apiClient.post('/classification-rules/classify', {
        description,
        amount,
      });
    } catch (err) {
      console.error('Error classifying transaction:', err);
      throw err;
    }
  };

  // Bulk create default rules for user
  const bulkCreateDefaults = async () => {
    try {
      const created = await apiClient.post('/classification-rules/defaults/create', {});
      setRules(created);
      return created;
    } catch (err) {
      console.error('Error creating default rules:', err);
      throw err;
    }
  };

  // Increment usage count for a rule
  const incrementUsage = async (id: string) => {
    try {
      await apiClient.post(`/classification-rules/${id}/increment-usage`, {});
    } catch (err) {
      console.error('Error incrementing rule usage:', err);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchRules();
    fetchDefaultRules();
  }, []);

  return {
    rules,
    defaultRules,
    isLoading,
    error,
    fetchRules,
    fetchDefaultRules,
    createRule,
    updateRule,
    deleteRule,
    classify,
    bulkCreateDefaults,
    incrementUsage,
  };
};
