'use client';

import { useState, useEffect } from 'react';
import { useCustomRules } from '@/hooks/useCustomRules';

interface Category {
  id: string;
  name: string;
}

interface RuleFormProps {
  rule?: any;
  categories: Category[];
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function RuleForm({
  rule,
  categories,
  onSuccess,
  onCancel,
}: RuleFormProps) {
  const { createRule, updateRule, isLoading } = useCustomRules();
  const [formData, setFormData] = useState({
    pattern: '',
    matchType: 'keyword',
    categoryId: '',
    subcategoryId: '',
    priority: 50,
    isActive: true,
    description: '',
    confidence: 0.85,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (rule) {
      setFormData({
        pattern: rule.keyword || rule.pattern,
        matchType: rule.matchType,
        categoryId: rule.categoryId,
        subcategoryId: rule.subcategoryId || '',
        priority: rule.priority,
        isActive: rule.isActive,
        description: rule.description || '',
        confidence: rule.confidence,
      });
    }
  }, [rule]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.pattern.trim()) {
      newErrors.pattern = 'Padrão é obrigatório';
    }

    if (!formData.categoryId) {
      newErrors.categoryId = 'Categoria é obrigatória';
    }

    if (formData.priority < 1 || formData.priority > 100) {
      newErrors.priority = 'Prioridade deve estar entre 1 e 100';
    }

    if (formData.confidence < 0 || formData.confidence > 1) {
      newErrors.confidence = 'Confiança deve estar entre 0 e 1';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      if (rule?.id) {
        await updateRule(rule.id, formData);
      } else {
        await createRule(formData);
      }
      onSuccess?.();
    } catch (error) {
      console.error('Error saving rule:', error);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    const { name, value, type } = e.target;
    const newValue =
      type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;

    setFormData(prev => ({
      ...prev,
      [name]: name === 'priority' || name === 'confidence'
        ? parseFloat(value)
        : newValue,
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        {rule ? '✏️ Editar Regra' : '➕ Nova Regra'}
      </h3>

      {/* Pattern Input */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-400">
          Padrão *
        </label>
        <input
          type="text"
          name="pattern"
          value={formData.pattern}
          onChange={handleChange}
          placeholder="Ex: IFOOD, .*UBER.*, NETFLIX"
          className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-600 focus:outline-none focus:ring-2 ${
            errors.pattern
              ? 'border-red-300 focus:ring-red-500'
              : 'border-gray-300 dark:border-gray-700 focus:ring-blue-500'
          }`}
        />
        {errors.pattern && (
          <p className="text-xs text-red-600 dark:text-red-400">
            {errors.pattern}
          </p>
        )}
      </div>

      {/* Match Type Select */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-400">
          Tipo de Correspondência *
        </label>
        <select
          name="matchType"
          value={formData.matchType}
          onChange={handleChange}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="keyword">🔤 Palavra-chave (case-insensitive)</option>
          <option value="regex">🔍 Expressão regular</option>
          <option value="exact">✓ Exata</option>
        </select>
      </div>

      {/* Category Select */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-400">
          Categoria *
        </label>
        <select
          name="categoryId"
          value={formData.categoryId}
          onChange={handleChange}
          className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 ${
            errors.categoryId
              ? 'border-red-300 focus:ring-red-500'
              : 'border-gray-300 dark:border-gray-700 focus:ring-blue-500'
          }`}
        >
          <option value="">Selecione uma categoria</option>
          {categories.map(cat => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
        {errors.categoryId && (
          <p className="text-xs text-red-600 dark:text-red-400">
            {errors.categoryId}
          </p>
        )}
      </div>

      {/* Priority */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-400">
          Prioridade (1-100) *
        </label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            name="priority"
            value={formData.priority}
            onChange={handleChange}
            min="1"
            max="100"
            className="flex-1 h-2 bg-gray-300 dark:bg-gray-700 rounded-lg cursor-pointer"
          />
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100 w-12">
            {formData.priority}
          </span>
        </div>
        {errors.priority && (
          <p className="text-xs text-red-600 dark:text-red-400">
            {errors.priority}
          </p>
        )}
      </div>

      {/* Confidence */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-400">
          Confiança (0-1) *
        </label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            name="confidence"
            value={formData.confidence}
            onChange={handleChange}
            min="0"
            max="1"
            step="0.05"
            className="flex-1 h-2 bg-gray-300 dark:bg-gray-700 rounded-lg cursor-pointer"
          />
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100 w-12">
            {(formData.confidence * 100).toFixed(0)}%
          </span>
        </div>
        {errors.confidence && (
          <p className="text-xs text-red-600 dark:text-red-400">
            {errors.confidence}
          </p>
        )}
      </div>

      {/* Description */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-400">
          Descrição
        </label>
        <textarea
          name="description"
          value={formData.description}
          onChange={handleChange}
          placeholder="Descrição opcional da regra..."
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Active Toggle */}
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          name="isActive"
          checked={formData.isActive}
          onChange={handleChange}
          className="w-4 h-4 rounded"
        />
        <label className="text-sm font-medium text-gray-700 dark:text-gray-400">
          Ativa
        </label>
      </div>

      {/* Buttons */}
      <div className="flex gap-2 justify-end pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm bg-gray-300 hover:bg-gray-400 text-gray-800 font-medium rounded-lg transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isLoading}
          className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {isLoading ? '⏳ Salvando...' : '💾 Salvar Regra'}
        </button>
      </div>
    </form>
  );
}
