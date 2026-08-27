'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Página inicial do site (`/`).
 *
 * Sem ela o App Router devolvia 404 na raiz — quem digitava o domínio sem
 * caminho não chegava a lugar nenhum. Aqui não há conteúdo próprio: a raiz
 * apenas encaminha para o painel (se já houver sessão) ou para o login.
 *
 * O redirecionamento roda no cliente porque a sessão vive no `localStorage`,
 * que não existe durante a renderização no servidor.
 */
export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    let autenticado = false;

    try {
      autenticado = Boolean(localStorage.getItem('access_token'));
    } catch {
      // Navegador com armazenamento bloqueado: trata como sessão ausente.
      autenticado = false;
    }

    router.replace(autenticado ? '/dashboard' : '/login');
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-center">
        <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-indigo-600" />
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
          💼 Casa Financeira
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Redirecionando…
        </p>
      </div>
    </main>
  );
}
