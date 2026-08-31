'use client';

import { FormEvent, useMemo, useState } from 'react';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import {
  usePlannedAccounts,
  type PlannedAccount,
} from '@/hooks/usePlannedAccounts';
import { useAccounts } from '@/hooks/useAccounts';
import { useCreditCards } from '@/hooks/useCreditCards';
import { useCategories } from '@/hooks/useCategories';
import {
  PLANNED_FREQUENCY_LABELS,
  PLANNED_FREQUENCY_OPTIONS,
  PLANNED_PRIORITY_LABELS,
  PLANNED_PRIORITY_OPTIONS,
  PLANNED_RESPONSIBLE_OPTIONS,
  PLANNED_STATUS_LABELS,
  PLANNED_STATUS_OPTIONS,
  PlannedAccountStatus,
  PlannedFrequency,
} from '@/types/planned-account';
import { formatBRL, formatDateBR } from '@/utils/format';

interface PlannedFormState {
  description: string;
  category: string;
  amount: string;
  dueDate: string;
  responsible: string;
  accountId: string;
  creditCardId: string;
  isRecurring: boolean;
  frequency: PlannedFrequency;
  status: PlannedAccountStatus;
  priority: string;
  observation: string;
}

const hoje = () => new Date().toISOString().slice(0, 10);

const emptyForm = (): PlannedFormState => ({
  description: '',
  category: '',
  amount: '',
  dueDate: hoje(),
  responsible: 'bruno',
  accountId: '',
  creditCardId: '',
  isRecurring: false,
  frequency: PlannedFrequency.MONTHLY,
  status: PlannedAccountStatus.PENDING,
  priority: '1',
  observation: '',
});

