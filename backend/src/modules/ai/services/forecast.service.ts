import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { randomUUID } from 'crypto';
import { Forecast } from '../entities/forecast.entity';
import {
  ForecastType,
  ForecastPeriod,
  ForecastModel,
} from '../entities/forecast.entity';
import {
  ForecastResponseDto,
  ListCategoryForecastsDto,
  CategoryForecastDto,
  BalanceProjectionDto,
  BalanceProjectionResponseDto,
  ForecastDetailsDto,
  ForecastComparisonDto,
  ListForecastComparisonsDto,
} from '../dtos/forecasts.dto';
import { FinancialDataService } from '../../financial-data/financial-data.service';
import { MonthlyPoint } from '../../financial-data/financial-data.types';

/** Meses completos mínimos para ajustar uma reta de tendência confiável. */
const MIN_MESES_HISTORICO = 3;

/** A partir deste número de meses a média móvel entra no ensemble. */
const MESES_PARA_ENSEMBLE = 6;

/** Multiplicador de ~95% de cobertura numa distribuição normal. */
const Z_95 = 1.96;

/**
 * Repartição de probabilidade dos cenários: são as áreas de uma normal
 * abaixo de -1σ, entre -1σ e +1σ e acima de +1σ. Não são números escolhidos
 * à mão — decorrem do desvio padrão real da série mensal.
 */
const PROB_CAUDA = 0.16;
const PROB_CENTRO = 0.68;

/** Variação relativa a partir da qual a tendência deixa de ser "estável". */
const LIMIAR_TENDENCIA = 0.02;

/** Variação percentual a partir da qual uma categoria é considerada em alta/baixa. */
const LIMIAR_CATEGORIA = 5;

/** Desvio máximo aceitável (%) para considerar uma previsão acertada. */
const LIMIAR_ACURACIA = 10;

interface PontoRegressao {
  x: number;
  y: number;
}

interface Regressao {
  slope: number;
  intercept: number;
}

/**
 * Metadados gravados junto da previsão. Descrevem exatamente o que foi
 * calculado a partir dos lançamentos reais — é o que alimenta
 * `getForecastDetails` e `getScenarios` sem precisar recomputar nada.
 */
interface MetadadosPrevisao {
  /** Meses completos efetivamente usados no ajuste. */
  monthsAnalyzed: number;
  /** Quantidade de lançamentos de despesa por trás desses meses. */
  expenseCount: number;
  /** Inclinação da reta em R$ por mês. */
  slopePerMonth: number;
  /** Inclinação relativa à média mensal (-1 a 1) — a "tendência" numérica. */
  relativeTrend: number;
  /** Média mensal observada no histórico usado. */
  monthlyAverage: number;
  /** Desvio padrão da série mensal (volatilidade real). */
  monthlyStdDev: number;
  /** Desvio padrão dos resíduos do ajuste — base do intervalo de confiança. */
  residualStdDev: number;
  /** Média móvel dos últimos 3 meses completos. */
  movingAverage: number;
  /** Total previsto para todo o horizonte. */
  horizonTotal: number;
  /** Horizonte em meses (usado para escalar a volatilidade). */
  horizonMonths: number;
  /** Erro percentual médio absoluto do ajuste sobre o próprio histórico. */
  mape: number;
  /** Verdadeiro quando não houve histórico suficiente para prever. */
  insufficientData: boolean;
}

/**
 * Service de previsões financeiras.
 *
 * Todas as projeções saem dos lançamentos REAIS da família, lidos pelo
 * `FinancialDataService`. O motor é uma regressão linear simples sobre a série
 * mensal de despesas, opcionalmente combinada com a média móvel dos últimos
 * meses (ensemble). Não existe Prophet nem ARIMA no projeto: informar esses
 * modelos seria mentir sobre o método usado.
 *
 * Regra 27 do projeto: sem histórico suficiente o serviço devolve previsão
 * vazia, acurácia zero e um insight explicando a falta de dados — nunca
 * extrapola e nunca usa valores aleatórios.
 */
@Injectable()
export class ForecastService {
  private readonly logger = new Logger(ForecastService.name);

  constructor(
    @InjectRepository(Forecast)
    private forecastRepository: Repository<Forecast>,
    private readonly financialData: FinancialDataService,
  ) {}

  // ==================== endpoints ====================

  /**
   * Previsão do gasto total para o período.
   *
   * As predições são DIÁRIAS (o total mensal previsto dividido pelos dias do
   * mês correspondente), o que permite ao frontend montar tanto a curva diária
   * quanto o acumulado do período.
   */
  async getForecast(
    userId: string,
    familyId: string,
    period: string,
  ): Promise<ForecastResponseDto> {
    const forecast = await this.obterOuGerarPrevisao(familyId, period);
    return this.mapForecastToDto(forecast);
  }

