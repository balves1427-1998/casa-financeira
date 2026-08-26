'use client';

import { useState, useCallback } from 'react';

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

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

  /**
   * Fetch all custom rules
   */
  const fetchRules = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_BASE}/classification-rules`, {
        credentials: 'include',
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
  }, [API_BASE]);

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
        const response = await fetch(`${API_BASE}/classification-rules/custom`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ruleData),
          credentials: 'include',
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
    [API_BASE, rules],
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
        const response = await fetch(
          `${API_BASE}/classification-rules/custom/${id}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(ruleData),
            credentials: 'include',
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
    [API_BASE, rules],
  );

  /**
   * Delete a rule
   */
  const deleteRule = useCallback(
    async (id: string) => {
      try {
        setIsLoading(true);
        const response = await fetch(
          `${API_BASE}/classification-rules/${id}`,
          {
            method: 'DELETE',
            credentials: 'include',
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
    [API_BASE, rules],
  );

  /**
   * Test a pattern against sample strings
   */
  const testPattern = useCallback(
    async (pattern: string, matchType: string, testStrings: string[]) => {
      try {
        setIsLoading(true);
        const response = await fetch(
          `${API_BASE}/classification-rules/test-pattern`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pattern, matchType, testStrings }),
            credentials: 'include',
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
    [API_BASE],
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
        const response = await fetch(
          `${API_BASE}/classification-rules/bulk-apply`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rules: rulesData, overwrite }),
            credentials: 'include',
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
    [API_BASE, fetchRules],
  );

  /**
   * Export all rules
   */
  const exportRules = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_BASE}/classification-rules/export`, {
        credentials: 'include',
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
  }, [API_BASE]);

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
        const response = await fetch(
          `${API_BASE}/classification-rules/share`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ruleIds,
              description,
              isPublic,
            }),
            credentials: 'include',
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
    [API_BASE],
  );

  /**
   * Fetch rule statistics
   */
  const fetchStats = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_BASE}/classification-rules/stats`, {
        credentials: 'include',
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
  }, [API_BASE]);

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
