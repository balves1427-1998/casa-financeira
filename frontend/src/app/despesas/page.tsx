'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useExpenses, type Expense } from '@/hooks/useExpenses';
import { useAccounts } from '@/hooks/useAccounts';
import { usePlannedAccounts } from '@/hooks/usePlannedAccounts';
import { useCreditCards } from '@/hooks/useCreditCards';
import { useCategories } from '@/hooks/useCategories';
import {
  DEFAULT_EXPENSE_CATEGORIES,
  EXPENSE_FREQUENCY_LABELS,
  EXPENSE_FREQUENCY_OPTIONS,
  EXPENSE_ORIGIN_LABELS,
  ExpenseOrigin,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_OPTIONS,
  PaymentMethod,
  RecurrenceFrequency,
  toExpenseAmount,
} from '@/types/expense';
import { formatBRL, formatDateBR, formatPercent } from '@/utils/format';
import { lerCampoMoeda, paraCampoMoeda } from '@/utils/money';
import {
  AlertCircle,
  Check,
  CreditCard,
  Filter,
  Home,
  Layers,
  Loader2,
  Plus,
  Receipt,
  Repeat,
  Trash2,
  TrendingDown,
  X,
} from 'lucide-react';

/** Responsáveis aceitos pelo backend (`@IsEnum(['bruno', 'giovanna'])`). */
const RESPONSIBLE_OPTIONS = [
  { value: 'bruno', label: 'Bruno' },
  { value: 'giovanna', label: 'Giovanna' },
];

/**
 * Paleta categórica do resumo por categoria.
 * Tons escolhidos para manterem contraste tanto no tema claro quanto no escuro.
 */
const CHART_PALETTE = [
  '#d03b3b',
  '#eb6834',
  '#fab219',
  '#3f9e6b',
  '#2a78d6',
  '#a05fd1',
  '#0e9aa7',
  '#8c6d4a',
  '#c2417f',
  '#6b7280',
];

interface ExpenseFormState {
  description: string;
  establishment: string;
  amount: string;
  date: string;
  category: string;
  subcategory: string;
  responsible: string;
  paymentMethod: PaymentMethod;
  accountId: string;
  creditCardId: string;
  isRecurring: boolean;
  frequency: RecurrenceFrequency;
  installments: string;
  currentInstallment: string;
  observation: string;
}

const hoje = () => new Date().toISOString().slice(0, 10);

const emptyForm = (): ExpenseFormState => ({
  description: '',
  establishment: '',
  amount: '',
  date: hoje(),
  category: '',
  subcategory: '',
  responsible: 'bruno',
  paymentMethod: PaymentMethod.DEBIT,
  accountId: '',
  creditCardId: '',
  isRecurring: false,
  frequency: RecurrenceFrequency.MONTHLY,
  installments: '',
  currentInstallment: '',
  observation: '',
});

/** Data ISO (`2026-08-26T00:00:00Z`) → valor de `<input type="date">`. */
function toDateInput(value: Date | string | null | undefined): string {
  if (!value) return hoje();
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return hoje();
  return date.toISOString().slice(0, 10);
}

