'use client';

import { FormEvent, useMemo, useState } from 'react';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { useCreditCards, type CreditCard } from '@/hooks/useCreditCards';
import { CardStatementPanel } from '@/components/CardStatementPanel';
import { useAccounts } from '@/hooks/useAccounts';
import {
  CARD_NUMBER_PATTERN,
  CARD_TYPE_SUGGESTIONS,
  CREDIT_CARD_STATUS_LABELS,
  CREDIT_CARD_STATUS_OPTIONS,
  CreditCardStatus,
} from '@/types/credit-card';
import { formatBRL, formatDateBR } from '@/utils/format';

interface CardFormState {
  name: string;
  bank: string;
  cardNumber: string;
  limit: string;
  closingDay: string;
  dueDay: string;
  status: CreditCardStatus;
  cardholderName: string;
  cardType: string;
  expiryDate: string;
  accountId: string;
  interestRate: string;
  notes: string;
}

const emptyForm = (): CardFormState => ({
  name: '',
  bank: '',
  cardNumber: '',
  limit: '',
  closingDay: '',
  dueDay: '',
  status: CreditCardStatus.ACTIVE,
  cardholderName: '',
  cardType: '',
  expiryDate: '',
  accountId: '',
  interestRate: '',
  notes: '',
});

/** Converte "5.000,00" ou "5000.00" em número. */
function parseAmount(raw: string): number {
  const normalized = raw.trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

/** Data ISO → valor de `<input type="date">`. */
function toDateInput(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

export default function CreditCardsPage() {
  const {
    cards,
    totalUtilization,
    isLoading,
    isSaving,
    error,
    createCard,
    updateCard,
    deleteCard,
    clearError,
  } = useCreditCards();

  const { accounts } = useAccounts();

  const [form, setForm] = useState<CardFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Confirmação inline de exclusão — sem `window.confirm`
  /**
   * Cartão com o painel de fatura aberto.
   *
   * Um de cada vez: os três endpoints do painel (fatura, histórico e melhor
   * dia) são carregados na abertura, e abrir todos de uma vez faria a tela
   * disparar uma dúzia de requisições sem que ninguém tivesse pedido.
   */
  const [cartaoDetalhado, setCartaoDetalhado] = useState<string | null>(null);

  const [confirmingDeletionId, setConfirmingDeletionId] = useState<string | null>(
    null,
  );

  /** Contas que podem pagar a fatura — o próprio cartão não entra na lista. */
  const contasPagadoras = useMemo(
    () => accounts.filter(account => account.type !== 'credit_card'),
    [accounts],
  );

  const getUtilizationColor = (percentage: number) => {
    if (percentage < 50) return 'bg-green-500';
    if (percentage < 80) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300';
      case 'inactive':
        return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
      case 'blocked':
        return 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300';
      case 'expired':
        return 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300';
      default:
        return 'bg-gray-100 dark:bg-gray-700';
    }
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

  const handleEdit = (card: CreditCard) => {
    setEditingId(card.id);
    setForm({
      name: card.name || '',
      bank: card.bank || '',
      cardNumber: card.cardNumber || '',
      limit: String(card.limit ?? ''),
      closingDay: card.closingDay ? String(card.closingDay) : '',
      dueDay: card.dueDay ? String(card.dueDay) : '',
      status: (card.status as CreditCardStatus) || CreditCardStatus.ACTIVE,
      cardholderName: card.cardholderName || '',
      cardType: card.cardType || '',
      expiryDate: toDateInput(card.expiryDate),
      accountId: card.accountId || '',
      interestRate:
        card.interestRate === undefined || card.interestRate === null
          ? ''
          : String(card.interestRate),
      notes: card.notes || '',
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
      setValidationError('Informe o nome do cartão. Ex.: Nubank Bruno.');
      return;
    }

    if (!editingId) {
      if (!form.bank.trim()) {
        setValidationError('Informe o banco emissor. Ex.: Nubank, Itaú, Inter.');
        return;
      }
      if (!CARD_NUMBER_PATTERN.test(form.cardNumber.trim())) {
        setValidationError(
          'Informe apenas os 4 últimos dígitos do cartão. Ex.: 1234',
        );
        return;
      }
    }

    const limite = parseAmount(form.limit);
    if (!Number.isFinite(limite) || limite < 0) {
      setValidationError(
        'Limite inválido. Informe um valor igual ou maior que zero. Ex.: 5.000,00',
      );
      return;
    }

    const fechamento = Number(form.closingDay.trim());
    if (!Number.isInteger(fechamento) || fechamento < 1 || fechamento > 31) {
      setValidationError('O dia de fechamento precisa estar entre 1 e 31.');
      return;
    }

    const vencimento = Number(form.dueDay.trim());
    if (!Number.isInteger(vencimento) || vencimento < 1 || vencimento > 31) {
      setValidationError('O dia de vencimento precisa estar entre 1 e 31.');
      return;
    }

    let juros: number | undefined;
    if (form.interestRate.trim()) {
      juros = parseAmount(form.interestRate);
      if (!Number.isFinite(juros) || juros < 0 || juros > 100) {
        setValidationError(
          'A taxa de juros precisa estar entre 0 e 100 (percentual ao mês). Ex.: 13,99',
        );
        return;
      }
    }

    /**
     * O backend roda com `whitelist` + `forbidNonWhitelisted`: campos fora do
     * DTO devolvem 400. `currentBalance` NÃO entra no corpo — é derivado pelo
     * backend a partir das despesas lançadas no cartão.
     *
     * O `UpdateCreditCardDto` é MENOR que o de criação: não aceita `bank`,
     * `cardNumber`, `cardType`, `expiryDate` nem `accountId`, por isso essas
     * chaves só entram na criação.
     */
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      limit: Number(limite.toFixed(2)),
      closingDay: fechamento,
      dueDay: vencimento,
      status: form.status,
      cardholderName: form.cardholderName.trim() || (editingId ? null : undefined),
      interestRate:
        juros !== undefined ? Number(juros.toFixed(2)) : editingId ? null : undefined,
      notes: form.notes.trim() || (editingId ? null : undefined),
    };

    if (!editingId) {
      payload.bank = form.bank.trim();
      payload.cardNumber = form.cardNumber.trim();
      if (form.cardType.trim()) payload.cardType = form.cardType.trim();
      if (form.expiryDate) {
        // `@IsDateString()`: o backend espera uma data ISO 8601 completa.
        payload.expiryDate = new Date(`${form.expiryDate}T12:00:00`).toISOString();
      }
      if (form.accountId) payload.accountId = form.accountId;
    }

    Object.keys(payload).forEach(chave => {
      if (payload[chave] === undefined) delete payload[chave];
    });

    try {
      if (editingId) {
        await updateCard(editingId, payload);
        setFeedback('Cartão atualizado com sucesso.');
      } else {
        await createCard(payload);
        setFeedback('Cartão cadastrado com sucesso.');
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
      await deleteCard(id);
      setConfirmingDeletionId(null);
      setFeedback('Cartão excluído.');
      if (editingId === id) {
        resetForm();
        setIsFormOpen(false);
      }
    } catch {
      setConfirmingDeletionId(null);
    }
  };

  const inputClass =
    'w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed';
  const labelClass =
    'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

  if (isLoading && cards.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Carregando cartões...</p>
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
            💳 Cartões de Crédito
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Fatura, limite disponível, onde você mais gasta e o melhor dia
            para comprar — com importação da fatura em PDF
          </p>
        </div>
        <Button variant="primary" onClick={handleOpenCreate}>
          ➕ Novo Cartão
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

      {/* Total Utilization */}
      {totalUtilization && cards.length > 0 && (
        <Card className="border-2 border-indigo-200 dark:border-indigo-800">
          <Card.Header>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Utilização Total de Crédito
            </h2>
          </Card.Header>
          <div className="pt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                  Total de Limite
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatBRL(totalUtilization.totalLimit)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                  Saldo Utilizado
                </p>
                <p className="text-2xl font-bold text-red-600">
                  {formatBRL(totalUtilization.totalBalance)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                  Limite Disponível
                </p>
                <p className="text-2xl font-bold text-green-600">
                  {formatBRL(totalUtilization.availableLimit)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                  Percentual Utilizado
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {totalUtilization.utilizationPercentage.toFixed(1)}%
                </p>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all ${getUtilizationColor(
                  totalUtilization.utilizationPercentage,
                )}`}
                style={{
                  width: `${Math.min(totalUtilization.utilizationPercentage, 100)}%`,
                }}
              ></div>
            </div>
          </div>
        </Card>
      )}

      {/* Formulário inline — criação e edição na própria página */}
      {isFormOpen && (
        <Card>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {editingId ? 'Editar cartão' : 'Novo cartão'}
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
                <label htmlFor="card-name" className={labelClass}>
                  Nome do cartão
                </label>
                <input
                  id="card-name"
                  type="text"
                  value={form.name}
                  onChange={event => setForm({ ...form, name: event.target.value })}
                  placeholder="Ex.: Nubank Bruno"
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="card-bank" className={labelClass}>
                  Banco emissor
                </label>
                <input
                  id="card-bank"
                  type="text"
                  value={form.bank}
                  onChange={event => setForm({ ...form, bank: event.target.value })}
                  disabled={Boolean(editingId)}
                  placeholder="Ex.: Nubank"
                  className={inputClass}
                />
                {editingId && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    O banco identifica o plástico e só pode ser definido no
                    cadastro — o servidor não aceita alterá-lo depois.
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="card-number" className={labelClass}>
                  4 últimos dígitos
                </label>
                <input
                  id="card-number"
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={form.cardNumber}
                  onChange={event =>
                    setForm({
                      ...form,
                      cardNumber: event.target.value.replace(/\D/g, '').slice(0, 4),
                    })
                  }
                  disabled={Boolean(editingId)}
                  placeholder="1234"
                  className={inputClass}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {editingId
                    ? 'Os dígitos só podem ser definidos no cadastro.'
                    : 'Somente os 4 últimos dígitos. Nunca informe o número completo, a senha ou o código de segurança.'}
                </p>
              </div>

              <div>
                <label htmlFor="card-limit" className={labelClass}>
                  Limite total (R$)
                </label>
                <input
                  id="card-limit"
                  type="text"
                  inputMode="decimal"
                  value={form.limit}
                  onChange={event => setForm({ ...form, limit: event.target.value })}
                  placeholder="5.000,00"
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="card-closing-day" className={labelClass}>
                    Dia de fechamento
                  </label>
                  <input
                    id="card-closing-day"
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
                  <label htmlFor="card-due-day" className={labelClass}>
                    Dia de vencimento
                  </label>
                  <input
                    id="card-due-day"
                    type="number"
                    min={1}
                    max={31}
                    step={1}
                    value={form.dueDay}
                    onChange={event =>
                      setForm({ ...form, dueDay: event.target.value })
                    }
                    placeholder="05"
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="card-status" className={labelClass}>
                  Situação
                </label>
                <select
                  id="card-status"
                  value={form.status}
                  onChange={event =>
                    setForm({ ...form, status: event.target.value as CreditCardStatus })
                  }
                  className={inputClass}
                >
                  {CREDIT_CARD_STATUS_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="card-holder" className={labelClass}>
                  Nome impresso no cartão (opcional)
                </label>
                <input
                  id="card-holder"
                  type="text"
                  value={form.cardholderName}
                  onChange={event =>
                    setForm({ ...form, cardholderName: event.target.value })
                  }
                  placeholder="Ex.: BRUNO A SILVA"
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="card-type" className={labelClass}>
                  Bandeira (opcional)
                </label>
                <input
                  id="card-type"
                  type="text"
                  list="card-type-options"
                  value={form.cardType}
                  onChange={event =>
                    setForm({ ...form, cardType: event.target.value })
                  }
                  disabled={Boolean(editingId)}
                  placeholder="Ex.: Mastercard"
                  className={inputClass}
                />
                <datalist id="card-type-options">
                  {CARD_TYPE_SUGGESTIONS.map(bandeira => (
                    <option key={bandeira} value={bandeira} />
                  ))}
                </datalist>
              </div>

              <div>
                <label htmlFor="card-expiry" className={labelClass}>
                  Validade (opcional)
                </label>
                <input
                  id="card-expiry"
                  type="date"
                  value={form.expiryDate}
                  onChange={event =>
                    setForm({ ...form, expiryDate: event.target.value })
                  }
                  disabled={Boolean(editingId)}
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="card-account" className={labelClass}>
                  Conta que paga a fatura (opcional)
                </label>
                <select
                  id="card-account"
                  value={form.accountId}
                  onChange={event =>
                    setForm({ ...form, accountId: event.target.value })
                  }
                  disabled={Boolean(editingId)}
                  className={inputClass}
                >
                  <option value="">Não informar</option>
                  {contasPagadoras.map(account => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                      {account.institution ? ` — ${account.institution}` : ''}
                    </option>
                  ))}
                </select>
                {editingId && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Bandeira, validade e conta pagadora só podem ser definidas no
                    cadastro — o servidor não aceita alterá-las depois.
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="card-interest" className={labelClass}>
                  Taxa de juros ao mês (%) — opcional
                </label>
                <input
                  id="card-interest"
                  type="text"
                  inputMode="decimal"
                  value={form.interestRate}
                  onChange={event =>
                    setForm({ ...form, interestRate: event.target.value })
                  }
                  placeholder="13,99"
                  className={inputClass}
                />
              </div>

              <div className="md:col-span-2">
                <label htmlFor="card-notes" className={labelClass}>
                  Observação (opcional)
                </label>
                <textarea
                  id="card-notes"
                  value={form.notes}
                  onChange={event => setForm({ ...form, notes: event.target.value })}
                  rows={2}
                  placeholder="Ex.: cartão usado só para assinaturas"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="primary" disabled={isSaving}>
                {isSaving
                  ? 'Salvando…'
                  : editingId
                    ? 'Salvar alterações'
                    : 'Cadastrar cartão'}
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

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {cards.length > 0 ? (
          cards.map(card => {
            const percentual =
              card.limit > 0 ? (card.currentBalance / card.limit) * 100 : 0;

            return (
              <Card key={card.id} className="relative overflow-hidden">
                {/* Card Background Effect */}
                <div className="absolute inset-0 opacity-10 bg-gradient-to-br from-indigo-500 to-purple-500"></div>

                <div className="relative">
                  {/* Header */}
                  <div className="flex justify-between items-start mb-4 gap-2">
                    <div className="min-w-0">
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white truncate">
                        {card.name}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                        {card.bank} • {card.cardType || 'Crédito'}
                      </p>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium flex-shrink-0 ${getStatusColor(
                        card.status,
                      )}`}
                    >
                      {CREDIT_CARD_STATUS_LABELS[card.status] || card.status}
                    </span>
                  </div>

                  {/* Card Number */}
                  <p className="text-sm text-gray-600 dark:text-gray-400 font-mono mb-4">
                    •••• •••• •••• {card.cardNumber}
                  </p>

                  {/* Utilization */}
                  <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900 rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-blue-900 dark:text-blue-200">
                        Limite Utilizado
                      </span>
                      <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                        {percentual.toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full bg-blue-200 dark:bg-blue-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${getUtilizationColor(percentual)}`}
                        style={{ width: `${Math.min(percentual, 100)}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Balance Info */}
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        Limite
                      </p>
                      <p className="font-bold text-gray-900 dark:text-white text-sm">
                        {formatBRL(card.limit)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        Usado
                      </p>
                      <p className="font-bold text-red-600 text-sm">
                        {formatBRL(card.currentBalance)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        Disponível
                      </p>
                      <p className="font-bold text-green-600 text-sm">
                        {formatBRL(card.limit - card.currentBalance)}
                      </p>
                    </div>
                  </div>

                  {/* Due Info */}
                  <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900 rounded-lg">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-yellow-900 dark:text-yellow-200 text-xs">
                          Fechamento
                        </p>
                        <p className="font-bold text-yellow-700 dark:text-yellow-300">
                          Dia {card.closingDay}
                        </p>
                      </div>
                      <div>
                        <p className="text-yellow-900 dark:text-yellow-200 text-xs">
                          Vencimento
                        </p>
                        <p className="font-bold text-yellow-700 dark:text-yellow-300">
                          Dia {card.dueDay}
                        </p>
                      </div>
                    </div>
                  </div>

                  {card.interestRate ? (
                    <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                      Taxa de juros: {card.interestRate.toFixed(2).replace('.', ',')}%
                      a.m.
                    </div>
                  ) : null}

                  {card.expiryDate && (
                    <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                      Validade: {formatDateBR(card.expiryDate)}
                    </div>
                  )}

                  {card.notes && (
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-4">
                      📝 {card.notes}
                    </p>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        setCartaoDetalhado(
                          cartaoDetalhado === card.id ? null : card.id,
                        )
                      }
                      className="flex-1 px-3 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded transition-colors"
                    >
                      {cartaoDetalhado === card.id
                        ? '▲ Fechar fatura'
                        : '📄 Ver fatura'}
                    </button>
                    <button
                      onClick={() => handleEdit(card)}
                      className="flex-1 px-3 py-2 text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                    >
                      ✏️
                    </button>
                    {confirmingDeletionId !== card.id && (
                      <button
                        onClick={() => setConfirmingDeletionId(card.id)}
                        disabled={isSaving}
                        aria-label={`Excluir o cartão ${card.name}`}
                        className="px-3 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded transition-colors"
                      >
                        🗑️
                      </button>
                    )}
                  </div>

                  {/* Fatura, categorias, histórico e importação de PDF */}
                  {cartaoDetalhado === card.id && (
                    <CardStatementPanel cardId={card.id} />
                  )}

                  {/* Confirmação inline — sem diálogo nativo */}
                  {confirmingDeletionId === card.id && (
                    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 rounded bg-red-50 dark:bg-red-950/20 p-3">
                      <p className="text-sm text-red-800 dark:text-red-200 mb-3">
                        Excluir o cartão <strong>{card.name}</strong> com{' '}
                        {formatBRL(card.currentBalance)} de fatura em aberto? Ele sai
                        da utilização total de crédito e as despesas lançadas nele
                        ficam sem cartão vinculado.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => handleDelete(card.id)}
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
                </div>
              </Card>
            );
          })
        ) : (
          <Card className="col-span-full">
            <div className="text-center py-12">
              <p className="text-gray-600 dark:text-gray-400 mb-2">
                Nenhum cartão cadastrado
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 max-w-md mx-auto">
                Sem cartão cadastrado não há como acompanhar limite, fatura nem
                parcelamentos — e as despesas no crédito ficam sem onde ser
                lançadas.
              </p>
              <Button variant="primary" onClick={handleOpenCreate}>
                ➕ Adicionar Cartão
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