  /**
   * Previsão por categoria: compara o período atual com o período
   * imediatamente anterior de mesma duração e projeta a mesma variação
   * observada para o próximo período.
   *
   * As despesas guardam a categoria como texto livre (`expenses.category`) —
   * não há tabela de categorias nesse escopo, então o próprio nome é usado
   * como identificador.
   */
  async getForecastByCategory(
    userId: string,
    familyId: string,
    filters: {
      period: string;
      limit?: number;
      minVariation?: number;
      categoryId?: string;
    },
  ): Promise<ListCategoryForecastsDto> {
    const atual = this.financialData.getPeriodRange(filters.period);
    const anterior = this.periodoAnterior(atual);

    const [categoriasAtuais, categoriasAnteriores] = await Promise.all([
      this.financialData.getExpensesByCategory(familyId, atual),
      this.financialData.getExpensesByCategory(familyId, anterior),
    ]);

    if (categoriasAtuais.length === 0) {
      // Sem despesas no período não há o que projetar.
      return {
        forecasts: [],
        totalCurrentSpending: 0,
        totalPredictedSpending: 0,
        totalPercentageChange: 0,
      };
    }

    const totaisAnteriores = new Map(
      categoriasAnteriores.map((c) => [c.category, c.total]),
    );

    const previsoes: CategoryForecastDto[] = categoriasAtuais.map((c) => {
      const anteriorTotal = totaisAnteriores.get(c.category) ?? 0;
      const temBase = anteriorTotal > 0;

      const percentageChange = temBase
        ? this.arredondar(((c.total - anteriorTotal) / anteriorTotal) * 100)
        : 0;

      // Projeta a mesma variação absoluta observada entre os dois períodos.
      const predictedSpending = temBase
        ? this.arredondar(Math.max(0, c.total + (c.total - anteriorTotal)))
        : this.arredondar(c.total);

      const trend = temBase
        ? percentageChange > LIMIAR_CATEGORIA
          ? 'UP'
          : percentageChange < -LIMIAR_CATEGORIA
            ? 'DOWN'
            : 'STABLE'
        : 'STABLE';

      return {
        categoryId: c.category,
        categoryName: c.category,
        currentSpending: this.arredondar(c.total),
        predictedSpending,
        percentageChange,
        trend,
        recommendation: this.recomendacaoCategoria(
          c.category,
          percentageChange,
          temBase,
        ),
      };
    });

    // Os totais descrevem o período inteiro e por isso são calculados antes
    // dos filtros de exibição.
    const totalCurrentSpending = this.arredondar(
      previsoes.reduce((soma, f) => soma + f.currentSpending, 0),
    );
    const totalPredictedSpending = this.arredondar(
      previsoes.reduce((soma, f) => soma + f.predictedSpending, 0),
    );
    const totalPercentageChange =
      totalCurrentSpending > 0
        ? this.arredondar(
            ((totalPredictedSpending - totalCurrentSpending) /
              totalCurrentSpending) *
              100,
          )
        : 0;

    const filtradas = previsoes
      .filter((f) =>
        filters.categoryId ? f.categoryId === filters.categoryId : true,
      )
      .filter((f) =>
        filters.minVariation !== undefined
          ? f.percentageChange >= filters.minVariation
          : true,
      )
      .slice(0, filters.limit ?? 20);

    return {
      forecasts: filtradas,
      totalCurrentSpending,
      totalPredictedSpending,
      totalPercentageChange,
    };
  }

  /**
   * Cenários otimista / esperado / pessimista.
   *
   * A amplitude vem da volatilidade REAL da série mensal (desvio padrão),
   * escalada para o horizonte por √(meses). As probabilidades são as áreas de
   * uma normal separadas por ±1σ.
   */
  async getScenarios(
    userId: string,
    familyId: string,
    period: string,
  ): Promise<any> {
    const forecast = await this.obterOuGerarPrevisao(familyId, period);
    const meta = this.lerMetadados(forecast);
    const cenarios = forecast.scenarios ?? {
      bestCase: 0,
      expectedCase: 0,
      worstCase: 0,
    };

    if (meta.insufficientData) {
      return {
        period,
        hasSufficientData: false,
        scenarios: {
          bestCase: {
            description: 'Indisponível',
            amount: 0,
            probability: 0,
            assumptions: [],
          },
          expectedCase: {
            description: 'Indisponível',
            amount: 0,
            probability: 0,
            assumptions: [],
          },
          worstCase: {
            description: 'Indisponível',
            amount: 0,
            probability: 0,
            assumptions: [],
          },
        },
        volatility: {
          monthlyStdDev: 0,
          horizonMonths: meta.horizonMonths,
          deviation: 0,
        },
        note: `São necessários ao menos ${MIN_MESES_HISTORICO} meses completos de despesas lançadas para simular cenários. Cadastre ou importe mais lançamentos.`,
        generatedAt: new Date(),
      };
    }

    const desvioHorizonte = this.arredondar(
      meta.monthlyStdDev * Math.sqrt(Math.max(1, meta.horizonMonths)),
    );

    const baseComum = [
      `Baseado em ${meta.monthsAnalyzed} meses completos de despesas reais (${meta.expenseCount} lançamentos).`,
      `Volatilidade mensal observada: desvio padrão de ${this.arredondar(meta.monthlyStdDev)} sobre média de ${this.arredondar(meta.monthlyAverage)}.`,
    ];

    return {
      period,
      hasSufficientData: true,
      scenarios: {
        bestCase: {
          description: 'Um desvio padrão abaixo do previsto',
          amount: cenarios.bestCase,
          probability: PROB_CAUDA,
          assumptions: [
            ...baseComum,
            `Gasto do período ${desvioHorizonte} abaixo da projeção central (-1σ).`,
          ],
        },
        expectedCase: {
          description: 'Projeção central da tendência observada',
          amount: cenarios.expectedCase,
          probability: PROB_CENTRO,
          assumptions: [
            ...baseComum,
            'Manutenção do ritmo de gastos medido no histórico, sem eventos extraordinários.',
          ],
        },
        worstCase: {
          description: 'Um desvio padrão acima do previsto',
          amount: cenarios.worstCase,
          probability: PROB_CAUDA,
          assumptions: [
            ...baseComum,
            `Gasto do período ${desvioHorizonte} acima da projeção central (+1σ).`,
          ],
        },
      },
      volatility: {
        monthlyStdDev: this.arredondar(meta.monthlyStdDev),
        horizonMonths: meta.horizonMonths,
        deviation: desvioHorizonte,
      },
      generatedAt: new Date(),
    };
  }

