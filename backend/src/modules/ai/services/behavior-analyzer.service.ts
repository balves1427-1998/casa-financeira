import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BehaviorAnalysis } from '../entities/behavior-analysis.entity';
import {
  BehaviorAnalysisResponseDto,
  ListPatternsDto,
  PatternDto,
  ListCorrelationsDto,
  CorrelationDto,
  SpendingProfileDto,
  PeriodAnalysisDto,
  DaySpendingDto,
  SeasonalPatternDto,
} from '../dtos/analysis.dto';
import { FinancialDataService } from '../../financial-data/financial-data.service';
import { Expense } from '../../expenses/entities/expense.entity';
import {
  MonthlyPoint,
  PeriodRange,
} from '../../financial-data/financial-data.types';

const MESES_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

/** Variação mínima entre períodos para classificar a tendência como alta/queda. */
const VARIACAO_TENDENCIA = 0.15;

/** Mínimo de lançamentos numa categoria para avaliar tendência. */
const AMOSTRA_MINIMA_CATEGORIA = 3;

/**
 * Participação mínima de um dia da semana para ser considerado concentração.
 * 1/7 ≈ 14,3% seria a distribuição uniforme; exigimos 1,5x isso.
 */
const CONCENTRACAO_MINIMA_DIA = 1.5 / 7;

/** Mínimo de pontos para calcular correlação de Pearson. */
const PONTOS_MINIMOS_CORRELACAO = 3;

/**
 * Análise comportamental construída exclusivamente sobre os lançamentos REAIS
 * da família.
 *
 * Todo dado vem do `FinancialDataService`; nenhum padrão, correlação ou métrica
 * é fixado no código. Quando não há histórico suficiente, os métodos devolvem
 * listas vazias e textos honestos dizendo que faltam lançamentos — regra 27 do
 * projeto (a IA não inventa informação).
 */
@Injectable()
export class BehaviorAnalyzerService {
  private readonly logger = new Logger(BehaviorAnalyzerService.name);

  constructor(
    @InjectRepository(BehaviorAnalysis)
    private behaviorAnalysisRepository: Repository<BehaviorAnalysis>,
    private readonly financialData: FinancialDataService,
  ) {}

  // ==================== análise completa ====================

  /**
   * Análise comportamental completa do período.
   *
   * Sempre recalcula a partir dos lançamentos atuais e persiste o resultado —
   * uma análise salva antiga descreveria um mês que não existe mais.
   */
  async analyzeBehavior(
    userId: string,
    familyId: string,
    period: string,
  ): Promise<BehaviorAnalysisResponseDto> {
    const range = this.getPeriodDateRange(period);

    const [resumo, analise, spendingProfile, insights] = await Promise.all([
      this.financialData.getSummary(familyId, range),
      this.generateBehaviorAnalysis(userId, familyId, period),
      this.getSpendingProfile(userId, familyId, period),
      this.generateInsights(userId, familyId),
    ]);

    const periodAnalysis = (analise?.periodAnalysis ??
      this.analiseDePeriodoVazia()) as unknown as PeriodAnalysisDto;

    const semLancamentos =
      resumo.expenseCount === 0 && resumo.incomeCount === 0;

    const summary = semLancamentos
      ? `Ainda não há lançamentos registrados no período ${period}. ` +
        'Importe um extrato ou cadastre despesas e receitas para que a análise comportamental possa ser feita.'
      : `No período ${period} foram registrados ${resumo.expenseCount} despesa(s) somando ` +
        `${this.formatarMoeda(resumo.totalExpenses)} e ${resumo.incomeCount} receita(s) somando ` +
        `${this.formatarMoeda(resumo.totalIncomes)} — saldo de ${this.formatarMoeda(resumo.balance)} ` +
        `e média diária de ${this.formatarMoeda(resumo.averageDailyExpense)}.`;

    return {
      period,
      summary,
      patterns: (analise?.patterns as PatternDto[]) ?? [],
      // As anomalias têm ciclo de vida próprio (confirmação pelo usuário) e são
      // servidas pelo AnomalyDetectorService em GET /analysis/anomalies.
      anomalies: [],
      correlations: (analise?.correlations as CorrelationDto[]) ?? [],
      insights: insights.insights,
      generatedAt: analise?.createdAt ?? new Date(),
      periodAnalysis,
      spendingProfile,
      metadata: {
        totalDespesas: this.arredondar(resumo.totalExpenses),
        totalReceitas: this.arredondar(resumo.totalIncomes),
        saldo: this.arredondar(resumo.balance),
        quantidadeLancamentos: resumo.expenseCount + resumo.incomeCount,
        diasNoPeriodo: resumo.days,
        possuiDadosSuficientes: !semLancamentos,
      },
    };
  }

  // ==================== padrões ====================

