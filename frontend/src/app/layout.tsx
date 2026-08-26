import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

/**
 * Layout raiz da aplicação.
 *
 * O App Router do Next.js exige um layout na raiz de `src/app` — sem ele o
 * build falha com "doesn't have a root layout". É também aqui que o
 * `globals.css` (diretivas do Tailwind) é carregado uma única vez para toda a
 * aplicação.
 */
export const metadata: Metadata = {
  title: 'Casa Financeira',
  description:
    'Controle financeiro doméstico com inteligência: fluxo de caixa, previsões e recomendações.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased dark:bg-gray-900 dark:text-gray-100">
        {children}
      </body>
    </html>
  );
}