  /**
   * Projeção diária do saldo.
   *
   * Parte do saldo consolidado das contas da família e aplica, dia a dia, a
   * média diária real de despesas e as receitas recorrentes cadastradas
   * (creditadas no dia do mês em que costumam cair).
   */
  async getBalanceProjection(
    userId: string,
    familyId: string,
    filters: {
      period: string;
      includeRisk: boolean;
    },
  ): Promise<BalanceProjectionResponseDto> {
    const dias = this.financialData.getPeriodDays(filters.period);
    const janelaHistorico = this.financialData.getPeriodRange('90_DAYS');

    const [saldoAtual, resumo, historicoSuficiente] = await Promise.all([
      this.financialData.getCurrentBalance(familyId),
      this.financialData.getSummary(familyId, janelaHistorico),
      this.financialData.hasSufficientHistory(familyId, MIN_MESES_HISTORICO),
    ]);

    // Sem nenhuma despesa registrada não existe média diária para projetar.
    if (resumo.expenseCount === 0) {
      return {
        projections: [],
        currentBalance: this.arredondar(saldoAtual),
        minimumProjectedBalance: this.arredondar(saldoAtual),
        maximumProjectedBalance: this.arredondar(saldoAtual),
        hasNegativeBalanceRisk: false,
        period: filters.period,
      };
    }

    const receitasRecorrentes = await this.receitasRecorrentesPorDia(
      familyId,
      janelaHistorico,
    );
    const gastoMedioDiario = resumo.averageDailyExpense;

    // Menos histórico ⇒ menos confiança na projeção, e a confiança decai ao
    // longo do horizonte porque o erro se acumula a cada dia projetado.
    const confiancaBase = historicoSuficiente ? 0.8 : 0.5;

    const hoje = new Date();
    const projections: BalanceProjectionDto[] = [];
    let saldo = saldoAtual;

    for (let i = 1; i <= dias; i++) {
      const data = new Date(hoje);
      data.setDate(data.getDate() + i);

      const receitaDoDia = receitasRecorrentes.get(data.getDate()) ?? 0;
      saldo = saldo + receitaDoDia - gastoMedioDiario;

      const saldoProjetado = this.arredondar(saldo);
      const negativo = saldoProjetado < 0;

      projections.push({
        date: data,
        projectedBalance: saldoProjetado,
        confidence: this.arredondar(
          Math.max(0.1, confiancaBase * (1 - 0.4 * (i / dias))),
          4,
        ),
        isRiskyDay: filters.includeRisk && negativo,
        riskReason:
          filters.includeRisk && negativo
            ? 'Saldo projetado negativo neste dia'
            : undefined,
      });
    }

    const saldos = projections.map((p) => p.projectedBalance);
    const minimo = Math.min(...saldos);
    const primeiroNegativo = projections.findIndex(
      (p) => p.projectedBalance < 0,
    );

    return {
      projections,
      currentBalance: this.arredondar(saldoAtual),
      minimumProjectedBalance: minimo,
      maximumProjectedBalance: Math.max(...saldos),
      hasNegativeBalanceRisk: minimo < 0,
      daysUntilNegativeBalance:
        primeiroNegativo >= 0 ? primeiroNegativo + 1 : undefined,
      period: filters.period,
    };
  }

