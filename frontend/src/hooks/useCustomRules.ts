'use client';

import { useState, useCallback } from 'react';
import { authFetch } from '../lib/api';

export interface CustomRule {
  id: string;
  pattern: string;
  keyword?: string;
  matchType: 'keyword' | 'regex' | 'exact';
  categoryId: string;
  categoryName: string;
  subcategoryId?: string;
  priority: number;
  isActive: boolean;
  description?: string;
  confidence: number;
  timesApplied: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TestResult {
  input: string;
  matched: boolean;
  error?: string;
}

export interface PatternTestResult {
  pattern: string;
  matchType: string;
  testResults: TestResult[];
  matchCount: number;
  successRate: number;
}

export interface BulkApplyResult {
  created: number;
  updated: number;
  failed: number;
  errors: Array<{
    rule: any;
    error: string;
  }>;
}

export interface RuleStats {
  totalRules: number;
  activeRules: number;
  inactiveRules: number;
  byMatchType: {
    keyword: number;
    regex: number;
    exact: number;
  };
  byCategory: Array<{
    categoryId: string;
    categoryName: string;
    ruleCount: number;
  }>;
  mostUsed: Array<{
    ruleId: string;
    pattern: string;
    matchType: string;
    usageCount: number;
    lastUsedAt: Date;
  }>;
  successRate: number;
}

export function useCustomRules() {
  const [rules, setRules] = useState<CustomRule[]>([]);
  const [stats, setStats] = useState<RuleStats | null>(null);
  const [testResult, setTestResult] = useState<PatternTestResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch all custom rules
   */
  const fetchRules = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await authFetch(`/classification-rules`, {
      });
      if (!response.ok) throw new Error('Failed to fetch rules');
      const data = await response.json();
      setRules(data);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Create a new custom rule
   */
  const createRule = useCallback(
    async (ruleData: {
      pattern: string;
      matchType: string;
      categoryId: string;
      subcategoryId?: string;
      priority?: number;
      isActive?: boolean;
      description?: string;
      confidence?: number;
    }) => {
      try {
        setIsLoading(true);
        const response = await authFetch(`/classification-rules/custom`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ruleData),
        });
        if (!response.ok) throw new Error('Failed to create rule');
        const newRule = await response.json();
        setRules([...rules, newRule]);
        setError(null);
        return newRule;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [rules],
  );

  /**
   * Update existing rule
   */
  const updateRule = useCallback(
    async (
      id: string,
      ruleData: {
        pattern?: string;
        matchType?: string;
        categoryId?: string;
        subcategoryId?: string;
        priority?: number;
        isActive?: boolean;
        description?: string;
        confidence?: number;
      },
    ) => {
      try {
        setIsLoading(true);
        const response = await authFetch(
          `/classification-rules/custom/${id}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(ruleData),
          },
        );
        if (!response.ok) throw new Error('Failed to update rule');
        const updated = await response.json();
        setRules(rules.map(r => (r.id === id ? updated : r)));
        setError(null);
        return updated;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [rules],
  );

  /**
   * Delete a rule
   */
  const deleteRule = useCallback(
    async (id: string) => {
      try {
        setIsLoading(true);
        const response = await authFetch(
          `/classification-rules/${id}`,
          {
            method: 'DELETE',
          },
        );
        if (!response.ok) throw new Error('Failed to delete rule');
        setRules(rules.filter(r => r.id !== id));
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [rules],
  );

  /**
   * Test a pattern against sample strings
   */
  const testPattern = useCallback(
    async (pattern: string, matchType: string, testStrings: string[]) => {
      try {
        setIsLoading(true);
        const response = await authFetch(
          `/classification-rules/test-pattern`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pattern, matchType, testStrings }),
          },
        );
        if (!response.ok) throw new Error('Failed to test pattern');
        const result = await response.json();
        setTestResult(result);
        setError(null);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  /**
   * Apply multiple rules in bulk
   */
  const bulkApplyRules = useCallback(
    async (
      rulesData: Array<{
        pattern: string;
        matchType: string;
        categoryId: string;
        subcategoryId?: string;
        priority?: number;
      }>,
      overwrite?: boolean,
    ) => {
      try {
        setIsLoading(true);
        const response = await authFetch(
          `/classification-rules/bulk-apply`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rules: rulesData, overwrite }),
          },
        );
        if (!response.ok) throw new Error('Failed to bulk apply rules');
        const result = await response.json();
        await fetchRules(); // Refresh rules list
        setError(null);
        return result as BulkApplyResult;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [fetchRules],
  );

  /**
   * Export all rules
   */
  const exportRules = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await authFetch(`/classification-rules/export`, {
      });
      if (!response.ok) throw new Error('Failed to export rules');
      const data = await response.json();
      setError(null);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Share rules with others
   */
  const shareRules = useCallback(
    async (
      ruleIds: string[],
      description?: string,
      isPublic?: boolean,
    ) => {
      try {
        setIsLoading(true);
        const response = await authFetch(
          `/classification-rules/share`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ruleIds,
              description,
              isPublic,
            }),
          },
        );
        if (!response.ok) throw new Error('Failed to share rules');
        const result = await response.json();
        setError(null);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  /**
   * Fetch rule statistics
   */
  const fetchStats = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await authFetch(`/classification-rules/stats`, {
      });
      if (!response.ok) throw new Error('Failed to fetch stats');
      const data = await response.json();
      setStats(data);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    rules,
    stats,
    testResult,
    isLoading,
    error,
    fetchRules,
    createRule,
    updateRule,
    deleteRule,
    testPattern,
    bulkApplyRules,
    exportRules,
    shareRules,
    fetchStats,
  };
}
