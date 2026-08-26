/**
 * Tipos compartilhados da camada de dados financeiros.
 *
 * Tudo aqui é agregado no escopo da FAMÍLIA: as despesas e receitas pertencem a
 * usuários individuais, mas a leitura financeira do sistema é sempre da casa
 * inteira (Bruno + Giovanna).
 */

/** Ponto de uma série temporal mensal (`month` no formato `YYYY-MM`). */
export interface MonthlyPoint {
  month: string;
  total: number;
  count: number;
}

/** Ponto de uma série temporal diária (`date` no formato `YYYY-MM-DD`). */
export interface DailyPoint {
  date: string;
  total: number;
  count: number;
}

export interface CategoryAggregate {
  category: string;
  total: number;
  count: number;
  average: number;
  /** Participação da categoria no total do período (0–1). */
  share: number;
}

export interface ResponsibleAggregate {
  responsible: string;
  total: number;
  count: number;
  share: number;
}

export interface DayOfWeekAggregate {
  /** 0 = domingo … 6 = sábado */
  dayOfWeek: number;
  label: string;
  total: number;
  count: number;
  average: number;
}

/**
 * Estatísticas descritivas de uma categoria, usadas para detectar anomalias
 * por desvio padrão (z-score).
 */
export interface CategoryStatistics {
  category: string;
  mean: number;
  stdDev: number;
  min: number;
  max: number;
  count: number;
}

export interface PeriodRange {
  start: Date;
  end: Date;
}

export interface FinancialSummary {
  totalExpenses: number;
  totalIncomes: number;
  balance: number;
  expenseCount: number;
  incomeCount: number;
  averageDailyExpense: number;
  days: number;
}

export interface RecurringExpense {
  description: string;
  category: string;
  averageAmount: number;
  occurrences: number;
  /** Intervalo médio entre ocorrências, em dias. */
  averageIntervalDays: number;
  lastDate: Date;
}
