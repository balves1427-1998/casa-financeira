'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const creditCardSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  bank: z.string().min(2, 'Banco deve ter pelo menos 2 caracteres'),
  cardNumber: z.string().regex(/^\d{4}$/, 'Deve conter os últimos 4 dígitos do cartão'),
  limit: z.number().min(0, 'Limite deve ser maior ou igual a 0'),
  currentBalance: z.number().min(0, 'Saldo deve ser maior ou igual a 0'),
  closingDay: z.number().min(1).max(31, 'Dia de fechamento inválido'),
  dueDay: z.number().min(1).max(31, 'Dia de vencimento inválido'),
  status: z.enum(['active', 'inactive', 'blocked', 'expired']),
  cardType: z.string().optional(),
  expiryDate: z.string().regex(/^\d{2}\/\d{2}$/, 'Formato deve ser MM/AA').optional(),
  interestRate: z.number().min(0).max(100, 'Taxa de juros deve estar entre 0 e 100').optional(),
});

type CreditCardFormData = z.infer<typeof creditCardSchema>;

interface CreditCardFormProps {
  initialData?: any;
  isLoading?: boolean;
  onSubmit: (data: CreditCardFormData) => Promise<void>;
  onCancel?: () => void;
}

export function CreditCardForm({
  initialData,
  isLoading,
  onSubmit,
  onCancel,
}: CreditCardFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<CreditCardFormData>({
    resolver: zodResolver(creditCardSchema),
    defaultValues: initialData || {
      status: 'active',
      currentBalance: 0,
    },
  });

  useEffect(() => {
    if (initialData) {
      reset(initialData);
    }
  }, [initialData, reset]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Nome do Cartão *</label>
          <input
            type="text"
            {...register('name')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
            placeholder="Ex: Nubank"
          />
          {errors.name && <p className="text-sm text-red-500 mt-1">{errors.name.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Banco *</label>
          <input
            type="text"
            {...register('bank')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
            placeholder="Ex: Nubank"
          />
          {errors.bank && <p className="text-sm text-red-500 mt-1">{errors.bank.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Últimos 4 dígitos *</label>
          <input
            type="text"
            {...register('cardNumber')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
            placeholder="0000"
            maxLength={4}
          />
          {errors.cardNumber && <p className="text-sm text-red-500 mt-1">{errors.cardNumber.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Tipo do Cartão</label>
          <input
            type="text"
            {...register('cardType')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
            placeholder="Ex: Crédito/Débito"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Limite (R$) *</label>
          <input
            type="number"
            {...register('limit', { valueAsNumber: true })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
            placeholder="0,00"
            step="0.01"
            min="0"
          />
          {errors.limit && <p className="text-sm text-red-500 mt-1">{errors.limit.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Saldo Atual (R$)</label>
          <input
            type="number"
            {...register('currentBalance', { valueAsNumber: true })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
            placeholder="0,00"
            step="0.01"
            min="0"
          />
          {errors.currentBalance && <p className="text-sm text-red-500 mt-1">{errors.currentBalance.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Dia de Fechamento *</label>
          <input
            type="number"
            {...register('closingDay', { valueAsNumber: true })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
            placeholder="1-31"
            min="1"
            max="31"
          />
          {errors.closingDay && <p className="text-sm text-red-500 mt-1">{errors.closingDay.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Dia de Vencimento *</label>
          <input
            type="number"
            {...register('dueDay', { valueAsNumber: true })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
            placeholder="1-31"
            min="1"
            max="31"
          />
          {errors.dueDay && <p className="text-sm text-red-500 mt-1">{errors.dueDay.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Data de Validade (MM/AA)</label>
          <input
            type="text"
            {...register('expiryDate')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
            placeholder="12/25"
            maxLength={5}
          />
          {errors.expiryDate && <p className="text-sm text-red-500 mt-1">{errors.expiryDate.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Status *</label>
          <select
            {...register('status')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
          >
            <option value="active">Ativo</option>
            <option value="inactive">Inativo</option>
            <option value="blocked">Bloqueado</option>
            <option value="expired">Expirado</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Taxa de Juros (%) ao mês</label>
        <input
          type="number"
          {...register('interestRate', { valueAsNumber: true })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
          placeholder="0,00"
          step="0.01"
          min="0"
          max="100"
        />
        {errors.interestRate && <p className="text-sm text-red-500 mt-1">{errors.interestRate.message}</p>}
      </div>

      <div className="flex gap-2 pt-4">
        <button
          type="submit"
          disabled={isSubmitting || isLoading}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
        >
          {isSubmitting || isLoading ? 'Salvando...' : 'Salvar Cartão'}
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
