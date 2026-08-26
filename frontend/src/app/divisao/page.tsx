'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSplit } from '@/hooks/useSplit';
import {
  SETTLEMENT_STATUS_LABELS,
  SPLIT_MODE_DESCRIPTIONS,
  SPLIT_MODE_LABELS,
  SPLIT_MODE_OPTIONS,
  SPLIT_PERIOD_OPTIONS,
  SplitMode,
  formatResponsible,
} from '@/types/split';
import { formatBRL, formatDateBR, formatPercent } from '@/utils/format';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  Home,
  Info,
  Loader2,
  Scale,
  Users,
  X,
} from 'lucide-react';

/** Responsáveis padrão quando ainda não há despesas no período. */
const RESPONSIBLE_FALLBACK = ['bruno', 'giovanna'];

export default function DivisaoPage() {
  const {
    summary,
    settlement,
    byCategory,
    rule,
    period,
    isLoading,
    isSaving,
    error,
    changePeriod,
    saveRule,
    clearError,
  } = useSplit();

  const [selectedMode, setSelectedMode] = useState<SplitMode>(SplitMode.EQUAL);
  const [customPercentages, setCustomPercentages] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  /** Responsáveis conhecidos: os que aparecem no acerto, no resumo ou o padrão. */
  const responsaveis = useMemo(() => {
    const fromSettlement = (settlement?.entries || []).map(entry => entry.responsible);
    const fromSummary = (summary?.participants || []).map(item => item.responsible);
    const fromRule = Object.keys(rule?.customPercentages || {});
    const unique = Array.from(
      new Set([...fromSettlement, ...fromSummary, ...fromRule]),
    );
    return unique.length > 0 ? unique : RESPONSIBLE_FALLBACK;
  }, [settlement, summary, rule]);

  // Sincroniza o seletor com a regra vigente assim que ela chega
  useEffect(() => {
    if (!rule) return;
    setSelectedMode((rule.mode as SplitMode) || SplitMode.EQUAL);
    setNotes(rule.notes || '');
    if (rule.customPercentages) {
      const entries = Object.entries(rule.customPercentages).map(
        ([key, value]) => [key, String(value)] as [string, string],
      );
      setCustomPercentages(Object.fromEntries(entries));
    }
  }, [rule]);

  const handleSaveRule = async () => {
    setFeedback(null);
    setValidationError(null);

    if (selectedMode === SplitMode.CUSTOM) {
      const parsed: Record<string, number> = {};
      for (const responsavel of responsaveis) {
        const raw = (customPercentages[responsavel] ?? '').toString().replace(',', '.');
        const value = Number(raw);
        if (!Number.isFinite(value) || value < 0) {
          setValidationError(
            `Informe um percentual válido para ${formatResponsible(responsavel)}.`,
          );
          return;
        }
        parsed[responsavel] = value;
      }

      const soma = Object.values(parsed).reduce((sum, value) => sum + value, 0);
      // O backend também valida e devolve a soma encontrada; validar aqui evita
      // uma ida ao servidor só para descobrir que 70 + 20 não fecha 100.
      if (Math.abs(soma - 100) > 0.01) {
        setValidationError(
          `A soma dos percentuais precisa dar 100. Soma atual: ${formatPercent(soma)}.`,
        );
        return;
      }

      try {
        await saveRule({
          mode: selectedMode,
          customPercentages: parsed,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        });
        setFeedback('Regra de rateio atualizada.');
      } catch {
        // A mensagem do backend já é exibida pelo estado do hook
      }
      return;
    }

    try {
      await saveRule({
        mode: selectedMode,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      setFeedback('Regra de rateio atualizada.');
    } catch {
      // A mensagem do backend já é exibida pelo estado do hook
    }
  };

  const avisos = useMemo(() => {
    const all = [...(summary?.warnings || []), ...(settlement?.warnings || [])];
    return Array.from(new Set(all));
  }, [summary, settlement]);

  const fallbackAplicado = Boolean(settlement?.fallbackApplied);

  return (
    <div className="max-w-6xl mx-auto p-6 md:p-8 space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Scale className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
            Divisão Bruno × Giovanna
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Quanto cada um pagou, a participação de cada um no total da casa e o
            acerto de contas segundo a regra de rateio vigente.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-2"
        >
          <Home className="w-4 h-4" />
          Voltar ao painel
        </Link>
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

      {/*
        AVISO DE FALLBACK — nunca esconder.
        Quando o modo proporcional à renda cai para 50/50 por falta de receita
        recorrente cadastrada, o usuário precisa saber que o número na tela NÃO
        foi calculado pelo critério que ele configurou (regra 27 do projeto).
      */}
      {fallbackAplicado && settlement && (
        <div className="rounded-lg border-2 border-amber-400 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-4 flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-amber-900 dark:text-amber-100">
              O rateio não foi calculado pelo critério configurado
            </h3>
            <p className="text-sm text-amber-800 dark:text-amber-200 mt-1">
              Você configurou{' '}
              <strong>
                {SPLIT_MODE_LABELS[settlement.configuredMode as string] ||
                  settlement.configuredMode}
              </strong>
              , mas o sistema aplicou{' '}
              <strong>
                {SPLIT_MODE_LABELS[settlement.appliedMode as string] ||
                  settlement.appliedMode}
              </strong>{' '}
              por falta de dados.
            </p>
            <p className="text-sm text-amber-800 dark:text-amber-200 mt-2">
              {settlement.criteria}
            </p>
            {settlement.appliedMode !== settlement.configuredMode &&
              settlement.configuredMode === SplitMode.INCOME_PROPORTIONAL && (
                <p className="text-sm text-amber-800 dark:text-amber-200 mt-2">
                  Cadastre as receitas recorrentes mensais de cada responsável em{' '}
                  <Link href="/receitas" className="underline font-medium">
                    Receitas
                  </Link>{' '}
                  para que o rateio proporcional à renda passe a valer.
                </p>
              )}
          </div>
        </div>
      )}

      {/* Demais avisos do backend */}
      {avisos.length > 0 && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 flex items-start gap-3">
          <Info className="w-5 h-5 text-gray-500 dark:text-gray-400 flex-shrink-0 mt-0.5" />
          <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
            {avisos.map(aviso => (
              <li key={aviso}>{aviso}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Seletor de período */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-gray-600 dark:text-gray-400 mr-1">Período:</span>
        {SPLIT_PERIOD_OPTIONS.map(option => (
          <button
            key={option.value}
            onClick={() => changePeriod(option.value)}
            disabled={isLoading}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 ${
              period === option.value
                ? 'border-indigo-600 bg-indigo-600 text-white'
                : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            {option.label}
          </button>
        ))}
        {summary && (
          <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
            {formatDateBR(summary.start)} a {formatDateBR(summary.end)}
          </span>
        )}
      </div>

      {/* Carregando */}
      {isLoading && !summary && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-6 w-1/3 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        </div>
      )}

      {/* Quem pagou quanto */}
      {summary && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              Quem pagou o quê
            </h2>
            <div className="text-right">
              <p className="text-xs text-gray-600 dark:text-gray-400">Total da casa</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {formatBRL(summary.totalPaid)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {summary.totalCount}{' '}
                {summary.totalCount === 1 ? 'lançamento' : 'lançamentos'}
              </p>
            </div>
          </div>

          {summary.participants.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-400 py-6 text-center">
              Nenhuma despesa registrada neste período — não há o que dividir.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
                {summary.participants.map(participante => (
                  <div
                    key={participante.responsible}
                    className="rounded-lg border border-gray-200 dark:border-gray-700 p-4"
                  >
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      {formatResponsible(participante.responsible)}
                    </p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                      {formatBRL(participante.paid)}
                    </p>
                    <div className="mt-3">
                      <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                        <div
                          className="h-full bg-indigo-500"
                          style={{
                            width: `${Math.min(
                              Math.max(participante.sharePercent, 0),
                              100,
                            )}%`,
                          }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                        {formatPercent(participante.sharePercent)} do total ·{' '}
                        {participante.count}{' '}
                        {participante.count === 1 ? 'lançamento' : 'lançamentos'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Diferença */}
              {summary.difference ? (
                <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-4">
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    <strong>{formatResponsible(summary.difference.paidMore)}</strong>{' '}
                    desembolsou{' '}
                    <strong>{formatBRL(summary.difference.amount)}</strong> a mais que{' '}
                    <strong>{formatResponsible(summary.difference.paidLess)}</strong> —
                    uma diferença de {formatPercent(summary.difference.percentPoints)} em
                    pontos de participação.
                  </p>
                </div>
              ) : (
                <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-4">
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    Não há dois responsáveis com despesas neste período, então não existe
                    diferença a comparar.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Acerto de contas */}
      {settlement && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
            Acerto de contas
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            {settlement.criteria}
          </p>

          <div className="flex flex-wrap items-center gap-2 mb-5 text-xs">
            <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
              Configurado:{' '}
              {SPLIT_MODE_LABELS[settlement.configuredMode as string] ||
                settlement.configuredMode}
            </span>
            <span
              className={`px-2 py-1 rounded ${
                fallbackAplicado
                  ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200'
                  : 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200'
              }`}
            >
              Aplicado:{' '}
              {SPLIT_MODE_LABELS[settlement.appliedMode as string] ||
                settlement.appliedMode}
            </span>
          </div>

          {settlement.entries.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-400 py-6 text-center">
              Sem lançamentos no período — nada a acertar.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-3 font-medium text-gray-600 dark:text-gray-400">
                      Responsável
                    </th>
                    <th className="text-right py-2 px-3 font-medium text-gray-600 dark:text-gray-400">
                      Pagou
                    </th>
                    <th className="text-right py-2 px-3 font-medium text-gray-600 dark:text-gray-400">
                      Cota
                    </th>
                    <th className="text-right py-2 px-3 font-medium text-gray-600 dark:text-gray-400">
                      Deveria pagar
                    </th>
                    <th className="text-right py-2 px-3 font-medium text-gray-600 dark:text-gray-400">
                      Saldo
                    </th>
                    <th className="text-left py-2 px-3 font-medium text-gray-600 dark:text-gray-400">
                      Situação
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {settlement.entries.map(entry => (
                    <tr
                      key={entry.responsible}
                      className="border-b border-gray-100 dark:border-gray-800"
                    >
                      <td className="py-2 px-3 font-medium text-gray-900 dark:text-white">
                        {formatResponsible(entry.responsible)}
                      </td>
                      <td className="py-2 px-3 text-right text-gray-700 dark:text-gray-300">
                        {formatBRL(entry.paid)}
                      </td>
                      <td className="py-2 px-3 text-right text-gray-700 dark:text-gray-300">
                        {formatPercent(entry.targetPercent)}
                      </td>
                      <td className="py-2 px-3 text-right text-gray-700 dark:text-gray-300">
                        {formatBRL(entry.shouldHavePaid)}
                      </td>
                      <td
                        className={`py-2 px-3 text-right font-semibold ${
                          entry.balance > 0
                            ? 'text-green-600 dark:text-green-400'
                            : entry.balance < 0
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {formatBRL(entry.balance)}
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            entry.status === 'RECEBE'
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200'
                              : entry.status === 'PAGA'
                                ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                          }`}
                        >
                          {SETTLEMENT_STATUS_LABELS[entry.status] || entry.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Transferências sugeridas */}
          <div className="mt-5">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
              Quem deve a quem
            </h3>
            {settlement.transfers.length === 0 ? (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Nada a transferir: as contas do período já estão equilibradas segundo a
                regra aplicada.
              </p>
            ) : (
              <ul className="space-y-2">
                {settlement.transfers.map(transfer => (
                  <li
                    key={`${transfer.from}-${transfer.to}-${transfer.amount}`}
                    className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 flex flex-wrap items-center gap-3 text-sm"
                  >
                    <span className="font-medium text-gray-900 dark:text-white">
                      {formatResponsible(transfer.from)}
                    </span>
                    <ArrowRight className="w-4 h-4 text-gray-400" />
                    <span className="font-medium text-gray-900 dark:text-white">
                      {formatResponsible(transfer.to)}
                    </span>
                    <span className="ml-auto font-bold text-indigo-600 dark:text-indigo-400">
                      {formatBRL(transfer.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Renda usada como base */}
          {settlement.incomeBasis.length > 0 && (
            <div className="mt-5 pt-5 border-t border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                Renda recorrente mensal usada como base
              </h3>
              <ul className="flex flex-wrap gap-3">
                {settlement.incomeBasis.map(item => (
                  <li
                    key={item.responsible}
                    className="rounded-lg bg-gray-50 dark:bg-gray-800/50 px-3 py-2 text-sm"
                  >
                    <span className="text-gray-700 dark:text-gray-300">
                      {formatResponsible(item.responsible)}:
                    </span>{' '}
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {formatBRL(item.monthlyAmount)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Regra de rateio */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
          Regra de rateio
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Define como as despesas compartilhadas da casa são distribuídas entre os
          responsáveis.
          {rule?.isDefault &&
            ' Nenhuma regra foi salva ainda — o sistema está usando o padrão igualitário.'}
        </p>

        {validationError && (
          <div className="mb-4 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20 p-3">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              {validationError}
            </p>
          </div>
        )}

        <div className="space-y-3 mb-4">
          {SPLIT_MODE_OPTIONS.map(option => (
            <label
              key={option.value}
              className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${
                selectedMode === option.value
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/20'
                  : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50'
              }`}
            >
              <input
                type="radio"
                name="split-mode"
                value={option.value}
                checked={selectedMode === option.value}
                onChange={() => {
                  setSelectedMode(option.value);
                  setValidationError(null);
                }}
                className="mt-1 w-4 h-4 text-indigo-600 focus:ring-indigo-500"
              />
              <span>
                <span className="block text-sm font-medium text-gray-900 dark:text-white">
                  {option.label}
                </span>
                <span className="block text-xs text-gray-600 dark:text-gray-400 mt-1">
                  {SPLIT_MODE_DESCRIPTIONS[option.value]}
                </span>
              </span>
            </label>
          ))}
        </div>

        {/* Percentuais personalizados */}
        {selectedMode === SplitMode.CUSTOM && (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
              Percentual de cada responsável
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {responsaveis.map(responsavel => (
                <div key={responsavel}>
                  <label
                    htmlFor={`percent-${responsavel}`}
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    {formatResponsible(responsavel)} (%)
                  </label>
                  <input
                    id={`percent-${responsavel}`}
                    type="text"
                    inputMode="decimal"
                    value={customPercentages[responsavel] ?? ''}
                    onChange={event =>
                      setCustomPercentages({
                        ...customPercentages,
                        [responsavel]: event.target.value,
                      })
                    }
                    placeholder="50"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              A soma precisa dar exatamente 100.
            </p>
          </div>
        )}

        <div className="mb-4">
          <label
            htmlFor="split-notes"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Observação do acordo (opcional)
          </label>
          <textarea
            id="split-notes"
            value={notes}
            onChange={event => setNotes(event.target.value)}
            rows={2}
            placeholder="Ex.: acordo revisado a cada aumento salarial"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleSaveRule}
            disabled={isSaving}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors flex items-center gap-2"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            Salvar regra
          </button>
          {rule?.updatedAt && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Última atualização: {formatDateBR(rule.updatedAt)}
            </span>
          )}
        </div>
      </div>

      {/* Divisão por categoria */}
      {byCategory.length > 0 && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-5">
            Quem pagou o quê por categoria
          </h2>
          <div className="space-y-4">
            {byCategory.map(categoria => (
              <div
                key={categoria.category}
                className="rounded-lg border border-gray-200 dark:border-gray-700 p-4"
              >
                <div className="flex items-center justify-between gap-3 mb-3">
                  <span className="font-medium text-gray-900 dark:text-white">
                    {categoria.category}
                  </span>
                  <span className="font-bold text-gray-900 dark:text-white">
                    {formatBRL(categoria.total)}
                  </span>
                </div>
                <div className="space-y-2">
                  {categoria.byResponsible.map(item => (
                    <div
                      key={`${categoria.category}-${item.responsible}`}
                      className="flex items-center gap-3 text-sm"
                    >
                      <span className="w-24 flex-shrink-0 text-gray-700 dark:text-gray-300">
                        {formatResponsible(item.responsible)}
                      </span>
                      <div className="flex-1 h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                        <div
                          className="h-full bg-indigo-500"
                          style={{
                            width: `${Math.min(Math.max(item.sharePercent, 0), 100)}%`,
                          }}
                        />
                      </div>
                      <span className="w-28 text-right text-gray-900 dark:text-white font-medium">
                        {formatBRL(item.paid)}
                      </span>
                      <span className="w-16 text-right text-xs text-gray-500 dark:text-gray-400">
                        {formatPercent(item.sharePercent)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