  /**
   * Detecta padrões REAIS de gasto:
   * - tendência por categoria comparando dois trimestres consecutivos;
   * - concentração de gastos em dias da semana;
   * - despesas recorrentes identificadas no histórico.
   */
  async detectPatterns(
    userId: string,
    familyId: string,
    filters: {
      frequency?: string;
      limit: number;
    },
  ): Promise<ListPatternsDto> {
    const [tendencias, concentracoes, recorrencias] = await Promise.all([
      this.padroesDeTendenciaPorCategoria(familyId),
      this.padroesDeConcentracaoSemanal(familyId),
      this.padroesDeRecorrencia(familyId),
    ]);

    const padroes = [...tendencias, ...concentracoes, ...recorrencias].sort(
      (a, b) => b.confidence - a.confidence,
    );

    const filtrados = filters.frequency
      ? padroes.filter((p) => p.frequency === filters.frequency)
      : padroes;

    const limitados = filtrados.slice(0, Math.max(0, filters.limit));

    return {
      patterns: limitados,
      total: filtrados.length,
      totalPatterns: filtrados.length,
      increasingCount: limitados.filter((p) => p.trend === 'increasing').length,
      decreasingCount: limitados.filter((p) => p.trend === 'decreasing').length,
      stableCount: limitados.filter((p) => p.trend === 'stable').length,
    };
  }

  /**
   * Tendência por categoria: últimos 3 meses contra os 3 meses anteriores.
   *
   * Sem histórico no período anterior não há base de comparação e nenhum padrão
   * é gerado.
   */
  private async padroesDeTendenciaPorCategoria(
    familyId: string,
  ): Promise<PatternDto[]> {
    const recente = this.financialData.getPeriodRange('LAST_3_MONTHS');
    const anterior = this.periodoAnteriorA(recente);

    const [categoriasRecentes, categoriasAnteriores] = await Promise.all([
      this.financialData.getExpensesByCategory(familyId, recente),
      this.financialData.getExpensesByCategory(familyId, anterior),
    ]);

    if (categoriasRecentes.length === 0 || categoriasAnteriores.length === 0) {
      return [];
    }

    const mapaAnterior = new Map(
      categoriasAnteriores.map((c) => [c.category, c]),
    );

    const padroes: PatternDto[] = [];

    for (const atual of categoriasRecentes) {
      const passado = mapaAnterior.get(atual.category);

      // Sem histórico anterior da categoria não dá para afirmar tendência.
      if (!passado || passado.total <= 0) continue;

      const amostra = atual.count + passado.count;
      if (amostra < AMOSTRA_MINIMA_CATEGORIA * 2) continue;

      const variacao = (atual.total - passado.total) / passado.total;
      const trend =
        variacao > VARIACAO_TENDENCIA
          ? 'increasing'
          : variacao < -VARIACAO_TENDENCIA
            ? 'decreasing'
            : 'stable';

      const diferenca = Math.abs(atual.total - passado.total);

      padroes.push({
        id: `tendencia-${this.slug(atual.category)}`,
        name: `Tendência de ${atual.category}`,
        description:
          `Gastos com ${atual.category} passaram de ${this.formatarMoeda(passado.total)} ` +
          `para ${this.formatarMoeda(atual.total)} nos últimos 3 meses ` +
          `(${variacao > 0 ? '+' : ''}${this.formatarNumero(variacao * 100)}%).`,
        frequency: 'monthly',
        affectedCategories: [atual.category],
        trend,
        confidence: this.confiancaPorAmostra(amostra, 24),
        recommendation:
          trend === 'increasing'
            ? `Aumento de ${this.formatarMoeda(diferenca)} no trimestre: revise os lançamentos de ${atual.category}.`
            : trend === 'decreasing'
              ? `Redução de ${this.formatarMoeda(diferenca)} no trimestre em ${atual.category}.`
              : `${atual.category} está estável entre os dois trimestres.`,
      });
    }

    return padroes;
  }

  /**
   * Concentração de gastos em um dia da semana, medida sobre os últimos 3
   * meses. Só vira padrão quando o dia responde por 1,5x a fatia uniforme.
   */
  private async padroesDeConcentracaoSemanal(
    familyId: string,
  ): Promise<PatternDto[]> {
    const range = this.financialData.getPeriodRange('LAST_3_MONTHS');
    const porDiaSemana = await this.financialData.getExpensesByDayOfWeek(
      familyId,
      range,
    );

    if (porDiaSemana.length < 3) return [];

    const total = porDiaSemana.reduce((soma, d) => soma + d.total, 0);
    if (total <= 0) return [];

    const maior = porDiaSemana.reduce((a, b) => (b.total > a.total ? b : a));
    const participacao = maior.total / total;

    if (participacao < CONCENTRACAO_MINIMA_DIA) return [];

    // Categorias mais relevantes nesse dia da semana.
    const despesas = await this.financialData.getExpenses(familyId, range);
    const totalPorCategoria = new Map<string, number>();
    for (const despesa of despesas) {
      if (this.dataDe(despesa).getDay() !== maior.dayOfWeek) continue;
      totalPorCategoria.set(
        despesa.category,
        (totalPorCategoria.get(despesa.category) ?? 0) +
          Number(despesa.amount),
      );
    }

    const afetadas = [...totalPorCategoria.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([categoria]) => categoria);

    return [
      {
        id: `concentracao-dia-${maior.dayOfWeek}`,
        name: `Concentração em ${maior.label}`,
        description:
          `${maior.label} concentra ${this.formatarNumero(participacao * 100)}% dos gastos dos últimos 3 meses ` +
          `(${this.formatarMoeda(maior.total)} em ${maior.count} lançamentos).`,
        frequency: 'weekly',
        affectedCategories: afetadas,
        trend: 'stable',
        confidence: this.confiancaPorAmostra(maior.count, 20),
        recommendation: `Planeje as compras de ${maior.label} com antecedência para diluir a concentração.`,
      },
    ];
  }

