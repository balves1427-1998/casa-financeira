'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { useIncome } from '@/hooks/useIncome';
import { useAccounts } from '@/hooks/useAccounts';
import {
  INCOME_FREQUENCY_LABELS,
  INCOME_FREQUENCY_OPTIONS,
  INCOME_TYPE_LABELS,
  INCOME_TYPE_OPTIONS,
  IncomeDto,
  IncomeFrequency,
  IncomeType,
  toIncomeAmount,
} from '@/types/income';
import { formatBRL, formatDateBR, formatPercent } from '@/utils/format';
import {
  AlertCircle,
  Check,
  Home,
  Loader2,
  PiggyBank,
  Plus,
  Repeat,
  Trash2,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';

/** Responsáveis previstos no escopo. Novos podem ser digitados no campo livre. */
const RESPONSIBLE_OPTIONS = [
  { value: 'bruno', label: 'Bruno' },
  { value: 'giovanna', label: 'Giovanna' },
];

/**
 * Paleta categórica para o gráfico de composição.
 * Passos escuros pensados para a superfície escura — não são simples inversões.
 */
const CHART_PALETTE = [
  '#2a78d6',
  '#eb6834',
  '#3f9e6b',
  '#a05fd1',
  '#fab219',
  '#d03b3b',
  '#0e9aa7',
  '#8c6d4a',
  '#c2417f',
  '#6b7280',
];

interface IncomeFormState {
  description: string;
  type: IncomeType;
  amount: string;
  date: string;
  accountId: string;
  responsible: string;
  isRecurring: boolean;
  frequency: IncomeFrequency;
  observation: string;
}

const hoje = () => new Date().toISOString().slice(0, 10);

const emptyForm = (): IncomeFormState => ({
  description: '',
  type: IncomeType.SALARY,
  amount: '',
  date: hoje(),
  accountId: '',
  responsible: 'bruno',
  isRecurring: false,
  frequency: IncomeFrequency.MONTHLY,
  observation: '',
});

/** Converte "8.500,00" ou "8500.00" em número. */
function parseAmount(raw: string): number {
  const normalized = raw.trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

/** Data ISO (`2026-08-26T00:00:00Z`) → valor de `<input type="date">`. */
function toDateInput(value: Date | string | null | undefined): string {
  if (!value) return hoje();
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return hoje();
  return date.toISOString().slice(0, 10);
}

export default function ReceitasPage() {
  const {
    incomes,
    typeBreakdown,
    recurringMonthly,
    isLoading,
    isSaving,
    error,
    createIncome,
    updateIncome,
    deleteIncome,
    setIncomeRecurrence,
    clearError,
  } = useIncome();

  const { accounts, isLoading: accountsLoading } = useAccounts();

  const [form, setForm] = useState<IncomeFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Confirmação inline de exclusão — sem `window.confirm`, que trava automação
  const [confirmingDeletionId, setConfirmingDeletionId] = useState<string | null>(null);

  /** Id da receita cuja recorrência está sendo encerrada ou retomada. */
  const [alterandoRecorrenciaId, setAlterandoRecorrenciaId] = useState<
    string | null
  >(null);

  /**
   * Encerra ou retoma a projeção da receita nos próximos meses.
   *
   * Útil na troca de emprego: o salário antigo para de aparecer no Planejado
   * sem que o histórico do que já foi recebido se perca.
   */
  const handleToggleRecorrencia = async (income: IncomeDto) => {
    const encerrando = !income.recurrenceCancelledAt;
    setAlterandoRecorrenciaId(income.id);
    setFeedback(null);
    try {
      await setIncomeRecurrence(income.id, !encerrando);
      setFeedback(
        encerrando
          ? `"${income.description}" não será mais projetada nos próximos meses.`
          : `"${income.description}" voltou a ser projetada para os próximos 12 meses.`,
      );
    } catch {
      // A mensagem já vem pelo `error` do hook.
    } finally {
      setAlterandoRecorrenciaId(null);
    }
  };

  // Pré-seleciona a primeira conta assim que a lista chega
  useEffect(() => {
    if (!form.accountId && accounts.length > 0) {
      setForm(prev => (prev.accountId ? prev : { ...prev, accountId: accounts[0].id }));
    }
  }, [accounts, form.accountId]);

  const totalGeral = useMemo(
    () => incomes.reduce((sum, income) => sum + toIncomeAmount(income.amount), 0),
    [incomes],
  );

  const totalRecorrenteMensal = useMemo(
    () => recurringMonthly.reduce((sum, item) => sum + (item.monthlyAmount || 0), 0),
    [recurringMonthly],
  );

  const totalDoMes = useMemo(() => {
    const agora = new Date();
    return incomes
      .filter(income => {
        const data = new Date(income.date);
        return (
          data.getMonth() === agora.getMonth() &&
          data.getFullYear() === agora.getFullYear()
        );
      })
      .reduce((sum, income) => sum + toIncomeAmount(income.amount), 0);
  }, [incomes]);

  /** Composição por origem, já ordenada e com o rótulo em português. */
  const chartData = useMemo(() => {
    const total = typeBreakdown.reduce(
      (sum, item) => sum + toIncomeAmount(item.total),
      0,
    );

    return typeBreakdown
      .map(item => {
        const value = toIncomeAmount(item.total);
        return {
          type: item.type,
          name: INCOME_TYPE_LABELS[item.type] || item.type,
          value,
          count: Number(item.count) || 0,
          percent: total > 0 ? (value / total) * 100 : 0,
        };
      })
      .filter(item => item.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [typeBreakdown]);

  const resetForm = () => {
    setForm({ ...emptyForm(), accountId: accounts[0]?.id || '' });
    setEditingId(null);
    setValidationError(null);
  };

  const handleOpenCreate = () => {
    resetForm();
    setIsFormOpen(true);
    setFeedback(null);
  };

  const handleEdit = (income: IncomeDto) => {
    setEditingId(income.id);
    setForm({
      description: income.description,
      type: (income.type as IncomeType) || IncomeType.OTHER,
      amount: String(toIncomeAmount(income.amount)),
      date: toDateInput(income.date),
      accountId: income.accountId,
      responsible: income.responsible,
      isRecurring: Boolean(income.isRecurring),
      frequency: (income.frequency as IncomeFrequency) || IncomeFrequency.MONTHLY,
      observation: income.observation || '',
    });
    setValidationError(null);
    setIsFormOpen(true);
    setFeedback(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFeedback(null);
    setValidationError(null);

    const amount = parseAmount(form.amount);

    if (!form.description.trim()) {
      setValidationError('Informe a descrição da receita.');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setValidationError('Informe um valor maior que zero. Ex.: 8500,00');
      return;
    }
    if (!form.accountId) {
      setValidationError(
        'Selecione a conta de destino. Cadastre uma conta antes de lançar receitas.',
      );
      return;
    }

    const payload = {
      description: form.description.trim(),
      type: form.type,
      amount: Number(amount.toFixed(2)),
      date: new Date(`${form.date}T12:00:00`).toISOString(),
      accountId: form.accountId,
      responsible: form.responsible,
      isRecurring: form.isRecurring,
      // Só envia a frequência quando a receita é recorrente: o backend valida
      // o enum e recusa um valor solto com `forbidNonWhitelisted`.
      ...(form.isRecurring ? { frequency: form.frequency } : {}),
      ...(form.observation.trim() ? { observation: form.observation.trim() } : {}),
    };

    try {
      if (editingId) {
        await updateIncome(editingId, payload);
        setFeedback('Receita atualizada com sucesso.');
      } else {
        await createIncome(payload);
        setFeedback('Receita cadastrada com sucesso.');
      }
      resetForm();
      setIsFormOpen(false);
    } catch {
      // A mensagem do backend já é exibida pelo estado do hook
    }
  };

  const handleDelete = async (id: string) => {
    setFeedback(null);
    try {
      await deleteIncome(id);
      setConfirmingDeletionId(null);
      setFeedback('Receita excluída.');
      if (editingId === id) {
        resetForm();
        setIsFormOpen(false);
      }
    } catch {
      setConfirmingDeletionId(null);
    }
  };

  const semContas = !accountsLoading && accounts.length === 0;

  return (
    <div className="max-w-6xl mx-auto p-6 md:p-8 space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <PiggyBank className="w-7 h-7 text-green-600 dark:text-green-400" />
            Receitas
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Tudo que entra na casa: salários, hora extra, freelance, reembolsos e
            demais origens de renda.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenCreate}
            className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Nova receita
          </button>
          <Link
            href="/dashboard"
            className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-2"
          >
            <Home className="w-4 h-4" />
            Voltar ao painel
          </Link>
        </div>
      </div>

      {/* Erro da API */}
      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20 p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-red-900 dark:text-red-100">
              Não foi possível concluir a operação
            </h3>
            <p className="text-sm text-red-800 dark:text-red-200 mt-1">{error}</p>
          </div>
          <button
            onClick={clearError}
            aria-label="Fechar aviso de erro"
            className="text-red-600 dark:text-red-300 hover:text-red-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Confirmação de sucesso */}
      {feedback && (
        <div className="rounded-lg border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/20 p-4 flex items-start gap-3">
          <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-green-800 dark:text-green-200 flex-1">{feedback}</p>
          <button
            onClick={() => setFeedback(null)}
            aria-label="Fechar aviso de sucesso"
            className="text-green-700 dark:text-green-300 hover:text-green-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Nenhuma conta cadastrada */}
      {semContas && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20 p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800 dark:text-amber-200">
            Nenhuma conta cadastrada. Toda receita precisa de uma conta de destino —
            cadastre uma conta antes de lançar entradas.
          </p>
        </div>
      )}

      {/* Indicadores */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            Recebido no mês
          </p>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">
            {formatBRL(totalDoMes)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            Total registrado
          </p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {formatBRL(totalGeral)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {incomes.length} {incomes.length === 1 ? 'lançamento' : 'lançamentos'}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            Renda recorrente mensal
          </p>
          <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
            {formatBRL(totalRecorrenteMensal)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Base do rateio proporcional à renda
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            Origens diferentes
          </p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {chartData.length}
          </p>
        </div>
      </div>

      {/* Composição por origem + renda recorrente por responsável */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
            Composição da renda por origem
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Soma de tudo que já foi registrado, agrupado pela origem do dinheiro.
          </p>

          {chartData.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-400 py-10 text-center">
              Ainda não há receitas registradas para montar a composição.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={2}
                    >
                      {chartData.map((entry, index) => (
                        <Cell
                          key={entry.type}
                          fill={CHART_PALETTE[index % CHART_PALETTE.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number | string) => formatBRL(Number(value))}
                    />
                    <Legend verticalAlign="bottom" height={24} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <ul className="space-y-2">
                {chartData.map((item, index) => (
                  <li
                    key={item.type}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-3 h-3 rounded-sm flex-shrink-0"
                        style={{
                          backgroundColor: CHART_PALETTE[index % CHART_PALETTE.length],
                        }}
                      />
                      <span className="text-gray-700 dark:text-gray-300 truncate">
                        {item.name}
                      </span>
                    </span>
                    <span className="flex items-center gap-2 flex-shrink-0">
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {formatBRL(item.value)}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 w-14 text-right">
                        {formatPercent(item.percent)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
            <Repeat className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            Renda recorrente
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Considera a ocorrência mais recente de cada receita mensal recorrente.
          </p>

          {recurringMonthly.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-400 py-6 text-center">
              Nenhuma receita marcada como recorrente mensal. Sem isso, o rateio
              proporcional à renda não tem base de cálculo.
            </p>
          ) : (
            <ul className="space-y-3">
              {recurringMonthly.map(item => (
                <li
                  key={item.responsible}
                  className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-700 p-3"
                >
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200 capitalize">
                    {item.responsible}
                  </span>
                  <span className="text-sm font-bold text-gray-900 dark:text-white">
                    {formatBRL(item.monthlyAmount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Formulário */}
      {isFormOpen && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {editingId ? 'Editar receita' : 'Nova receita'}
            </h2>
            <button
              onClick={() => {
                resetForm();
                setIsFormOpen(false);
              }}
              aria-label="Fechar formulário"
              className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              <X className="w-5 h-5" />
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
                <label
                  htmlFor="income-description"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Descrição
                </label>
                <input
                  id="income-description"
                  type="text"
                  value={form.description}
                  onChange={event =>
                    setForm({ ...form, description: event.target.value })
                  }
                  placeholder="Ex.: Salário Bruno"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label
                  htmlFor="income-type"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Tipo
                </label>
                <select
                  id="income-type"
                  value={form.type}
                  onChange={event =>
                    setForm({ ...form, type: event.target.value as IncomeType })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  {INCOME_TYPE_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="income-amount"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Valor (R$)
                </label>
                <input
                  id="income-amount"
                  type="text"
                  inputMode="decimal"
                  value={form.amount}
                  onChange={event => setForm({ ...form, amount: event.target.value })}
                  placeholder="8500,00"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label
                  htmlFor="income-date"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Data
                </label>
                <input
                  id="income-date"
                  type="date"
                  value={form.date}
                  onChange={event => setForm({ ...form, date: event.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label
                  htmlFor="income-responsible"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Responsável
                </label>
                <select
                  id="income-responsible"
                  value={form.responsible}
                  onChange={event =>
                    setForm({ ...form, responsible: event.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  {RESPONSIBLE_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="income-account"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Conta de destino
                </label>
                <select
                  id="income-account"
                  value={form.accountId}
                  onChange={event => setForm({ ...form, accountId: event.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">Selecione a conta</option>
                  {accounts.map(account => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                      {account.institution ? ` — ${account.institution}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Recorrência */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  id="income-recurring"
                  type="checkbox"
                  checked={form.isRecurring}
                  onChange={event =>
                    setForm({ ...form, isRecurring: event.target.checked })
                  }
                  className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-green-600 focus:ring-green-500"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Receita recorrente
                </span>
              </label>

              {form.isRecurring && (
                <div className="mt-3">
                  <label
                    htmlFor="income-frequency"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    Frequência
                  </label>
                  <select
                    id="income-frequency"
                    value={form.frequency}
                    onChange={event =>
                      setForm({
                        ...form,
                        frequency: event.target.value as IncomeFrequency,
                      })
                    }
                    className="w-full md:w-64 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    {INCOME_FREQUENCY_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Apenas receitas recorrentes MENSAIS entram no cálculo do rateio
                    proporcional à renda.
                  </p>
                </div>
              )}
            </div>

            <div>
              <label
                htmlFor="income-observation"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Observação (opcional)
              </label>
              <textarea
                id="income-observation"
                value={form.observation}
                onChange={event => setForm({ ...form, observation: event.target.value })}
                rows={2}
                placeholder="Ex.: adiantamento de 40%"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={isSaving}
                className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors flex items-center gap-2"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                {editingId ? 'Salvar alterações' : 'Cadastrar receita'}
              </button>
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setIsFormOpen(false);
                }}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Lista */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-5 flex items-center gap-2">
          <Wallet className="w-5 h-5 text-green-600 dark:text-green-400" />
          Lançamentos
        </h2>

        {isLoading && incomes.length === 0 ? (
          <div className="animate-pulse space-y-3">
            <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        ) : incomes.length === 0 ? (
          <p className="text-sm text-gray-600 dark:text-gray-400 py-6 text-center">
            Nenhuma receita cadastrada ainda. Comece registrando os salários da casa.
          </p>
        ) : (
          <ul className="space-y-3">
            {incomes.map(income => (
              <li
                key={income.id}
                className="rounded-lg border border-gray-200 dark:border-gray-700 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-white truncate">
                      {income.description}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs">
                      <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                        {INCOME_TYPE_LABELS[income.type as string] || income.type}
                      </span>
                      <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                        {formatDateBR(income.date)}
                      </span>
                      <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 capitalize">
                        {income.responsible}
                      </span>
                      {income.account?.name && (
                        <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                          {income.account.name}
                        </span>
                      )}
                      {income.isRecurring && (
                        <span
                          className={`px-2 py-1 rounded flex items-center gap-1 ${
                            income.recurrenceCancelledAt
                              ? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 line-through'
                              : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-200'
                          }`}
                        >
                          <Repeat className="w-3 h-3" />
                          Recorrente
                          {income.frequency
                            ? ` · ${
                                INCOME_FREQUENCY_LABELS[income.frequency as string] ||
                                income.frequency
                              }`
                            : ''}
                        </span>
                      )}
                    </div>
                    {income.observation && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                        {income.observation}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold text-green-600 dark:text-green-400">
                      {formatBRL(toIncomeAmount(income.amount))}
                    </span>
                    <button
                      onClick={() => handleEdit(income)}
                      className="px-3 py-1.5 rounded text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                      Editar
                    </button>
                    {income.isRecurring && (
                      <button
                        onClick={() => handleToggleRecorrencia(income)}
                        disabled={alterandoRecorrenciaId === income.id}
                        title={
                          income.recurrenceCancelledAt
                            ? 'Voltar a projetar esta receita nos próximos meses'
                            : 'Parar de projetar esta receita nos próximos meses'
                        }
                        className="px-3 py-1.5 rounded text-xs font-medium border border-indigo-200 dark:border-indigo-900 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                      >
                        {alterandoRecorrenciaId === income.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Repeat className="w-3.5 h-3.5" />
                        )}
                        {income.recurrenceCancelledAt
                          ? 'Retomar recorrência'
                          : 'Cancelar recorrência'}
                      </button>
                    )}
                    {confirmingDeletionId !== income.id && (
                      <button
                        onClick={() => setConfirmingDeletionId(income.id)}
                        disabled={isSaving}
                        className="px-3 py-1.5 rounded text-xs font-medium border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Excluir
                      </button>
                    )}
                  </div>
                </div>

                {/* Confirmação inline — sem diálogo nativo */}
                {confirmingDeletionId === income.id && (
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 rounded bg-red-50 dark:bg-red-950/20 p-3">
                    <p className="text-sm text-red-800 dark:text-red-200 mb-3">
                      Excluir a receita <strong>{income.description}</strong> de{' '}
                      {formatBRL(toIncomeAmount(income.amount))}? Ela deixará de contar
                      no saldo e nas análises da casa.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleDelete(income.id)}
                        disabled={isSaving}
                        className="px-3 py-1.5 rounded text-xs font-medium bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white transition-colors flex items-center gap-1.5"
                      >
                        {isSaving ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                        Confirmar exclusão
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
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