/** Primeiro e último dia do mês corrente, no formato do `<input type="date">`. */
function mesAtual(): { inicio: string; fim: string } {
  const agora = new Date();
  const inicio = new Date(agora.getFullYear(), agora.getMonth(), 1);
  const fim = new Date(agora.getFullYear(), agora.getMonth() + 1, 0);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`;
  return { inicio: iso(inicio), fim: iso(fim) };
}

export default function DespesasPage() {
  const {
    expenses,
    isLoading,
    isSaving,
    error,
    createExpense,
    updateExpense,
    deleteExpense,
    setExpensePaid,
    setExpenseRecurrence,
    clearError,
  } = useExpenses();

  const { planned, fetchPlanned: refetchPlanned } = usePlannedAccounts();
  const { accounts, isLoading: accountsLoading } = useAccounts();
  const { cards } = useCreditCards();
  const { categories } = useCategories();

  const [form, setForm] = useState<ExpenseFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Confirmação inline de exclusão — sem `window.confirm`
  const [confirmingDeletionId, setConfirmingDeletionId] = useState<string | null>(null);

  /** Id da despesa cujo ícone de pagamento está sendo alternado agora. */
  const [alterandoPagamentoId, setAlterandoPagamentoId] = useState<string | null>(
    null,
  );

  /** Id da despesa cuja recorrência está sendo encerrada ou retomada. */
  const [alterandoRecorrenciaId, setAlterandoRecorrenciaId] = useState<
    string | null
  >(null);

  /**
   * Encerra ou retoma a série recorrente.
   *
   * O `refetchPlanned` no fim é o que faz o bloco de previstas refletir a
   * mudança na hora — sem ele, os meses futuros continuariam listados depois
   * de o usuário cancelar.
   */
  const handleToggleRecorrencia = async (expense: Expense) => {
    const encerrando = !expense.recurrenceCancelledAt;
    setAlterandoRecorrenciaId(expense.id);
    setFeedback(null);
    try {
      await setExpenseRecurrence(expense.id, !encerrando);
      await refetchPlanned({ silent: true });
      setFeedback(
        encerrando
          ? `"${expense.description}" não será mais projetada nos próximos meses. A despesa deste mês continua no histórico.`
          : `"${expense.description}" voltou a ser projetada para os próximos 12 meses.`,
      );
    } catch {
      // A mensagem já vem pelo `error` do hook.
    } finally {
      setAlterandoRecorrenciaId(null);
    }
  };

  /**
   * Alterna a situação de pagamento pelo ícone da lista.
   *
   * O estado de "salvando" é por linha, e não global: com um único indicador,
   * clicar em uma despesa desabilitaria o ícone de todas as outras.
   */
  const handleTogglePago = async (expense: Expense) => {
    setAlterandoPagamentoId(expense.id);
    setFeedback(null);
    try {
      await setExpensePaid(expense.id, !expense.isPaid);
      setFeedback(
        expense.isPaid
          ? `"${expense.description}" voltou para pendente.`
          : `"${expense.description}" marcada como paga.`,
      );
    } catch {
      // A mensagem já vem pelo `error` do hook.
    } finally {
      setAlterandoPagamentoId(null);
    }
  };

  // Filtros
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroResponsavel, setFiltroResponsavel] = useState('');
  const [filtroInicio, setFiltroInicio] = useState('');
  const [filtroFim, setFiltroFim] = useState('');

  const temFiltro = Boolean(
    filtroCategoria || filtroResponsavel || filtroInicio || filtroFim,
  );

  const limparFiltros = () => {
    setFiltroCategoria('');
    setFiltroResponsavel('');
    setFiltroInicio('');
    setFiltroFim('');
  };

  const aplicarMesAtual = () => {
    const { inicio, fim } = mesAtual();
    setFiltroInicio(inicio);
    setFiltroFim(fim);
  };

  /** Contas comuns (o cartão de crédito tem seu próprio seletor). */
  const contasDePagamento = useMemo(
    () => accounts.filter(account => account.type !== 'credit_card'),
    [accounts],
  );

  /**
   * Sugestões de categoria: as cadastradas pelo usuário somadas às categorias
   * padrão do escopo e às que já aparecem nos lançamentos.
   */
  const sugestoesCategoria = useMemo(() => {
    const nomes = new Set<string>();
    categories
      .filter(categoria => categoria.type !== 'income')
      .forEach(categoria => nomes.add(categoria.name));
    expenses.forEach(expense => expense.category && nomes.add(expense.category));
    DEFAULT_EXPENSE_CATEGORIES.forEach(nome => nomes.add(nome));
    return Array.from(nomes).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [categories, expenses]);

  /** Categorias efetivamente usadas — é o que faz sentido oferecer no filtro. */
  const categoriasLancadas = useMemo(() => {
    const nomes = new Set<string>();
    expenses.forEach(expense => expense.category && nomes.add(expense.category));
    return Array.from(nomes).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [expenses]);

  const despesasFiltradas = useMemo(() => {
    const inicio = filtroInicio ? new Date(`${filtroInicio}T00:00:00`) : null;
    const fim = filtroFim ? new Date(`${filtroFim}T23:59:59`) : null;

    return expenses
      .filter(expense => {
        if (filtroCategoria && expense.category !== filtroCategoria) return false;
        if (filtroResponsavel && expense.responsible !== filtroResponsavel) return false;

        const data = new Date(expense.date);
        if (inicio && data < inicio) return false;
        if (fim && data > fim) return false;
        return true;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [expenses, filtroCategoria, filtroResponsavel, filtroInicio, filtroFim]);

  const totalFiltrado = useMemo(
    () => despesasFiltradas.reduce((sum, e) => sum + toExpenseAmount(e.amount), 0),
    [despesasFiltradas],
  );

  /**
   * Ocorrências ainda não realizadas das despesas recorrentes.
   *
   * Vêm do Planejado, onde a série é projetada. Aparecem aqui porque é nesta
   * tela que se pergunta "o que tenho de Netflix em outubro?" — mas ficam num
   * bloco à parte e **fora do total gasto**: nada saiu do caixa ainda. Contá-las
   * como despesa faria outubro mostrar dinheiro gasto que ainda está na conta.
   */
  const previstasFiltradas = useMemo(() => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const inicio = filtroInicio ? new Date(`${filtroInicio}T00:00:00`) : hoje;
    const fim = filtroFim ? new Date(`${filtroFim}T23:59:59`) : null;

    return planned
      .filter(conta => {
        // Só projeções de recorrência; contas cadastradas à mão têm a sua tela.
        if (!conta.recurringExpenseId) return false;
        if (conta.status === 'paid' || conta.status === 'cancelled') return false;
        if (filtroCategoria && conta.category !== filtroCategoria) return false;
        if (filtroResponsavel && conta.responsible !== filtroResponsavel)
          return false;

        const vencimento = new Date(conta.dueDate);
        if (vencimento < inicio) return false;
        if (fim && vencimento > fim) return false;
        return true;
      })
      .sort(
        (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
      );
  }, [planned, filtroCategoria, filtroResponsavel, filtroInicio, filtroFim]);

  const totalPrevisto = useMemo(
    () => previstasFiltradas.reduce((sum, p) => sum + Number(p.amount || 0), 0),
    [previstasFiltradas],
  );

  const totalDoMes = useMemo(() => {
    const agora = new Date();
    return expenses
      .filter(expense => {
        const data = new Date(expense.date);
        return (
          data.getMonth() === agora.getMonth() &&
          data.getFullYear() === agora.getFullYear()
        );
      })
      .reduce((sum, e) => sum + toExpenseAmount(e.amount), 0);
  }, [expenses]);

  /**
   * Resumo por categoria calculado sobre a lista JÁ FILTRADA — o gráfico
   * precisa responder aos filtros, senão contradiz a lista logo abaixo dele.
   */
  const resumoPorCategoria = useMemo(() => {
    const mapa = new Map<string, { total: number; count: number }>();

    despesasFiltradas.forEach(expense => {
      const chave = expense.category || 'Sem categoria';
      const atual = mapa.get(chave) || { total: 0, count: 0 };
      atual.total += toExpenseAmount(expense.amount);
      atual.count += 1;
      mapa.set(chave, atual);
    });

    const total = Array.from(mapa.values()).reduce((sum, item) => sum + item.total, 0);

    return Array.from(mapa.entries())
      .map(([category, item]) => ({
        category,
        total: item.total,
        count: item.count,
        percent: total > 0 ? (item.total / total) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [despesasFiltradas]);

  const maiorCategoria = resumoPorCategoria[0] || null;

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

  const handleEdit = (expense: Expense) => {
    setEditingId(expense.id);
    setForm({
      description: expense.description || '',
      establishment: expense.establishment || '',
      amount: paraCampoMoeda(toExpenseAmount(expense.amount)),
      date: toDateInput(expense.date),
      category: expense.category || '',
      subcategory: expense.subcategory || '',
      responsible: expense.responsible || 'bruno',
      paymentMethod: (expense.paymentMethod as PaymentMethod) || PaymentMethod.DEBIT,
      accountId: expense.accountId || '',
      creditCardId: expense.creditCardId || '',
      isRecurring: Boolean(expense.isRecurring),
      frequency:
        (expense.frequency as RecurrenceFrequency) || RecurrenceFrequency.MONTHLY,
      installments: expense.installments ? String(expense.installments) : '',
      currentInstallment: expense.currentInstallment
        ? String(expense.currentInstallment)
        : '',
      observation: expense.observation || '',
    });
    setValidationError(null);
    setIsFormOpen(true);
    setFeedback(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFeedback(null);
    setValidationError(null);

    const amount = lerCampoMoeda(form.amount);
    const totalParcelas = form.installments.trim()
      ? Number(form.installments.trim())
      : undefined;
    const parcelaAtual = form.currentInstallment.trim()
      ? Number(form.currentInstallment.trim())
      : undefined;

    if (!form.description.trim()) {
      setValidationError('Informe a descrição da despesa.');
      return;
    }
    if (!Number.isFinite(amount) || amount < 0.01) {
      setValidationError('Informe um valor de pelo menos R$ 0,01. Ex.: 149,90');
      return;
    }
    if (!form.category.trim()) {
      setValidationError('Informe a categoria da despesa.');
      return;
    }
    if (totalParcelas !== undefined && (!Number.isInteger(totalParcelas) || totalParcelas < 1)) {
      setValidationError('O total de parcelas precisa ser um número inteiro a partir de 1.');
      return;
    }
    if (parcelaAtual !== undefined && (!Number.isInteger(parcelaAtual) || parcelaAtual < 1)) {
      setValidationError('A parcela atual precisa ser um número inteiro a partir de 1.');
      return;
    }
    if (
      totalParcelas !== undefined &&
      parcelaAtual !== undefined &&
      parcelaAtual > totalParcelas
    ) {
      setValidationError(
        `A parcela atual (${parcelaAtual}) não pode ser maior que o total de parcelas (${totalParcelas}).`,
      );
      return;
    }

    const usaCartao = form.paymentMethod === PaymentMethod.CREDIT;

    /**
     * O backend roda com `whitelist` + `forbidNonWhitelisted`: campos fora do
     * DTO devolvem 400. Já os opcionais aceitam `null`, então na edição
     * enviamos `null` para limpar de fato o que o usuário apagou — omitir
     * manteria o valor antigo no banco.
     */
    const payload: Record<string, unknown> = {
      description: form.description.trim(),
      amount: Number(amount.toFixed(2)),
      date: new Date(`${form.date}T12:00:00`).toISOString(),
      category: form.category.trim(),
      responsible: form.responsible,
      paymentMethod: form.paymentMethod,
      isRecurring: form.isRecurring,
      establishment: form.establishment.trim() || (editingId ? null : undefined),
      subcategory: form.subcategory.trim() || (editingId ? null : undefined),
      observation: form.observation.trim() || (editingId ? null : undefined),
      frequency: form.isRecurring ? form.frequency : editingId ? null : undefined,
      installments: totalParcelas ?? (editingId ? null : undefined),
      currentInstallment: parcelaAtual ?? (editingId ? null : undefined),
      accountId: usaCartao
        ? editingId
          ? null
          : undefined
        : form.accountId || (editingId ? null : undefined),
      creditCardId: usaCartao
        ? form.creditCardId || (editingId ? null : undefined)
        : editingId
          ? null
          : undefined,
    };

    if (!editingId) {
      payload.origin = ExpenseOrigin.MANUAL;
    }

    // Remove as chaves `undefined` — o axios as omitiria, mas deixar explícito
    // evita enviar `"undefined"` em qualquer serialização futura.
    Object.keys(payload).forEach(chave => {
      if (payload[chave] === undefined) delete payload[chave];
    });

    try {
      if (editingId) {
        await updateExpense(editingId, payload);
        setFeedback('Despesa atualizada com sucesso.');
      } else {
        await createExpense(payload);
        setFeedback('Despesa cadastrada com sucesso.');
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
      await deleteExpense(id);
      setConfirmingDeletionId(null);
      setFeedback('Despesa excluída.');
      if (editingId === id) {
        resetForm();
        setIsFormOpen(false);
      }
    } catch {
      setConfirmingDeletionId(null);
    }
  };

  const semDespesas = !isLoading && expenses.length === 0;
  const semContas = !accountsLoading && accounts.length === 0;

  const inputClass =
    'w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500';
  const labelClass =
    'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

  return (
    <div className="max-w-6xl mx-auto p-6 md:p-8 space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Receipt className="w-7 h-7 text-red-600 dark:text-red-400" />
            Despesas
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Tudo que sai da casa: compras, contas, assinaturas e parcelamentos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenCreate}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Nova despesa
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
            Nenhuma conta cadastrada. A despesa pode ser lançada mesmo assim, mas
            sem vincular a conta o saldo da casa não reflete a saída.{' '}
            <Link href="/contas" className="underline font-medium">
              Cadastrar conta
            </Link>
            .
          </p>
        </div>
      )}

      {/* Indicadores — só fazem sentido quando existe algo lançado */}
      {semDespesas ? (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-8 text-center">
          <TrendingDown className="w-10 h-10 mx-auto text-gray-400 dark:text-gray-600 mb-3" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Nenhuma despesa cadastrada ainda
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 max-w-md mx-auto">
            Sem lançamentos não há o que somar nem comparar: totais, resumo por
            categoria e média só aparecem depois da primeira despesa. Comece pelas
            contas fixas do mês — aluguel, mercado, assinaturas.
          </p>
          <button
            onClick={handleOpenCreate}
            className="mt-4 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Cadastrar a primeira despesa
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              Gasto no mês atual
            </p>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">
              {formatBRL(totalDoMes)}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              {temFiltro ? 'Total do filtro' : 'Total registrado'}
            </p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {formatBRL(totalFiltrado)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {despesasFiltradas.length}{' '}
              {despesasFiltradas.length === 1 ? 'lançamento' : 'lançamentos'}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              Maior categoria
            </p>
            {maiorCategoria ? (
              <>
                <p className="text-2xl font-bold text-gray-900 dark:text-white truncate">
                  {maiorCategoria.category}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {formatBRL(maiorCategoria.total)} ·{' '}
                  {formatPercent(maiorCategoria.percent)}
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Nada no filtro atual
              </p>
            )}
          </div>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              Ticket médio
            </p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {despesasFiltradas.length > 0
                ? formatBRL(totalFiltrado / despesasFiltradas.length)
                : '—'}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Valor médio por lançamento
            </p>
          </div>
        </div>
      )}

      {/* Filtros */}
      {!semDespesas && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Filter className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              Filtros
            </h2>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={aplicarMesAtual}
                className="px-3 py-1.5 rounded text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Mês atual
              </button>
              {temFiltro && (
                <button
                  onClick={limparFiltros}
                  className="px-3 py-1.5 rounded text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  Limpar filtros
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label htmlFor="filtro-categoria" className={labelClass}>
                Categoria
              </label>
              <select
                id="filtro-categoria"
                value={filtroCategoria}
                onChange={event => setFiltroCategoria(event.target.value)}
                className={inputClass}
              >
                <option value="">Todas</option>
                {categoriasLancadas.map(categoria => (
                  <option key={categoria} value={categoria}>
                    {categoria}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="filtro-responsavel" className={labelClass}>
                Responsável
              </label>
              <select
                id="filtro-responsavel"
                value={filtroResponsavel}
                onChange={event => setFiltroResponsavel(event.target.value)}
                className={inputClass}
              >
                <option value="">Todos</option>
                {RESPONSIBLE_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="filtro-inicio" className={labelClass}>
                De
              </label>
              <input
                id="filtro-inicio"
                type="date"
                value={filtroInicio}
                onChange={event => setFiltroInicio(event.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="filtro-fim" className={labelClass}>
                Até
              </label>
              <input
                id="filtro-fim"
                type="date"
                value={filtroFim}
                onChange={event => setFiltroFim(event.target.value)}
                className={inputClass}
              />
            </div>
          </div>
        </div>
      )}

      {/* Resumo por categoria */}
      {!semDespesas && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
            <Layers className="w-5 h-5 text-red-600 dark:text-red-400" />
            Resumo por categoria
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            {temFiltro
              ? 'Considera apenas os lançamentos do filtro aplicado acima.'
              : 'Considera todos os lançamentos registrados.'}
          </p>

          {resumoPorCategoria.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-400 py-10 text-center">
              Nenhum lançamento no filtro atual — não há o que resumir.
            </p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
              <div
                className="w-full"
                style={{ height: Math.max(180, resumoPorCategoria.length * 38) }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={resumoPorCategoria}
                    layout="vertical"
                    margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
                  >
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="category"
                      width={110}
                      tick={{ fontSize: 12, fill: 'currentColor' }}
                      className="text-gray-600 dark:text-gray-400"
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(148, 163, 184, 0.15)' }}
                      formatter={(value: number | string) => formatBRL(Number(value))}
                    />
                    <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                      {resumoPorCategoria.map((entry, index) => (
                        <Cell
                          key={entry.category}
                          fill={CHART_PALETTE[index % CHART_PALETTE.length]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <ul className="space-y-2">
                {resumoPorCategoria.map((item, index) => (
                  <li
                    key={item.category}
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
                        {item.category}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                        ({item.count})
                      </span>
                    </span>
                    <span className="flex items-center gap-2 flex-shrink-0">
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {formatBRL(item.total)}
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
      )}

      {/* Formulário */}
      {isFormOpen && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {editingId ? 'Editar despesa' : 'Nova despesa'}
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
                <label htmlFor="expense-description" className={labelClass}>
                  Descrição
                </label>
                <input
                  id="expense-description"
                  type="text"
                  value={form.description}
                  onChange={event =>
                    setForm({ ...form, description: event.target.value })
                  }
                  placeholder="Ex.: Compra do mês"
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="expense-establishment" className={labelClass}>
                  Estabelecimento (opcional)
                </label>
                <input
                  id="expense-establishment"
                  type="text"
                  value={form.establishment}
                  onChange={event =>
                    setForm({ ...form, establishment: event.target.value })
                  }
                  placeholder="Ex.: Atacadão"
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="expense-amount" className={labelClass}>
                  Valor (R$)
                </label>
                <input
                  id="expense-amount"
                  type="text"
                  inputMode="decimal"
                  value={form.amount}
                  onChange={event => setForm({ ...form, amount: event.target.value })}
                  placeholder="149,90"
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="expense-date" className={labelClass}>
                  Data
                </label>
                <input
                  id="expense-date"
                  type="date"
                  value={form.date}
                  onChange={event => setForm({ ...form, date: event.target.value })}
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="expense-category" className={labelClass}>
                  Categoria
                </label>
                <input
                  id="expense-category"
                  type="text"
                  list="expense-category-options"
                  value={form.category}
                  onChange={event => setForm({ ...form, category: event.target.value })}
                  placeholder="Ex.: Supermercado"
                  className={inputClass}
                />
                <datalist id="expense-category-options">
                  {sugestoesCategoria.map(categoria => (
                    <option key={categoria} value={categoria} />
                  ))}
                </datalist>
              </div>

              <div>
                <label htmlFor="expense-subcategory" className={labelClass}>
                  Subcategoria (opcional)
                </label>
                <input
                  id="expense-subcategory"
                  type="text"
                  value={form.subcategory}
                  onChange={event =>
                    setForm({ ...form, subcategory: event.target.value })
                  }
                  placeholder="Ex.: Hortifruti"
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="expense-responsible" className={labelClass}>
                  Responsável
                </label>
                <select
                  id="expense-responsible"
                  value={form.responsible}
                  onChange={event =>
                    setForm({ ...form, responsible: event.target.value })
                  }
                  className={inputClass}
                >
                  {RESPONSIBLE_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="expense-payment-method" className={labelClass}>
                  Forma de pagamento
                </label>
                <select
                  id="expense-payment-method"
                  value={form.paymentMethod}
                  onChange={event =>
                    setForm({
                      ...form,
                      paymentMethod: event.target.value as PaymentMethod,
                    })
                  }
                  className={inputClass}
                >
                  {PAYMENT_METHOD_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {form.paymentMethod === PaymentMethod.CREDIT ? (
                <div className="md:col-span-2">
                  <label htmlFor="expense-credit-card" className={labelClass}>
                    Cartão de crédito
                  </label>
                  <select
                    id="expense-credit-card"
                    value={form.creditCardId}
                    onChange={event =>
                      setForm({ ...form, creditCardId: event.target.value })
                    }
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
                  {cards.length === 0 && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Nenhum cartão cadastrado.{' '}
                      <Link href="/cards" className="underline">
                        Cadastrar cartão
                      </Link>
                      .
                    </p>
                  )}
                </div>
              ) : (
                <div className="md:col-span-2">
                  <label htmlFor="expense-account" className={labelClass}>
                    Conta de origem
                  </label>
                  <select
                    id="expense-account"
                    value={form.accountId}
                    onChange={event =>
                      setForm({ ...form, accountId: event.target.value })
                    }
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
              )}
            </div>

            {/* Recorrência */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  id="expense-recurring"
                  type="checkbox"
                  checked={form.isRecurring}
                  onChange={event =>
                    setForm({ ...form, isRecurring: event.target.checked })
                  }
                  className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-red-600 focus:ring-red-500"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Despesa recorrente
                </span>
              </label>

              {form.isRecurring && (
                <div className="mt-3">
                  <label htmlFor="expense-frequency" className={labelClass}>
                    Frequência
                  </label>
                  <select
                    id="expense-frequency"
                    value={form.frequency}
                    onChange={event =>
                      setForm({
                        ...form,
                        frequency: event.target.value as RecurrenceFrequency,
                      })
                    }
                    className={`${inputClass} md:w-64`}
                  >
                    {EXPENSE_FREQUENCY_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>

                  <p className="mt-3 flex items-start gap-2 rounded bg-indigo-50 dark:bg-indigo-950/30 p-3 text-xs text-indigo-800 dark:text-indigo-200">
                    <Repeat className="w-4 h-4 shrink-0 mt-px" />
                    <span>
                      Os próximos 12 meses entram sozinhos no{' '}
                      <Link href="/planned" className="underline font-medium">
                        Planejado
                      </Link>
                      , e a projeção se renova conforme o tempo passa — a despesa
                      se repete até você cancelar a recorrência, pelo botão na
                      lista de lançamentos. Se a casa já tiver a mesma conta para
                      o mesmo vencimento, nada é duplicado.
                    </span>
                  </p>
                </div>
              )}
            </div>

            {/* Parcelamento */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Parcelamento (opcional)
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="expense-installments" className={labelClass}>
                    Total de parcelas
                  </label>
                  <input
                    id="expense-installments"
                    type="number"
                    min={1}
                    step={1}
                    value={form.installments}
                    onChange={event =>
                      setForm({ ...form, installments: event.target.value })
                    }
                    placeholder="Ex.: 6"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="expense-current-installment" className={labelClass}>
                    Parcela atual
                  </label>
                  <input
                    id="expense-current-installment"
                    type="number"
                    min={1}
                    step={1}
                    value={form.currentInstallment}
                    onChange={event =>
                      setForm({ ...form, currentInstallment: event.target.value })
                    }
                    placeholder="Ex.: 1"
                    className={inputClass}
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                O valor informado acima é o da parcela, não o total da compra.
              </p>
            </div>

            <div>
              <label htmlFor="expense-observation" className={labelClass}>
                Observação (opcional)
              </label>
              <textarea
                id="expense-observation"
                value={form.observation}
                onChange={event => setForm({ ...form, observation: event.target.value })}
                rows={2}
                placeholder="Ex.: compra dividida com a Giovanna"
                className={inputClass}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={isSaving}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors flex items-center gap-2"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                {editingId ? 'Salvar alterações' : 'Cadastrar despesa'}
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
          <Receipt className="w-5 h-5 text-red-600 dark:text-red-400" />
          Lançamentos
          {!semDespesas && (
            <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
              ({despesasFiltradas.length} de {expenses.length})
            </span>
          )}
        </h2>

        {isLoading && expenses.length === 0 ? (
          <div className="animate-pulse space-y-3">
            <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        ) : expenses.length === 0 ? (
          <p className="text-sm text-gray-600 dark:text-gray-400 py-6 text-center">
            Nenhuma despesa cadastrada ainda. Comece registrando as contas fixas do
            mês.
          </p>
        ) : despesasFiltradas.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Nenhum lançamento corresponde ao filtro aplicado. Existem{' '}
              {expenses.length}{' '}
              {expenses.length === 1 ? 'despesa registrada' : 'despesas registradas'}{' '}
              no total.
            </p>
            <button
              onClick={limparFiltros}
              className="mt-3 px-3 py-1.5 rounded text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              Limpar filtros
            </button>
          </div>
        ) : (
          <ul className="space-y-3">
            {despesasFiltradas.map(expense => (
              <li
                key={expense.id}
                className="rounded-lg border border-gray-200 dark:border-gray-700 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    {/*
                      Ícone selecionável de pagamento. É um botão de verdade, com
                      `aria-pressed`, para funcionar por teclado e leitor de tela
                      — um ícone clicável em `<div>` não é alcançável por Tab.
                    */}
                    <button
                      type="button"
                      onClick={() => handleTogglePago(expense)}
                      disabled={alterandoPagamentoId === expense.id}
                      aria-pressed={expense.isPaid}
                      title={
                        expense.isPaid
                          ? `Paga em ${formatDateBR(expense.paidAt || expense.date)} — clique para voltar a pendente`
                          : 'Marcar como paga'
                      }
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-50 ${
                        expense.isPaid
                          ? 'border-green-500 bg-green-500 text-white hover:bg-green-600'
                          : 'border-gray-300 dark:border-gray-600 text-gray-400 hover:border-green-500 hover:text-green-600'
                      }`}
                    >
                      {alterandoPagamentoId === expense.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      <span className="sr-only">
                        {expense.isPaid
                          ? 'Marcar como não paga'
                          : 'Marcar como paga'}
                      </span>
                    </button>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-white truncate">
                      {expense.description}
                      {expense.establishment ? (
                        <span className="font-normal text-gray-600 dark:text-gray-400">
                          {' '}
                          · {expense.establishment}
                        </span>
                      ) : null}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs">
                      <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                        {expense.category}
                        {expense.subcategory ? ` / ${expense.subcategory}` : ''}
                      </span>
                      <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                        {formatDateBR(expense.date)}
                      </span>
                      <span
                        className={`px-2 py-1 rounded flex items-center gap-1 ${
                          expense.isPaid
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200'
                            : 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200'
                        }`}
                      >
                        {expense.isPaid ? (
                          <>
                            <Check className="w-3 h-3" />
                            Paga
                            {expense.paidAt
                              ? ` em ${formatDateBR(expense.paidAt)}`
                              : ''}
                          </>
                        ) : (
                          'Pendente'
                        )}
                      </span>
                      <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 capitalize">
                        {expense.responsible}
                      </span>
                      <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 flex items-center gap-1">
                        <CreditCard className="w-3 h-3" />
                        {PAYMENT_METHOD_LABELS[expense.paymentMethod] ||
                          expense.paymentMethod}
                      </span>
                      {expense.installments ? (
                        <span className="px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200">
                          Parcela {expense.currentInstallment || 1}/
                          {expense.installments}
                        </span>
                      ) : null}
                      {expense.isRecurring && (
                        <span className="px-2 py-1 rounded bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-200 flex items-center gap-1">
                          <Repeat className="w-3 h-3" />
                          Recorrente
                          {expense.frequency
                            ? ` · ${
                                EXPENSE_FREQUENCY_LABELS[expense.frequency] ||
                                expense.frequency
                              }`
                            : ''}
                        </span>
                      )}
                      {expense.origin && expense.origin !== 'manual' && (
                        <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                          {EXPENSE_ORIGIN_LABELS[expense.origin] || expense.origin}
                        </span>
                      )}
                    </div>
                    {expense.observation && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                        {expense.observation}
                      </p>
                    )}
                  </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold text-red-600 dark:text-red-400">
                      {formatBRL(toExpenseAmount(expense.amount))}
                    </span>
                    <button
                      onClick={() => handleEdit(expense)}
                      className="px-3 py-1.5 rounded text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                      Editar
                    </button>
                    {expense.isRecurring && (
                      <button
                        onClick={() => handleToggleRecorrencia(expense)}
                        disabled={alterandoRecorrenciaId === expense.id}
                        title={
                          expense.recurrenceCancelledAt
                            ? 'Voltar a projetar esta despesa nos próximos meses'
                            : 'Parar de projetar esta despesa nos próximos meses'
                        }
                        className="px-3 py-1.5 rounded text-xs font-medium border border-indigo-200 dark:border-indigo-900 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                      >
                        {alterandoRecorrenciaId === expense.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Repeat className="w-3.5 h-3.5" />
                        )}
                        {expense.recurrenceCancelledAt
                          ? 'Retomar recorrência'
                          : 'Cancelar recorrência'}
                      </button>
                    )}
                    {confirmingDeletionId !== expense.id && (
                      <button
                        onClick={() => setConfirmingDeletionId(expense.id)}
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
                {confirmingDeletionId === expense.id && (
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 rounded bg-red-50 dark:bg-red-950/20 p-3">
                    <p className="text-sm text-red-800 dark:text-red-200 mb-3">
                      Excluir a despesa <strong>{expense.description}</strong> de{' '}
                      {formatBRL(toExpenseAmount(expense.amount))}? Ela deixará de
                      contar nos totais, no resumo por categoria e nas análises da
                      casa.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleDelete(expense.id)}
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

      {/*
        Ocorrências previstas das despesas recorrentes.

        Ficam num bloco separado, e não misturadas à lista acima, porque ainda
        não aconteceram: entram no Fluxo de Caixa como compromisso, mas NÃO no
        total gasto. Misturá-las faria outubro parecer já gasto.
      */}
      {previstasFiltradas.length > 0 && (
        <div className="rounded-lg border border-indigo-200 dark:border-indigo-900 bg-indigo-50/40 dark:bg-indigo-950/20 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Repeat className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              Ainda vão acontecer
            </h2>
            <div className="text-right">
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {previstasFiltradas.length}{' '}
                {previstasFiltradas.length === 1 ? 'ocorrência' : 'ocorrências'}
              </p>
              <p className="text-lg font-bold text-indigo-700 dark:text-indigo-300">
                {formatBRL(totalPrevisto)}
              </p>
            </div>
          </div>

          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Projeções das suas despesas recorrentes. Elas{' '}
            <strong>não entram no total gasto</strong> — o dinheiro ainda está na
            conta. Viram despesa de verdade quando você marcar como paga, em{' '}
            <Link href="/planned" className="underline font-medium">
              Planejado
            </Link>
            .
          </p>

          <ul className="space-y-2">
            {previstasFiltradas.map(prevista => (
              <li
                key={prevista.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-indigo-200/70 dark:border-indigo-900/70 bg-white dark:bg-gray-900 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white truncate">
                    {prevista.description}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-1 text-xs">
                    <span className="px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-200">
                      Prevista para {formatDateBR(prevista.dueDate)}
                    </span>
                    {prevista.category && (
                      <span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                        {prevista.category}
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 capitalize">
                      {prevista.responsible}
                    </span>
                  </div>
                </div>
                <span className="text-base font-semibold text-indigo-700 dark:text-indigo-300">
                  {formatBRL(Number(prevista.amount || 0))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
