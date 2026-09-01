'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiClient } from '@/lib/api';
import { formatBRL, formatDateBR } from '@/utils/format';
import { getApiErrorMessage } from '@/utils/api-error';

interface LinhaCategoria {
  category: string;
  total: number;
  count: number;
  percentage: number;
}

interface Statement {
  cardId: string;
  cardName: string;
  limit: number;
  usedLimit: number;
  availableLimit: number;
  utilizationPercentage: number;
  closingDate: string;
  dueDate: string;
  currentInvoice: { total: number; count: number; categories: LinhaCategoria[] };
  nextInvoice: { total: number; count: number; closingDate: string };
  daysUntilClosing: number;
  daysUntilDue: number;
}

interface MesHistorico {
  competencia: string;
  total: number;
  count: number;
}

interface MelhorDia {
  bestDate: string;
  recommendation: string;
  closingNotice: string;
  shouldWait: boolean;
  daysUntilClosing: number;
  daysToPayIfBuyToday: number;
  daysToPayIfWait: number;
  extraDaysIfWait: number;
}

interface LancamentoLido {
  transactionId: string;
  date: string;
  description: string;
  amount: number;
  suggestedCategory?: string;
  type?: string;
}

/** "2027-03" → "mar/27" */
function rotuloCompetencia(competencia: string): string {
  const [ano, mes] = competencia.split('-');
  const nomes = [
    'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
    'jul', 'ago', 'set', 'out', 'nov', 'dez',
  ];
  return `${nomes[Number(mes) - 1] ?? mes}/${ano.slice(2)}`;
}

/**
 * Painel de acompanhamento de um cartão.
 *
 * Reúne o que a aba Cartões precisa responder: quanto já foi gasto na fatura
 * aberta, em que categorias, quanto de limite sobrou, como o gasto evoluiu, e
 * qual o melhor dia para comprar considerando o fechamento.
 *
 * Tudo vem de endpoints que DERIVAM os números dos lançamentos do cartão — não
 * há saldo digitado à mão em nenhum ponto.
 */
