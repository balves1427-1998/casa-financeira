'use client';

import { ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface LayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: LayoutProps) {
  const { isLoading, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Carregando...</p>
        </div>
      </div>
    );
  }

  const navigationItems = [
    { label: 'Dashboard', href: '/dashboard', icon: '📊' },
    { label: 'Despesas', href: '/despesas', icon: '💸' },
    { label: 'Receitas', href: '/receitas', icon: '💰' },
    { label: 'Contas', href: '/contas', icon: '🏦' },
    { label: 'Categorias', href: '/categories', icon: '📂' },
    { label: 'Cartões', href: '/cards', icon: '💳' },
    { label: 'Planejado', href: '/planned', icon: '📋' },
    { label: 'Metas', href: '/metas', icon: '🎯' },
    { label: 'Divisão', href: '/divisao', icon: '⚖️' },
    { label: 'Fluxo de Caixa', href: '/cash-flow', icon: '📈' },
    { label: 'Relatórios', href: '/relatorios', icon: '📄' },
    { label: 'Inteligência Financeira', href: '/ai', icon: '🤖' },
    { label: 'Família', href: '/familia', icon: '👨‍👩‍👧' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 z-40 h-screen w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
        {/* Logo */}
        <div className="h-16 flex items-center justify-center border-b border-gray-200 dark:border-gray-700">
          <h1 className="text-xl font-bold text-indigo-600 dark:text-indigo-400">
            💼 Casa Financeira
          </h1>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-2">
          {navigationItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center space-x-3 px-4 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <span className="text-lg">{item.icon}</span>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {item.label}
              </span>
            </Link>
          ))}
        </nav>

        {/* Logout Button */}
        <div className="absolute bottom-4 left-4 right-4">
          <button
            onClick={handleLogout}
            className="w-full px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
          >
            Sair
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-64 p-8">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
