'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const categorySchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  description: z.string().optional(),
  type: z.enum(['income', 'expense']),
  color: z.string().regex(/^#[0-9A-F]{6}$/i, 'Cor deve ser um valor hexadecimal válido'),
  icon: z.string().optional(),
  monthlyBudget: z.number().min(0, 'Orçamento deve ser maior ou igual a 0').optional(),
  isRecurring: z.boolean().default(false),
  parentCategoryId: z.string().optional().nullable(),
});

type CategoryFormData = z.infer<typeof categorySchema>;

interface CategoryFormProps {
  initialData?: any;
  isLoading?: boolean;
  onSubmit: (data: CategoryFormData) => Promise<void>;
  onCancel?: () => void;
}

const COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280', '#000000',
];

const ICONS = [
  '🏠', '🍔', '🛒', '🚗', '⛽', '🏥', '🎓', '🎮',
  '✈️', '🎫', '🐕', '💰', '🏦', '💳', '📊', '📱',
];

export function CategoryForm({
  initialData,
  isLoading,
  onSubmit,
  onCancel,
}: CategoryFormProps) {
  const [selectedColor, setSelectedColor] = useState(initialData?.color || '#3b82f6');
  const [selectedIcon, setSelectedIcon] = useState(initialData?.icon || '💰');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<CategoryFormData>({
    resolver: zodResolver(categorySchema),
    defaultValues: initialData || {
      type: 'expense',
      isRecurring: false,
      color: selectedColor,
      icon: selectedIcon,
    },
  });

  useEffect(() => {
    if (initialData) {
      reset(initialData);
    }
  }, [initialData, reset]);

  const handleSubmitForm = async (data: CategoryFormData) => {
    try {
      await onSubmit({
        ...data,
        color: selectedColor,
        icon: selectedIcon,
      });
    } catch (error) {
      console.error('Erro ao submeter formulário:', error);
    }
  };

  return (
    <form onSubmit={handleSubmit(handleSubmitForm)} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Nome da Categoria *</label>
        <input
          type="text"
          {...register('name')}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
          placeholder="Ex: Alimentação"
        />
        {errors.name && <p className="text-sm text-red-500 mt-1">{errors.name.message}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Descrição</label>
        <textarea
          {...register('description')}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
          placeholder="Descrição opcional"
          rows={3}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Tipo *</label>
          <select
            {...register('type')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
          >
            <option value="expense">Despesa</option>
            <option value="income">Receita</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Orçamento Mensal (R$)</label>
          <input
            type="number"
            {...register('monthlyBudget', { valueAsNumber: true })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
            placeholder="0,00"
            step="0.01"
            min="0"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Cor</label>
        <div className="flex gap-2 flex-wrap">
          {COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => setSelectedColor(color)}
              className={`w-8 h-8 rounded-lg border-2 transition-all ${
                selectedColor === color ? 'border-gray-800 dark:border-white' : 'border-gray-300'
              }`}
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Ícone</label>
        <div className="flex gap-2 flex-wrap">
          {ICONS.map((icon) => (
            <button
              key={icon}
              type="button"
              onClick={() => setSelectedIcon(icon)}
              className={`w-10 h-10 flex items-center justify-center rounded-lg border-2 text-xl transition-all ${
                selectedIcon === icon
                  ? 'border-gray-800 dark:border-white bg-blue-100 dark:bg-blue-900'
                  : 'border-gray-300'
              }`}
            >
              {icon}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          {...register('isRecurring')}
          className="w-4 h-4 rounded"
        />
        <label className="text-sm font-medium">Essa é uma despesa/receita recorrente?</label>
      </div>

      <div className="flex gap-2 pt-4">
        <button
          type="submit"
          disabled={isSubmitting || isLoading}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
        >
          {isSubmitting || isLoading ? 'Salvando...' : 'Salvar Categoria'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 font-medium py-2 px-4 rounded-lg transition-colors"
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