  /**
   * Despesas recorrentes identificadas pelo histórico (assinaturas, contas
   * fixas), com o custo anual estimado a partir do intervalo médio real.
   */
  private async padroesDeRecorrencia(familyId: string): Promise<PatternDto[]> {
    const recorrentes = await this.financialData.getRecurringExpenses(
      familyId,
      6,
    );

    return recorrentes.slice(0, 10).map((recorrente) => {
      const ocorrenciasPorAno =
        recorrente.averageIntervalDays > 0
          ? 365 / recorrente.averageIntervalDays
          : 12;
      const custoAnual = recorrente.averageAmount * ocorrenciasPorAno;

      return {
        id: `recorrencia-${this.slug(recorrente.description)}`,
        name: `Recorrência: ${recorrente.description}`,
        description:
          `"${recorrente.description}" se repete a cada ${recorrente.averageIntervalDays} dias — ` +
          `média de ${this.formatarMoeda(recorrente.averageAmount)} em ${recorrente.occurrences} ocorrências.`,
        frequency: this.frequenciaPorIntervalo(recorrente.averageIntervalDays),
        affectedCategories: [recorrente.category],
        trend: 'stable',
        confidence: this.confiancaPorAmostra(recorrente.occurrences, 12),
        recommendation: `Custo anual estimado: ${this.formatarMoeda(custoAnual)}.`,
      };
    });
  }

  // ==================== correlações ====================

  /**
   * Correlação de Pearson REAL entre séries mensais: receita × despesa e os
   * pares das categorias mais relevantes.
   *
   * Com menos de 3 meses de histórico nenhuma correlação é calculada.
   */
  async analyzeCorrelations(
    userId: string,
    familyId: string,
    filters: {
      minCorrelation: number;
      limit: number;
    },
  ): Promise<ListCorrelationsDto> {
    const range = this.financialData.getPeriodRange('LAST_12_MONTHS');

    const [despesasMensais, receitasMensais, despesas] = await Promise.all([
      this.financialData.getMonthlyExpenseSeries(familyId, 12),
      this.financialData.getMonthlyIncomeSeries(familyId, 12),
      this.financialData.getExpenses(familyId, range),
    ]);

    const meses = despesasMensais.map((p) => p.month);

    if (meses.length < PONTOS_MINIMOS_CORRELACAO) {
      this.logger.debug(
        `Família ${familyId} tem apenas ${meses.length} mês(es) de histórico: correlações não calculadas.`,
      );
      return { correlations: [], total: 0, strongCorrelations: 0 };
    }

    const correlacoes: CorrelationDto[] = [];

    // 1) Receita x Despesa nos meses em que existem os dois lados.
    const mapaReceitas = new Map(receitasMensais.map((p) => [p.month, p]));
    const mesesComReceita = meses.filter((m) => mapaReceitas.has(m));

    if (mesesComReceita.length >= PONTOS_MINIMOS_CORRELACAO) {
      const receitas = mesesComReceita.map(
        (m) => mapaReceitas.get(m)?.total ?? 0,
      );
      const gastos = mesesComReceita.map(
        (m) => this.valorDoMes(despesasMensais, m),
      );
      const correlacao = this.montarCorrelacao(
        'Receitas',
        'Despesas',
        receitas,
        gastos,
      );
      if (correlacao) correlacoes.push(correlacao);
    }

    // 2) Pares entre as categorias mais relevantes do último ano.
    const seriesPorCategoria = this.seriesMensaisPorCategoria(despesas, meses);
    const categorias = [...seriesPorCategoria.entries()]
      .map(([categoria, serie]) => ({
        categoria,
        serie,
        total: serie.reduce((soma, v) => soma + v, 0),
        mesesAtivos: serie.filter((v) => v > 0).length,
      }))
      .filter((c) => c.mesesAtivos >= PONTOS_MINIMOS_CORRELACAO)
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);