  /**
   * Detalhes e premissas da previsão — tudo derivado do que foi realmente
   * calculado, inclusive o modelo usado e a acurácia medida sobre o histórico.
   */
  async getForecastDetails(
    userId: string,
    familyId: string,
    period: string,
  ): Promise<ForecastDetailsDto> {
    const forecast = await this.obterOuGerarPrevisao(familyId, period);
    const meta = this.lerMetadados(forecast);
    const resumo = forecast.summary ?? {};
    const geradoEm = forecast.createdAt ?? new Date();

    return {
      id: forecast.id,
      forecastType: forecast.forecastType,
      period: forecast.period,
      modelUsed: forecast.modelUsed,
      modelAccuracy: Number(resumo.accuracy) || 0,
      confidence: Number(resumo.confidence) || 0,
      averagePredicted: Number(resumo.averagePredicted) || 0,
      trend: meta.relativeTrend,
      keyInsights: this.montarInsights(meta, resumo.trend),
      assumptions: this.montarPremissas(meta, forecast.modelUsed),
      generatedAt: geradoEm,
      nextUpdateAt: new Date(
        new Date(geradoEm).getTime() + 7 * 24 * 60 * 60 * 1000,
      ),
    };
  }

  /**
   * Backtest honesto do modelo: para cada mês fechado com histórico anterior
   * suficiente, ajusta a reta apenas com os meses ANTERIORES e compara a
   * previsão com o gasto que de fato aconteceu.
   */
  async getAccuracyComparison(
    userId: string,
    familyId: string,
    limit: number,
  ): Promise<ListForecastComparisonsDto> {
    const serie = await this.financialData.getMonthlyExpenseSeries(
      familyId,
      12,
    );
    const completos = this.mesesCompletos(serie);

    // É preciso um mês fechado além do mínimo de treino para ter o que comparar.
    if (completos.length < MIN_MESES_HISTORICO + 1) {
      return {
        comparisons: [],
        averageAccuracy: 0,
        overallTrend: 'INSUFFICIENT_DATA',
      };
    }

    const baseIndice = this.mesParaIndice(completos[0].month);
    const comparacoes: ForecastComparisonDto[] = [];

    for (let i = MIN_MESES_HISTORICO; i < completos.length; i++) {
      const treino: PontoRegressao[] = completos.slice(0, i).map((p) => ({
        x: this.mesParaIndice(p.month) - baseIndice,
        y: p.total,
      }));
      const { slope, intercept } = this.regressaoLinear(treino);

      const alvo = completos[i];
      const previsto = Math.max(
        0,
        intercept + slope * (this.mesParaIndice(alvo.month) - baseIndice),
      );
      const real = alvo.total;
      const variancia =
        real > 0 ? this.arredondar(((real - previsto) / real) * 100) : 0;
      const acertou = Math.abs(variancia) <= LIMIAR_ACURACIA;

      comparacoes.push({
        period: alvo.month,
        actualSpending: this.arredondar(real),
        forecastedSpending: this.arredondar(previsto),
        variancePercentage: variancia,
        isAccurate: acertou,
        learningNote: this.notaAprendizado(variancia, acertou, i),
      });
    }

    const acuracias = comparacoes.map((c) =>
      Math.max(0, 100 - Math.abs(c.variancePercentage)),
    );
    const averageAccuracy = this.arredondar(
      acuracias.reduce((soma, a) => soma + a, 0) / acuracias.length,
    );

    return {
      // Mais recentes primeiro.
      comparisons: [...comparacoes].reverse().slice(0, Math.max(0, limit)),
      averageAccuracy,
      overallTrend: this.tendenciaDaAcuracia(comparacoes),
    };
  }

  /**
   * Descarta as previsões em cache da família para que a próxima leitura
   * recalcule tudo a partir dos lançamentos atuais.
   */
  async regenerateForecasts(userId: string, familyId: string): Promise<any> {
    await this.forecastRepository.delete({ familyId });

    return {
      success: true,
      message: 'Previsões regeneradas com sucesso',
      regeneratedAt: new Date(),
    };
  }

  // ==================== geração da previsão ====================

  /**
   * Reaproveita a previsão gerada hoje (se houver) ou calcula uma nova.
   *
   * O cache é diário porque a base muda a cada lançamento: uma previsão de
   * ontem já não descreve a casa de hoje.
   */
  private async obterOuGerarPrevisao(
    familyId: string,
    period: string,
  ): Promise<Forecast> {
    const inicioDoDia = new Date();
    inicioDoDia.setHours(0, 0, 0, 0);

    const emCache = await this.forecastRepository.findOne({
      where: {
        familyId,
        period: period as ForecastPeriod,
        forecastType: ForecastType.TOTAL,
        createdAt: MoreThanOrEqual(inicioDoDia),
      },
      order: { createdAt: 'DESC' },
    });

    if (emCache) {
      return emCache;
    }

    return this.gerarPrevisao(familyId, period, ForecastType.TOTAL);
  }

