'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAccounts, type Account } from '@/hooks/useAccounts';
import {
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPE_OPTIONS,
  AccountType,
  toAccountAmount,
} from '@/types/account';
import { formatBRL } from '@/utils/format';
import {
  AlertCircle,
  Building2,
  Check,
  CreditCard,
  Home,
  Landmark,
  Loader2,
  Plus,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';

interface AccountFormState {
  name: string;
  type: AccountType;
  institution: string;
  initialBalance: string;
  limit: string;
  closingDay: string;
  dueDay: string;
}

const emptyForm = (): AccountFormState => ({
  name: '',
  type: AccountType.CHECKING,
  institution: '',
  initialBalance: '',
  limit: '',
  closingDay: '',
  dueDay: '',
});

/** Converte "3.000,00" ou "3000.00" em número. Aceita negativo. */
function parseAmount(raw: string): number {
  const normalized = raw.trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

const ICONE_POR_TIPO: Record<string, typeof Wallet> = {
  [AccountType.CHECKING]: Landmark,
  [AccountType.SAVINGS]: Building2,
  [AccountType.WALLET]: Wallet,
  [AccountType.DIGITAL]: Building2,
  [AccountType.CREDIT_CARD]: CreditCard,
};

export default function ContasPage() {
  const {
    accounts,
    totalBalance,
    isLoading,
    isSaving,
    error,
    createAccount,
    updateAccount,
    deleteAccount,
    clearError,
  } = useAccounts();

  const [form, setForm] = useState<AccountFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Confirmação inline de exclusão — sem `window.confirm`
  const [confirmingDeletionId, setConfirmingDeletionId] = useState<string | null>(null);

  const contasComuns = useMemo(
    () => accounts.filter(account => account.type !== 'credit_card'),
    [accounts],
  );

  const cartoes = useMemo(
    () => accounts.filter(account => account.type === 'credit_card'),
    [accounts],
  );

  const saldoEmContas = useMemo(
    () => contasComuns.reduce((sum, account) => sum + toAccountAmount(account.balance), 0),
    [contasComuns],
  );

  const limiteTotalCartoes = useMemo(
    () => cartoes.reduce((sum, account) => sum + toAccountAmount(account.limit), 0),
    [cartoes],
  );

  const ehCartao = form.type === AccountType.CREDIT_CARD;

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

  const handleEdit = (account: Account) => {
    setEditingId(account.id);
    setForm({
      name: account.name || '',
      type: (account.type as AccountType) || AccountType.CHECKING,
      institution: account.institution || '',
      initialBalance: String(toAccountAmount(account.initialBalance)),
      limit:
        account.limit === undefined || account.limit === null
          ? ''
          : String(toAccountAmount(account.limit)),
      closingDay: account.closingDay ? String(account.closingDay) : '',
      dueDay: account.dueDay ? String(account.dueDay) : '',
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
      setValidationError('Informe o nome da conta.');
      return;
    }
    if (!form.institution.trim()) {
      setValidationError('Informe a instituição. Ex.: Nubank, Itaú, Caixa.');
      return;
    }

    const saldoInicial = form.initialBalance.trim()
      ? parseAmount(form.initialBalance)
      : 0;
    if (!Number.isFinite(saldoInicial)) {
      setValidationError('Saldo inicial inválido. Ex.: 3000,00');
      return;
    }

    const limite = form.limit.trim() ? parseAmount(form.limit) : undefined;
    if (limite !== undefined && (!Number.isFinite(limite) || limite < 0)) {
      setValidationError('Limite inválido. Informe um valor igual ou maior que zero.');
      return;
    }

    const fechamento = form.closingDay.trim() ? Number(form.closingDay.trim()) : undefined;
    if (
      fechamento !== undefined &&
      (!Number.isInteger(fechamento) || fechamento < 1 || fechamento > 31)
    ) {
      setValidationError('O dia de fechamento precisa estar entre 1 e 31.');
      return;
    }

    const vencimento = form.dueDay.trim() ? Number(form.dueDay.trim()) : undefined;
    if (
      vencimento !== undefined &&
      (!Number.isInteger(vencimento) || vencimento < 1 || vencimento > 31)
    ) {
      setValidationError('O dia de vencimento precisa estar entre 1 e 31.');
      return;
    }

    /**
     * O saldo (`balance`) NÃO entra no corpo: ele é derivado pelo backend a
     * partir do saldo inicial e dos lançamentos. O `CreateAccountDto` não tem
     * esse campo e, com `forbidNonWhitelisted`, enviá-lo devolve 400.
     *
     * `initialBalance` também só existe na criação — o `UpdateAccountDto` não
     * o aceita, por isso o campo fica bloqueado na edição.
     */
    const base: Record<string, unknown> = {
      name: form.name.trim(),
      type: form.type,
      institution: form.institution.trim(),
    };

    if (limite !== undefined) base.limit = Number(limite.toFixed(2));
    else if (editingId) base.limit = null;

    if (fechamento !== undefined) base.closingDay = fechamento;
    else if (editingId) base.closingDay = null;

    if (vencimento !== undefined) base.dueDay = vencimento;
    else if (editingId) base.dueDay = null;

    try {
      if (editingId) {
        await updateAccount(editingId, base);
        setFeedback('Conta atualizada com sucesso.');
      } else {
        await createAccount({
          ...base,
          initialBalance: Number(saldoInicial.toFixed(2)),
        });
        setFeedback('Conta cadastrada com sucesso.');
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
      await deleteAccount(id);
      setConfirmingDeletionId(null);
      setFeedback('Conta excluída.');
      if (editingId === id) {
        resetForm();
        setIsFormOpen(false);
      }
    } catch {
      setConfirmingDeletionId(null);
    }
  };

  const semContas = !isLoading && accounts.length === 0;

  const inputClass =
    'w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed';
  const labelClass =
    'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

  return (
    <div className="max-w-6xl mx-auto p-6 md:p-8 space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Landmark className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
            Contas
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Onde o dinheiro da casa fica: conta corrente, poupança, carteira,
            conta digital e cartões.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenCreate}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Nova conta
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

      {/* Indicadores — sem conta cadastrada não há saldo a apresentar */}
      {semContas ? (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-8 text-center">
          <Landmark className="w-10 h-10 mx-auto text-gray-400 dark:text-gray-600 mb-3" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Nenhuma conta cadastrada ainda
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 max-w-md mx-auto">
            Sem conta cadastrada não existe saldo a consolidar — o painel, o fluxo
            de caixa e as receitas dependem daqui. Comece pela conta em que o
            salário cai.
          </p>
          <button
            onClick={handleOpenCreate}
            className="mt-4 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Cadastrar a primeira conta
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              Saldo consolidado
            </p>
            <p
              className={`text-2xl font-bold ${
                totalBalance < 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-gray-900 dark:text-white'
              }`}
            >
              {formatBRL(totalBalance)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Somado pelo servidor, incluindo todas as contas cadastradas
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              Saldo em contas
            </p>
            <p
              className={`text-2xl font-bold ${
                saldoEmContas < 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-green-600 dark:text-green-400'
              }`}
            >
              {formatBRL(saldoEmContas)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {contasComuns.length}{' '}
              {contasComuns.length === 1 ? 'conta' : 'contas'}, sem contar cartões
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              Cartões cadastrados
            </p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {cartoes.length}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {cartoes.length === 0
                ? 'Nenhum cartão nesta tela'
                : `Limite total: ${formatBRL(limiteTotalCartoes)}`}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              Instituições
            </p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {new Set(accounts.map(account => account.institution)).size}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Bancos e carteiras diferentes
            </p>
          </div>
        </div>
      )}

      {/* Formulário */}
      {isFormOpen && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {editingId ? 'Editar conta' : 'Nova conta'}
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
                <label htmlFor="account-name" className={labelClass}>
                  Nome
                </label>
                <input
                  id="account-name"
                  type="text"
                  value={form.name}
                  onChange={event => setForm({ ...form, name: event.target.value })}
                  placeholder="Ex.: Conta do Bruno"
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="account-institution" className={labelClass}>
                  Instituição
                </label>
                <input
                  id="account-institution"
                  type="text"
                  value={form.institution}
                  onChange={event =>
                    setForm({ ...form, institution: event.target.value })
                  }
                  placeholder="Ex.: Nubank"
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="account-type" className={labelClass}>
                  Tipo
                </label>
                <select
                  id="account-type"
                  value={form.type}
                  onChange={event =>
                    setForm({ ...form, type: event.target.value as AccountType })
                  }
                  className={inputClass}
                >
                  {ACCOUNT_TYPE_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="account-initial-balance" className={labelClass}>
                  Saldo inicial (R$)
                </label>
                <input
                  id="account-initial-balance"
                  type="text"
                  inputMode="decimal"
                  value={form.initialBalance}
                  onChange={event =>
                    setForm({ ...form, initialBalance: event.target.value })
                  }
                  disabled={Boolean(editingId)}
                  placeholder="3000,00"
                  className={inputClass}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {editingId
                    ? 'O saldo inicial só pode ser definido na criação da conta — o saldo atual é calculado pelo servidor a partir dos lançamentos.'
                    : 'Ponto de partida do saldo. Depois disso o saldo passa a ser calculado pelos lançamentos.'}
                </p>
              </div>

              <div>
                <label htmlFor="account-limit" className={labelClass}>
                  Limite (R$) {ehCartao ? '' : '— opcional'}
                </label>
                <input
                  id="account-limit"
                  type="text"
                  inputMode="decimal"
                  value={form.limit}
                  onChange={event => setForm({ ...form, limit: event.target.value })}
                  placeholder="5000,00"
                  className={inputClass}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {ehCartao
                    ? 'Limite total do cartão.'
                    : 'Use para limite de crédito ou cheque especial.'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="account-closing-day" className={labelClass}>
                    Dia de fechamento
                  </label>
                  <input
                    id="account-closing-day"
                    type="number"
                    min={1}
                    max={31}
                    step={1}
                    value={form.closingDay}
                    onChange={event =>
                      setForm({ ...form, closingDay: event.target.value })
                    }
                    placeholder="28"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="account-due-day" className={labelClass}>
                    Dia de vencimento
                  </label>
                  <input
                    id="account-due-day"
                    type="number"
                    min={1}
                    max={31}
                    step={1}
                    value={form.dueDay}
                    onChange={event => setForm({ ...form, dueDay: event.target.value })}
                    placeholder="05"
                    className={inputClass}
                  />
                </div>
              </div>
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
                {editingId ? 'Salvar alterações' : 'Cadastrar conta'}
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
          <Wallet className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          Contas cadastradas
        </h2>

        {isLoading && accounts.length === 0 ? (
          <div className="animate-pulse space-y-3">
            <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-gray-600 dark:text-gray-400 py-6 text-center">
            Nenhuma conta cadastrada ainda. Cadastre a conta em que o salário cai
            para o restante do sistema ter base de cálculo.
          </p>
        ) : (
          <ul className="space-y-3">
            {accounts.map(account => {
              const Icone = ICONE_POR_TIPO[account.type] || Wallet;
              const saldo = toAccountAmount(account.balance);

              return (
                <li
                  key={account.id}
                  className="rounded-lg border border-gray-200 dark:border-gray-700 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="mt-0.5 flex-shrink-0 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 p-2">
                        <Icone className="w-5 h-5 text-indigo-600 dark:text-indigo-300" />
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-white truncate">
                          {account.name}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs">
                          <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                            {ACCOUNT_TYPE_LABELS[account.type] || account.type}
                          </span>
                          <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                            {account.institution}
                          </span>
                          <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                            Saldo inicial: {formatBRL(toAccountAmount(account.initialBalance))}
                          </span>
                          {account.limit !== undefined && account.limit !== null && (
                            <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                              Limite: {formatBRL(toAccountAmount(account.limit))}
                            </span>
                          )}
                          {account.closingDay ? (
                            <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                              Fecha dia {account.closingDay}
                            </span>
                          ) : null}
                          {account.dueDay ? (
                            <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                              Vence dia {account.dueDay}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Saldo atual
                        </p>
                        <p
                          className={`text-lg font-bold ${
                            saldo < 0
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-gray-900 dark:text-white'
                          }`}
                        >
                          {formatBRL(saldo)}
                        </p>
                      </div>
                      <button
                        onClick={() => handleEdit(account)}
                        className="px-3 py-1.5 rounded text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      >
                        Editar
                      </button>
                      {confirmingDeletionId !== account.id && (
                        <button
                          onClick={() => setConfirmingDeletionId(account.id)}
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
                  {confirmingDeletionId === account.id && (
                    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 rounded bg-red-50 dark:bg-red-950/20 p-3">
                      <p className="text-sm text-red-800 dark:text-red-200 mb-3">
                        Excluir a conta <strong>{account.name}</strong> com saldo de{' '}
                        {formatBRL(saldo)}? Ela sai do saldo consolidado e as
                        receitas e despesas ligadas a ela ficam sem conta de
                        origem.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => handleDelete(account.id)}
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
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
