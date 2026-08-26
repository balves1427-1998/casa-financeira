/**
 * Tipos do painel de Divisão Bruno × Giovanna (`split`).
 *
 * Espelham o backend em:
 * backend/src/modules/split/split.types.ts
 * backend/src/modules/split/dtos/split-rule.dto.ts
 * backend/src/modules/split/entities/split-rule.entity.ts
 *
 * Percentuais vêm de 0 a 100 (e não de 0 a 1) — vão direto para a tela.
 */

/** Critério de rateio das despesas compartilhadas. */
export enum SplitMode {
  EQUAL = 'EQUAL',
  INCOME_PROPORTIONAL = 'INCOME_PROPORTIONAL',
  CUSTOM = 'CUSTOM',
}

export const SPLIT_MODE_LABELS: Record<string, string> = {
  [SplitMode.EQUAL]: 'Igualitário (50/50)',
  [SplitMode.INCOME_PROPORTIONAL]: 'Proporcional à renda',
  [SplitMode.CUSTOM]: 'Percentuais personalizados',
};

export const SPLIT_MODE_DESCRIPTIONS: Record<string, string> = {
  [SplitMode.EQUAL]:
    'Cada responsável arca com a mesma fatia das despesas da casa (1/N).',
  [SplitMode.INCOME_PROPORTIONAL]:
    'Cada um arca proporcionalmente à sua renda mensal recorrente cadastrada em Receitas.',
  [SplitMode.CUSTOM]:
    'Você define manualmente o percentual de cada responsável. A soma precisa dar 100.',
};

export const SPLIT_MODE_OPTIONS: Array<{ value: SplitMode; label: string }> =
  Object.values(SplitMode).map(value => ({
    value,
    label: SPLIT_MODE_LABELS[value],
  }));

/** Períodos aceitos pelo query param `period` das rotas de divisão. */
export enum SplitPeriod {
  THIS_MONTH = 'THIS_MONTH',
  LAST_MONTH = 'LAST_MONTH',
  LAST_3_MONTHS = 'LAST_3_MONTHS',
  LAST_6_MONTHS = 'LAST_6_MONTHS',
  LAST_12_MONTHS = 'LAST_12_MONTHS',
  THIS_YEAR = 'THIS_YEAR',
}

export const SPLIT_PERIOD_LABELS: Record<string, string> = {
  [SplitPeriod.THIS_MONTH]: 'Mês atual',
  [SplitPeriod.LAST_MONTH]: 'Mês anterior',
  [SplitPeriod.LAST_3_MONTHS]: 'Últimos 3 meses',
  [SplitPeriod.LAST_6_MONTHS]: 'Últimos 6 meses',
  [SplitPeriod.LAST_12_MONTHS]: 'Últimos 12 meses',
  [SplitPeriod.THIS_YEAR]: 'Ano atual',
};

export const SPLIT_PERIOD_OPTIONS: Array<{ value: SplitPeriod; label: string }> =
  Object.values(SplitPeriod).map(value => ({
    value,
    label: SPLIT_PERIOD_LABELS[value],
  }));

/** Intervalo efetivamente considerado, devolvido junto de todo resultado. */
export interface SplitPeriodInfoDto {
  period: string;
  start: Date | string;
  end: Date | string;
}

/** Quanto um responsável pagou no período. */
export interface ResponsibleShareDto {
  responsible: string;
  paid: number;
  count: number;
  /** Participação no total da casa, de 0 a 100. */
  sharePercent: number;
}

/** Quem pagou o quê dentro de uma categoria. */
export interface CategorySplitDto {
  category: string;
  total: number;
  byResponsible: Array<{
    responsible: string;
    paid: number;
    /** Participação dentro da categoria, de 0 a 100. */
    sharePercent: number;
  }>;
}

/**
 * Diferença entre os dois maiores pagadores.
 * `null` quando há menos de dois responsáveis com despesas no período.
 */
export interface SplitDifferenceDto {
  paidMore: string;
  paidLess: string;
  amount: number;
  /** Diferença em pontos percentuais de participação. */
  percentPoints: number;
}

/** Resposta de `GET /split/summary`. */
export interface SplitSummaryDto extends SplitPeriodInfoDto {
  totalPaid: number;
  totalCount: number;
  participants: ResponsibleShareDto[];
  difference: SplitDifferenceDto | null;
  byCategory: CategorySplitDto[];
  /** Avisos sobre ausência de dados (regra 27: nunca inventar informação). */
  warnings: string[];
}

/** Situação de um responsável no acerto de contas. */
export interface SettlementEntryDto {
  responsible: string;
  paid: number;
  /** Percentual que a regra vigente atribui a ele, de 0 a 100. */
  targetPercent: number;
  shouldHavePaid: number;
  /** `paid - shouldHavePaid`. Positivo: pagou a mais. */
  balance: number;
  status: 'RECEBE' | 'PAGA' | 'QUITADO';
}

/** Transferência sugerida para zerar o acerto. */
export interface SettlementTransferDto {
  from: string;
  to: string;
  amount: number;
}

/** Resposta de `GET /split/settlement`. */
export interface SettlementDto extends SplitPeriodInfoDto {
  /** Modo configurado na regra da família. */
  configuredMode: SplitMode | string;
  /**
   * Modo REALMENTE aplicado. Difere de `configuredMode` quando faltam dados —
   * por exemplo, rateio proporcional sem nenhuma receita recorrente cadastrada.
   * A tela PRECISA avisar isso ao usuário, nunca esconder.
   */
  appliedMode: SplitMode | string;
  /** Frase em português explicando o critério efetivamente usado. */
  criteria: string;
  /** `true` quando `appliedMode !== configuredMode`. */
  fallbackApplied: boolean;
  totalPaid: number;
  entries: SettlementEntryDto[];
  transfers: SettlementTransferDto[];
  /** Renda recorrente mensal por responsável usada no rateio proporcional. */
  incomeBasis: Array<{ responsible: string; monthlyAmount: number }>;
  warnings: string[];
}

/** Resposta de `GET /split/rule` e `PUT /split/rule`. */
export interface SplitRuleDto {
  mode: SplitMode | string;
  customPercentages: Record<string, number> | null;
  notes: string | null;
  /** `true` quando a família ainda não salvou nenhuma regra (padrão EQUAL). */
  isDefault: boolean;
  updatedAt: Date | string | null;
}

/** Corpo de `PUT /split/rule`. */
export interface SetSplitRuleDto {
  mode: SplitMode;
  /** Obrigatório no modo CUSTOM. Ex.: `{ bruno: 70, giovanna: 30 }`. */
  customPercentages?: Record<string, number>;
  notes?: string;
}

/** Rótulos legíveis dos status do acerto de contas. */
export const SETTLEMENT_STATUS_LABELS: Record<string, string> = {
  RECEBE: 'Tem a receber',
  PAGA: 'Precisa pagar',
  QUITADO: 'Quitado',
};

/** Deixa o identificador do responsável apresentável (`bruno` → `Bruno`). */
export function formatResponsible(responsible: string): string {
  if (!responsible) return '—';
  return responsible
    .split(/[\s_-]+/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}
