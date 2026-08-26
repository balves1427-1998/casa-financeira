// User Types
export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  role: 'admin' | 'user';
  createdAt: Date;
  updatedAt: Date;
}

// Account Types
export interface Account {
  id: string;
  userId: string;
  name: string;
  type: 'checking' | 'savings' | 'wallet' | 'digital' | 'credit_card';
  institution: string;
  balance: number;
  initialBalance: number;
  limit?: number;
  closingDay?: number;
  dueDay?: number;
  createdAt: Date;
  updatedAt: Date;
}

// Receitas: ver `@/types/income`.
// O antigo tipo `Receipt` foi removido junto com o módulo `receipts` do
// backend — as duas tabelas do mesmo conceito viraram `incomes`.

// Expense Types
export interface Expense {
  id: string;
  userId: string;
  accountId?: string;
  creditCardId?: string;
  description: string;
  establishment?: string;
  amount: number;
  date: Date;
  category: string;
  subcategory?: string;
  responsible: string;
  paymentMethod: 'cash' | 'debit' | 'credit' | 'transfer' | 'pix';
  isRecurring: boolean;
  frequency?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  installments?: number;
  currentInstallment?: number;
  observation?: string;
  origin: 'manual' | 'bank_statement' | 'credit_card' | 'import' | 'recurring';
  createdAt: Date;
  updatedAt: Date;
}

// Category Types
export interface Category {
  id: string;
  userId: string;
  name: string;
  icon?: string;
  color?: string;
  budget?: number;
  subcategories?: Category[];
  createdAt: Date;
  updatedAt: Date;
}

// Dashboard Types
export interface DashboardData {
  currentBalance: number;
  monthlyIncome: number;
  monthlyExpense: number;
  projectedBalance: number;
  accountsPayable: number;
  overdueAccounts: number;
  accountsDueInSevenDays: number;
  creditCardExpenses: number;
  largestExpenseCategory: string;
  averageDailyExpense: number;
}

// Import Types
export interface ImportedTransaction {
  date: Date;
  description: string;
  establishment?: string;
  amount: number;
  transactionType: 'debit' | 'credit';
  category?: string;
  responsible?: string;
  status: 'pending' | 'confirmed' | 'rejected';
}

// API Response Types
export interface ApiResponse<T> {
  data: T;
  message?: string;
  status: 'success' | 'error';
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Auth Types
export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user: User;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData extends LoginCredentials {
  name: string;
  confirmPassword: string;
}
