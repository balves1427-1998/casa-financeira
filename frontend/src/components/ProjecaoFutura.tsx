'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import { formatBRL } from '@/utils/format';
import { getApiErrorMessage } from '@/utils/api-error';
import { lerCampoMoeda, paraCampoMoeda } from '@/utils/money';
import { CriticalDaysPanel } from '@/components/cash-flow/CriticalDaysPanel';
import { ShoppingRecommendation } from '@/components/cash-flow/ShoppingRecommendation';
import { BestDayToShopDto } from '@/types/cash-flow';

/**
 * Projeção de saldo, dias críticos e melhor período para comprar.
 *
 * Morava no Fluxo de Caixa, que agora é EXTRATO — realidade, não previsão.
 * Projeção é futuro, e futuro é o assunto desta tela: aqui ela fica ao lado das
 * contas que a causam, e dá para ver a conta e o efeito dela na mesma página.
 */
export function ProjecaoFutura() {
  const hoje = new Date();
  const [mes] = useState(hoje.getMonth() + 1);
  const [ano] = useState(hoje.getFullYear());

  const [projecao, setProjecao] = useState<any>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [valorDesejado, setValorDesejado] = useState('1.000,00');
  const [recomendacao, setRecomendacao] = useState<BestDayToShopDto | null>(null);
  const [consultando, setConsultando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setProjecao(await apiClient.getCashFlowMonth(mes, ano));
    } catch (err) {
      setProjecao(null);
      setErro(getApiErrorMessage(err, 'Não foi possível carregar a projeção.'));
    } finally {
      setCarregando(false);
    }
  }, [mes, ano]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const consultarMelhorDia = async () => {
    const valor = lerCampoMoeda(valorDesejado);
    if (!Number.isFinite(valor) || valor <= 0) {
      setErro('Informe um valor válido para a compra.');
      return;
    }

    setConsultando(true);
    setErro(null);
    try {
      setRecomendacao(await apiClient.getCashFlowBestDay({ desiredAmount: valor }));
    } catch (err) {
      setErro(getApiErrorMessage(err, 'Não foi possível calcular o melhor dia.'));
    } finally {
      setConsultando(false);
    }
  };

  const diasCriticos = projecao?.criticalDays ?? [];
  const ultimoDia = projecao?.days?.[projecao.days.length - 1];

  return (
    <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 mb-6">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
        Projeção do mês
      </h2>
      <p className="text-xs text-gray-600 dark:text-gray-400 mb-4">
        Considera o que já aconteceu somado ao que está previsto aqui no
        Planejado. Para o que de fato entrou e saiu, veja o Fluxo de Caixa.
      </p>

      {erro && (
        <p className="mb-3 rounded bg-red-50 dark:bg-red-950/30 p-2 text-sm text-red-800 dark:text-red-200">
          {erro}
        </p>
      )}

      {carregando && !projecao && (
        <div className="h-24 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
      )}

      {projecao && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-3">
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Saldo inicial
              </p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">
                {formatBRL(projecao.openingBalance)}
              </p>
            </div>

            <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-3">
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Previsto a pagar
              </p>
              <p className="text-lg font-bold text-red-700 dark:text-red-300">
                {formatBRL(projecao.totalPlanned)}
              </p>
            </div>

            <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-3">
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Previsto a receber
              </p>
              <p className="text-lg font-bold text-green-700 dark:text-green-300">
                {formatBRL(projecao.totalPlannedIncome)}
              </p>
            </div>

            <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-3">
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Saldo projetado no fim do mês
              </p>
              <p
                className={`text-lg font-bold ${
                  (ultimoDia?.projectedBalance ?? 0) < 0
                    ? 'text-red-700 dark:text-red-300'
                    : 'text-gray-900 dark:text-white'
                }`}
              >
                {formatBRL(ultimoDia?.projectedBalance ?? 0)}
              </p>
            </div>
          </div>

          {diasCriticos.length > 0 && (
            <div className="mb-4">
              <CriticalDaysPanel
                criticalDays={diasCriticos}
                title="⚠️ Dias que exigem mais caixa"
              />
            </div>
          )}

          <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-3">
            <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">
              Melhor período para uma compra
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-gray-600 dark:text-gray-400">
                Valor pretendido
                <input
                  type="text"
                  inputMode="decimal"
                  value={valorDesejado}
                  onChange={e => setValorDesejado(e.target.value)}
                  onBlur={() => {
                    const v = lerCampoMoeda(valorDesejado);
                    if (Number.isFinite(v)) setValorDesejado(paraCampoMoeda(v));
                  }}
                  className="mt-1 block w-40 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm text-gray-900 dark:text-white"
                />
              </label>
              <button
                onClick={consultarMelhorDia}
                disabled={consultando}
                className="rounded bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {consultando ? 'Calculando…' : 'Ver melhor período'}
              </button>
            </div>

            {(recomendacao || consultando) && (
              <div className="mt-3">
                <ShoppingRecommendation
                  recommendation={recomendacao}
                  isLoading={consultando}
                />
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
