/**
 * Tipos do módulo de Categorias (`categories`).
 *
 * Espelham os DTOs reais do backend em:
 * backend/src/modules/categories/dtos/create-category.dto.ts
 * backend/src/modules/categories/entities/category.entity.ts
 */

/** Tipos aceitos pelo backend (`enum CategoryType`). */
export enum CategoryType {
  INCOME = 'income',
  EXPENSE = 'expense',
}

export const CATEGORY_TYPE_LABELS: Record<string, string> = {
  [CategoryType.INCOME]: 'Receita',
  [CategoryType.EXPENSE]: 'Despesa',
};

export const CATEGORY_TYPE_OPTIONS: Array<{ value: CategoryType; label: string }> =
  Object.values(CategoryType).map(value => ({
    value,
    label: CATEGORY_TYPE_LABELS[value],
  }));

/**
 * O backend valida a cor com `@Matches(/^#[0-9A-F]{6}$/i)`.
 * Qualquer outro formato ("azul", "#FFF", "rgb(...)") devolve 400.
 */
export const CATEGORY_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

/** Paleta de atalho — os mesmos tons usados nos gráficos do sistema. */
export const CATEGORY_COLOR_SUGGESTIONS = [
  '#D03B3B',
  '#EB6834',
  '#FAB219',
  '#3F9E6B',
  '#2A78D6',
  '#A05FD1',
  '#0E9AA7',
  '#8C6D4A',
  '#C2417F',
  '#6B7280',
];

/**
 * Corpo de `POST /categories`.
 *
 * ATENÇÃO: o `ValidationPipe` global roda com `whitelist` +
 * `forbidNonWhitelisted`. Enviar qualquer chave fora desta lista devolve 400.
 */
export interface CreateCategoryDto {
  name: string;
  type: CategoryType;
  description?: string | null;
  parentCategoryId?: string;
  color?: string | null;
  icon?: string | null;
  monthlyBudget?: number | null;
  isRecurring?: boolean;
  displayOrder?: number | null;
}

/**
 * Corpo de `PUT /categories/:id`.
 *
 * O `UpdateCategoryDto` do backend NÃO aceita `type` nem `parentCategoryId`:
 * o tipo da categoria e o vínculo com a categoria-mãe são definidos apenas na
 * criação. Enviá-los devolve 400.
 */
export interface UpdateCategoryDto {
  name?: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  monthlyBudget?: number | null;
  isRecurring?: boolean;
  displayOrder?: number | null;
}

/**
 * Converte com segurança um valor monetário vindo da API.
 * Colunas `decimal` do PostgreSQL chegam como string pelo driver `pg`
 * (`"1500.00"`), e somar/formatar string produz resultado errado.
 */
export function toCategoryAmount(
  value: number | string | null | undefined,
): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
