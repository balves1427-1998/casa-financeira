import { LoginForm } from '@/components/LoginForm';

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-primary-50 to-blue-50 px-4 dark:from-gray-900 dark:to-gray-800">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-4xl font-bold text-gray-900 dark:text-white">
            Casa Financeira
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Seu CFO da Casa
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-8 shadow-lg dark:border-gray-700 dark:bg-gray-800">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
