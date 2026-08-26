'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const plannedAccountSchema = z.object({
  description: z.string().min(2, 'Descrição deve ter pelo menos 2 caracteres'),
  category: z.string().optional(),
  amount: z.number().min(0.01, 'Valor deve ser maior que 0'),
  dueDate: z.string(),
  responsible: z.enum(['bruno', 'giovanna']),
  status: z.enum(['pending', 'confirmed', 'paid', 'cancelled', 'overdue']),
  observation: z.string().optional(),
  priority: z.number().min(0).max(2).default(1),
  isRecurring: z.boolean().default(false),
  frequency: z.string().optional(),
});

type PlannedAccountFormData = z.infer<typeof plannedAccountSchema>;

interface PlannedAccountFormProps {
  initialData?: any;
  isLoading?: boolean;
  onSubmit: (data: PlannedAccountFormData) => Promise<void>;
  onCancel?: () => void;
}

export function PlannedAccountForm({
  initialData,
  isLoading,
  onSubmit,
  onCancel,
}: PlannedAccountFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    watch,
  } = useForm<PlannedAccountFormData>({
    resolver: zodResolver(plannedAccountSchema),
    defaultValues: initialData || {
      status: 'pending',
      priority: 1,
      isRecurring: false,
      responsible: 'bruno',
    },
  });

  const isRecurring = watch('isRecurring');

  useEffect(() => {
    if (initialData) {
      reset(initialData);
    }
  }, [initialData, reset]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Descrição *</label>
        <input
          type="text"
          {...register('description')}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
          placeholder="Ex: Pagamento de Aluguel"
        />
        {errors.description && <p className="text-sm text-red-500 mt-1">{errors.description.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Categoria</label>
          <input
            type="text"
            {...register('category')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
            placeholder="Ex: Moradia"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Valor (R$) *</label>
          <input
            type="number"
            {...register('amount', { valueAsNumber: true })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
            placeholder="0,00"
            step="0.01"
            min="0.01"
          />
          {errors.amount && <p className="text-sm text-red-500 mt-1">{errors.amount.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Data de Vencimento *</label>
          <input
            type="date"
            {...register('dueDate')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
          />
          {errors.dueDate && <p className="text-sm text-red-500 mt-1">{errors.dueDate.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Responsável *</label>
          <select
            {...register('responsible')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
          >
            <option value="bruno">Bruno</option>
            <option value="giovanna">Giovanna</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Status *</label>
          <select
            {...register('status')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
          >
            <option value="pending">Pendente</option>
            <option value="confirmed">Confirmada</option>
            <option value="paid">Paga</option>
            <option value="cancelled">Cancelada</option>
            <option value="overdue">Vencida</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Prioridade</label>
          <select
            {...register('priority', { valueAsNumber: true })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
          >
            <option value="0">Baixa</option>
            <option value="1">Normal</option>
            <option value="2">Alta</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Observação</label>
        <textarea
          {...register('observation')}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
          placeholder="Observações adicionais..."
          rows={3}
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          {...register('isRecurring')}
          className="w-4 h-4 rounded"
        />
        <label className="text-sm font-medium">Essa conta é recorrente?</label>
      </div>

      {isRecurring && (
        <div>
          <label className="block text-sm font-medium mb-1">Frequência</label>
          <select
            {...register('frequency')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
          >
            <option value="weekly">Semanal</option>
            <option value="biweekly">Quinzenal</option>
            <option value="monthly">Mensal</option>
            <option value="quarterly">Trimestral</option>
            <option value="yearly">Anual</option>
          </select>
        </div>
      )}

      <div className="flex gap-2 pt-4">
        <button
          type="submit"
          disabled={isSubmitting || isLoading}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
        >
          {isSubmitting || isLoading ? 'Salvando...' : 'Salvar Conta'}
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