  /**
   * Calcula a previsão a partir da série mensal real de despesas.
   *
   * Passos:
   * 1. lê os últimos 12 meses e descarta o mês corrente (ainda incompleto);
   * 2. ajusta uma reta por mínimos quadrados sobre os meses fechados;
   * 3. com 6+ meses, combina a reta com a média móvel de 3 meses (ensemble);
   * 4. distribui o total mensal previsto pelos dias de cada mês;
   * 5. deriva os limites do intervalo do desvio dos resíduos (±1,96σ).
   */
  private async gerarPrevisao(
    familyId: string,
    period: string,
    forecastType: ForecastType,
  ): Promise<Forecast> {
    const dias = this.financialData.getPeriodDays(period);
    const horizonMonths = this.arredondar(dias / 30, 2);

    const [historicoSuficiente, serie] = await Promise.all([
      this.financialData.hasSufficientHistory(familyId, MIN_MESES_HISTORICO),
      this.financialData.getMonthlyExpenseSeries(familyId, 12),
    ]);

    const completos = this.mesesCompletos(serie);

    if (!historicoSuficiente || completos.length < MIN_MESES_HISTORICO) {
      this.logger.warn(
        `Previsão sem histórico suficiente para a família ${familyId}: ` +
          `${completos.length} mês(es) fechado(s).`,
      );
      return this.previsaoSemDados(
        familyId,
        period,
        forecastType,
        completos,
        horizonMonths,
      );
    }

    const baseIndice = this.mesParaIndice(completos[0].month);
    const pontos: PontoRegressao[] = completos.map((p) => ({
      x: this.mesParaIndice(p.month) - baseIndice,
      y: p.total,
    }));

    const { slope, intercept } = this.regressaoLinear(pontos);

    const totais = completos.map((p) => p.total);
    const mediaMensal = totais.reduce((s, v) => s + v, 0) / totais.length;
    const desvioMensal = this.desvioPadrao(totais);

    const residuos = pontos.map((p) => p.y - (intercept + slope * p.x));
    const residualStdDev = this.desvioResiduos(residuos);

    // Média móvel dos 3 meses fechados mais recentes.
    const ultimos = completos.slice(-3);
    const movingAverage =
      ultimos.reduce((s, p) => s + p.total, 0) / ultimos.length;

    const usaEnsemble = completos.length >= MESES_PARA_ENSEMBLE;
    const modelUsed = usaEnsemble ? ForecastModel.ENSEMBLE : ForecastModel.LINEAR;

    // Erro percentual médio absoluto do próprio ajuste — é a acurácia que
    // podemos honestamente afirmar (in-sample).
    const mape = this.calcularMape(pontos, intercept, slope);
    const accuracy = this.arredondar(
      Math.min(100, Math.max(0, 100 - mape * 100)),
    );

    // Quanto mais volátil o histórico e menos meses disponíveis, menor a
    // confiança declarada.
    const coefVariacao = mediaMensal > 0 ? residualStdDev / mediaMensal : 1;
    const fatorHistorico = 0.6 + 0.4 * Math.min(1, completos.length / 12);
    const confianca = this.arredondar(
      Math.min(0.95, Math.max(0.3, 0.95 - coefVariacao)) * fatorHistorico,
      4,
    );

    const hoje = new Date();
    const predictions: Array<{
      date: string;
      predictedValue: number;
      lowerBound: number;
      upperBound: number;
      confidence: number;
    }> = [];

    for (let i = 1; i <= dias; i++) {
      const data = new Date(hoje);
      data.setDate(data.getDate() + i);

      const x = this.dataParaIndiceMensal(data) - baseIndice;
      const totalMensalPrevisto = this.preverMes(
        x,
        intercept,
        slope,
        movingAverage,
        usaEnsemble,
      );

      const diasDoMes = this.diasNoMes(data);
      const valorDiario = totalMensalPrevisto / diasDoMes;
      const sigmaDiario = residualStdDev / diasDoMes;

      predictions.push({
        date: data.toISOString().split('T')[0],
        predictedValue: this.arredondar(valorDiario),
        lowerBound: this.arredondar(
          Math.max(0, valorDiario - Z_95 * sigmaDiario),
        ),
        upperBound: this.arredondar(valorDiario + Z_95 * sigmaDiario),
        // A incerteza cresce com a distância: ao fim do horizonte a confiança
        // é 30% menor que no primeiro dia.
        confidence: this.arredondar(
          Math.max(0.1, confianca * (1 - 0.3 * (i / dias))),
          4,
        ),
      });
    }

    const valores = predictions.map((p) => p.predictedValue);
    const totalHorizonte = this.arredondar(
      valores.reduce((s, v) => s + v, 0),
    );

    const relativeTrend = mediaMensal > 0 ? slope / mediaMensal : 0;
    const trend =
      relativeTrend > LIMIAR_TENDENCIA
        ? 'UP'
        : relativeTrend < -LIMIAR_TENDENCIA
          ? 'DOWN'
          : 'STABLE';

    // Volatilidade do horizonte: o desvio mensal escala com √(nº de meses).
    const desvioHorizonte =
      desvioMensal * Math.sqrt(Math.max(1, horizonMonths));

    const metadata: MetadadosPrevisao = {
      monthsAnalyzed: completos.length,
      expenseCount: completos.reduce((s, p) => s + p.count, 0),
      slopePerMonth: this.arredondar(slope),
      relativeTrend: this.arredondar(
        Math.max(-1, Math.min(1, relativeTrend)),
        4,
      ),
      monthlyAverage: this.arredondar(mediaMensal),
      monthlyStdDev: this.arredondar(desvioMensal),
      residualStdDev: this.arredondar(residualStdDev),
      movingAverage: this.arredondar(movingAverage),
      horizonTotal: totalHorizonte,
      horizonMonths,
      mape: this.arredondar(mape * 100),
      insufficientData: false,
    };

    const forecast = this.forecastRepository.create({
      familyId,
      forecastType,
      period: period as ForecastPeriod,
      modelUsed,
      predictions,
      summary: {
        averagePredicted: this.arredondar(
          valores.reduce((s, v) => s + v, 0) / valores.length,
        ),
        minPredicted: this.arredondar(Math.min(...valores)),
        maxPredicted: this.arredondar(Math.max(...valores)),
        trend,
        modelUsed,
        accuracy,
        confidence: confianca,
      },
      scenarios: {
        bestCase: this.arredondar(Math.max(0, totalHorizonte - desvioHorizonte)),
        expectedCase: totalHorizonte,
        worstCase: this.arredondar(totalHorizonte + desvioHorizonte),
      },
      accuracy,
      metadata: metadata as unknown as Record<string, any>,
    });

    const salvo = await this.forecastRepository.save(forecast);
    return Array.isArray(salvo) ? salvo[0] : salvo;
  }

