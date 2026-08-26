'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from './Button';
import { Input } from './Input';
import { apiClient } from '@/lib/api';

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export const LoginForm: React.FC = () => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiClient.login(data.email, data.password);

      // Save tokens
      localStorage.setItem('access_token', response.access_token);
      localStorage.setItem('refresh_token', response.refresh_token);
      localStorage.setItem('user', JSON.stringify(response.user));

      // Redirect to dashboard
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erro ao fazer login');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-md space-y-4">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
        Bem-vindo de volta!
      </h2>

      {error && (
        <div className="rounded-lg bg-danger-50 p-4 text-sm text-danger-600 dark:bg-danger-900/20 dark:text-danger-400">
          {error}
        </div>
      )}

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

      <Button
        type="submit"
        loading={isLoading}
        className="w-full"
      >
        Entrar
      </Button>

      <p className="text-center text-sm text-gray-600 dark:text-gray-400">
        Não tem conta?{' '}
        <a
          href="/register"
          className="font-medium text-primary-600 hover:text-primary-700"
        >
          Criar conta
        </a>
      </p>
    </form>
  );
};
