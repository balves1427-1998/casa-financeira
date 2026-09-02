'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { formatBRL, formatDateBR } from '@/utils/format';
import { getApiErrorMessage } from '@/utils/api-error';

interface Movimento {
  date: string;
  tipo: 'entrada' | 'saida';
  descricao: string;
  categoria?: string;
  responsavel?: string;
  valor: number;
  origem: 'receita' | 'despesa' | 'fatura';
  saldoApos: number;
}

interface Extrato {
  month: number;
  year: number;
  openingBalance: number;
  saldoAteHoje: number;
  closingBalance: number;
  totalEntradas: number;
  totalSaidas: number;
  movimentos: Movimento[];
}

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

const ROTULO_ORIGEM: Record<Movimento['origem'], string> = {
  receita: 'Receita',
  despesa: 'Despesa',
  fatura: 'Fatura do cartão',
};

/**
 * Fluxo de Caixa — EXTRATO, não projeção.
 *
 * Esta tela responde uma pergunta só: "onde eu estou agora?". Mostra o que de
 * fato entrou e saiu da conta, em ordem cronológica, com o saldo correndo ao
 * lado — como um extrato bancário.
 *
 * O que ela deliberadamente NÃO faz é projetar. Contas previstas, dias críticos
 * e melhor dia para comprar vivem no Planejado, que é a tela de futuro. Enquanto
 * as duas coisas moravam aqui, o saldo desta página nunca batia com o do banco:
 * carregava compromissos que ainda não tinham acontecido, e não servia para
 * conferir nada.
 *
 * Compras no cartão não aparecem. Elas foram gastas, mas o dinheiro continua na
 * conta até a fatura ser paga — quem aparece é a fatura, no dia do pagamento.
 */
export default function CashFlowPage() {
  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());
  const [extrato, setExtrato] = useState<Extrato | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setExtrato(await apiClient.getStatement(mes, ano));
    } catch (err) {
      setExtrato(null);
      setErro(getApiErrorMessage(err, 'Não foi possível carregar o extrato.'));
    } finally {
      setCarregando(false);
    }
  }, [mes, ano]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const mesAnterior = () => {
    if (mes === 1) {
      setMes(12);
      setAno(ano - 1);
    } else {
      setMes(mes - 1);
    }
  };

  const mesSeguinte = () => {
    if (mes === 12) {
      setMes(1);
      setAno(ano + 1);
    } else {
      setMes(mes + 1);
    }
  };

  const ehMesCorrente =
    mes === hoje.getMonth() + 1 && ano === hoje.getFullYear();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
            🧾 Fluxo de Caixa
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            O que entrou e saiu de verdade. Para o que ainda vai acontecer, veja
            o Planejado.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={mesAnterior}
            aria-label="Mês anterior"
            className="p-2 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="min-w-[10rem] text-center text-sm font-medium text-gray-900 dark:text-white">
            {MESES[mes - 1]} de {ano}
          </span>
          <button
            onClick={mesSeguinte}
            aria-label="Próximo mês"
            className="p-2 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {erro && (
        <p className="rounded bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-800 dark:text-red-200">
          {erro}
        </p>
      )}

      {carregando && !extrato && (
        <div className="space-y-3 animate-pulse">
          <div className="h-24 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-64 rounded bg-gray-200 dark:bg-gray-700" />
        </div>
      )}

      {extrato && (
        <>
          {/* O saldo fica no topo: é a pergunta que traz o usuário aqui. */}
          <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {ehMesCorrente ? 'Saldo até hoje' : 'Saldo ao fim do período'}
            </p>
            <p
              className={`text-4xl font-bold tabular-nums ${
                (ehMesCorrente
                  ? extrato.saldoAteHoje
                  : extrato.closingBalance) < 0
                  ? 'text-red-700 dark:text-red-300'
                  : 'text-gray-900 dark:text-white'
              }`}
            >
              {formatBRL(
                ehMesCorrente ? extrato.saldoAteHoje : extrato.closingBalance,
              )}
            </p>

            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span className="text-gray-600 dark:text-gray-400">
                Saldo inicial:{' '}
                <strong className="text-gray-900 dark:text-white">
                  {formatBRL(extrato.openingBalance)}
                </strong>
              </span>
              <span className="text-green-700 dark:text-green-300">
                Entradas: <strong>{formatBRL(extrato.totalEntradas)}</strong>
              </span>
              <span className="text-red-700 dark:text-red-300">
                Saídas: <strong>{formatBRL(extrato.totalSaidas)}</strong>
              </span>
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
            {extrato.movimentos.length === 0 ? (
              <p className="p-8 text-center text-sm text-gray-600 dark:text-gray-400">
                Nenhuma movimentação em {MESES[mes - 1]}. Receitas e despesas
                aparecem aqui assim que forem lançadas.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800 text-xs uppercase text-gray-600 dark:text-gray-400">
                    <tr>
                      <th className="p-3 text-left font-medium">Data</th>
                      <th className="p-3 text-left font-medium">Descrição</th>
                      <th className="p-3 text-left font-medium">Tipo</th>
                      <th className="p-3 text-right font-medium">Valor</th>
                      <th className="p-3 text-right font-medium">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extrato.movimentos.map((m, i) => (
                      <tr
                        key={`${m.date}-${m.descricao}-${i}`}
                        className="border-t border-gray-200 dark:border-gray-700"
                      >
                        <td className="p-3 whitespace-nowrap text-gray-700 dark:text-gray-300">
                          {formatDateBR(m.date)}
                        </td>
                        <td className="p-3">
                          <span className="text-gray-900 dark:text-white">
                            {m.descricao}
                          </span>
                          {m.categoria && (
                            <span className="block text-xs text-gray-500 dark:text-gray-400">
                              {m.categoria}
                              {m.responsavel ? ` · ${m.responsavel}` : ''}
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          <span
                            className={`inline-block rounded px-2 py-0.5 text-xs ${
                              m.origem === 'fatura'
                                ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200'
                                : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                            }`}
                          >
                            {ROTULO_ORIGEM[m.origem]}
                          </span>
                        </td>
                        <td
                          className={`p-3 text-right whitespace-nowrap tabular-nums font-medium ${
                            m.tipo === 'entrada'
                              ? 'text-green-700 dark:text-green-300'
                              : 'text-red-700 dark:text-red-300'
                          }`}
                        >
                          {m.tipo === 'entrada' ? '+' : '−'} {formatBRL(m.valor)}
                        </td>
                        <td className="p-3 text-right whitespace-nowrap tabular-nums text-gray-900 dark:text-white">
                          {formatBRL(m.saldoApos)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <p className="text-xs text-gray-500 dark:text-gray-400">
            Compras no cartão não aparecem aqui: o dinheiro só sai da conta
            quando a fatura é paga — e é a fatura que entra no extrato, no dia do
            pagamento. As compras seguem detalhadas na aba Despesas.
          </p>
        </>
      )}
    </div>
  );
}