  /**
   * Resposta honesta para quando não há histórico suficiente (regra 27).
   *
   * Não persiste nada: não existe previsão a guardar, apenas a constatação de
   * que faltam lançamentos.
   */
  private previsaoSemDados(
    familyId: string,
    period: string,
    forecastType: ForecastType,
    completos: MonthlyPoint[],
    horizonMonths: number,
  ): Forecast {
    const metadata: MetadadosPrevisao = {
      monthsAnalyzed: completos.length,
      expenseCount: completos.reduce((s, p) => s + p.count, 0),
      slopePerMonth: 0,
      relativeTrend: 0,
      monthlyAverage: 0,
      monthlyStdDev: 0,
      residualStdDev: 0,
      movingAverage: 0,
      horizonTotal: 0,
      horizonMonths,
      mape: 0,
      insufficientData: true,
    };

    return {
      id: randomUUID(),
      familyId,
      forecastType,
      period: period as ForecastPeriod,
      categoryId: null,
      targetUserId: null,
      predictions: [],
      summary: {
        averagePredicted: 0,
        minPredicted: 0,
        maxPredicted: 0,
        trend: 'STABLE',
        modelUsed: ForecastModel.LINEAR,
        accuracy: 0,
        confidence: 0,
      },
      scenarios: { bestCase: 0, expectedCase: 0, worstCase: 0 },
      modelUsed: ForecastModel.LINEAR,
      accuracy: 0,
      metadata: metadata as unknown as Record<string, any>,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as Forecast;
  }

  /**
   * Valor mensal previsto para o índice `x`.
   *
   * No ensemble a tendência linear pesa 60% e a média móvel 40%: a reta capta
   * a direção de longo prazo, a média móvel amortece a extrapolação com o
   * nível recente de gastos.
   */
  private preverMes(
    x: number,
    intercept: number,
    slope: number,
    movingAverage: number,
    usaEnsemble: boolean,
  ): number {
    const linear = intercept + slope * x;
    const previsto = usaEnsemble ? 0.6 * linear + 0.4 * movingAverage : linear;
    return Math.max(0, previsto);
  }

  // ==================== textos derivados dos cálculos ====================

  private montarInsights(meta: MetadadosPrevisao, trend?: string): string[] {
    if (meta.insufficientData) {
      return [
        `Não há histórico suficiente para prever: foram encontrados ${meta.monthsAnalyzed} mês(es) fechado(s) de despesas, e o modelo precisa de ao menos ${MIN_MESES_HISTORICO}.`,
        'Nenhuma projeção foi calculada — cadastre ou importe mais lançamentos para liberar as previsões.',
      ];
    }

    const insights: string[] = [
      `Tendência estimada por regressão linear sobre ${meta.monthsAnalyzed} meses fechados (${meta.expenseCount} lançamentos).`,
    ];

    const variacaoMensalPercentual = this.arredondar(
      meta.relativeTrend * 100,
      1,
    );

    if (trend === 'UP') {
      insights.push(
        `Despesas em alta: cerca de ${Math.abs(variacaoMensalPercentual)}% de aumento por mês em relação à média do período.`,
      );
    } else if (trend === 'DOWN') {
      insights.push(
        `Despesas em queda: cerca de ${Math.abs(variacaoMensalPercentual)}% de redução por mês em relação à média do período.`,
      );
    } else {
      insights.push(
        'Despesas estáveis: a inclinação da tendência é inferior a 2% da média mensal.',
      );
    }

    const volatilidade =
      meta.monthlyAverage > 0
        ? this.arredondar((meta.monthlyStdDev / meta.monthlyAverage) * 100, 1)
        : 0;
    insights.push(
      `Volatilidade mensal de ${volatilidade}% da média — é o que define a largura dos cenários.`,
    );

    insights.push(
      `Erro médio do ajuste sobre o próprio histórico: ${meta.mape}%.`,
    );

    return insights;
  }

  private montarPremissas(
    meta: MetadadosPrevisao,
    modelUsed: ForecastModel,
  ): string[] {
    if (meta.insufficientData) {
      return [
        'Nenhuma premissa foi aplicada: sem histórico suficiente, nada foi projetado.',
      ];
    }

    const premissas = [
      `Série mensal real de despesas da família (${meta.monthsAnalyzed} meses fechados).`,
      'O mês corrente foi excluído do ajuste por ainda estar incompleto.',
    ];

    if (modelUsed === ForecastModel.ENSEMBLE) {
      premissas.push(
        'Previsão combina tendência linear (peso 60%) com a média móvel de 3 meses (peso 40%).',
      );
    } else {
      premissas.push(
        'Previsão usa apenas a tendência linear — ainda não há meses suficientes para a média móvel entrar no cálculo.',
      );
    }

    premissas.push(
      'Intervalo de confiança de ~95% (±1,96σ) calculado sobre o desvio dos resíduos do ajuste.',
      'O total mensal previsto é distribuído igualmente entre os dias de cada mês.',
      'Não considera eventos extraordinários nem lançamentos futuros ainda não cadastrados.',
    );

    return premissas;
  }

  private recomendacaoCategoria(
    categoria: string,
    percentageChange: number,
    temBase: boolean,
  ): string {
    if (!temBase) {
      return `Sem gastos em ${categoria} no período anterior — não há base de comparação para projetar variação.`;
    }

    if (percentageChange > LIMIAR_CATEGORIA) {
      return `Gasto ${Math.abs(percentageChange)}% acima do período anterior. Revise os lançamentos de ${categoria}.`;
    }

    if (percentageChange < -LIMIAR_CATEGORIA) {
      return `Gasto ${Math.abs(percentageChange)}% abaixo do período anterior. Redução confirmada em ${categoria}.`;
    }

    return `Gasto estável em ${categoria} (variação de ${percentageChange}%).`;
  }

  private notaAprendizado(
    variancia: number,
    acertou: boolean,
    indice: number,
  ): string {
    const direcao =
      variancia > 0
        ? `subestimou o gasto real em ${Math.abs(variancia)}%`
        : variancia < 0
          ? `superestimou o gasto em ${Math.abs(variancia)}%`
          : 'acertou o valor previsto';

    const base = `Ajuste com ${indice} mês(es) anteriores ${direcao}.`;

    return acertou
      ? `${base} Desvio dentro da faixa aceitável de ${LIMIAR_ACURACIA}%.`
      : `${base} Desvio acima da faixa aceitável de ${LIMIAR_ACURACIA}%.`;
  }

  /**
   * A acurácia está melhorando se o erro médio da metade mais recente das
   * comparações for menor que o da metade mais antiga.
   */
  private tendenciaDaAcuracia(comparacoes: ForecastComparisonDto[]): string {
    if (comparacoes.length < 2) {
      return 'INSUFFICIENT_DATA';
    }

    const meio = Math.floor(comparacoes.length / 2);
    const erroMedio = (lista: ForecastComparisonDto[]) =>
      lista.reduce((s, c) => s + Math.abs(c.variancePercentage), 0) /
      lista.length;

    const antigas = erroMedio(comparacoes.slice(0, meio));
    const recentes = erroMedio(comparacoes.slice(meio));

    if (recentes < antigas - 2) return 'IMPROVING';
    if (recentes > antigas + 2) return 'DEGRADING';
    return 'STABLE';
  }

  // ==================== utilitários ====================

  /**
   * Receitas recorrentes agrupadas pelo dia do mês em que costumam cair.
   *
   * A mesma descrição pode aparecer várias vezes na janela analisada (uma por
   * mês); mantemos apenas a ocorrência mais recente para não somar o mesmo
   * salário três vezes.
   */
  private async receitasRecorrentesPorDia(
    familyId: string,
    janela: { start: Date; end: Date },
  ): Promise<Map<number, number>> {
    const receitas = await this.financialData.getIncomes(familyId, janela);

    const maisRecentePorDescricao = new Map<
      string,
      { dia: number; valor: number; data: number }
    >();

    for (const receita of receitas) {
      if (!receita.isRecurring) continue;
      // Só receitas mensais (ou sem frequência definida, tratadas como mensais)
      // fazem sentido num calendário de dia do mês.
      if (receita.frequency && receita.frequency !== 'monthly') continue;

      const chave = (receita.description || '').toLowerCase().trim();
      const data = new Date(receita.date);
      const anterior = maisRecentePorDescricao.get(chave);

      if (!anterior || data.getTime() > anterior.data) {
        maisRecentePorDescricao.set(chave, {
          dia: data.getDate(),
          valor: Number(receita.amount) || 0,
          data: data.getTime(),
        });
      }
    }

    const porDia = new Map<number, number>();
    for (const { dia, valor } of maisRecentePorDescricao.values()) {
      porDia.set(dia, (porDia.get(dia) ?? 0) + valor);
    }

    return porDia;
  }

  /** Descarta o mês corrente, que ainda está incompleto e viesaria a tendência. */
  private mesesCompletos(serie: MonthlyPoint[]): MonthlyPoint[] {
    const agora = new Date();
    const mesAtual = `${agora.getFullYear()}-${String(
      agora.getMonth() + 1,
    ).padStart(2, '0')}`;

    return serie.filter((p) => p.month < mesAtual);
  }

  /** Ajuste por mínimos quadrados: y = intercept + slope · x. */
  private regressaoLinear(pontos: PontoRegressao[]): Regressao {
    const n = pontos.length;
    if (n === 0) return { slope: 0, intercept: 0 };
    if (n === 1) return { slope: 0, intercept: pontos[0].y };

    const somaX = pontos.reduce((s, p) => s + p.x, 0);
    const somaY = pontos.reduce((s, p) => s + p.y, 0);
    const somaXY = pontos.reduce((s, p) => s + p.x * p.y, 0);
    const somaXX = pontos.reduce((s, p) => s + p.x * p.x, 0);

    const denominador = n * somaXX - somaX * somaX;
    const slope =
      denominador === 0 ? 0 : (n * somaXY - somaX * somaY) / denominador;
    const intercept = (somaY - slope * somaX) / n;

    return { slope, intercept };
  }

  /** Desvio padrão amostral. */
  private desvioPadrao(valores: number[]): number {
    if (valores.length < 2) return 0;
    const media = valores.reduce((s, v) => s + v, 0) / valores.length;
    const variancia =
      valores.reduce((s, v) => s + (v - media) ** 2, 0) / (valores.length - 1);
    return Math.sqrt(variancia);
  }

  /**
   * Desvio dos resíduos com correção de graus de liberdade (n − 2, pois a reta
   * consome dois parâmetros).
   */
  private desvioResiduos(residuos: number[]): number {
    if (residuos.length < 3) return 0;
    const soma = residuos.reduce((s, r) => s + r * r, 0);
    return Math.sqrt(soma / (residuos.length - 2));
  }

  /** Erro percentual médio absoluto do ajuste (0–1). */
  private calcularMape(
    pontos: PontoRegressao[],
    intercept: number,
    slope: number,
  ): number {
    const validos = pontos.filter((p) => p.y > 0);
    if (validos.length === 0) return 1;

    const soma = validos.reduce((s, p) => {
      const previsto = intercept + slope * p.x;
      return s + Math.abs(p.y - previsto) / p.y;
    }, 0);

    return soma / validos.length;
  }

  /** `YYYY-MM` → número absoluto de meses, para servir de eixo x. */
  private mesParaIndice(month: string): number {
    const [ano, mes] = month.split('-').map(Number);
    return ano * 12 + (mes - 1);
  }

  private dataParaIndiceMensal(data: Date): number {
    return data.getFullYear() * 12 + data.getMonth();
  }

  private diasNoMes(data: Date): number {
    return new Date(data.getFullYear(), data.getMonth() + 1, 0).getDate();
  }

  /** Período imediatamente anterior, de mesma duração e sem sobreposição. */
  private periodoAnterior(atual: { start: Date; end: Date }): {
    start: Date;
    end: Date;
  } {
    const duracao = atual.end.getTime() - atual.start.getTime();
    return {
      start: new Date(atual.start.getTime() - duracao - 1),
      end: new Date(atual.start.getTime() - 1),
    };
  }

  private arredondar(valor: number, casas = 2): number {
    if (!Number.isFinite(valor)) return 0;
    const fator = 10 ** casas;
    return Math.round(valor * fator) / fator;
  }

  private lerMetadados(forecast: Forecast): MetadadosPrevisao {
    const meta = (forecast.metadata ?? {}) as Partial<MetadadosPrevisao>;

    return {
      monthsAnalyzed: meta.monthsAnalyzed ?? 0,
      expenseCount: meta.expenseCount ?? 0,
      slopePerMonth: meta.slopePerMonth ?? 0,
      relativeTrend: meta.relativeTrend ?? 0,
      monthlyAverage: meta.monthlyAverage ?? 0,
      monthlyStdDev: meta.monthlyStdDev ?? 0,
      residualStdDev: meta.residualStdDev ?? 0,
      movingAverage: meta.movingAverage ?? 0,
      horizonTotal: meta.horizonTotal ?? 0,
      horizonMonths: meta.horizonMonths ?? 0,
      mape: meta.mape ?? 0,
      insufficientData: meta.insufficientData ?? false,
    };
  }

  private mapForecastToDto(forecast: Forecast): ForecastResponseDto {
    return {
      id: forecast.id,
      forecastType: forecast.forecastType,
      period: forecast.period,
      categoryId: forecast.categoryId || undefined,
      predictions: forecast.predictions as any,
      summary: forecast.summary as any,
      scenarios: forecast.scenarios as any,
      generatedAt: forecast.createdAt,
    };
  }
}
