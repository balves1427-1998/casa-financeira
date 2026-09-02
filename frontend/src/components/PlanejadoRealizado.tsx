'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import { formatBRL } from '@/utils/format';
import { getApiErrorMessage } from '@/utils/api-error';

interface Resumo {
  competencia: string;
  receitasPlanejadas: number;
  despesasPlanejadas: number;
  receitasRealizadas: number;
  despesasRealizadas: number;
  variacaoReceitas: number;
  variacaoDespesas: number;
  saldoPlanejado: number;
  saldoRealizado: number;
  detalhe: {
    faturasPlanejadas: number;
    comprasNoCartao: number;
    contasPagas: number;
    contasPendentes: number;
    contasVencidas: number;
  };
}

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/** Doze meses para trás e três para frente: cobre o histórico e a projeção. */
function competenciasDisponiveis(): Array<{ mes: number; ano: number; rotulo: string }> {
  const hoje = new Date();
  const lista = [];

  for (let deslocamento = 3; deslocamento >= -12; deslocamento--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() + deslocamento, 1);
    lista.push({
      mes: d.getMonth() + 1,
      ano: d.getFullYear(),
      rotulo: `${MESES[d.getMonth()]} de ${d.getFullYear()}`,
    });
  }

  return lista;
}

/**
 * Planejado x Realizado da competência.
 *
 * A leitura que este painel precisa permitir: "o mês saiu como eu tinha
 * planejado?". Por isso a variação vem com sinal e cor — gastar MENOS do que o
 * previsto é bom, receber menos é ruim, e as duas coisas não podem ter a mesma
 * aparência.
 */
export function PlanejadoRealizado() {
  const opcoes = competenciasDisponiveis();
  const atual = opcoes.find(o => {
    const hoje = new Date();
    return o.mes === hoje.getMonth() + 1 && o.ano === hoje.getFullYear();
  }) ?? opcoes[3];

  const [mes, setMes] = useState(atual.mes);
  const [ano, setAno] = useState(atual.ano);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setResumo(await apiClient.getPlanejadoRealizado(mes, ano));
    } catch (err) {
      setResumo(null);
      setErro(getApiErrorMessage(err, 'Não foi possível carregar o resumo do mês.'));
    } finally {
      setCarregando(false);
    }
  }, [mes, ano]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return (
    <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">
          Planejado × Realizado
        </h2>

        <label className="flex items-center gap-2 text-sm">
          <span className="text-gray-600 dark:text-gray-400">Competência</span>
          <select
            value={`${ano}-${mes}`}
            onChange={e => {
              const [a, m] = e.target.value.split('-').map(Number);
              setAno(a);
              setMes(m);
            }}
            className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm text-gray-900 dark:text-white"
          >
            {opcoes.map(o => (
              <option key={`${o.ano}-${o.mes}`} value={`${o.ano}-${o.mes}`}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </label>
      </div>

      {erro && (
        <p className="rounded bg-red-50 dark:bg-red-950/30 p-2 text-sm text-red-800 dark:text-red-200">
          {erro}
        </p>
      )}

      {carregando && !resumo && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 animate-pulse">
          {[0, 1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-20 rounded bg-gray-200 dark:bg-gray-700" />
          ))}
        </div>
      )}

      {resumo && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <Bloco
              titulo="Receitas planejadas"
              valor={resumo.receitasPlanejadas}
            />
            <Bloco
              titulo="Receitas realizadas"
              valor={resumo.receitasRealizadas}
              // Receber menos do que o previsto é o problema aqui.
              variacao={resumo.variacaoReceitas}
              bomQuando="positivo"
            />
            <Bloco
              titulo="Saldo planejado"
              valor={resumo.saldoPlanejado}
              destaque
            />

            <Bloco
              titulo="Despesas planejadas"
              valor={resumo.despesasPlanejadas}
              rodape={
                resumo.detalhe.faturasPlanejadas > 0
                  ? `inclui ${formatBRL(resumo.detalhe.faturasPlanejadas)} de faturas`
                  : undefined
              }
            />
            <Bloco
              titulo="Despesas realizadas"
              valor={resumo.despesasRealizadas}
              // Gastar menos do que o previsto é bom.
              variacao={resumo.variacaoDespesas}
              bomQuando="negativo"
            />
            <Bloco
              titulo="Saldo realizado"
              valor={resumo.saldoRealizado}
              destaque
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
            <span>
              Compras no cartão neste mês:{' '}
              <strong className="text-gray-900 dark:text-white">
                {formatBRL(resumo.detalhe.comprasNoCartao)}
              </strong>
            </span>
            <span>{resumo.detalhe.contasPagas} conta(s) paga(s)</span>
            <span>{resumo.detalhe.contasPendentes} pendente(s)</span>
            {resumo.detalhe.contasVencidas > 0 && (
              <span className="text-red-700 dark:text-red-300">
                {resumo.detalhe.contasVencidas} vencida(s)
              </span>
            )}
          </div>

          {resumo.detalhe.comprasNoCartao > 0 && (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              As compras no cartão foram gastas neste mês, mas o dinheiro só sai
              no vencimento da fatura — por isso entram como despesa realizada
              no mês em que a fatura é paga, e não aqui.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function Bloco({
  titulo,
  valor,
  variacao,
  bomQuando,
  rodape,
  destaque,
}: {
  titulo: string;
  valor: number;
  variacao?: number;
  bomQuando?: 'positivo' | 'negativo';
  rodape?: string;
  destaque?: boolean;
}) {
  const corDoSaldo =
    destaque && valor < 0
      ? 'text-red-700 dark:text-red-300'
      : destaque
        ? 'text-green-700 dark:text-green-300'
        : 'text-gray-900 dark:text-white';

  // Uma variação de zero não merece destaque: só polui.
  const mostrarVariacao =
    variacao !== undefined && Math.abs(variacao) >= 0.01 && bomQuando;

  const favoravel =
    bomQuando === 'positivo' ? (variacao ?? 0) > 0 : (variacao ?? 0) < 0;

  return (
    <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-3">
      <p className="text-xs text-gray-600 dark:text-gray-400">{titulo}</p>
      <p className={`text-lg font-bold ${corDoSaldo}`}>{formatBRL(valor)}</p>

      {mostrarVariacao && (
        <p
          className={`text-xs mt-0.5 ${
            favoravel
              ? 'text-green-700 dark:text-green-300'
              : 'text-amber-700 dark:text-amber-300'
          }`}
        >
          {(variacao ?? 0) > 0 ? '▲' : '▼'} {formatBRL(Math.abs(variacao ?? 0))}{' '}
          {favoravel ? 'a favor' : 'contra'} o planejado
        </p>
      )}

      {rodape && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{rodape}</p>
      )}
    </div>
  );
}
