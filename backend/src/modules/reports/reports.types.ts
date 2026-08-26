/**
 * Tipos do Relatório Mensal (item 28 do escopo do projeto).
 *
 * Todos os valores monetários já são `number` — as colunas `decimal` do
 * PostgreSQL chegam como STRING no driver `pg` e são convertidas com `Number()`
 * antes de qualquer conta.
 *
 * Percentuais são expressos de 0 a 100 (e não de 0 a 1), porque vão direto para
 * a tela e para os arquivos exportados.
 *
 * REGRA 27 DO PROJETO: campos que dependem de dados inexistentes são `null` — e
 * nunca zero ou um exemplo inventado. "Variação desconhecida" e "variação de
 * 0%" são coisas diferentes, e o relatório precisa distinguir as duas.
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
  start: Date;
  end: Date;
  /** Dias corridos do mês. */
  days: number;
}

/**
 * Variação de um número entre o mês do relatório e o mês anterior.
 *
 * `percent` é `null` quando o mês anterior foi zero: não existe variação
 * percentual sobre uma base zero, e devolver `100` ou `0` seria inventar.
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
  dueDate: Date;
  responsible: string;
  status: string;
  paymentDate: Date | null;
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
  date: Date;
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
  deadline: Date | null;
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

/** Um alerta do relatório. */
export interface AlertLine {
  type:
    | 'orcamento'
    | 'conta_vencida'
    | 'conta_a_vencer'
    | 'cartao'
    | 'saldo'
    | 'meta'
    | 'gasto_atipico';
  severity: 'info' | 'warning' | 'critical';
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

/** Um lançamento do período (usado no CSV e na aba "Lançamentos" do XLSX). */
export interface TransactionLine {
  date: Date;
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
  generatedAt: Date;
  period: ReportPeriod;
  /** `false` quando não há NENHUM lançamento no mês. */
  hasData: boolean;
  /**
   * Avisos em português sobre o que não pôde ser calculado por falta de dados.
   * A regra 27 do projeto exige dizer isso claramente em vez de preencher com
   * exemplos.
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

/** Arquivo realmente gravado em disco por uma exportação. */
export interface GeneratedFile {
  format: ReportFormat;
  fileName: string;
  /** Caminho absoluto no disco. */
  filePath: string;
  /** Tamanho REAL, lido com `fs.statSync`. */
  size: number;
  mimeType: string;
}
