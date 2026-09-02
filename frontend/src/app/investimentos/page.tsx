'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { useGoals } from '@/hooks/useGoals';
import {
  GOAL_STATUS_LABELS,
  GOAL_TYPE_ICONS,
  GOAL_TYPE_LABELS,
  GOAL_TYPE_OPTIONS,
  GoalDto,
  GoalStatus,
  GoalType,
  toGoalAmount,
} from '@/types/goal';
import { formatBRL, formatDateBR, formatPercent } from '@/utils/format';
import { lerCampoMoeda, paraCampoMoeda } from '@/utils/money';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  Home,
  Loader2,
  Plus,
  Target,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';

interface GoalFormState {
  name: string;
  type: GoalType;
  targetAmount: string;
  currentAmount: string;
  investedAmount: string;
  institution: string;
  maturityDate: string;
  liquidity: string;
  deadline: string;
  monthlyContribution: string;
  description: string;
}

const emptyForm = (): GoalFormState => ({
  name: '',
  type: GoalType.EMERGENCY_FUND,
  targetAmount: '',
  currentAmount: '',
  investedAmount: '',
  institution: '',
  maturityDate: '',
  liquidity: '',
  deadline: '',
  monthlyContribution: '',
  description: '',
});

/** Opções de liquidez oferecidas no formulário. */
const LIQUIDEZ_OPCOES = [
  'Imediata (D+0)',
  'D+1',
  'D+30',
  'No vencimento',
];

function toDateInput(value: Date | string | null | undefined): string {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

const STATUS_FILTERS: Array<{ value: GoalStatus | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'Todas' },
  { value: GoalStatus.ACTIVE, label: 'Ativas' },
  { value: GoalStatus.COMPLETED, label: 'Concluídas' },
  { value: GoalStatus.CANCELLED, label: 'Canceladas' },
];