    for (let i = 0; i < categorias.length; i++) {
      for (let j = i + 1; j < categorias.length; j++) {
        const correlacao = this.montarCorrelacao(
          categorias[i].categoria,
          categorias[j].categoria,
          categorias[i].serie,
          categorias[j].serie,
        );
        if (correlacao) correlacoes.push(correlacao);
      }
    }

    const filtradas = correlacoes
      .filter((c) => Math.abs(c.coefficient) >= filters.minCorrelation)
      .sort((a, b) => Math.abs(b.coefficient) - Math.abs(a.coefficient));

    return {
      correlations: filtradas.slice(0, Math.max(0, filters.limit)),
      total: filtradas.length,
      strongCorrelations: filtradas.filter(
        (c) => Math.abs(c.coefficient) >= 0.7,
      ).length,
    };
  }

  /** Monta o DTO de correlação; devolve null quando o cálculo não é possível. */
  private montarCorrelacao(
    variavel1: string,
    variavel2: string,
    serie1: number[],
    serie2: number[],
  ): CorrelationDto | null {
    const coeficiente = this.pearson(serie1, serie2);
    if (coeficiente === null) return null;

    const n = Math.min(serie1.length, serie2.length);

    return {
      id: `corr-${this.slug(variavel1)}-${this.slug(variavel2)}`,
      variable1: variavel1,
      variable2: variavel2,
      coefficient: this.arredondar(coeficiente),
      interpretation: this.interpretarCorrelacao(
        variavel1,
        variavel2,
        coeficiente,
        n,
      ),
      pValue: this.pValorPearson(coeficiente, n),
    };
  }

  /** Texto em português explicando a força e o sentido da correlação. */
  private interpretarCorrelacao(
    variavel1: string,
    variavel2: string,
    coeficiente: number,
    n: number,
  ): string {
    const forca =
      Math.abs(coeficiente) >= 0.7
        ? 'forte'
        : Math.abs(coeficiente) >= 0.4
          ? 'moderada'
          : 'fraca';
    const sentido =
      coeficiente >= 0
        ? 'sobem e descem juntos'
        : 'seguem sentidos opostos';

    return (
      `Correlação ${forca} (r = ${this.formatarNumero(coeficiente, 2)}) em ${n} meses: ` +
      `${variavel1} e ${variavel2} ${sentido}.`
    );
  }

  /** Séries mensais de cada categoria alinhadas aos meses informados. */
  private seriesMensaisPorCategoria(
    despesas: Expense[],
    meses: string[],
  ): Map<string, number[]> {
    const indicePorMes = new Map(meses.map((m, i) => [m, i]));
    const series = new Map<string, number[]>();

    for (const despesa of despesas) {
      const data = this.dataDe(despesa);
      const chave = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
      const indice = indicePorMes.get(chave);
      if (indice === undefined) continue;

      if (!series.has(despesa.category)) {
        series.set(despesa.category, new Array(meses.length).fill(0));
      }
      const serie = series.get(despesa.category) as number[];
      serie[indice] += Number(despesa.amount);
    }

    return series;
  }

  // ==================== perfil de gasto ====================

  /**
   * Perfil de gasto calculado sobre o período pedido.
   *
   * Sem despesas registradas todos os números voltam zerados e a categoria
   * principal é explicitamente marcada como indisponível.
   */
  async getSpendingProfile(
    userId: string,
    familyId: string,
    period: string,
  ): Promise<SpendingProfileDto> {
    const range = this.getPeriodDateRange(period);
    const dias = this.diasDoIntervalo(range);

    const [resumo, categorias, serieDiaria, serieMensal] = await Promise.all([
      this.financialData.getSummary(familyId, range),
      this.financialData.getExpensesByCategory(familyId, range),
      this.financialData.getDailyExpenseSeries(familyId, dias),
      this.financialData.getMonthlyExpenseSeries(familyId, 12),
    ]);

    if (resumo.expenseCount === 0) {
      return {
        averageDailySpend: 0,
        averageMonthlySpend: 0,
        maxSpendDay: 0,
        minSpendDay: 0,
        topCategory: 'Sem dados suficientes',
        topCategoryPercentage: 0,
        spendingLevel: 'LOW',
        trend: 'STABLE',
        predictability: 0,
      };
    }

    const totaisDiarios = serieDiaria.map((p) => p.total);
    const principal = categorias[0];

    // Razão despesa/receita: sem receita registrada o comprometimento é total.
    const razao =
      resumo.totalIncomes > 0
        ? resumo.totalExpenses / resumo.totalIncomes
        : Number.POSITIVE_INFINITY;

    return {
      averageDailySpend: this.arredondar(resumo.averageDailyExpense),
      // Projeção mensal a partir da média diária do MESMO período analisado.
      averageMonthlySpend: this.arredondar(resumo.averageDailyExpense * 30),
      maxSpendDay:
        totaisDiarios.length > 0 ? this.arredondar(Math.max(...totaisDiarios)) : 0,
      minSpendDay:
        totaisDiarios.length > 0 ? this.arredondar(Math.min(...totaisDiarios)) : 0,
      topCategory: principal?.category ?? 'Sem dados suficientes',
      topCategoryPercentage: principal
        ? this.arredondar(principal.share * 100, 1)
        : 0,
      spendingLevel:
        razao < 0.5
          ? 'LOW'
          : razao < 0.75
            ? 'MEDIUM'
            : razao < 1
              ? 'HIGH'
              : 'VERY_HIGH',
      trend: this.tendenciaMensal(serieMensal),
      predictability: this.previsibilidade(serieMensal, totaisDiarios),
    };
  }

  /**
   * Tendência de gasto: último mês fechado contra a média dos meses anteriores.
   * O mês em curso é ignorado porque ainda está incompleto.
   */
  private tendenciaMensal(
    serieMensal: MonthlyPoint[],
  ): 'STABLE' | 'GROWING' | 'DECLINING' {
    const fechados = serieMensal.filter((p) => p.month !== this.mesAtual());
    if (fechados.length < 3) return 'STABLE';

    const ultimo = fechados[fechados.length - 1].total;
    const anteriores = fechados.slice(0, -1).map((p) => p.total);
    const media = this.media(anteriores);

    if (media <= 0) return 'STABLE';

    const variacao = (ultimo - media) / media;
    if (variacao > 0.1) return 'GROWING';
    if (variacao < -0.1) return 'DECLINING';
    return 'STABLE';
  }

  /**
   * Previsibilidade = 1 − coeficiente de variação.
   * Usa a série mensal fechada quando existe; caso contrário a série diária.
   */
  private previsibilidade(
    serieMensal: MonthlyPoint[],
    totaisDiarios: number[],
  ): number {
    const fechados = serieMensal
      .filter((p) => p.month !== this.mesAtual())
      .map((p) => p.total);

    const base =
      fechados.length >= 3
        ? fechados
        : totaisDiarios.length >= 7
          ? totaisDiarios
          : [];

    if (base.length === 0) return 0;

    const media = this.media(base);
    if (media <= 0) return 0;

    const coeficienteVariacao = this.desvioPadrao(base) / media;
    return this.arredondar(
      Math.max(0, Math.min(1, 1 - coeficienteVariacao)),
      2,
    );
  }

  // ==================== insights ====================

  /**
   * Insights automáticos em português citando apenas números reais.
   *
   * Sem lançamentos no mês corrente devolve uma única frase honesta pedindo
   * dados — nenhum exemplo é fabricado.
   */
  async generateInsights(
    userId: string,
    familyId: string,
  ): Promise<{ insights: string[]; generatedAt: Date }> {
    const mesAtual = this.financialData.getPeriodRange('THIS_MONTH');
    const mesAnterior = this.financialData.getPeriodRange('LAST_MONTH');

    const [
      resumoAtual,
      resumoAnterior,
      categoriasAtuais,
      categoriasAnteriores,
      responsaveis,
      recorrentes,
    ] = await Promise.all([
      this.financialData.getSummary(familyId, mesAtual),
      this.financialData.getSummary(familyId, mesAnterior),
      this.financialData.getExpensesByCategory(familyId, mesAtual),
      this.financialData.getExpensesByCategory(familyId, mesAnterior),
      this.financialData.getExpensesByResponsible(familyId, mesAtual),
      this.financialData.getRecurringExpenses(familyId, 6),
    ]);

    const insights: string[] = [];

    if (resumoAtual.expenseCount === 0 && resumoAtual.incomeCount === 0) {
      return {
        insights: [
          'Ainda não há lançamentos neste mês. Importe um extrato ou cadastre despesas e receitas para o assistente analisar.',
        ],
        generatedAt: new Date(),
      };
    }

    // Total do mês e comparação com o mês anterior.
    insights.push(
      `Neste mês a casa gastou ${this.formatarMoeda(resumoAtual.totalExpenses)} em ` +
        `${resumoAtual.expenseCount} lançamento(s), média de ${this.formatarMoeda(resumoAtual.averageDailyExpense)} por dia.`,
    );

    if (resumoAnterior.totalExpenses > 0) {
      const variacao =
        (resumoAtual.totalExpenses - resumoAnterior.totalExpenses) /
        resumoAnterior.totalExpenses;
      insights.push(
        variacao >= 0
          ? `As despesas estão ${this.formatarNumero(variacao * 100)}% acima do mês passado ` +
            `(${this.formatarMoeda(resumoAnterior.totalExpenses)} → ${this.formatarMoeda(resumoAtual.totalExpenses)}).`
          : `As despesas estão ${this.formatarNumero(Math.abs(variacao) * 100)}% abaixo do mês passado ` +
            `(${this.formatarMoeda(resumoAnterior.totalExpenses)} → ${this.formatarMoeda(resumoAtual.totalExpenses)}).`,
      );
    }

    // Categoria principal.
    const principal = categoriasAtuais[0];
    if (principal) {
      insights.push(
        `Maior categoria do mês: ${principal.category}, com ${this.formatarMoeda(principal.total)} ` +
          `(${this.formatarNumero(principal.share * 100)}% das despesas).`,
      );
    }

    // Categoria que mais cresceu em relação ao mês anterior.
    const mapaAnterior = new Map(
      categoriasAnteriores.map((c) => [c.category, c.total]),
    );
    let maiorAlta: { categoria: string; variacao: number; de: number; para: number } | null =
      null;
    for (const categoria of categoriasAtuais) {
      const antes = mapaAnterior.get(categoria.category);
      if (!antes || antes <= 0) continue;
      const variacao = (categoria.total - antes) / antes;
      if (variacao > 0.2 && (!maiorAlta || variacao > maiorAlta.variacao)) {
        maiorAlta = {
          categoria: categoria.category,
          variacao,
          de: antes,
          para: categoria.total,
        };
      }
    }
    if (maiorAlta) {
      insights.push(
        `O gasto com ${maiorAlta.categoria} está ${this.formatarNumero(maiorAlta.variacao * 100)}% acima do mês passado ` +
          `(${this.formatarMoeda(maiorAlta.de)} → ${this.formatarMoeda(maiorAlta.para)}).`,
      );
    }

    // Divisão entre responsáveis.
    if (responsaveis.length >= 2) {
      const [primeiro, segundo] = responsaveis;
      insights.push(
        `${primeiro.responsible} pagou ${this.formatarMoeda(primeiro.total)} ` +
          `(${this.formatarNumero(primeiro.share * 100)}%) e ${segundo.responsible} pagou ` +
          `${this.formatarMoeda(segundo.total)} (${this.formatarNumero(segundo.share * 100)}%) — ` +
          `diferença de ${this.formatarMoeda(Math.abs(primeiro.total - segundo.total))}.`,
      );
    } else if (responsaveis.length === 1) {
      insights.push(
        `Todos os ${this.formatarMoeda(responsaveis[0].total)} do mês estão lançados em ${responsaveis[0].responsible}.`,
      );
    }

    // Saldo do mês.
    if (resumoAtual.incomeCount > 0) {
      insights.push(
        resumoAtual.balance >= 0
          ? `Receitas de ${this.formatarMoeda(resumoAtual.totalIncomes)} cobrem as despesas do mês; sobram ${this.formatarMoeda(resumoAtual.balance)}.`
          : `As despesas superam as receitas do mês em ${this.formatarMoeda(Math.abs(resumoAtual.balance))}.`,
      );
    }

    // Custo das recorrências.
    if (recorrentes.length > 0) {
      const custoMensal = recorrentes.reduce((soma, r) => {
        const porMes =
          r.averageIntervalDays > 0 ? 30 / r.averageIntervalDays : 1;
        return soma + r.averageAmount * porMes;
      }, 0);
      insights.push(
        `Foram identificadas ${recorrentes.length} despesa(s) recorrente(s): cerca de ` +
          `${this.formatarMoeda(custoMensal)} por mês, ${this.formatarMoeda(custoMensal * 12)} por ano.`,
      );
    }

    return { insights, generatedAt: new Date() };
  }

  // ==================== período ====================

  /**
   * Intervalo de datas do período.
   * Delega para o `FinancialDataService` para não duplicar a regra.
   */
  getPeriodDateRange(period: string): PeriodRange {
    return this.financialData.getPeriodRange(period);
  }

  /**
   * Recalcula e persiste a análise comportamental da família a partir dos
   * lançamentos reais.
   */
  async generateBehaviorAnalysis(
    userId: string,
    familyId: string,
    period: string,
  ): Promise<BehaviorAnalysis> {
    const [periodAnalysis, padroes, correlacoes] = await Promise.all([
      this.construirAnaliseDePeriodo(familyId, period),
      this.detectPatterns(userId, familyId, { limit: 20 }),
      this.analyzeCorrelations(userId, familyId, {
        minCorrelation: 0,
        limit: 20,
      }),
    ]);

    const analysis = this.behaviorAnalysisRepository.create({
      familyId,
      patterns: padroes.patterns,
      // Anomalias são gravadas pelo AnomalyDetectorService em tabela própria.
      anomalies: [],
      correlations: correlacoes.correlations,
      clustering: [],
      periodAnalysis: periodAnalysis as unknown as Record<string, any>,
      seasonalityScore: periodAnalysis.seasonalityScore,
    });

    return this.behaviorAnalysisRepository.save(analysis);
  }

  /**
   * Monta a análise temporal do período: gasto por dia da semana, melhores e
   * piores dias, sazonalidade mensal.
   */
  private async construirAnaliseDePeriodo(
    familyId: string,
    period: string,
  ): Promise<PeriodAnalysisDto> {
    const range = this.getPeriodDateRange(period);

    const [porDiaSemana, despesas, serieMensal, seasonalityScore] =
      await Promise.all([
        this.financialData.getExpensesByDayOfWeek(familyId, range),
        this.financialData.getExpenses(familyId, range),
        this.financialData.getMonthlyExpenseSeries(familyId, 12),
        this.calcularSeasonalityScore(familyId),
      ]);

    if (porDiaSemana.length === 0) {
      return { ...this.analiseDePeriodoVazia(), seasonalityScore };
    }

    // Totais por data, para medir o gasto médio e a variância de cada dia da
    // semana em termos de "quanto se gasta num sábado", não por lançamento.
    const totalPorData = new Map<string, number>();
    const diaDaSemanaPorData = new Map<string, number>();
    for (const despesa of despesas) {
      const data = this.dataDe(despesa);
      const chave = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
      totalPorData.set(
        chave,
        (totalPorData.get(chave) ?? 0) + Number(despesa.amount),
      );
      diaDaSemanaPorData.set(chave, data.getDay());
    }

    const totaisPorDiaSemana = new Map<number, number[]>();
    for (const [chave, total] of totalPorData) {
      const dia = diaDaSemanaPorData.get(chave) as number;
      if (!totaisPorDiaSemana.has(dia)) totaisPorDiaSemana.set(dia, []);
      (totaisPorDiaSemana.get(dia) as number[]).push(total);
    }

    const spendingByDayOfWeek: DaySpendingDto[] = porDiaSemana.map(
      (agregado) => {
        const totais = totaisPorDiaSemana.get(agregado.dayOfWeek) ?? [];
        const mediaDoDia =
          totais.length > 0 ? this.media(totais) : agregado.average;

        return {
          dayOfWeek: agregado.label,
          averageSpend: this.arredondar(mediaDoDia),
          variance: this.arredondar(this.variancia(totais)),
          transactionCount: agregado.count,
        };
      },
    );

    const ordenadosPorGasto = [...spendingByDayOfWeek].sort(
      (a, b) => a.averageSpend - b.averageSpend,
    );

    return {
      // "Melhores" dias são aqueles em que a casa gasta menos.
      bestSpendingDays: ordenadosPorGasto.slice(0, 3).map((d) => d.dayOfWeek),
      worstSpendingDays: ordenadosPorGasto
        .slice(-3)
        .reverse()
        .map((d) => d.dayOfWeek),
      spendingByDayOfWeek,
      seasonalPatterns: this.montarSazonalidade(serieMensal),
      seasonalityScore,
    };
  }

  /** Estrutura vazia usada quando não há lançamentos no período. */
  private analiseDePeriodoVazia(): PeriodAnalysisDto {
    return {
      bestSpendingDays: [],
      worstSpendingDays: [],
      spendingByDayOfWeek: [],
      seasonalPatterns: [],
      seasonalityScore: 0,
    };
  }

  /**
   * Sazonalidade mensal: total de cada mês e o quanto ele se afasta da média
   * dos meses analisados (em reais).
   */
  private montarSazonalidade(serieMensal: MonthlyPoint[]): SeasonalPatternDto[] {
    if (serieMensal.length === 0) return [];

    const mediaDosMeses = this.media(serieMensal.map((p) => p.total));

    return serieMensal.map((ponto) => {
      const [ano, mes] = ponto.month.split('-');
      return {
        month: MESES_PT[Number(mes) - 1] ?? ponto.month,
        year: Number(ano),
        averageSpend: this.arredondar(ponto.total),
        variance: this.arredondar(ponto.total - mediaDosMeses),
      };
    });
  }

  /**
   * Score de sazonalidade REAL: variância ENTRE meses ÷ variância total dos
   * gastos diários do último ano (eta² da análise de variância).
   *
   * 0 = o gasto diário não depende do mês; 1 = toda a variação é explicada pelo
   * mês. Sem pelo menos dois meses de movimento o score é 0.
   */
  private async calcularSeasonalityScore(familyId: string): Promise<number> {
    const serieDiaria = await this.financialData.getDailyExpenseSeries(
      familyId,
      365,
    );

    if (serieDiaria.length < 2) return 0;

    const grupos = new Map<string, number[]>();
    for (const ponto of serieDiaria) {
      const mes = ponto.date.slice(0, 7);
      if (!grupos.has(mes)) grupos.set(mes, []);
      (grupos.get(mes) as number[]).push(ponto.total);
    }

    if (grupos.size < 2) return 0;

    const todos = serieDiaria.map((p) => p.total);
    const varianciaTotal = this.variancia(todos);
    if (varianciaTotal === 0) return 0;

    const mediaGeral = this.media(todos);
    let somaEntreGrupos = 0;
    for (const valores of grupos.values()) {
      somaEntreGrupos +=
        valores.length * (this.media(valores) - mediaGeral) ** 2;
    }
    const varianciaEntreMeses = somaEntreGrupos / todos.length;

    return this.arredondar(
      Math.max(0, Math.min(1, varianciaEntreMeses / varianciaTotal)),
      2,
    );
  }

  // ==================== estatística ====================

  /** Coeficiente de correlação de Pearson; null quando não é calculável. */
  private pearson(x: number[], y: number[]): number | null {
    const n = Math.min(x.length, y.length);
    if (n < PONTOS_MINIMOS_CORRELACAO) return null;

    const mediaX = this.media(x.slice(0, n));
    const mediaY = this.media(y.slice(0, n));

    let produto = 0;
    let somaX = 0;
    let somaY = 0;

    for (let i = 0; i < n; i++) {
      const dx = x[i] - mediaX;
      const dy = y[i] - mediaY;
      produto += dx * dy;
      somaX += dx * dx;
      somaY += dy * dy;
    }

    // Série constante não tem variação: correlação indefinida.
    if (somaX === 0 || somaY === 0) return null;

    const r = produto / Math.sqrt(somaX * somaY);
    return Math.max(-1, Math.min(1, r));
  }

  /**
   * p-valor bicaudal do coeficiente de Pearson pela transformação z de Fisher.
   * Com menos de 4 pontos o teste não é conclusivo e devolvemos 1.
   */
  private pValorPearson(r: number, n: number): number {
    if (n < 4) return 1;
    if (Math.abs(r) >= 0.999999) return 0;

    const z = Math.atanh(r) * Math.sqrt(n - 3);
    const p = 2 * (1 - this.cdfNormal(Math.abs(z)));
    return this.arredondar(Math.max(0, Math.min(1, p)), 4);
  }

  private cdfNormal(z: number): number {
    return 0.5 * (1 + this.erf(z / Math.SQRT2));
  }

  /** Aproximação de Abramowitz & Stegun (7.1.26) para a função erro. */
  private erf(x: number): number {
    const sinal = x < 0 ? -1 : 1;
    const absoluto = Math.abs(x);

    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const t = 1 / (1 + p * absoluto);
    const y =
      1 -
      ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) *
        t *
        Math.exp(-absoluto * absoluto);

    return sinal * y;
  }

  private media(valores: number[]): number {
    if (valores.length === 0) return 0;
    return valores.reduce((soma, v) => soma + v, 0) / valores.length;
  }

  /** Variância populacional. */
  private variancia(valores: number[]): number {
    if (valores.length === 0) return 0;
    const media = this.media(valores);
    return (
      valores.reduce((soma, v) => soma + (v - media) ** 2, 0) / valores.length
    );
  }

  private desvioPadrao(valores: number[]): number {
    return Math.sqrt(this.variancia(valores));
  }

  // ==================== utilitários ====================

  /** Intervalo de mesma duração imediatamente anterior ao informado. */
  private periodoAnteriorA(range: PeriodRange): PeriodRange {
    const duracao = range.end.getTime() - range.start.getTime();
    const end = new Date(range.start.getTime() - 1);
    const start = new Date(range.start.getTime() - duracao);
    return { start, end };
  }

  private diasDoIntervalo(range: PeriodRange): number {
    return Math.max(
      1,
      Math.round((range.end.getTime() - range.start.getTime()) / 86_400_000),
    );
  }

  private mesAtual(): string {
    const agora = new Date();
    return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
  }

  private valorDoMes(serie: MonthlyPoint[], mes: string): number {
    return serie.find((p) => p.month === mes)?.total ?? 0;
  }

  /** Confiança derivada do tamanho da amostra (satura em `referencia`). */
  private confiancaPorAmostra(amostra: number, referencia: number): number {
    if (amostra <= 0) return 0;
    return this.arredondar(Math.min(1, amostra / referencia), 2);
  }

  /** Traduz o intervalo médio entre ocorrências em frequência do DTO. */
  private frequenciaPorIntervalo(dias: number): string {
    if (dias <= 2) return 'daily';
    if (dias <= 10) return 'weekly';
    if (dias <= 45) return 'monthly';
    return 'seasonal';
  }

  private dataDe(despesa: { date: Date | string }): Date {
    return despesa.date instanceof Date ? despesa.date : new Date(despesa.date);
  }

  private slug(texto: string): string {
    return texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  private arredondar(valor: number, casas = 2): number {
    const fator = 10 ** casas;
    return Math.round(valor * fator) / fator;
  }

  /** Formata no padrão brasileiro: R$ 1.250,00 */
  private formatarMoeda(valor: number): string {
    const negativo = valor < 0;
    const [inteiro, decimal] = Math.abs(valor).toFixed(2).split('.');
    const comSeparador = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${negativo ? '-' : ''}R$ ${comSeparador},${decimal}`;
  }

  /** Formata número com vírgula decimal (padrão brasileiro). */
  private formatarNumero(valor: number, casas = 1): string {
    return valor.toFixed(casas).replace('.', ',');
  }
}
