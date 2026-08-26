/**
 * Tipos do Relatório Mensal (item 28 do escopo).
 *
 * Espelham `backend/src/modules/reports/reports.types.ts` e
 * `backend/src/modules/reports/dtos/report.dto.ts`.
 *
 * DIFERENÇA PROPOSITAL EM RELAÇÃO AO BACKEND: tudo que lá é `Date` aqui é
 * `string`. O que trafega é JSON, e o axios não reidrata datas — tipar como
 * `Date` mentiria sobre o valor em runtime. `formatDateBR` aceita `string`.
 *
 * Percentuais chegam de 0 a 100 (e não de 0 a 1) — vão direto para a tela.
 *
 * REGRA 27 DO PROJETO: campos que dependem de dados inexistentes chegam `null`,
 * nunca zero. "Variação desconhecida" e "variação de 0%" são coisas diferentes,
 * e a tela precisa distinguir as duas.
 */

/** Formatos de exportação suportados. */
export type ReportFormat = 'pdf' | 'xlsx' | 'csv';

/** Período coberto pelo relatório. */
export interface ReportPeriod {
  /** 1 a 12. */
  month: number;
  year: number;
  /** Rótulo em português: "Agosto de 2026". */
  label: string;
  start: string;
  end: string;
  /** Dias corridos do mês. */
  days: number;
}

/**
 * Variação de um número entre o mês do relatório e o mês anterior.
 *
 * `percent` é `null` quando o mês anterior foi zero: não existe variação
 * percentual sobre uma base zero. A tela mostra "sem base", nunca 100%.
 */
export interface Variation {
  current: number;
  previous: number;
  /** `current - previous`. */
  absolute: number;
  /** `(absolute / |previous|) * 100`, ou `null` sem base de comparação. */
  percent: number | null;
  direction: 'up' | 'down' | 'stable';
}

/** Indicadores principais do mês. */
export interface ReportOverview {
  totalIncome: number;
  totalExpenses: number;
  /** Receitas − despesas do mês (resultado do mês, não saldo em conta). */
  balance: number;
  incomeCount: number;
  expenseCount: number;
  transactionCount: number;
  averageDailyExpense: number;
  /** Percentual da receita que sobrou. `null` quando não houve receita. */
  savingsRate: number | null;
  /** Saldo consolidado das contas da família HOJE (não é do mês fechado). */
  currentBalance: number;
  /** Maior despesa individual do mês. `null` sem despesas. */
  highestExpense: number | null;
  /** Menor despesa individual do mês. `null` sem despesas. */
  lowestExpense: number | null;
}

/** Uma linha de "Gastos por categoria", já comparada com o mês anterior. */
export interface CategoryLine {
  category: string;
  total: number;
  count: number;
  average: number;
  /** Participação da categoria no total do mês, de 0 a 100. */
  share: number;
  previousTotal: number;
  variationAbsolute: number;
  variationPercent: number | null;
}

/** Uma linha de "Gastos por responsável", já comparada com o mês anterior. */
export interface ResponsibleLine {
  responsible: string;
  total: number;
  count: number;
  /** Participação do responsável no total do mês, de 0 a 100. */
  share: number;
  previousTotal: number;
  variationAbsolute: number;
  variationPercent: number | null;
}

/** Conta planejada do mês (paga, pendente, vencida ou cancelada). */
export interface PlannedAccountLine {
  id: string;
  description: string;
  category: string | null;
  amount: number;
  dueDate: string;
  responsible: string;
  status: string;
  paymentDate: string | null;
}

/** Agrupamento de contas planejadas por situação. */
export interface PlannedAccountsGroup {
  count: number;
  total: number;
  items: PlannedAccountLine[];
}

/** Seção "Contas pagas / Contas pendentes". */
export interface PlannedAccountsSection {
  paid: PlannedAccountsGroup;
  pending: PlannedAccountsGroup;
  overdue: PlannedAccountsGroup;
  cancelled: PlannedAccountsGroup;
}

/** Situação de um cartão de crédito da família. */
export interface CreditCardLine {
  cardId: string;
  name: string;
  bank: string;
  limit: number;
  currentBalance: number;
  availableLimit: number;
  /** Limite utilizado, de 0 a 100. */
  utilizationPercent: number;
  closingDay: number;
  dueDay: number;
}

/** Seção "Gastos no cartão". */
export interface CreditCardSection {
  /** Despesas do mês pagas com cartão de crédito. */
  totalSpent: number;
  transactionCount: number;
  /** Participação do cartão no total de despesas do mês, de 0 a 100. */
  shareOfExpenses: number;
  cards: CreditCardLine[];
  totalLimit: number;
  totalUsedLimit: number;
  totalAvailableLimit: number;
}

