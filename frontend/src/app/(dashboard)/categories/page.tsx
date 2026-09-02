'use client';

import { FormEvent, useMemo, useState } from 'react';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { useCategories, type Category } from '@/hooks/useCategories';
import {
  CATEGORY_COLOR_PATTERN,
  CATEGORY_COLOR_SUGGESTIONS,
  CATEGORY_TYPE_LABELS,
  CATEGORY_TYPE_OPTIONS,
  CategoryType,
} from '@/types/category';
import { formatBRL } from '@/utils/format';
import { lerCampoMoeda, paraCampoMoeda } from '@/utils/money';

interface CategoryFormState {
  name: string;
  type: CategoryType;
  parentCategoryId: string;
  description: string;
  color: string;
  icon: string;
  monthlyBudget: string;
  isRecurring: boolean;
  displayOrder: string;
}

const emptyForm = (): CategoryFormState => ({
  name: '',
  type: CategoryType.EXPENSE,
  parentCategoryId: '',
  description: '',
  color: '',
  icon: '',
  monthlyBudget: '',
  isRecurring: false,
  displayOrder: '',
});

export default function CategoriesPage() {
  const {
    categories,
    isLoading,
    isSaving,
    error,
    createCategory,
    updateCategory,
    deleteCategory,
    createDefaults,
    clearError,
  } = useCategories();

  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');

  const [form, setForm] = useState<CategoryFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Confirmação inline de exclusão — sem `window.confirm`
  const [confirmingDeletionId, setConfirmingDeletionId] = useState<string | null>(
    null,
  );

  /** Só as categorias-mãe: as subcategorias aparecem aninhadas no cartão delas. */
  const raizes = useMemo(
    () => categories.filter(categoria => !categoria.parentCategoryId),
    [categories],
  );

  const categoriasFiltradas = useMemo(
    () =>
      filterType === 'all'
        ? raizes
        : raizes.filter(categoria => categoria.type === filterType),
    [raizes, filterType],
  );

  /** Candidatas a categoria-mãe: raízes do mesmo tipo escolhido no formulário. */
  const possiveisMaes = useMemo(
    () => raizes.filter(categoria => categoria.type === form.type),
    [raizes, form.type],
  );

  const orcamentoTotal = useMemo(
    () =>
      categories.reduce(
        (soma, categoria) => soma + (categoria.monthlyBudget || 0),
        0,
      ),
    [categories],
  );

  /** Índice id → categoria, para descrever bem a exclusão de subcategorias. */
  const porId = useMemo(() => {
    const mapa = new Map<string, Category>();
    categories.forEach(categoria => {
      mapa.set(categoria.id, categoria);
      categoria.subcategories?.forEach(sub => mapa.set(sub.id, sub));
    });
    return mapa;
  }, [categories]);

  const resetForm = () => {
    setForm(emptyForm());
    setEditingId(null);
    setValidationError(null);
  };

  const handleOpenCreate = (parentCategoryId?: string, type?: CategoryType) => {
    setForm({
      ...emptyForm(),
      parentCategoryId: parentCategoryId || '',
      type: type || CategoryType.EXPENSE,
    });
    setEditingId(null);
    setValidationError(null);
    setIsFormOpen(true);
    setFeedback(null);
  };

  const handleEdit = (categoria: Category) => {
    setEditingId(categoria.id);
    setForm({
      name: categoria.name || '',
      type: (categoria.type as CategoryType) || CategoryType.EXPENSE,
      parentCategoryId: categoria.parentCategoryId || '',
      description: categoria.description || '',
      color: categoria.color || '',
      icon: categoria.icon || '',
      monthlyBudget:
        categoria.monthlyBudget === undefined || categoria.monthlyBudget === null
          ? ''
          : paraCampoMoeda(categoria.monthlyBudget),
      isRecurring: Boolean(categoria.isRecurring),
      displayOrder: String(categoria.displayOrder ?? 0),
    });
    setValidationError(null);
    setIsFormOpen(true);
    setFeedback(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFeedback(null);
    setValidationError(null);

    if (!form.name.trim()) {
      setValidationError('Informe o nome da categoria.');
      return;
    }

    const cor = form.color.trim();
    if (cor && !CATEGORY_COLOR_PATTERN.test(cor)) {
      setValidationError(
        'A cor precisa estar no formato hexadecimal de 6 dígitos. Ex.: #2A78D6',
      );
      return;
    }

    let orcamento: number | undefined;
    if (form.monthlyBudget.trim()) {
      orcamento = lerCampoMoeda(form.monthlyBudget);
      if (!Number.isFinite(orcamento) || orcamento < 0) {
        setValidationError(
          'Orçamento mensal inválido. Informe um valor igual ou maior que zero. Ex.: 1.200,00',
        );
        return;
      }
    }

    let ordem = 0;
    if (form.displayOrder.trim()) {
      ordem = Number(form.displayOrder.trim());
      if (!Number.isInteger(ordem) || ordem < 0) {
        setValidationError(
          'A ordem de exibição precisa ser um número inteiro igual ou maior que zero.',
        );
        return;
      }
    }

    /**
     * O backend roda com `whitelist` + `forbidNonWhitelisted`: campos fora do
     * DTO devolvem 400. O `UpdateCategoryDto` não tem `type` nem
     * `parentCategoryId`, por isso essas duas chaves só entram na criação.
     *
     * Os opcionais aceitam `null`, então na edição enviamos `null` para limpar
     * de fato o que o usuário apagou — omitir manteria o valor antigo.
     */
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      description: form.description.trim() || (editingId ? null : undefined),
      color: cor || (editingId ? null : undefined),
      icon: form.icon.trim() || (editingId ? null : undefined),
      monthlyBudget:
        orcamento !== undefined
          ? Number(orcamento.toFixed(2))
          : editingId
            ? null
            : undefined,
      isRecurring: form.isRecurring,
      // `displayOrder` é NOT NULL no banco (default 0): nunca enviar null.
      displayOrder: ordem,
    };

    if (!editingId) {
      payload.type = form.type;
      // `parentCategoryId` é `@IsUUID()`: string vazia devolve 400.
      if (form.parentCategoryId) {
        payload.parentCategoryId = form.parentCategoryId;
      }
    }

    Object.keys(payload).forEach(chave => {
      if (payload[chave] === undefined) delete payload[chave];
    });

    try {
      if (editingId) {
        await updateCategory(editingId, payload);
        setFeedback('Categoria atualizada com sucesso.');
      } else {
        await createCategory(payload);
        setFeedback(
          form.parentCategoryId
            ? 'Subcategoria cadastrada com sucesso.'
            : 'Categoria cadastrada com sucesso.',
        );
      }
      resetForm();
      setIsFormOpen(false);
    } catch {
      // A mensagem real do backend já é exibida pelo estado do hook
    }
  };

  const handleDelete = async (id: string) => {
    setFeedback(null);
    try {
      await deleteCategory(id);
      setConfirmingDeletionId(null);
      setFeedback('Categoria excluída.');
      if (editingId === id) {
        resetForm();
        setIsFormOpen(false);
      }
    } catch {
      setConfirmingDeletionId(null);
    }
  };

  const handleCreateDefaults = async () => {
    setFeedback(null);
    try {
      await createDefaults();
      setFeedback('Categorias padrão criadas.');
    } catch {
      // A mensagem real do backend já é exibida pelo estado do hook
    }
  };

  const inputClass =
    'w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed';
  const labelClass =
    'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

  /** Bloco de confirmação de exclusão, reaproveitado por categorias e subcategorias. */
  const renderConfirmacao = (id: string) => {
    const alvo = porId.get(id);
    const filhas = alvo?.subcategories?.length || 0;

    return (
      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 rounded bg-red-50 dark:bg-red-950/20 p-3">
        {filhas > 0 ? (
          <p className="text-sm text-red-800 dark:text-red-200 mb-3">
            <strong>{alvo?.name}</strong> tem {filhas}{' '}
            {filhas === 1 ? 'subcategoria' : 'subcategorias'}. O servidor recusa a
            exclusão enquanto elas existirem — exclua as subcategorias primeiro.
          </p>
        ) : (
          <p className="text-sm text-red-800 dark:text-red-200 mb-3">
            Excluir a categoria <strong>{alvo?.name}</strong>? Os lançamentos já
            registrados com esse nome continuam existindo, mas a categoria deixa
            de aparecer nas sugestões e o orçamento definido nela é perdido.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {filhas === 0 && (
            <button
              onClick={() => handleDelete(id)}
              disabled={isSaving}
              className="px-3 py-1.5 rounded text-xs font-medium bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white transition-colors"
            >
              {isSaving ? 'Excluindo…' : 'Confirmar exclusão'}
            </button>
          )}
          <button
            onClick={() => setConfirmingDeletionId(null)}
            className="px-3 py-1.5 rounded text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  };

  if (isLoading && categories.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Carregando categorias...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            📂 Categorias
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Organize e gerencie suas categorias de receita e despesa
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {categories.length === 0 && (
            <Button
              variant="secondary"
              onClick={handleCreateDefaults}
              disabled={isSaving}
            >
              ✨ Criar categorias padrão
            </Button>
          )}
          <Button variant="primary" onClick={() => handleOpenCreate()}>
            ➕ Nova Categoria
          </Button>
        </div>
      </div>

      {/* Erro da API */}
      {error && (
        <div className="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-200 px-4 py-3 rounded flex items-start justify-between gap-3">
          <span className="text-sm">{error}</span>
          <button
            onClick={clearError}
            aria-label="Fechar aviso de erro"
            className="font-bold leading-none"
          >
            ×
          </button>
        </div>
      )}

      {/* Confirmação de sucesso */}
      {feedback && (
        <div className="bg-green-100 dark:bg-green-900 border border-green-400 dark:border-green-600 text-green-800 dark:text-green-200 px-4 py-3 rounded flex items-start justify-between gap-3">
          <span className="text-sm">{feedback}</span>
          <button
            onClick={() => setFeedback(null)}
            aria-label="Fechar aviso de sucesso"
            className="font-bold leading-none"
          >
            ×
          </button>
        </div>
      )}

      {/* Filter */}
      <Card>
        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={() => setFilterType('all')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filterType === 'all'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            Todas ({raizes.length})
          </button>
          <button
            onClick={() => setFilterType('income')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filterType === 'income'
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            Receitas ({raizes.filter(c => c.type === 'income').length})
          </button>
          <button
            onClick={() => setFilterType('expense')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filterType === 'expense'
                ? 'bg-red-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            Despesas ({raizes.filter(c => c.type === 'expense').length})
          </button>
          {orcamentoTotal > 0 && (
            <span className="ml-auto text-sm text-gray-600 dark:text-gray-400">
              Orçamento mensal somado:{' '}
              <strong className="text-gray-900 dark:text-white">
                {formatBRL(orcamentoTotal)}
              </strong>
            </span>
          )}
        </div>
      </Card>

      {/* Formulário inline — criação e edição na própria página */}
      {isFormOpen && (
        <Card>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {editingId
                ? 'Editar categoria'
                : form.parentCategoryId
                  ? 'Nova subcategoria'
                  : 'Nova categoria'}
            </h2>
            <button
              onClick={() => {
                resetForm();
                setIsFormOpen(false);
              }}
              aria-label="Fechar formulário"
              className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-xl leading-none"
            >
              ×
            </button>
          </div>

          {validationError && (
            <div className="mb-4 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20 p-3">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                {validationError}
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="category-name" className={labelClass}>
                  Nome
                </label>
                <input
                  id="category-name"
                  type="text"
                  value={form.name}
                  onChange={event => setForm({ ...form, name: event.target.value })}
                  placeholder="Ex.: Supermercado"
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="category-type" className={labelClass}>
                  Tipo
                </label>
                <select
                  id="category-type"
                  value={form.type}
                  onChange={event =>
                    setForm({
                      ...form,
                      type: event.target.value as CategoryType,
                      // Trocar o tipo invalida a categoria-mãe escolhida antes.
                      parentCategoryId: '',
                    })
                  }
                  disabled={Boolean(editingId)}
                  className={inputClass}
                >
                  {CATEGORY_TYPE_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {editingId && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    O tipo só pode ser definido na criação — o servidor não aceita
                    alterá-lo depois. Para mudar, crie outra categoria.
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="category-parent" className={labelClass}>
                  Categoria-mãe (opcional)
                </label>
                <select
                  id="category-parent"
                  value={form.parentCategoryId}
                  onChange={event =>
                    setForm({ ...form, parentCategoryId: event.target.value })
                  }
                  disabled={Boolean(editingId)}
                  className={inputClass}
                >
                  <option value="">Nenhuma — categoria principal</option>
                  {possiveisMaes.map(categoria => (
                    <option key={categoria.id} value={categoria.id}>
                      {categoria.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {editingId
                    ? 'O vínculo com a categoria-mãe só pode ser definido na criação.'
                    : 'Escolher uma categoria-mãe cria uma subcategoria dentro dela.'}
                </p>
              </div>

              <div>
                <label htmlFor="category-icon" className={labelClass}>
                  Ícone (opcional)
                </label>
                <input
                  id="category-icon"
                  type="text"
                  value={form.icon}
                  onChange={event => setForm({ ...form, icon: event.target.value })}
                  placeholder="Ex.: 🛒"
                  maxLength={8}
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="category-budget" className={labelClass}>
                  Orçamento mensal (R$) — opcional
                </label>
                <input
                  id="category-budget"
                  type="text"
                  inputMode="decimal"
                  value={form.monthlyBudget}
                  onChange={event =>
                    setForm({ ...form, monthlyBudget: event.target.value })
                  }
                  placeholder="1.200,00"
                  className={inputClass}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Alerta amarelo aos 80% e vermelho aos 100% do valor definido.
                </p>
              </div>

              <div>
                <label htmlFor="category-order" className={labelClass}>
                  Ordem de exibição
                </label>
                <input
                  id="category-order"
                  type="number"
                  min={0}
                  step={1}
                  value={form.displayOrder}
                  onChange={event =>
                    setForm({ ...form, displayOrder: event.target.value })
                  }
                  placeholder="0"
                  className={inputClass}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Menor número aparece primeiro. Em branco vale 0.
                </p>
              </div>

              <div className="md:col-span-2">
                <label htmlFor="category-color" className={labelClass}>
                  Cor (opcional)
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    id="category-color"
                    type="text"
                    value={form.color}
                    onChange={event =>
                      setForm({ ...form, color: event.target.value })
                    }
                    placeholder="#2A78D6"
                    className={`${inputClass} md:w-48`}
                  />
                  {CATEGORY_COLOR_SUGGESTIONS.map(cor => (
                    <button
                      key={cor}
                      type="button"
                      onClick={() => setForm({ ...form, color: cor })}
                      aria-label={`Usar a cor ${cor}`}
                      title={cor}
                      className={`w-7 h-7 rounded border ${
                        form.color.toUpperCase() === cor
                          ? 'border-gray-900 dark:border-white ring-2 ring-indigo-500'
                          : 'border-gray-300 dark:border-gray-600'
                      }`}
                      style={{ backgroundColor: cor }}
                    />
                  ))}
                  {form.color && (
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, color: '' })}
                      className="px-3 py-1.5 rounded text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                      Limpar cor
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Hexadecimal de 6 dígitos — é o formato que o servidor aceita.
                </p>
              </div>

              <div className="md:col-span-2">
                <label htmlFor="category-description" className={labelClass}>
                  Descrição (opcional)
                </label>
                <textarea
                  id="category-description"
                  value={form.description}
                  onChange={event =>
                    setForm({ ...form, description: event.target.value })
                  }
                  rows={2}
                  placeholder="Ex.: compras de mercado do mês"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  id="category-recurring"
                  type="checkbox"
                  checked={form.isRecurring}
                  onChange={event =>
                    setForm({ ...form, isRecurring: event.target.checked })
                  }
                  className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Categoria recorrente (aluguel, assinaturas, contas fixas)
                </span>
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="primary" disabled={isSaving}>
                {isSaving
                  ? 'Salvando…'
                  : editingId
                    ? 'Salvar alterações'
                    : 'Cadastrar categoria'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  resetForm();
                  setIsFormOpen(false);
                }}
              >
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Categories Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {categoriasFiltradas.length > 0 ? (
          categoriasFiltradas.map(category => (
            <Card key={category.id}>
              <div className="flex justify-between items-start mb-4 gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">{category.icon || '📁'}</span>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white truncate">
                      {category.name}
                    </h3>
                    {category.color && (
                      <span
                        className="w-4 h-4 rounded-sm border border-gray-300 dark:border-gray-600 flex-shrink-0"
                        style={{ backgroundColor: category.color }}
                      />
                    )}
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {category.type === 'income' ? '💰 ' : '💸 '}
                    {CATEGORY_TYPE_LABELS[category.type] || category.type}
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleEdit(category)}
                    className="px-3 py-1.5 rounded text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    ✏️ Editar
                  </button>
                  {confirmingDeletionId !== category.id && (
                    <button
                      onClick={() => setConfirmingDeletionId(category.id)}
                      disabled={isSaving}
                      aria-label={`Excluir a categoria ${category.name}`}
                      className="px-2 py-1 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded transition-colors"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              </div>

              {category.description && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  {category.description}
                </p>
              )}

              {category.monthlyBudget ? (
                <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900 rounded-lg">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
                    Orçamento Mensal:
                  </p>
                  <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                    {formatBRL(category.monthlyBudget)}
                  </p>
                </div>
              ) : null}

              {category.isRecurring && (
                <div className="inline-block px-3 py-1 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded-full text-xs font-medium">
                  🔁 Recorrente
                </div>
              )}

              {confirmingDeletionId === category.id &&
                renderConfirmacao(category.id)}

              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                    Subcategorias ({category.subcategories?.length || 0})
                  </p>
                  <button
                    onClick={() =>
                      handleOpenCreate(
                        category.id,
                        category.type as CategoryType,
                      )
                    }
                    className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    ➕ Adicionar
                  </button>
                </div>

                {category.subcategories && category.subcategories.length > 0 ? (
                  <div className="space-y-1">
                    {category.subcategories.map(sub => (
                      <div key={sub.id}>
                        <div className="text-sm text-gray-600 dark:text-gray-400 flex justify-between items-center gap-2">
                          <span className="truncate">└ {sub.name}</span>
                          <span className="flex items-center gap-2 flex-shrink-0">
                            {sub.monthlyBudget ? (
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {formatBRL(sub.monthlyBudget)}
                              </span>
                            ) : null}
                            <button
                              onClick={() => handleEdit(sub)}
                              aria-label={`Editar a subcategoria ${sub.name}`}
                              className="text-indigo-600 dark:text-indigo-400 hover:underline text-xs"
                            >
                              editar
                            </button>
                            {confirmingDeletionId !== sub.id && (
                              <button
                                onClick={() => setConfirmingDeletionId(sub.id)}
                                disabled={isSaving}
                                aria-label={`Excluir a subcategoria ${sub.name}`}
                                className="text-red-500 hover:text-red-700 disabled:opacity-50"
                              >
                                ×
                              </button>
                            )}
                          </span>
                        </div>
                        {confirmingDeletionId === sub.id &&
                          renderConfirmacao(sub.id)}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Nenhuma subcategoria — use &quot;Adicionar&quot; para detalhar
                    os gastos desta categoria.
                  </p>
                )}
              </div>
            </Card>
          ))
        ) : (
          <Card className="col-span-full">
            <div className="text-center py-12">
              <p className="text-gray-600 dark:text-gray-400 mb-2">
                {categories.length === 0
                  ? 'Nenhuma categoria cadastrada ainda'
                  : 'Nenhuma categoria encontrada neste filtro'}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 max-w-md mx-auto">
                {categories.length === 0
                  ? 'Sem categorias não há como agrupar gastos, definir orçamento nem comparar meses. Comece pelas que a casa mais usa — Moradia, Supermercado, Transporte.'
                  : 'Troque o filtro acima ou cadastre uma categoria deste tipo.'}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="primary" onClick={() => handleOpenCreate()}>
                  ➕ Criar Primeira Categoria
                </Button>
                {categories.length === 0 && (
                  <Button
                    variant="secondary"
                    onClick={handleCreateDefaults}
                    disabled={isSaving}
                  >
                    ✨ Criar categorias padrão
                  </Button>
                )}
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