export function CardStatementPanel({ cardId }: { cardId: string }) {
  const [statement, setStatement] = useState<Statement | null>(null);
  const [historico, setHistorico] = useState<MesHistorico[]>([]);
  const [melhorDia, setMelhorDia] = useState<MelhorDia | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // Importação de fatura
  const inputArquivo = useRef<HTMLInputElement>(null);
  const [importId, setImportId] = useState<string | null>(null);
  const [lidos, setLidos] = useState<LancamentoLido[]>([]);
  const [importando, setImportando] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  /**
   * Carrega os três blocos de forma INDEPENDENTE.
   *
   * Antes isto era um `Promise.all`, e o efeito colateral era grave: uma falha
   * em QUALQUER uma das três chamadas — inclusive a de "melhor dia", que é a
   * menos essencial das três — derrubava o painel inteiro, e junto com ele
   * sumia a importação de fatura em PDF. O usuário não via um erro no lugar do
   * botão; via a funcionalidade simplesmente não existir.
   *
   * Foi exatamente o que aconteceu em produção enquanto a coluna
   * `planned_accounts.type` estava faltando: "melhor dia" consulta o fluxo de
   * caixa, o fluxo de caixa quebrava, e a importação de PDF desaparecia da tela
   * por tabela.
   */
  const carregar = useCallback(async () => {
    setIsLoading(true);
    setErro(null);

    const [s, h, m] = await Promise.allSettled([
      apiClient.getCardStatement(cardId),
      apiClient.getCardHistory(cardId, 12),
      apiClient.getCardBestDay(cardId),
    ]);

    if (s.status === 'fulfilled') {
      setStatement(s.value);
    } else {
      setStatement(null);
      setErro(getApiErrorMessage(s.reason, 'Não foi possível carregar a fatura.'));
    }

    // Histórico e melhor dia são complementares: quando falham, o bloco some,
    // mas nada mais é afetado.
    setHistorico(h.status === 'fulfilled' && Array.isArray(h.value) ? h.value : []);
    setMelhorDia(m.status === 'fulfilled' ? m.value : null);

    setIsLoading(false);
  }, [cardId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  /**
   * Lê a fatura em PDF.
   *
   * O arquivo NUNCA é gravado como despesa direto: o backend extrai os
   * lançamentos e devolve para conferência. Só depois de o usuário confirmar é
   * que eles viram despesas — a regra 5 do escopo do projeto.
   */
  const handleArquivo = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = event.target.files?.[0];
    if (!arquivo) return;

    setImportando(true);
    setFeedback(null);
    setErro(null);

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const resultado = String(reader.result);
          // `data:application/pdf;base64,XXXX` → só a parte depois da vírgula
          resolve(resultado.slice(resultado.indexOf(',') + 1));
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(arquivo);
      });

      const resultado = await apiClient.uploadCardInvoice(
        arquivo.name,
        base64,
        cardId,
      );

      setImportId(resultado?.id ?? null);

      const extraidos = Array.isArray(resultado?.extractedData)
        ? resultado.extractedData
        : Object.values(resultado?.extractedData ?? {});

      setLidos(extraidos as LancamentoLido[]);

      if (extraidos.length === 0) {
        setFeedback(
          'Nenhum lançamento foi reconhecido neste PDF. Confira se o arquivo é a fatura e não o extrato.',
        );
      }
    } catch (err) {
      setErro(getApiErrorMessage(err, 'Não foi possível ler a fatura.'));
    } finally {
      setImportando(false);
      if (inputArquivo.current) inputArquivo.current.value = '';
    }
  };

  const handleConfirmarImportacao = async () => {
    if (!importId) return;

    setImportando(true);
    try {
      const resultado = await apiClient.confirmPdfImport(importId);
      setFeedback(
        `${resultado?.imported ?? 0} lançamento(s) gravado(s); ${
          resultado?.skipped ?? 0
        } ignorado(s) por duplicidade ou por serem crédito.`,
      );
      setImportId(null);
      setLidos([]);
      await carregar();
    } catch (err) {
      setErro(getApiErrorMessage(err, 'Não foi possível gravar os lançamentos.'));
    } finally {
      setImportando(false);
    }
  };

  if (isLoading) {
    return (
      <div className="mt-4 animate-pulse space-y-3">
        <div className="h-20 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
    );
  }

  const gastoNoGrafico = historico.map(mes => ({
    mes: rotuloCompetencia(mes.competencia),
    total: mes.total,
  }));

  const temHistorico = historico.some(mes => mes.total > 0);

  return (
    <div className="mt-4 space-y-5 border-t border-gray-200 dark:border-gray-700 pt-4">
      {erro && (
        <p className="text-sm text-red-700 dark:text-red-300">{erro}</p>
      )}
      {feedback && (
        <p className="text-sm text-green-700 dark:text-green-300">{feedback}</p>
      )}

      {/* Fatura e limite — só quando a fatura carregou. A importação de PDF
          abaixo NÃO depende disto: é justamente ela que popula o cartão. */}
      {statement && (
      <>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-3">
          <p className="text-xs text-gray-600 dark:text-gray-400">Fatura atual</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white">
            {formatBRL(statement.currentInvoice.total)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {statement.currentInvoice.count} lançamento(s) · fecha em{' '}
            {formatDateBR(statement.closingDate)}
          </p>
        </div>

        <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-3">
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Próxima fatura
          </p>
          <p className="text-xl font-bold text-gray-900 dark:text-white">
            {formatBRL(statement.nextInvoice.total)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Vence em {formatDateBR(statement.dueDate)} ·{' '}
            {statement.daysUntilDue} dia(s)
          </p>
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-1 text-xs">
          <span className="text-gray-600 dark:text-gray-400">
            Limite usado: {formatBRL(statement.usedLimit)}
          </span>
          <span className="font-semibold text-gray-900 dark:text-white">
            Disponível: {formatBRL(statement.availableLimit)}
          </span>
        </div>
        <div className="h-2.5 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
          <div
            className={`h-full transition-all ${
              statement.utilizationPercentage >= 80
                ? 'bg-red-500'
                : statement.utilizationPercentage >= 50
                  ? 'bg-amber-500'
                  : 'bg-green-500'
            }`}
            style={{
              width: `${Math.min(statement.utilizationPercentage, 100)}%`,
            }}
          />
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {statement.utilizationPercentage.toFixed(1)}% de{' '}
          {formatBRL(statement.limit)} — considera todas as compras ainda não
          pagas, não só a fatura aberta.
        </p>
      </div>

      {/* Fechamento e melhor dia para comprar */}
      {melhorDia && (
        <div className="space-y-2">
          {/* O prazo até fechar vem primeiro: é o dado que decide a compra. */}
          <div className="rounded-lg bg-gray-100 dark:bg-gray-800 p-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                📅 {melhorDia.closingNotice}
              </p>
              {melhorDia.daysUntilClosing > 0 && (
                <span className="shrink-0 text-2xl font-bold tabular-nums text-gray-900 dark:text-white">
                  {melhorDia.daysUntilClosing}
                  <span className="ml-1 text-xs font-normal text-gray-500 dark:text-gray-400">
                    {melhorDia.daysUntilClosing === 1 ? 'dia' : 'dias'}
                  </span>
                </span>
              )}
            </div>
          </div>

          <div
            className={`rounded-lg p-3 text-sm ${
              melhorDia.shouldWait
                ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200'
                : 'bg-green-50 dark:bg-green-950/20 text-green-900 dark:text-green-200'
            }`}
          >
            <p className="font-medium mb-0.5">
              {melhorDia.shouldWait
                ? `⏳ Melhor comprar a partir de ${formatDateBR(melhorDia.bestDate)}`
                : '🟢 Hoje é o melhor dia para comprar'}
            </p>
            <p className="text-xs">{melhorDia.recommendation}</p>

            {melhorDia.shouldWait && melhorDia.extraDaysIfWait > 0 && (
              <p className="mt-1.5 text-xs opacity-80">
                Prazo comprando hoje: {melhorDia.daysToPayIfBuyToday} dia(s) ·
                esperando: {melhorDia.daysToPayIfWait} dia(s).
              </p>
            )}
          </div>
        </div>
      )}

      {/* Onde o cartão está sendo gasto */}
      {statement.currentInvoice.categories.length > 0 && (
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">
            Onde você mais gastou nesta fatura
          </p>
          <ul className="space-y-1.5">
            {statement.currentInvoice.categories.slice(0, 5).map(linha => (
              <li key={linha.category} className="text-xs">
                <div className="flex justify-between mb-0.5">
                  <span className="text-gray-700 dark:text-gray-300">
                    {linha.category}{' '}
                    <span className="text-gray-500">({linha.count})</span>
                  </span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatBRL(linha.total)} · {linha.percentage.toFixed(0)}%
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                  <div
                    className="h-full bg-indigo-500"
                    style={{ width: `${Math.min(linha.percentage, 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Evolução mensal */}
      {temHistorico && (
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">
            Evolução dos últimos 12 meses
          </p>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={gastoNoGrafico}>
                <CartesianGrid strokeDasharray="3 3" stroke="#9ca3af33" />
                <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} width={60} />
                <Tooltip
                  formatter={(valor: number) => formatBRL(valor)}
                  labelFormatter={rotulo => `Mês: ${rotulo}`}
                />
                <Bar dataKey="total" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      </>
      )}

      {/* Importar fatura em PDF — SEMPRE visível.
          É por aqui que os lançamentos entram no cartão; se ela dependesse da
          fatura ter carregado, um cartão recém-cadastrado (ou uma falha
          qualquer no backend) deixaria o usuário sem caminho nenhum. */}
      <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 p-3">
        <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">
          Importar fatura em PDF
        </p>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
          Os lançamentos são lidos e mostrados para conferência.{' '}
          <strong>Nada é gravado antes de você confirmar.</strong>
        </p>
        <input
          ref={inputArquivo}
          type="file"
          accept="application/pdf"
          onChange={handleArquivo}
          disabled={importando}
          className="block w-full text-xs text-gray-700 dark:text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-indigo-600 file:text-white hover:file:bg-indigo-700 disabled:opacity-50"
        />

        {lidos.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-medium text-gray-900 dark:text-white mb-2">
              {lidos.length} lançamento(s) encontrado(s) — confira antes de
              gravar:
            </p>
            <div className="max-h-56 overflow-y-auto rounded border border-gray-200 dark:border-gray-700">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                  <tr>
                    <th className="text-left p-2">Data</th>
                    <th className="text-left p-2">Descrição</th>
                    <th className="text-left p-2">Categoria</th>
                    <th className="text-right p-2">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {lidos.map(item => (
                    <tr
                      key={item.transactionId}
                      className="border-t border-gray-200 dark:border-gray-700"
                    >
                      <td className="p-2 whitespace-nowrap">
                        {formatDateBR(item.date)}
                      </td>
                      <td className="p-2">{item.description}</td>
                      <td className="p-2 text-gray-600 dark:text-gray-400">
                        {item.suggestedCategory || 'Outros'}
                      </td>
                      <td className="p-2 text-right whitespace-nowrap">
                        {formatBRL(Number(item.amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap gap-2 mt-2">
              <button
                onClick={handleConfirmarImportacao}
                disabled={importando}
                className="px-3 py-1.5 rounded text-xs font-medium bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white transition-colors"
              >
                {importando ? 'Gravando…' : 'Confirmar e gravar'}
              </button>
              <button
                onClick={() => {
                  setImportId(null);
                  setLidos([]);
                }}
                className="px-3 py-1.5 rounded text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Descartar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