/** Uma compra parcelada identificada no mês. */
export interface InstallmentLine {
  description: string;
  establishment: string | null;
  category: string;
  responsible: string;
  date: string;
  /** Valor da parcela lançada no mês. */
  installmentAmount: number;
  totalInstallments: number;
  currentInstallment: number;
  remainingInstallments: number;
  /** `installmentAmount × parcelas restantes` — impacto nos próximos meses. */
  remainingAmount: number;
}

/** Seção "Parcelamentos". */
export interface InstallmentsSection {
  count: number;
  totalInMonth: number;
  /** Somatório do que ainda vai pesar nos meses seguintes. */
  totalRemaining: number;
  items: InstallmentLine[];
}

/** Um mês da "Evolução patrimonial". */
export interface NetWorthPoint {
  /** `YYYY-MM`. */
  month: string;
  /** Rótulo em português: "ago/2026". */
  label: string;
  income: number;
  expenses: number;
  /** `income - expenses` do mês. */
  net: number;
  /** Soma acumulada dos resultados desde o início da janela de 12 meses. */
  accumulated: number;
}

/** Seção "Evolução patrimonial". */
export interface NetWorthSection {
  points: NetWorthPoint[];
  /** Resultado acumulado ao fim da janela. */
  accumulatedResult: number;
  /** Saldo consolidado das contas hoje — referência, não é histórico. */
  currentBalance: number;
  /** Quantos dos 12 meses da janela têm algum lançamento. */
  monthsWithData: number;
}

/** Uma meta financeira no relatório. */
export interface GoalLine {
  id: string;
  name: string;
  type: string;
  targetAmount: number;
  currentAmount: number;
  remainingAmount: number;
  /** 0 a 100. `null` quando o objetivo é zero. */
  progressPercent: number | null;
  deadline: string | null;
  status: string;
}

/** Seção "Metas". */
export interface GoalsSection {
  totalGoals: number;
  activeGoals: number;
  completedGoals: number;
  totalTargetAmount: number;
  totalCurrentAmount: number;
  totalRemainingAmount: number;
  overallProgressPercent: number | null;
  items: GoalLine[];
}

/** Situação de um orçamento de categoria no mês. */
export interface BudgetLine {
  categoryId: string;
  name: string;
  monthlyBudget: number;
  spent: number;
  remaining: number;
  /** Consumo do orçamento, de 0 a 100. */
  percent: number;
  status: 'ok' | 'warning' | 'exceeded';
}

/** Seção "Orçamento" — base dos alertas amarelo (80%) e vermelho (100%). */
export interface BudgetsSection {
  /** `false` quando o relatório não é do mês corrente (ver `notice`). */
  available: boolean;
  notice: string | null;
  items: BudgetLine[];
}

/** Tipos de alerta emitidos pelo relatório. */
export type AlertType =
  | 'orcamento'
  | 'conta_vencida'
  | 'conta_a_vencer'
  | 'cartao'
  | 'saldo'
  | 'meta'
  | 'gasto_atipico';

export type AlertSeverity = 'info' | 'warning' | 'critical';

/** Um alerta do relatório. */
export interface AlertLine {
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
}

/** Uma sugestão de economia (vinda das recomendações reais da IA). */
export interface SuggestionLine {
  title: string;
  description: string;
  /** Economia estimada pela regra que gerou a recomendação. */
  potentialSavings: number | null;
  priority: string;
}

/** Quem pagou o quê — divisão Bruno × Giovanna. */
export interface SplitSection {
  /** `false` quando o período do relatório não é comparável pelo SplitService. */
  available: boolean;
  notice: string | null;
  totalPaid: number;
  participants: {
    responsible: string;
    paid: number;
    sharePercent: number;
  }[];
  difference: {
    paidMore: string;
    paidLess: string;
    amount: number;
  } | null;
  /** Critério de rateio efetivamente aplicado (50/50, proporcional…). */
  criteria: string | null;
  /** Acerto sugerido entre os responsáveis. */
  transfers: { from: string; to: string; amount: number }[];
}

/** Seção "Comparação com o mês anterior". */
export interface ComparisonSection {
  previousLabel: string;
  /** `true` quando o mês anterior também não tem lançamentos. */
  previousHasData: boolean;
  income: Variation;
  expenses: Variation;
  balance: Variation;
  creditCard: Variation;
  /** Categorias que mais subiram, já ordenadas por variação absoluta. */
  biggestIncreases: CategoryLine[];
  /** Categorias que mais caíram. */
  biggestDecreases: CategoryLine[];
}

