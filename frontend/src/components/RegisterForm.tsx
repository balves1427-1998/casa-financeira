'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from './Button';
import { Input } from './Input';
import { apiClient } from '@/lib/api';

const registerSchema = z.object({
  name: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres'),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
  confirmPassword: z.string().min(8, 'Confirmação de senha inválida'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Senhas não conferem',
  path: ['confirmPassword'],
});

type RegisterFormData = z.infer<typeof registerSchema>;

export const RegisterForm: React.FC = () => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterFormData) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiClient.register(
        data.name,
        data.email,
        data.password,
      );

      // Save tokens
      localStorage.setItem('access_token', response.access_token);
      localStorage.setItem('refresh_token', response.refresh_token);
      localStorage.setItem('user', JSON.stringify(response.user));

      // Redirect to dashboard
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erro ao criar conta');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-md space-y-4">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
        Criar Conta
      </h2>

      {error && (
        <div className="rounded-lg bg-danger-50 p-4 text-sm text-danger-600 dark:bg-danger-900/20 dark:text-danger-400">
          {error}
        </div>
      )}

      <Input
        label="Nome Completo"
        placeholder="Seu nome"
        {...register('name')}
        error={errors.name?.message}
      />

      <Input
        label="Email"
        placeholder="seu-email@example.com"
        {...register('email')}
        error={errors.email?.message}
      />

      <Input
        label="Senha"
        type="password"
        placeholder="••••••••"
        {...register('password')}
        error={errors.password?.message}
      />

      <Input
        label="Confirmar Senha"
        type="password"
        placeholder="••••••••"
        {...register('confirmPassword')}
        error={errors.confirmPassword?.message}
      />

      <Button
        type="submit"
        loading={isLoading}
        className="w-full"
      >
        Criar Conta
      </Button>

      <p className="text-center text-sm text-gray-600 dark:text-gray-400">
        Já tem conta?{' '}
        <a
          href="/login"
          className="font-medium text-primary-600 hover:text-primary-700"
        >
          Entrar
        </a>
      </p>
    </form>
  );
};
