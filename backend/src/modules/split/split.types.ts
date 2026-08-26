import { SplitMode } from './entities/split-rule.entity';

/**
 * Tipos do painel de divisão Bruno × Giovanna (item 15 do escopo).
 *
 * Todos os valores monetários são números já convertidos com `Number()` — as
 * colunas `decimal` do PostgreSQL chegam como string no driver `pg` e somá-las
 * cruas produziria concatenação.
 *
 * Percentuais são expressos de 0 a 100 (e não de 0 a 1) porque vão direto para
 * a tela.
 */

/** Intervalo efetivamente considerado, devolvido junto de todo resultado. */
export interface SplitPeriodInfo {
  /** Rótulo pedido pelo usuário (`THIS_MONTH`, `LAST_MONTH`, …). */
  period: string;
  start: Date;
  end: Date;
}

/** Quanto um responsável pagou no período. */
export interface ResponsibleShare {
  responsible: string;
  /** Total efetivamente desembolsado por ele no período. */
  paid: number;
  /** Quantidade de lançamentos. */
  count: number;
  /** Participação dele no total da casa, de 0 a 100. */
  sharePercent: number;
}

/** Quem pagou o quê dentro de uma categoria. */
export interface CategorySplit {
  category: string;
  total: number;
  byResponsible: {
    responsible: string;
    paid: number;
    /** Participação dentro da categoria, de 0 a 100. */
    sharePercent: number;
  }[];
}

/**
 * Diferença entre os dois maiores pagadores.
 *
 * `null` quando há menos de dois responsáveis com despesas no período — sem
 * dois pagadores não existe "diferença" a informar.
 */
export interface SplitDifference {
  /** Quem desembolsou mais. */
  paidMore: string;
  /** Quem desembolsou menos. */
  paidLess: string;
  /** Diferença absoluta entre os dois. */
  amount: number;
  /** A diferença em pontos percentuais de participação. */
  percentPoints: number;
}

/** Resposta de `GET /split/summary`. */
export interface SplitSummary extends SplitPeriodInfo {
  /** Total desembolsado pela casa no período. */
  totalPaid: number;
  /** Quantidade total de lançamentos considerados. */
  totalCount: number;
  participants: ResponsibleShare[];
  difference: SplitDifference | null;
  byCategory: CategorySplit[];
  /** Avisos sobre ausência de dados (regra 27: nunca inventar informação). */
  warnings: string[];
}

/** Situação de um responsável no acerto de contas. */
export interface SettlementEntry {
  responsible: string;
  /** O que ele efetivamente pagou no período. */
  paid: number;
  /** Percentual que a regra vigente atribui a ele, de 0 a 100. */
  targetPercent: number;
  /** O que ele deveria ter pagado segundo a regra. */
  shouldHavePaid: number;
  /** `paid - shouldHavePaid`. Positivo: pagou a mais. Negativo: pagou a menos. */
  balance: number;
  /** Leitura pronta do saldo. */
  status: 'RECEBE' | 'PAGA' | 'QUITADO';
}

/** Transferência sugerida para zerar o acerto. */
export interface SettlementTransfer {
  from: string;
  to: string;
  amount: number;
}

/** Resposta de `GET /split/settlement`. */
export interface Settlement extends SplitPeriodInfo {
  /** Modo configurado na regra da família. */
  configuredMode: SplitMode;
  /**
   * Modo REALMENTE aplicado no cálculo.
   *
   * Difere de `configuredMode` quando faltam dados — por exemplo, rateio
   * proporcional à renda sem nenhuma receita recorrente cadastrada. A regra 27
   * do projeto exige deixar isso explícito em vez de cair em 50/50 em silêncio.
   */
  appliedMode: SplitMode;
  /** Frase em português explicando o critério efetivamente usado. */
  criteria: string;
  /** `true` quando `appliedMode !== configuredMode`. */
  fallbackApplied: boolean;
  totalPaid: number;
  entries: SettlementEntry[];
  transfers: SettlementTransfer[];
  /** Renda recorrente mensal por responsável usada no rateio proporcional. */
  incomeBasis: { responsible: string; monthlyAmount: number }[];
  /** Avisos sobre dados ausentes ou parciais. */
  warnings: string[];
}

/** Resposta de `GET /split/rule` e `PUT /split/rule`. */
export interface SplitRuleView {
  mode: SplitMode;
  customPercentages: Record<string, number> | null;
  notes: string | null;
  /** `true` quando a família ainda não salvou nenhuma regra (padrão EQUAL). */
  isDefault: boolean;
  updatedAt: Date | null;
}