export default function InvestimentosPage() {
  const {
    goals,
    summary,
    statusFilter,
    isLoading,
    isSaving,
    error,
    fetchGoals,
    createGoal,
    updateGoal,
    addContribution,
    deleteGoal,
    clearError,
  } = useGoals();

  const [form, setForm] = useState<GoalFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Aporte: id do investimento aberto para aporte + valor digitado
  const [contributingId, setContributingId] = useState<string | null>(null);
  const [contributionAmount, setContributionAmount] = useState('');
  const [contributionDate, setContributionDate] = useState(
    new Date().toISOString().slice(0, 10),
  );

  // Confirmação inline de exclusão — sem `window.confirm`
  const [confirmingDeletionId, setConfirmingDeletionId] = useState<string | null>(null);

  /** Ids dos objetivos que o backend classificou como em risco. */
  const idsEmRisco = useMemo(
    () => new Set((summary?.goalsAtRisk || []).map(item => item.id)),
    [summary],
  );

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

  const handleEdit = (goal: GoalDto) => {
    setEditingId(goal.id);
    setForm({
      name: goal.name,
      type: (goal.type as GoalType) || GoalType.OTHER,
      targetAmount: goal.targetAmount ? String(toGoalAmount(goal.targetAmount)) : '',
      currentAmount: paraCampoMoeda(toGoalAmount(goal.currentAmount)),
      investedAmount:
        goal.investedAmount !== undefined && goal.investedAmount !== null
          ? String(toGoalAmount(goal.investedAmount))
          : '',
      institution: goal.institution ?? '',
      liquidity: goal.liquidity ?? '',
      maturityDate: goal.maturityDate
        ? new Date(goal.maturityDate).toISOString().slice(0, 10)
        : '',
      deadline: toDateInput(goal.deadline),
      monthlyContribution:
        goal.monthlyContribution !== null && goal.monthlyContribution !== undefined
          ? String(toGoalAmount(goal.monthlyContribution))
          : '',
      description: goal.description || '',
    });
    setValidationError(null);
    setIsFormOpen(true);
    setFeedback(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFeedback(null);
    setValidationError(null);

    const temObjetivo = form.targetAmount.trim().length > 0;
    const targetAmount = temObjetivo ? lerCampoMoeda(form.targetAmount) : 0;
    const investedAmount = form.investedAmount.trim()
      ? lerCampoMoeda(form.investedAmount)
      : undefined;
    const currentAmount = form.currentAmount.trim()
      ? lerCampoMoeda(form.currentAmount)
      : 0;
    const monthlyContribution = form.monthlyContribution.trim()
      ? lerCampoMoeda(form.monthlyContribution)
      : undefined;

    if (!form.name.trim()) {
      setValidationError('Informe o nome do investimento.');
      return;
    }
    // Objetivo é OPCIONAL: um CDB não tem meta, tem valor. Quando informado,
    // precisa ser um número válido — um alvo zerado esconderia a barra de
    // progresso sem explicar por quê.
    if (temObjetivo && (!Number.isFinite(targetAmount) || targetAmount <= 0)) {
      setValidationError('Informe um valor objetivo maior que zero. Ex.: 15000,00');
      return;
    }
    if (!Number.isFinite(currentAmount) || currentAmount < 0) {
      setValidationError('O valor já guardado não pode ser negativo.');
      return;
    }
    if (
      monthlyContribution !== undefined &&
      (!Number.isFinite(monthlyContribution) || monthlyContribution < 0)
    ) {
      setValidationError('O aporte mensal planejado não pode ser negativo.');
      return;
    }

    if (
      investedAmount !== undefined &&
      (!Number.isFinite(investedAmount) || investedAmount < 0)
    ) {
      setValidationError('O valor aportado não pode ser negativo.');
      return;
    }

    const payload = {
      name: form.name.trim(),
      type: form.type,
      ...(temObjetivo ? { targetAmount: Number(targetAmount.toFixed(2)) } : {}),
      currentAmount: Number(currentAmount.toFixed(2)),
      ...(investedAmount !== undefined
        ? { investedAmount: Number(investedAmount.toFixed(2)) }
        : {}),
      ...(form.institution.trim() ? { institution: form.institution.trim() } : {}),
      ...(form.liquidity ? { liquidity: form.liquidity } : {}),
      ...(form.maturityDate
        ? { maturityDate: new Date(`${form.maturityDate}T12:00:00`).toISOString() }
        : {}),
      ...(form.deadline
        ? { deadline: new Date(`${form.deadline}T12:00:00`).toISOString() }
        : {}),
      ...(monthlyContribution !== undefined
        ? { monthlyContribution: Number(monthlyContribution.toFixed(2)) }
        : {}),
      ...(form.description.trim() ? { description: form.description.trim() } : {}),
    };

    try {
      if (editingId) {
        await updateGoal(editingId, payload);
        setFeedback('Investimento atualizado com sucesso.');
      } else {
        await createGoal(payload);
        setFeedback('Investimento cadastrado com sucesso.');
      }
      resetForm();
      setIsFormOpen(false);
    } catch {
      // A mensagem do backend já é exibida pelo estado do hook
    }
  };

  const handleAddContribution = async (goalId: string) => {
    setFeedback(null);
    setValidationError(null);

    const amount = lerCampoMoeda(contributionAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setValidationError('Informe um valor de aporte maior que zero.');
      return;
    }

    try {
      const updated = await addContribution(goalId, {
        amount: Number(amount.toFixed(2)),
        date: new Date(`${contributionDate}T12:00:00`).toISOString(),
      });
      setContributingId(null);
      setContributionAmount('');
      setFeedback(
        `Aporte de ${formatBRL(amount)} registrado em "${updated.name}". ${
          updated.progress.message
        }`,
      );
    } catch {
      // A mensagem do backend já é exibida pelo estado do hook
    }
  };

  const handleDelete = async (id: string) => {
    setFeedback(null);
    try {
      await deleteGoal(id);
      setConfirmingDeletionId(null);
      setFeedback('Investimento excluído.');
    } catch {
      setConfirmingDeletionId(null);
    }
  };

  const handleFilter = (value: GoalStatus | 'ALL') => {
    fetchGoals(value === 'ALL' ? undefined : value).catch(() => undefined);
  };

  const activeFilter: GoalStatus | 'ALL' = statusFilter ?? 'ALL';

  return (
    <div className="max-w-6xl mx-auto p-6 md:p-8 space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Target className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
            Investimentos
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Onde o dinheiro está aplicado e para que ele está guardado: CDB,
            Tesouro, poupança e caixinhas com objetivo — com aportes, rendimento
            e prazo. Nada aqui entra como receita no fluxo de caixa.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenCreate}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Novo investimento
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

      {/* Patrimônio e rendimento consolidados */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-lg border-2 border-indigo-200 dark:border-indigo-800 bg-white dark:bg-gray-900 p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              Patrimônio investido
            </p>
            <p className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">
              {formatBRL(summary.totalCurrentAmount)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Valor atual de tudo o que está aplicado
            </p>
          </div>

          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              Aportado
            </p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">
              {formatBRL(summary.totalInvestedAmount)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              O que saiu do seu bolso
            </p>
          </div>

          {/*
            Rendimento pode ser NEGATIVO, e a tela mostra assim. Esconder
            prejuízo tornaria o painel inútil justamente quando ele mais importa.
          */}
          <div
            className={`rounded-lg border-2 bg-white dark:bg-gray-900 p-4 ${
              summary.totalProfit >= 0
                ? 'border-green-200 dark:border-green-800'
                : 'border-red-200 dark:border-red-800'
            }`}
          >
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              Rendimento
            </p>
            <p
              className={`text-3xl font-bold ${
                summary.totalProfit >= 0
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {summary.totalProfit >= 0 ? '+' : ''}
              {formatBRL(summary.totalProfit)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {summary.totalProfitPercentage === null
                ? 'Sem aporte registrado para calcular a rentabilidade'
                : `${formatPercent(summary.totalProfitPercentage)} sobre o aportado`}
            </p>
          </div>
        </div>
      )}

      {/* Resumo dos objetivos */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              Progresso dos objetivos
            </p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {summary.overallProgressPercentage === null
                ? 'Sem dados'
                : formatPercent(summary.overallProgressPercentage)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {formatBRL(summary.totalCurrentAmount)} de{' '}
              {formatBRL(summary.totalTargetAmount)}
            </p>
          </div>

          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              Falta guardar
            </p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {formatBRL(summary.totalRemainingAmount)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {summary.activeGoals} ativa(s) · {summary.completedGoals} concluída(s)
            </p>
          </div>

          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              Aporte mensal necessário
            </p>
            <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
              {formatBRL(summary.totalRequiredMonthlyContribution)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Planejado: {formatBRL(summary.totalPlannedMonthlyContribution)}
              {summary.monthlyContributionGap > 0
                ? ` · faltam ${formatBRL(summary.monthlyContributionGap)}/mês`
                : ''}
            </p>
          </div>

          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              Objetivos em risco
            </p>
            <p
              className={`text-2xl font-bold ${
                summary.goalsAtRisk.length > 0
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-green-600 dark:text-green-400'
              }`}
            >
              {summary.goalsAtRisk.length}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {summary.overdueGoals > 0
                ? `${summary.overdueGoals} com prazo vencido`
                : 'Nenhum prazo vencido'}
            </p>
          </div>
        </div>
      )}

      {/* Objetivos em risco em destaque */}
      {summary && summary.goalsAtRisk.length > 0 && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20 p-4">
          <h2 className="font-semibold text-amber-900 dark:text-amber-100 flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5" />
            Metas em risco
          </h2>
          <ul className="space-y-2">
            {summary.goalsAtRisk.map(item => (
              <li key={item.id} className="text-sm text-amber-800 dark:text-amber-200">
                <strong>{item.name}</strong>
                <span className="text-amber-700 dark:text-amber-300">
                  {' '}
                  ({GOAL_TYPE_LABELS[item.type as string] || item.type})
                </span>
                : {item.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Próximo prazo */}
      {summary?.nextDeadline && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 text-sm text-gray-700 dark:text-gray-300">
          Próximo prazo: <strong>{summary.nextDeadline.name}</strong> em{' '}
          {formatDateBR(summary.nextDeadline.deadline)}.
        </div>
      )}

      {/* Formulário */}
      {isFormOpen && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {editingId ? 'Editar meta' : 'Nova meta'}
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
                  htmlFor="goal-name"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Nome
                </label>
                <input
                  id="goal-name"
                  type="text"
                  value={form.name}
                  onChange={event => setForm({ ...form, name: event.target.value })}
                  placeholder="Ex.: Viagem para o Chile, CDB Nubank"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label
                  htmlFor="goal-type"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Tipo
                </label>
                <select
                  id="goal-type"
                  value={form.type}
                  onChange={event =>
                    setForm({ ...form, type: event.target.value as GoalType })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {GOAL_TYPE_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="goal-target"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Valor objetivo (R$)
                </label>
                <input
                  id="goal-target"
                  type="text"
                  inputMode="decimal"
                  value={form.targetAmount}
                  onChange={event =>
                    setForm({ ...form, targetAmount: event.target.value })
                  }
                  placeholder="15000,00"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Opcional. Deixe em branco para uma aplicação sem meta — um CDB
                  tem valor, não objetivo.
                </p>
              </div>

              <div>
                <label
                  htmlFor="goal-institution"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Instituição
                </label>
                <input
                  id="goal-institution"
                  type="text"
                  value={form.institution}
                  onChange={event =>
                    setForm({ ...form, institution: event.target.value })
                  }
                  placeholder="Ex.: Nubank, XP, Caixa"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label
                  htmlFor="goal-invested"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Aportado do próprio bolso (R$)
                </label>
                <input
                  id="goal-invested"
                  type="text"
                  inputMode="decimal"
                  value={form.investedAmount}
                  onChange={event =>
                    setForm({ ...form, investedAmount: event.target.value })
                  }
                  placeholder="10000,00"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  É a diferença entre este valor e o atual que revela o
                  rendimento. Em branco, assume o valor atual e o ganho começa
                  em zero.
                </p>
              </div>

              <div>
                <label
                  htmlFor="goal-liquidity"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Liquidez
                </label>
                <select
                  id="goal-liquidity"
                  value={form.liquidity}
                  onChange={event =>
                    setForm({ ...form, liquidity: event.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Não informada</option>
                  {LIQUIDEZ_OPCOES.map(opcao => (
                    <option key={opcao} value={opcao}>
                      {opcao}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="goal-maturity"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Vencimento
                </label>
                <input
                  id="goal-maturity"
                  type="date"
                  value={form.maturityDate}
                  onChange={event =>
                    setForm({ ...form, maturityDate: event.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Para CDB, Tesouro e afins.
                </p>
              </div>

              <div>
                <label
                  htmlFor="goal-current"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Valor atual (R$)
                </label>
                <input
                  id="goal-current"
                  type="text"
                  inputMode="decimal"
                  value={form.currentAmount}
                  onChange={event =>
                    setForm({ ...form, currentAmount: event.target.value })
                  }
                  placeholder="8000,00"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label
                  htmlFor="goal-deadline"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Prazo (opcional)
                </label>
                <input
                  id="goal-deadline"
                  type="date"
                  value={form.deadline}
                  onChange={event => setForm({ ...form, deadline: event.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Sem prazo, o sistema não calcula o aporte mensal necessário.
                </p>
              </div>

              <div>
                <label
                  htmlFor="goal-monthly"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Aporte mensal planejado (R$)
                </label>
                <input
                  id="goal-monthly"
                  type="text"
                  inputMode="decimal"
                  value={form.monthlyContribution}
                  onChange={event =>
                    setForm({ ...form, monthlyContribution: event.target.value })
                  }
                  placeholder="1000,00"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="goal-description"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Descrição (opcional)
              </label>
              <textarea
                id="goal-description"
                value={form.description}
                onChange={event => setForm({ ...form, description: event.target.value })}
                rows={2}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={isSaving}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors flex items-center gap-2"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                {editingId ? 'Salvar alterações' : 'Criar meta'}
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

      {/* Filtro por status */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map(filter => (
          <button
            key={filter.value}
            onClick={() => handleFilter(filter.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              activeFilter === filter.value
                ? 'border-indigo-600 bg-indigo-600 text-white'
                : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Lista de investimentos */}
      {isLoading && goals.length === 0 ? (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-6 w-1/3 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-24 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-24 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        </div>
      ) : goals.length === 0 ? (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-10 text-center">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Nenhum investimento cadastrado. Comece pela reserva de emergência,
            ou cadastre a poupança que você já tem.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {goals.map(goal => {
            const progress = goal.progress;
            const percentual = progress.progressPercentage ?? 0;
            const emRisco = idsEmRisco.has(goal.id) || progress.isOverdue;
            const concluida = progress.isCompleted;

            const barColor = concluida
              ? 'bg-green-500'
              : emRisco
                ? 'bg-amber-500'
                : 'bg-indigo-500';

            return (
              <div
                key={goal.id}
                className={`rounded-lg border bg-white dark:bg-gray-900 p-6 ${
                  emRisco && !concluida
                    ? 'border-amber-300 dark:border-amber-800'
                    : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                      <span aria-hidden>
                        {GOAL_TYPE_ICONS[goal.type as string] || '🎯'}
                      </span>
                      {goal.name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
                      <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                        {GOAL_TYPE_LABELS[goal.type as string] || goal.type}
                      </span>
                      <span
                        className={`px-2 py-1 rounded ${
                          goal.status === GoalStatus.COMPLETED
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200'
                            : goal.status === GoalStatus.CANCELLED
                              ? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                              : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-200'
                        }`}
                      >
                        {GOAL_STATUS_LABELS[goal.status as string] || goal.status}
                      </span>
                      {goal.institution && (
                        <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                          {goal.institution}
                        </span>
                      )}
                      {goal.liquidity && (
                        <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                          Liquidez: {goal.liquidity}
                        </span>
                      )}
                      {goal.maturityDate && (
                        <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                          Vence em {formatDateBR(goal.maturityDate)}
                        </span>
                      )}
                      {progress.deadline && (
                        <span
                          className={`px-2 py-1 rounded ${
                            progress.isOverdue
                              ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200'
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                          }`}
                        >
                          Prazo: {formatDateBR(progress.deadline)}
                          {progress.monthsRemaining !== null &&
                            !progress.isOverdue &&
                            ` · ${progress.monthsRemaining} ${
                              progress.monthsRemaining === 1 ? 'mês' : 'meses'
                            }`}
                        </span>
                      )}
                      {emRisco && !concluida && (
                        <span className="px-2 py-1 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Em risco
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setContributingId(
                          contributingId === goal.id ? null : goal.id,
                        );
                        setContributionAmount('');
                        setValidationError(null);
                      }}
                      className="px-3 py-1.5 rounded text-xs font-medium bg-green-600 hover:bg-green-700 text-white transition-colors flex items-center gap-1.5"
                    >
                      <TrendingUp className="w-3.5 h-3.5" />
                      Registrar aporte
                    </button>
                    <button
                      onClick={() => handleEdit(goal)}
                      className="px-3 py-1.5 rounded text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                      Editar
                    </button>
                    {confirmingDeletionId !== goal.id && (
                      <button
                        onClick={() => setConfirmingDeletionId(goal.id)}
                        disabled={isSaving}
                        className="px-3 py-1.5 rounded text-xs font-medium border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Excluir
                      </button>
                    )}
                  </div>
                </div>

                {/* Valor atual, aportado e rendimento */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                  <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-3">
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                      Valor atual
                    </p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">
                      {formatBRL(progress.currentAmount)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-3">
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                      Aportado
                    </p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">
                      {formatBRL(progress.investedAmount)}
                    </p>
                  </div>
                  <div
                    className={`rounded-lg p-3 ${
                      progress.profit >= 0
                        ? 'bg-green-50 dark:bg-green-950/20'
                        : 'bg-red-50 dark:bg-red-950/20'
                    }`}
                  >
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                      Rendimento
                    </p>
                    <p
                      className={`text-lg font-bold ${
                        progress.profit >= 0
                          ? 'text-green-700 dark:text-green-400'
                          : 'text-red-700 dark:text-red-400'
                      }`}
                    >
                      {progress.profit >= 0 ? '+' : ''}
                      {formatBRL(progress.profit)}
                      {progress.profitPercentage !== null && (
                        <span className="text-xs font-medium">
                          {' '}
                          ({formatPercent(progress.profitPercentage)})
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                {/*
                  A barra de progresso só aparece quando existe objetivo. Numa
                  aplicação sem meta ela mostraria 0% para sempre, sugerindo
                  atraso onde não há nada a atingir.
                */}
                {progress.progressPercentage !== null && (
                  <div className="mb-4">
                    <div className="flex items-baseline justify-between mb-2">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        Objetivo: {formatBRL(progress.targetAmount)}
                      </span>
                      <span className="text-sm font-bold text-gray-900 dark:text-white">
                        {formatPercent(progress.progressPercentage)}
                      </span>
                    </div>
                    <div
                      className="h-3 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden"
                      role="progressbar"
                      aria-valuenow={Math.round(percentual)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Progresso de ${goal.name}`}
                    >
                      <div
                        className={`h-full ${barColor} transition-all`}
                        style={{ width: `${Math.min(Math.max(percentual, 0), 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      Falta {formatBRL(progress.remainingAmount)}
                    </p>
                  </div>
                )}

                {/* Aporte planejado × necessário */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                  <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-3">
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                      Aporte planejado
                    </p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {progress.plannedMonthlyContribution === null
                        ? 'Não informado'
                        : `${formatBRL(progress.plannedMonthlyContribution)}/mês`}
                    </p>
                  </div>

                  <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-3">
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                      Aporte necessário
                    </p>
                    <p
                      className={`text-sm font-semibold ${
                        progress.isPlannedContributionSufficient === false
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-gray-900 dark:text-white'
                      }`}
                    >
                      {progress.requiredMonthlyContribution === null
                        ? 'Depende de um prazo'
                        : `${formatBRL(progress.requiredMonthlyContribution)}/mês`}
                    </p>
                    {progress.monthlyContributionGap !== null &&
                      progress.monthlyContributionGap > 0 && (
                        <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                          Faltam {formatBRL(progress.monthlyContributionGap)}/mês
                        </p>
                      )}
                  </div>

                  <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-3">
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                      Conclusão no ritmo atual
                    </p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {progress.projectedCompletionDate
                        ? formatDateBR(progress.projectedCompletionDate)
                        : 'Sem estimativa'}
                    </p>
                    {progress.willMeetDeadline === false && (
                      <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                        Não bate o prazo neste ritmo
                      </p>
                    )}
                  </div>
                </div>

                {/* Leitura em português vinda do backend */}
                <p className="text-sm text-gray-700 dark:text-gray-300 rounded-lg bg-gray-50 dark:bg-gray-800/50 p-3">
                  {progress.message}
                </p>

                {goal.description && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                    {goal.description}
                  </p>
                )}

                {/* Formulário de aporte */}
                {contributingId === goal.id && (
                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                      Novo aporte em {goal.name}
                    </h4>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="flex-1">
                        <label
                          htmlFor={`contribution-amount-${goal.id}`}
                          className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
                        >
                          Valor (R$)
                        </label>
                        <input
                          id={`contribution-amount-${goal.id}`}
                          type="text"
                          inputMode="decimal"
                          value={contributionAmount}
                          onChange={event => setContributionAmount(event.target.value)}
                          placeholder="1000,00"
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                      </div>
                      <div className="flex-1">
                        <label
                          htmlFor={`contribution-date-${goal.id}`}
                          className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
                        >
                          Data
                        </label>
                        <input
                          id={`contribution-date-${goal.id}`}
                          type="date"
                          value={contributionDate}
                          onChange={event => setContributionDate(event.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                      </div>
                      <div className="flex items-end gap-2">
                        <button
                          onClick={() => handleAddContribution(goal.id)}
                          disabled={isSaving}
                          className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium transition-colors flex items-center gap-2"
                        >
                          {isSaving ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Check className="w-4 h-4" />
                          )}
                          Registrar
                        </button>
                        <button
                          onClick={() => setContributingId(null)}
                          className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Confirmação inline de exclusão — sem diálogo nativo */}
                {confirmingDeletionId === goal.id && (
                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 rounded bg-red-50 dark:bg-red-950/20 p-3">
                    <p className="text-sm text-red-800 dark:text-red-200 mb-3">
                      Excluir o investimento <strong>{goal.name}</strong>? O histórico de
                      aportes registrado nela será perdido.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleDelete(goal.id)}
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