/** Converte "1.200,50" ou "1200.50" em número. */
function parseAmount(raw: string): number {
  const normalized = raw.trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

/** Data ISO (`2026-09-05T00:00:00Z`) → valor de `<input type="date">`. */
function toDateInput(value: string | Date | null | undefined): string {
  if (!value) return hoje();
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return hoje();
  return date.toISOString().slice(0, 10);
}

export default function PlannedPage() {
  const {
    planned,
    isLoading,
    isSaving,
    error,
    createPlanned,
    updatePlanned,
    deletePlanned,
    markAsPaid,
    clearError,
  } = usePlannedAccounts();

  const { accounts } = useAccounts();
  const { cards } = useCreditCards();
  const { categories } = useCategories();

  const [filterStatus, setFilterStatus] = useState<string>('pending');

  const [form, setForm] = useState<PlannedFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Confirmação inline de exclusão — sem `window.confirm`
  const [confirmingDeletionId, setConfirmingDeletionId] = useState<string | null>(
    null,
  );

  /** Contas comuns: o cartão de crédito tem seu próprio seletor. */
  const contasDePagamento = useMemo(
    () => accounts.filter(account => account.type !== 'credit_card'),
    [accounts],
  );

  /** Sugestões de categoria: as cadastradas mais as já usadas no planejamento. */
  const sugestoesCategoria = useMemo(() => {
    const nomes = new Set<string>();
    categories
      .filter(categoria => categoria.type !== 'income')
      .forEach(categoria => nomes.add(categoria.name));
    planned.forEach(item => item.category && nomes.add(item.category));
    return Array.from(nomes).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [categories, planned]);

  const filteredPlanned = useMemo(
    () =>
      planned.filter(p => (filterStatus === 'all' ? true : p.status === filterStatus)),
    [planned, filterStatus],
  );

  const statistics = useMemo(
    () => ({
      pending: planned.filter(p => p.status === 'pending').length,
      confirmed: planned.filter(p => p.status === 'confirmed').length,
      paid: planned.filter(p => p.status === 'paid').length,
      overdue: planned.filter(p => p.status === 'overdue').length,
    }),
    [planned],
  );

  /**
   * Totais em aberto, separados por lado.
   *
   * `amount` é `decimal` no Postgres e chega como string; o hook já converte
   * com `Number()`, então aqui a soma é aritmética de verdade.
   *
   * Entrada e saída são somadas em separado de propósito: um total único
   * misturaria R$ 8.500 de salário com R$ 1.800 de aluguel e não responderia
   * nem "quanto tenho a pagar" nem "quanto vou receber".
   */
  const emAberto = useMemo(
    () => planned.filter(p => p.status === 'pending' || p.status === 'confirmed'),
    [planned],
  );

  const totalPending = useMemo(
    () =>
      emAberto
        .filter(p => p.type !== 'income')
        .reduce((sum, p) => sum + p.amount, 0),
    [emAberto],
  );

  const totalAReceber = useMemo(
    () =>
      emAberto
        .filter(p => p.type === 'income')
        .reduce((sum, p) => sum + p.amount, 0),
    [emAberto],
  );

  /** O que sobra depois de pagar tudo o que está previsto. */
  const saldoPlanejado = totalAReceber - totalPending;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300';
      case 'confirmed':
        return 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300';
      case 'paid':
        return 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300';
      case 'cancelled':
        return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
      case 'overdue':
        return 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300';
      default:
        return 'bg-gray-100 dark:bg-gray-700';
    }
  };

  const getPriorityColor = (priority: number) => {
    switch (priority) {
      case 0:
        return 'text-gray-500';
      case 1:
        return 'text-yellow-500';
      case 2:
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  const getDaysUntilDue = (dueDate: string) => {
    const today = new Date();
    const due = new Date(dueDate);
    return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  const resetForm = () => {
    setForm(emptyForm());
    setEditingId(null);
    setValidationError(null);
  };

  const handleOpenCreate = () => {
    resetForm();
    setIsFormOpen(true);
    setFeedback(null);
  };

  const handleEdit = (account: PlannedAccount) => {
    setEditingId(account.id);
    setForm({
      description: account.description || '',
      category: account.category || '',
      amount: String(account.amount ?? ''),
      dueDate: toDateInput(account.dueDate),
      responsible: account.responsible || 'bruno',
      accountId: account.accountId || '',
      creditCardId: account.creditCardId || '',
      isRecurring: Boolean(account.isRecurring),
      frequency:
        (account.frequency as PlannedFrequency) || PlannedFrequency.MONTHLY,
      status: (account.status as PlannedAccountStatus) || PlannedAccountStatus.PENDING,
      priority: String(account.priority ?? 1),
      observation: account.observation || '',
    });
    setValidationError(null);
    setIsFormOpen(true);
    setFeedback(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFeedback(null);
    setValidationError(null);

    if (!form.description.trim()) {
      setValidationError('Informe a descrição da conta. Ex.: Aluguel.');
      return;
    }

    const valor = parseAmount(form.amount);
    if (!Number.isFinite(valor) || valor < 0.01) {
      setValidationError('Informe um valor de pelo menos R$ 0,01. Ex.: 1.800,00');
      return;
    }

    if (!form.dueDate) {
      setValidationError('Informe a data de vencimento.');
      return;
    }

    const prioridade = Number(form.priority);
    if (!Number.isInteger(prioridade) || prioridade < 0 || prioridade > 2) {
      setValidationError('Prioridade inválida. Escolha entre Baixa, Normal e Alta.');
      return;
    }

    /**
     * O backend roda com `whitelist` + `forbidNonWhitelisted`: campos fora do
     * DTO devolvem 400. O `UpdatePlannedAccountDto` é MENOR que o de criação —
     * não aceita `responsible`, `accountId`, `creditCardId`, `isRecurring` nem
     * `frequency` —, por isso essas chaves só entram na criação.
     */
    const payload: Record<string, unknown> = {
      description: form.description.trim(),
      amount: Number(valor.toFixed(2)),
      // Meio-dia evita que o fuso empurre o vencimento para o dia anterior.
      dueDate: new Date(`${form.dueDate}T12:00:00`).toISOString(),
      category: form.category.trim() || (editingId ? null : undefined),
      status: form.status,
      observation: form.observation.trim() || (editingId ? null : undefined),
      priority: prioridade,
    };

    if (!editingId) {
      payload.responsible = form.responsible;
      payload.isRecurring = form.isRecurring;
      if (form.isRecurring) payload.frequency = form.frequency;
      // `accountId` e `creditCardId` são `@IsUUID()`: string vazia devolve 400.
      if (form.accountId) payload.accountId = form.accountId;
      if (form.creditCardId) payload.creditCardId = form.creditCardId;
    }

    Object.keys(payload).forEach(chave => {
      if (payload[chave] === undefined) delete payload[chave];
    });

    try {
      if (editingId) {
        await updatePlanned(editingId, payload);
        setFeedback('Conta planejada atualizada com sucesso.');
      } else {
        await createPlanned(payload);
        setFeedback('Conta planejada cadastrada com sucesso.');
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
      await deletePlanned(id);
      setConfirmingDeletionId(null);
      setFeedback('Conta planejada excluída.');
      if (editingId === id) {
        resetForm();
        setIsFormOpen(false);
      }
    } catch {
      setConfirmingDeletionId(null);
    }
  };

  const handleMarkAsPaid = async (id: string) => {
    setFeedback(null);
    try {
      await markAsPaid(id);
      setFeedback('Conta marcada como paga.');
    } catch {
      // A mensagem real do backend já é exibida pelo estado do hook
    }
  };

  const inputClass =
    'w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed';
  const labelClass =
    'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

  if (isLoading && planned.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">
            Carregando planejamentos...
          </p>
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
            📋 Contas Planejadas
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Organize e acompanhe suas despesas futuras
          </p>
        </div>
        <Button variant="primary" onClick={handleOpenCreate}>
          ➕ Nova Conta
        </Button>
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

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Previstas</p>
          <p className="text-2xl font-bold text-yellow-600">{statistics.pending}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Confirmadas</p>
          <p className="text-2xl font-bold text-blue-600">{statistics.confirmed}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Pagas</p>
          <p className="text-2xl font-bold text-green-600">{statistics.paid}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Vencidas</p>
          <p className="text-2xl font-bold text-red-600">{statistics.overdue}</p>
        </Card>
      </div>

      {/* Visão consolidada: o que entra, o que sai e o que sobra */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-2 border-green-200 dark:border-green-800">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
            A Receber
          </p>
          <p className="text-3xl font-bold text-green-600">
            {formatBRL(totalAReceber)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Salários e outras receitas recorrentes previstas
          </p>
        </Card>

        <Card className="border-2 border-red-200 dark:border-red-800">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
            A Pagar
          </p>
          <p className="text-3xl font-bold text-red-600">
            {formatBRL(totalPending)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Contas previstas e confirmadas
          </p>
        </Card>

        <Card
          className={`border-2 ${
            saldoPlanejado >= 0
              ? 'border-indigo-200 dark:border-indigo-800'
              : 'border-amber-300 dark:border-amber-800'
          }`}
        >
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
            Saldo Planejado
          </p>
          <p
            className={`text-3xl font-bold ${
              saldoPlanejado >= 0 ? 'text-indigo-600' : 'text-amber-600'
            }`}
          >
            {formatBRL(saldoPlanejado)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {saldoPlanejado >= 0
              ? 'O que sobra depois de pagar tudo o que está previsto'
              : 'O previsto a pagar supera o previsto a receber'}
          </p>
        </Card>
      </div>

      {/* Filter */}
      <Card>
        <div className="flex gap-2 flex-wrap">
          {['pending', 'confirmed', 'paid', 'overdue', 'cancelled', 'all'].map(
            status => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filterStatus === status
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {status === 'all'
                  ? 'Todas'
                  : PLANNED_STATUS_LABELS[status] || status}
              </button>
            ),
          )}
        </div>
      </Card>

      {/* Formulário inline — criação e edição na própria página */}
      {isFormOpen && (
        <Card>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {editingId ? 'Editar conta planejada' : 'Nova conta planejada'}
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
                <label htmlFor="planned-description" className={labelClass}>
                  Descrição
                </label>
                <input
                  id="planned-description"
                  type="text"
                  value={form.description}
                  onChange={event =>
                    setForm({ ...form, description: event.target.value })
                  }
                  placeholder="Ex.: Aluguel"
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="planned-category" className={labelClass}>
                  Categoria (opcional)
                </label>
                <input
                  id="planned-category"
                  type="text"
                  list="planned-category-options"
                  value={form.category}
                  onChange={event =>
                    setForm({ ...form, category: event.target.value })
                  }
                  placeholder="Ex.: Moradia"
                  className={inputClass}
                />
                <datalist id="planned-category-options">
                  {sugestoesCategoria.map(categoria => (
                    <option key={categoria} value={categoria} />
                  ))}
                </datalist>
              </div>

              <div>
                <label htmlFor="planned-amount" className={labelClass}>
                  Valor (R$)
                </label>
                <input
                  id="planned-amount"
                  type="text"
                  inputMode="decimal"
                  value={form.amount}
                  onChange={event => setForm({ ...form, amount: event.target.value })}
                  placeholder="1.800,00"
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="planned-due-date" className={labelClass}>
                  Data de vencimento
                </label>
                <input
                  id="planned-due-date"
                  type="date"
                  value={form.dueDate}
                  onChange={event =>
                    setForm({ ...form, dueDate: event.target.value })
                  }
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="planned-responsible" className={labelClass}>
                  Responsável
                </label>
                <select
                  id="planned-responsible"
                  value={form.responsible}
                  onChange={event =>
                    setForm({ ...form, responsible: event.target.value })
                  }
                  disabled={Boolean(editingId)}
                  className={inputClass}
                >
                  {PLANNED_RESPONSIBLE_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {editingId && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    O responsável só pode ser definido na criação — o servidor não
                    aceita alterá-lo depois.
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="planned-status" className={labelClass}>
                  Situação
                </label>
                <select
                  id="planned-status"
                  value={form.status}
                  onChange={event =>
                    setForm({
                      ...form,
                      status: event.target.value as PlannedAccountStatus,
                    })
                  }
                  className={inputClass}
                >
                  {PLANNED_STATUS_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="planned-priority" className={labelClass}>
                  Prioridade
                </label>
                <select
                  id="planned-priority"
                  value={form.priority}
                  onChange={event =>
                    setForm({ ...form, priority: event.target.value })
                  }
                  className={inputClass}
                >
                  {PLANNED_PRIORITY_OPTIONS.map(option => (
                    <option key={option.value} value={String(option.value)}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="planned-account" className={labelClass}>
                  Conta de débito (opcional)
                </label>
                <select
                  id="planned-account"
                  value={form.accountId}
                  onChange={event =>
                    setForm({ ...form, accountId: event.target.value })
                  }
                  disabled={Boolean(editingId)}
                  className={inputClass}
                >
                  <option value="">Não informar</option>
                  {contasDePagamento.map(account => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                      {account.institution ? ` — ${account.institution}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="planned-credit-card" className={labelClass}>
                  Cartão de crédito (opcional)
                </label>
                <select
                  id="planned-credit-card"
                  value={form.creditCardId}
                  onChange={event =>
                    setForm({ ...form, creditCardId: event.target.value })
                  }
                  disabled={Boolean(editingId)}
                  className={inputClass}
                >
                  <option value="">Não informar</option>
                  {cards.map(card => (
                    <option key={card.id} value={card.id}>
                      {card.name}
                      {card.bank ? ` — ${card.bank}` : ''}
                    </option>
                  ))}
                </select>
                {editingId && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Conta e cartão só podem ser vinculados na criação — o servidor
                    não aceita alterá-los depois.
                  </p>
                )}
              </div>

              <div className="md:col-span-2">
                <label htmlFor="planned-observation" className={labelClass}>
                  Observação (opcional)
                </label>
                <textarea
                  id="planned-observation"
                  value={form.observation}
                  onChange={event =>
                    setForm({ ...form, observation: event.target.value })
                  }
                  rows={2}
                  placeholder="Ex.: boleto chega por e-mail no dia 28"
                  className={inputClass}
                />
              </div>
            </div>

            {/* Recorrência */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  id="planned-recurring"
                  type="checkbox"
                  checked={form.isRecurring}
                  onChange={event =>
                    setForm({ ...form, isRecurring: event.target.checked })
                  }
                  disabled={Boolean(editingId)}
                  className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500 disabled:opacity-60"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Conta recorrente
                </span>
              </label>

              {form.isRecurring && (
                <div className="mt-3">
                  <label htmlFor="planned-frequency" className={labelClass}>
                    Frequência
                  </label>
                  <select
                    id="planned-frequency"
                    value={form.frequency}
                    onChange={event =>
                      setForm({
                        ...form,
                        frequency: event.target.value as PlannedFrequency,
                      })
                    }
                    disabled={Boolean(editingId)}
                    className={`${inputClass} md:w-64`}
                  >
                    {PLANNED_FREQUENCY_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {editingId && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                  A recorrência só pode ser definida na criação — o servidor não
                  aceita alterá-la depois. Para mudar, exclua esta conta e cadastre
                  outra.
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="primary" disabled={isSaving}>
                {isSaving
                  ? 'Salvando…'
                  : editingId
                    ? 'Salvar alterações'
                    : 'Cadastrar conta'}
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

      {/* List */}
      <div className="space-y-3">
        {filteredPlanned.length > 0 ? (
          filteredPlanned.map(account => {
            const daysUntilDue = getDaysUntilDue(account.dueDate);
            return (
              <Card key={account.id} className="hover:shadow-lg transition-shadow">
                <div className="flex flex-wrap justify-between items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="min-w-0">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white truncate">
                          {account.description}
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {account.category || 'Sem categoria'} •{' '}
                          <span className="capitalize">{account.responsible}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 items-center mt-2">
                      {/*
                        Entrada e saída na mesma lista precisam ser distinguíveis
                        de relance: sem esta marca, R$ 8.500 de salário e
                        R$ 8.500 de conta a pagar ficam idênticos na tela.
                      */}
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          account.type === 'income'
                            ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
                            : 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300'
                        }`}
                      >
                        {account.type === 'income' ? '↓ A receber' : '↑ A pagar'}
                      </span>

                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(
                          account.status,
                        )}`}
                      >
                        {PLANNED_STATUS_LABELS[account.status] || account.status}
                      </span>

                      <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                        <span className={getPriorityColor(account.priority)}>★</span>{' '}
                        {PLANNED_PRIORITY_LABELS[account.priority] || 'Normal'}
                      </span>

                      {account.isRecurring && (
                        <span className="px-3 py-1 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300">
                          🔁{' '}
                          {account.frequency
                            ? PLANNED_FREQUENCY_LABELS[account.frequency] ||
                              account.frequency
                            : 'Recorrente'}
                        </span>
                      )}

                      {account.status !== 'paid' &&
                        account.status !== 'cancelled' &&
                        daysUntilDue <= 3 &&
                        daysUntilDue >= 0 && (
                          <span className="px-3 py-1 rounded-full text-xs font-medium bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300">
                            ⚠️{' '}
                            {daysUntilDue === 0
                              ? 'Vence hoje'
                              : `Vence em ${daysUntilDue} ${
                                  daysUntilDue === 1 ? 'dia' : 'dias'
                                }`}
                          </span>
                        )}
                    </div>
                  </div>

                  <div className="text-right">
                    <p
                      className={`text-2xl font-bold mb-2 ${
                        account.type === 'income'
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-gray-900 dark:text-white'
                      }`}
                    >
                      {account.type === 'income' ? '+ ' : ''}
                      {formatBRL(account.amount)}
                    </p>

                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                      {account.type === 'income' ? 'Entra' : 'Vence'}:{' '}
                      {formatDateBR(account.dueDate)}
                    </p>

                    <div className="flex flex-wrap gap-2 justify-end">
                      {account.status !== 'paid' &&
                        account.status !== 'cancelled' && (
                          <button
                            onClick={() => handleMarkAsPaid(account.id)}
                            disabled={isSaving}
                            className="px-3 py-1 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded transition-colors"
                          >
                            ✓ Pagar
                          </button>
                        )}
                      <button
                        onClick={() => handleEdit(account)}
                        className="px-3 py-1 text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                      >
                        ✏️ Editar
                      </button>
                      {confirmingDeletionId !== account.id && (
                        <button
                          onClick={() => setConfirmingDeletionId(account.id)}
                          disabled={isSaving}
                          aria-label={`Excluir ${account.description}`}
                          className="px-3 py-1 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded transition-colors"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {account.observation && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                    📝 {account.observation}
                  </p>
                )}

                {/* Confirmação inline — sem diálogo nativo */}
                {confirmingDeletionId === account.id && (
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 rounded bg-red-50 dark:bg-red-950/20 p-3">
                    <p className="text-sm text-red-800 dark:text-red-200 mb-3">
                      Excluir <strong>{account.description}</strong> de{' '}
                      {formatBRL(account.amount)} com vencimento em{' '}
                      {formatDateBR(account.dueDate)}? Ela sai do total a pagar, do
                      fluxo de caixa e dos alertas de vencimento.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleDelete(account.id)}
                        disabled={isSaving}
                        className="px-3 py-1.5 rounded text-xs font-medium bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white transition-colors"
                      >
                        {isSaving ? 'Excluindo…' : 'Confirmar exclusão'}
                      </button>
                      <button
                        onClick={() => setConfirmingDeletionId(null)}
                        className="px-3 py-1.5 rounded text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })
        ) : (
          <Card>
            <div className="text-center py-12">
              <p className="text-gray-600 dark:text-gray-400 mb-2">
                {planned.length === 0
                  ? 'Nenhuma conta planejada ainda'
                  : `Nenhuma conta ${
                      filterStatus === 'all'
                        ? ''
                        : (PLANNED_STATUS_LABELS[filterStatus] || '').toLowerCase()
                    } encontrada`}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 max-w-md mx-auto">
                {planned.length === 0
                  ? 'Sem contas futuras cadastradas não há fluxo de caixa projetado, dias críticos nem lembrete de vencimento. Comece pelas fixas: aluguel, internet, escola.'
                  : 'Troque o filtro acima ou cadastre uma conta.'}
              </p>
              <Button variant="primary" onClick={handleOpenCreate}>
                ➕ Criar Primeira Conta
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
