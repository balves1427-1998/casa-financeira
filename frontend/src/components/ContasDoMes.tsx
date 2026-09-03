'use client';

import { useMemo, useState } from 'react';
import { useAccounts } from '@/hooks/useAccounts';
import { useExpenses } from '@/hooks/useExpenses';
import { usePlannedAccounts } from '@/hooks/usePlannedAccounts';
import { formatBRL, formatDateBR } from '@/utils/format';

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/** Hoje em `YYYY-MM-DD`, no fuso local — `toISOString()` volta um dia à noite. */
function hojeISO(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/**
 * O que precisa ser pago neste mês, e com quanto se conta para pagar.
 *
 * É a primeira pergunta de quem abre o sistema no dia a dia — e ela não era
 * respondida em lugar nenhum: o saldo estava em Contas, os compromissos no
 * Planejado, e os gastos aqui. Para saber se o mês fecha, era preciso somar
 * três telas de cabeça.
 *
 * O saldo mostrado é o das contas de pagamento. Cartão de crédito fica de fora
 * de propósito: o saldo dele é dívida, não dinheiro disponível.
 */
export function ContasDoMes() {
  const { accounts } = useAccounts();
  const { planned, markAsPaid, isSaving } = usePlannedAccounts();
  const { expenses, setExpensePaid } = useExpenses();
  const [pagando, setPagando] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [dataDoPagamento, setDataDoPagamento] = useState(hojeISO());

  const hoje = new Date();
  const mes = hoje.getMonth();
  const ano = hoje.getFullYear();

  const saldoEmCaixa = useMemo(
    () =>
      accounts
        .filter(c => c.type !== 'credit_card')
        .reduce((soma, c) => soma + Number(c.balance || 0), 0),
    [accounts],
  );

  /**
   * Tudo que vence neste mês e ainda não foi pago.
   *
   * Vem de DOIS lugares, e essa é a correção: além do Planejado, entram as
   * despesas ainda não pagas. A primeira ocorrência de uma despesa recorrente
   * não vira conta planejada — a projeção da série começa na ocorrência
   * seguinte —, então quem cadastra "Luz, todo dia 28" fica com o vencimento
   * do próprio mês só em Despesas. Este painel dizia "R$ 0,00 a pagar" para
   * uma casa com catorze contas vencendo.
   */
  const aPagar = useMemo(() => {
    const doMes = (data: string | Date) => {
      const v = new Date(data);
      return v.getMonth() === mes && v.getFullYear() === ano;
    };

    const doPlanejado = planned
      .filter(c => {
        if (c.type === 'income') return false;
        if (c.status === 'paid' || c.status === 'cancelled') return false;
        return doMes(c.dueDate);
      })
      .map(c => ({
        id: c.id,
        origem: 'planejado' as const,
        description: c.description,
        amount: Number(c.amount || 0),
        dueDate: c.dueDate as string,
        category: c.category,
        responsible: c.responsible,
      }));

    const deDespesas = expenses
      .filter(e => {
        if (e.isPaid) return false;
        // Compra no cartão não vence sozinha: vence dentro da fatura, que já
        // entra pelo Planejado. Contar as duas cobraria o mesmo em dobro.
        if (e.paymentMethod === 'credit' && e.creditCardId) return false;
        return doMes((e as any).dueDate ?? e.date);
      })
      .map(e => ({
        id: e.id,
        origem: 'despesa' as const,
        description: e.description,
        amount: Number(e.amount || 0),
        dueDate: ((e as any).dueDate ?? e.date) as string,
        category: e.category,
        responsible: e.responsible,
      }));

    return [...doPlanejado, ...deDespesas].sort(
      (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
    );
  }, [planned, expenses, mes, ano]);

  const totalAPagar = useMemo(
    () => aPagar.reduce((soma, c) => soma + Number(c.amount || 0), 0),
    [aPagar],
  );

  const aReceber = useMemo(
    () =>
      planned
        .filter(c => {
          if (c.type !== 'income') return false;
          if (c.status === 'paid' || c.status === 'cancelled') return false;
          const v = new Date(c.dueDate);
          return v.getMonth() === mes && v.getFullYear() === ano;
        })
        .reduce((soma, c) => soma + Number(c.amount || 0), 0),
    [planned, mes, ano],
  );

  // O que sobra depois de pagar tudo o que vence no mês, contando o que ainda
  // está por receber. É o número que decide se dá para comprar alguma coisa.
  const sobra = saldoEmCaixa + aReceber - totalAPagar;

  /**
   * Confirma o pagamento na data em que o dinheiro saiu.
   *
   * A data é perguntada, e não assumida como hoje: quase nunca se registra no
   * mesmo dia, e gravar "hoje" joga a saída para a competência errada — no
   * virar do mês, para o mês errado.
   */
  const marcarPaga = async (
    id: string,
    origem: 'planejado' | 'despesa',
    data: string,
  ) => {
    setPagando(id);
    try {
      // Cada origem tem o seu jeito de ser quitada: a conta planejada é
      // confirmada, a despesa é marcada como paga.
      if (origem === 'planejado') {
        await markAsPaid(id, data || undefined);
      } else {
        await setExpensePaid(id, true);
      }
      setConfirmando(null);
    } finally {
      setPagando(null);
    }
  };

  const abrirConfirmacao = (id: string) => {
    setConfirmando(id);
    setDataDoPagamento(hojeISO());
  };

  const diasAte = (data: string | Date) => {
    const v = new Date(data);
    v.setHours(0, 0, 0, 0);
    const h = new Date();
    h.setHours(0, 0, 0, 0);
    return Math.round((v.getTime() - h.getTime()) / 86400000);
  };

  return (
    <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
        A pagar em {MESES[mes]}
      </h2>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-3">
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Saldo em caixa
          </p>
          <p className="text-xl font-bold text-gray-900 dark:text-white">
            {formatBRL(saldoEmCaixa)}
          </p>
        </div>

        <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-3">
          <p className="text-xs text-gray-600 dark:text-gray-400">
            A pagar no mês
          </p>
          <p className="text-xl font-bold text-red-700 dark:text-red-300">
            {formatBRL(totalAPagar)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {aPagar.length} conta(s)
          </p>
        </div>

        <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-3">
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Ainda a receber
          </p>
          <p className="text-xl font-bold text-green-700 dark:text-green-300">
            {formatBRL(aReceber)}
          </p>
        </div>

        <div
          className={`rounded-lg p-3 ${
            sobra < 0
              ? 'bg-red-50 dark:bg-red-950/20'
              : 'bg-green-50 dark:bg-green-950/20'
          }`}
        >
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Sobra depois de pagar tudo
          </p>
          <p
            className={`text-xl font-bold ${
              sobra < 0
                ? 'text-red-700 dark:text-red-300'
                : 'text-green-700 dark:text-green-300'
            }`}
          >
            {formatBRL(sobra)}
          </p>
        </div>
      </div>

      {aPagar.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Nenhuma conta em aberto vencendo em {MESES[mes]}.
        </p>
      ) : (
        <ul className="divide-y divide-gray-200 dark:divide-gray-700">
          {aPagar.map(conta => {
            const dias = diasAte(conta.dueDate);
            const vencida = dias < 0;

            return (
              <li
                key={conta.id}
                className="flex flex-wrap items-center justify-between gap-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {conta.description}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formatDateBR(conta.dueDate)}
                    {vencida
                      ? ` · vencida há ${Math.abs(dias)} dia(s)`
                      : dias === 0
                        ? ' · vence hoje'
                        : ` · em ${dias} dia(s)`}
                    {conta.category ? ` · ${conta.category}` : ''}
                    {conta.responsible ? ` · ${conta.responsible}` : ''}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`text-sm font-semibold tabular-nums ${
                      vencida
                        ? 'text-red-700 dark:text-red-300'
                        : 'text-gray-900 dark:text-white'
                    }`}
                  >
                    {formatBRL(Number(conta.amount))}
                  </span>
                  {confirmando === conta.id ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="date"
                        aria-label="Data do pagamento"
                        value={dataDoPagamento}
                        onChange={e => setDataDoPagamento(e.target.value)}
                        className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-1.5 py-1 text-xs text-gray-900 dark:text-white"
                      />
                      <button
                        onClick={() =>
                          marcarPaga(conta.id, conta.origem, dataDoPagamento)
                        }
                        disabled={isSaving || !dataDoPagamento}
                        className="rounded bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        {pagando === conta.id ? 'Pagando…' : 'Confirmar'}
                      </button>
                      <button
                        onClick={() => setConfirmando(null)}
                        className="rounded border border-gray-300 dark:border-gray-600 px-2 py-1 text-xs text-gray-700 dark:text-gray-300"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => abrirConfirmacao(conta.id)}
                      disabled={isSaving}
                      className="rounded bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      Marcar paga
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
        Para criar ou remover um compromisso futuro, use a aba Planejado. Aqui
        embaixo ficam as despesas já realizadas, que você pode lançar e excluir.
      </p>
    </section>
  );
}