/** Um lançamento do período. */
export interface TransactionLine {
  date: string;
  kind: 'receita' | 'despesa';
  description: string;
  establishment: string | null;
  category: string;
  responsible: string;
  paymentMethod: string | null;
  amount: number;
}

/** Estrutura consolidada do Relatório Mensal. */
export interface MonthlyReport {
  familyId: string;
  generatedAt: string;
  period: ReportPeriod;
  /** `false` quando não há NENHUM lançamento no mês. */
  hasData: boolean;
  /**
   * Avisos em português sobre o que não pôde ser calculado por falta de dados.
   * A regra 27 do projeto exige mostrá-los, e não preencher com exemplos.
   */
  notices: string[];
  overview: ReportOverview;
  byCategory: CategoryLine[];
  byResponsible: ResponsibleLine[];
  split: SplitSection;
  plannedAccounts: PlannedAccountsSection;
  creditCards: CreditCardSection;
  installments: InstallmentsSection;
  netWorth: NetWorthSection;
  goals: GoalsSection;
  budgets: BudgetsSection;
  alerts: AlertLine[];
  comparison: ComparisonSection;
  suggestions: SuggestionLine[];
  transactions: TransactionLine[];
}

// ==================== histórico de relatórios gerados ====================

/** Um arquivo já exportado e gravado para um relatório do histórico. */
export interface ReportFileDto {
  format: ReportFormat;
  fileName: string;
  /** Tamanho em bytes, lido do disco pelo backend. */
  size: number;
  /** Caminho relativo — a tela baixa via `apiClient`, não por link direto. */
  downloadUrl: string;
}

/**
 * Um relatório no histórico (`GET /reports`).
 * Espelha `ReportSummaryDto` do backend, sem o `payload`.
 */
export interface MonthlyReportSummaryDto {
  id: string;
  reportType: string;
  status: 'pending' | 'generating' | 'ready' | 'failed' | string;
  month: number;
  year: number;
  /** "Agosto de 2026". */
  periodLabel: string;
  formats: ReportFormat[];
  files: ReportFileDto[];
  metadata?: Record<string, unknown>;
  errorMessage?: string;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Resposta paginada de `GET /reports`. */
export interface ListMonthlyReportsDto {
  reports: MonthlyReportSummaryDto[];
  total: number;
  limit: number;
  offset: number;
}

/** Corpo de `POST /reports/monthly`. */
export interface GenerateMonthlyReportDto {
  month?: number;
  year?: number;
  /** Omitido, o backend gera os três formatos. */
  formats?: ReportFormat[];
}

/** Detalhe de `GET /reports/:id` — o resumo mais o relatório consolidado. */
export type MonthlyReportDetailDto = MonthlyReportSummaryDto & {
  report: MonthlyReport | null;
};

// ==================== rótulos e opções da tela ====================

export const REPORT_FORMATS: ReportFormat[] = ['pdf', 'xlsx', 'csv'];

export const REPORT_FORMAT_LABELS: Record<ReportFormat, string> = {
  pdf: 'PDF',
  xlsx: 'Excel',
  csv: 'CSV',
};

export const REPORT_STATUS_LABELS: Record<string, string> = {
  pending: 'Na fila',
  generating: 'Gerando',
  ready: 'Pronto',
  failed: 'Falhou',
};

export const ALERT_SEVERITY_LABELS: Record<AlertSeverity, string> = {
  info: 'Informação',
  warning: 'Atenção',
  critical: 'Crítico',
};

export const BUDGET_STATUS_LABELS: Record<BudgetLine['status'], string> = {
  ok: 'Dentro do orçamento',
  warning: 'Acima de 80%',
  exceeded: 'Orçamento estourado',
};

/** Situação de uma conta planejada, como o backend grava. */
export const PLANNED_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Previsto',
  PAID: 'Pago',
  OVERDUE: 'Vencido',
  CANCELLED: 'Cancelado',
  pending: 'Previsto',
  paid: 'Pago',
  overdue: 'Vencido',
  cancelled: 'Cancelado',
};

export const MONTH_LABELS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

export const MONTH_OPTIONS: Array<{ value: number; label: string }> =
  MONTH_LABELS.map((label, index) => ({ value: index + 1, label }));

/** Rótulo curto do mês: "fevereiro/2026". */
export function formatMonthLabel(month: number, year: number): string {
  const nome = MONTH_LABELS[month - 1];
  return nome ? `${nome.toLowerCase()}/${year}` : `${month}/${year}`;
}

/** Nomes de responsáveis vêm em minúsculas do banco. */
export function formatResponsibleName(responsible: string): string {
  if (!responsible) return '—';
  return responsible.charAt(0).toUpperCase() + responsible.slice(1);
}

/** Tamanho de arquivo legível — os tamanhos vêm em bytes. */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}
