import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Recommendation } from '../entities/recommendation.entity';
import {
  RecommendationType,
  RecommendationPriority,
  RecommendationPeriod,
} from '../entities/recommendation.entity';
import {
  ListRecommendationsDto,
  UpdateRecommendationDto,
  RecommendationImpactEstimateDto,
  RecommendationActionResultDto,
} from '../dtos/recommendations.dto';
import { FinancialDataService } from '../../financial-data/financial-data.service';
import {
  CategoryAggregate,
  MonthlyPoint,
  PeriodRange,
  RecurringExpense,
} from '../../financial-data/financial-data.types';
import { Expense } from '../../expenses/entities/expense.entity';

/** Meses fechados usados como base de comparação do mês corrente. */
const MESES_COMPARACAO = 3;

/** Alta percentual mínima sobre a média para acusar categoria fora do padrão. */
const VARIACAO_CATEGORIA_MINIMA = 25;

/** Excedente mínimo em R$ para que a categoria vire recomendação. */
const EXCEDENTE_MINIMO = 50;

/** Valor máximo de uma cobrança recorrente tratada como assinatura. */
const VALOR_MAXIMO_ASSINATURA = 150;

/** Faixa de intervalo médio (dias) que caracteriza uma cobrança mensal. */
const INTERVALO_MENSAL_MINIMO = 20;
const INTERVALO_MENSAL_MAXIMO = 45;

/** Valor até o qual uma despesa é considerada "compra pequena". */
const VALOR_COMPRA_PEQUENA = 60;

/** Quantidade de compras pequenas na mesma categoria que justifica agrupá-las. */
const MINIMO_COMPRAS_PEQUENAS = 8;

/** Sobra mensal mínima (R$) para sugerir aplicação do excedente. */
const SOBRA_MINIMA_RELEVANTE = 100;

/** Participação de um dia da semana que caracteriza concentração de gastos. */
const CONCENTRACAO_DIA_SEMANA = 0.35;

/** Lançamentos mínimos no mês para avaliar padrão semanal. */
const MINIMO_LANCAMENTOS_PADRAO = 10;

/** Alta acumulada mínima (%) para acusar tendência sustentada. */
const ALTA_SUSTENTADA_MINIMA = 15;

/** Teto de recomendações persistidas por regeneração. */
const MAX_RECOMENDACOES = 8;

/**
 * Frações da despesa mensal que saturam as escalas de 0 a 100.
 *
 * São convenções de escala declaradas (não números sobre a família): um item
 * que pesa 20% da despesa mensal já é máximo em relevância, e uma economia
 * equivalente a 25% da despesa mensal já é máxima em impacto.
 */
const PESO_SATURA_RELEVANCIA = 0.2;
const ECONOMIA_SATURA_IMPACTO = 0.25;

const DIAS_DA_SEMANA = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
];

const MESES_PT = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

/**
 * Recomendação ainda não persistida, montada a partir dos lançamentos reais.
 * `metadata` guarda a base do cálculo (regra 27: toda recomendação precisa
 * poder mostrar de onde saiu o número).
 */
interface RecomendacaoCandidata {
  type: RecommendationType;
  title: string;
  description: string;
  potentialSavings: number | null;
  period: RecommendationPeriod;
  relevance: number;
  impact: number;
  ease: number;
  actionUrl: string | null;
  metadata: Record<string, any>;
}

/**
 * Service para gerar e gerenciar recomendações automáticas.
 *
 * As recomendações NÃO são textos prontos: cada uma nasce de uma regra aplicada
 * sobre os lançamentos reais da família, lidos exclusivamente pelo
 * `FinancialDataService`. Título e descrição citam os valores que realmente
 * foram calculados, e `metadata` registra a base do cálculo.
 *
 * Regra 27 do projeto: sem lançamentos que sustentem uma regra, nenhuma
 * recomendação é criada — o serviço informa a ausência de dados em vez de
 * inventar uma sugestão. Nenhum valor aleatório é usado.
 */
@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);

  constructor(
    @InjectRepository(Recommendation)
    private recommendationRepository: Repository<Recommendation>,
    private readonly financialData: FinancialDataService,
  ) {}

  /**
   * Lista recomendações da família
   */
  async listRecommendations(
    userId: string,
    familyId: string,
    filters: {
      priority?: string;
      type?: string;
      limit: number;
      offset: number;
      includeDismissed: boolean;
    },
  ): Promise<ListRecommendationsDto> {
    const query = this.recommendationRepository
      .createQueryBuilder('r')
      // `andWhere` é obrigatório aqui: um segundo `where` descartaria o filtro
      // por usuário e vazaria recomendações entre membros da mesma família.
      .where('r.userId = :userId', { userId })
      .andWhere('r.familyId = :familyId', { familyId });

    if (!filters.includeDismissed) {
      query.andWhere('r.isDismissed = :isDismissed', { isDismissed: false });
    }

    if (filters.priority) {
      query.andWhere('r.priority = :priority', { priority: filters.priority });
    }

    if (filters.type) {
      query.andWhere('r.type = :type', { type: filters.type });
    }

    // A entidade Recommendation não possui coluna `score`; `relevance` é o
    // proxy persistido do score calculado em `calculateScore`.
    query.orderBy('r.relevance', 'DESC').addOrderBy('r.createdAt', 'DESC');

    const [recommendations, total] = await query
      .skip(filters.offset)
      .take(filters.limit)
      .getManyAndCount();

    const highPriorityCount = recommendations.filter(r => r.priority === RecommendationPriority.HIGH).length;
    const mediumPriorityCount = recommendations.filter(r => r.priority === RecommendationPriority.MEDIUM).length;
    const lowPriorityCount = recommendations.filter(r => r.priority === RecommendationPriority.LOW).length;

    return {
      recommendations: recommendations.map((r) => ({
        id: r.id,
        userId: r.userId,
        familyId: r.familyId,
        type: r.type,
        title: r.title,
        description: r.description,
        potentialSavings: r.potentialSavings || undefined,
        period: r.period,
        relevance: r.relevance,
        impact: r.impact,
        ease: r.ease,
        priority: r.priority,
        actionUrl: r.actionUrl || undefined,
        isDismissed: r.isDismissed,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      total,
      highPriorityCount,
      mediumPriorityCount,
      lowPriorityCount,
    };
  }

  /**
   * Obtém apenas recomendações com alta prioridade
   */
  async getHighPriorityRecommendations(
    userId: string,
    familyId: string,
    limit: number,
  ): Promise<ListRecommendationsDto> {
    return this.listRecommendations(userId, familyId, {
      priority: RecommendationPriority.HIGH,
      limit,
      offset: 0,
      includeDismissed: false,
    });
  }

  /**
   * Obtém uma recomendação específica
   */
  async getRecommendation(userId: string, familyId: string, recommendationId: string) {
    const recommendation = await this.recommendationRepository.findOne({
      where: {
        id: recommendationId,
        userId,
        familyId,
      },
    });

    return recommendation
      ? {
          id: recommendation.id,
          userId: recommendation.userId,
          familyId: recommendation.familyId,
          type: recommendation.type,
          title: recommendation.title,
          description: recommendation.description,
          potentialSavings: recommendation.potentialSavings,
          period: recommendation.period,
          relevance: recommendation.relevance,
          impact: recommendation.impact,
          ease: recommendation.ease,
          priority: recommendation.priority,
          actionUrl: recommendation.actionUrl,
          isDismissed: recommendation.isDismissed,
          createdAt: recommendation.createdAt,
          updatedAt: recommendation.updatedAt,
        }
      : null;
  }

  /**
   * Atualiza uma recomendação (ex: marcar como descartada)
   */
  async updateRecommendation(
    userId: string,
    familyId: string,
    recommendationId: string,
    dto: UpdateRecommendationDto,
  ) {
    const recommendation = await this.recommendationRepository.findOne({
      where: {
        id: recommendationId,
        userId,
        familyId,
      },
    });

    if (!recommendation) {
      return null;
    }

    if (dto.isDismissed !== undefined) {
      recommendation.isDismissed = dto.isDismissed;
      recommendation.dismissedAt = dto.isDismissed ? new Date() : null;
    }

    const updated = await this.recommendationRepository.save(recommendation);

    return {
      id: updated.id,
      userId: updated.userId,
      familyId: updated.familyId,
      type: updated.type,
      title: updated.title,
      description: updated.description,
      potentialSavings: updated.potentialSavings,
      period: updated.period,
      relevance: updated.relevance,
      impact: updated.impact,
      ease: updated.ease,
      priority: updated.priority,
      actionUrl: updated.actionUrl,
      isDismissed: updated.isDismissed,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  /**
   * Soma as economias REAIS das recomendações ativas.
   *
   * `totalPotentialSavings` é a soma de `potentialSavings` de TODAS as
   * recomendações ativas (cada uma carrega seu próprio `period`: mensal ou
   * anual). O `type` devolvido é o que concentra a maior economia — o DTO
   * comporta um único tipo, e mostrar o mais representativo é mais útil do que
   * mostrar o primeiro encontrado.
   */
  async estimateImpact(userId: string, familyId: string): Promise<RecommendationImpactEstimateDto> {
    const recommendations = await this.recommendationRepository.find({
      where: {
        userId,
        familyId,
        isDismissed: false,
        deletedAt: IsNull(),
      },
    });

    if (recommendations.length === 0) {
      return {
        type: RecommendationType.OPPORTUNITY,
        totalPotentialSavings: 0,
        averageDifficulty: 0,
        percentageOfEasyActions: 0,
        recommendations: [],
      } as RecommendationImpactEstimateDto;
    }

    // `potentialSavings` é decimal no banco e chega como string via driver;
    // sem Number() a soma vira concatenação de texto.
    const economia = (r: Recommendation) => Number(r.potentialSavings) || 0;

    const totalPotentialSavings = this.arredondar(
      recommendations.reduce((soma, r) => soma + economia(r), 0),
    );

    // Tipo com maior economia acumulada.
    const economiaPorTipo = new Map<RecommendationType, number>();
    for (const r of recommendations) {
      economiaPorTipo.set(
        r.type,
        (economiaPorTipo.get(r.type) ?? 0) + economia(r),
      );
    }
    const tipoPrincipal = [...economiaPorTipo.entries()].sort(
      (a, b) => b[1] - a[1],
    )[0][0];

    const facilidadeMedia =
      recommendations.reduce((soma, r) => soma + (r.ease || 0), 0) /
      recommendations.length;

    const faceis = recommendations.filter((r) => r.ease >= 70).length;

    return {
      type: tipoPrincipal,
      totalPotentialSavings,
      averageDifficulty: this.arredondar(100 - facilidadeMedia),
      percentageOfEasyActions: this.arredondar(
        (faceis / recommendations.length) * 100,
      ),
      // Maior economia primeiro: é a ordem em que o usuário deve atacá-las.
      recommendations: [...recommendations]
        .sort((a, b) => economia(b) - economia(a))
        .map((r) => ({
          id: r.id,
          userId: r.userId,
          familyId: r.familyId,
          type: r.type,
          title: r.title,
          description: r.description,
          potentialSavings: r.potentialSavings || undefined,
          period: r.period,
          relevance: r.relevance,
          impact: r.impact,
          ease: r.ease,
          priority: r.priority,
          actionUrl: r.actionUrl || undefined,
          isDismissed: r.isDismissed,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        })),
    };
  }

  /**
   * Aplica uma recomendação
   */
  async applyRecommendation(
    userId: string,
    familyId: string,
    recommendationId: string,
    dto: any,
  ): Promise<RecommendationActionResultDto> {
    const recommendation = await this.recommendationRepository.findOne({
      where: {
        id: recommendationId,
        userId,
        familyId,
      },
    });

    if (!recommendation) {
      return {
        success: false,
        message: 'Recomendação não encontrada',
      };
    }

    // Marcar como aplicada
    recommendation.isDismissed = false;
    await this.recommendationRepository.save(recommendation);

    return {
      success: true,
      message: `Recomendação "${recommendation.title}" aplicada com sucesso`,
      redirectUrl: recommendation.actionUrl || undefined,
    };
  }

  // ==================== geração das recomendações ====================

  /**
   * Regenera as recomendações a partir dos lançamentos REAIS da família.
   *
   * Fluxo:
   * 1. lê o mês corrente, os 3 meses fechados anteriores, as séries mensais e
   *    as cobranças recorrentes;
   * 2. aplica as regras que os dados sustentam (categoria em alta, assinatura,
   *    pulverização de compras, sobra recorrente, padrão de gasto);
   * 3. arquiva (soft delete) as recomendações ativas antigas e persiste as
   *    novas, sempre com o score e a prioridade derivados dos números.
   *
   * Sem lançamentos suficientes, nada é gravado e a resposta diz isso.
   */
  async regenerateRecommendations(userId: string, familyId: string) {
    const mesAtual = this.financialData.getPeriodRange('THIS_MONTH');
    const mesesAnteriores = this.mesesFechadosAnteriores(MESES_COMPARACAO);

    const [
      resumoMes,
      categoriasMes,
      categoriasAnteriores,
      despesasMes,
      recorrentes,
      serieDespesas,
      serieReceitas,
    ] = await Promise.all([
      this.financialData.getSummary(familyId, mesAtual),
      this.financialData.getExpensesByCategory(familyId, mesAtual),
      this.financialData.getExpensesByCategory(familyId, mesesAnteriores),
      this.financialData.getExpenses(familyId, mesAtual),
      this.financialData.getRecurringExpenses(familyId, 6),
      this.financialData.getMonthlyExpenseSeries(familyId, 6),
      this.financialData.getMonthlyIncomeSeries(familyId, 6),
    ]);

    // Base de escala: a despesa do mês corrente ou, se o mês ainda não teve
    // lançamentos, a média dos meses fechados.
    const mesesFechados = this.mesesFechados(serieDespesas);
    const mediaMensalFechada =
      mesesFechados.length > 0
        ? mesesFechados.reduce((s, p) => s + p.total, 0) / mesesFechados.length
        : 0;
    const baseMensal =
      resumoMes.totalExpenses > 0 ? resumoMes.totalExpenses : mediaMensalFechada;

    const rotuloMes = this.rotuloMes(mesAtual.start);

    if (baseMensal <= 0) {
      this.logger.warn(
        `Sem despesas lançadas para a família ${familyId}: nenhuma recomendação gerada.`,
      );
      return {
        success: true,
        generated: 0,
        totalPotentialSavings: 0,
        message:
          `Ainda não há despesas lançadas para a família — nenhuma recomendação foi gerada. ` +
          `Cadastre ou importe lançamentos para receber sugestões baseadas nos seus dados.`,
        regeneratedAt: new Date(),
      };
    }

    const candidatas: RecomendacaoCandidata[] = [
      ...this.regraCategoriaEmAlta(
        categoriasMes,
        categoriasAnteriores,
        baseMensal,
        rotuloMes,
      ),
      ...this.regraAssinaturas(recorrentes, baseMensal),
      ...this.regraComprasPulverizadas(despesasMes, baseMensal, rotuloMes),
      ...this.regraSobraParaInvestir(serieReceitas, serieDespesas, baseMensal),
      ...this.regraPadraoSemanal(despesasMes, baseMensal, rotuloMes),
      ...this.regraTendenciaDeAlta(mesesFechados, baseMensal),
    ];

    // Recomendações já descartadas pelo usuário não voltam do arquivo morto.
    const ativas = await this.recommendationRepository.find({
      where: { userId, familyId, deletedAt: IsNull() },
    });
    const titulosDescartados = new Set(
      ativas.filter((r) => r.isDismissed).map((r) => r.title),
    );

    const selecionadas = candidatas
      .filter((c) => !titulosDescartados.has(c.title))
      .sort(
        (a, b) =>
          this.calculateScore(b.relevance, b.impact, b.ease) -
          this.calculateScore(a.relevance, a.impact, a.ease),
      )
      .slice(0, MAX_RECOMENDACOES);

    // Arquiva as recomendações ativas anteriores: foram substituídas pelo
    // cálculo feito agora sobre os lançamentos atuais.
    await this.recommendationRepository.update(
      { userId, familyId, isDismissed: false, deletedAt: IsNull() },
      { deletedAt: new Date() },
    );

    if (selecionadas.length === 0) {
      return {
        success: true,
        generated: 0,
        totalPotentialSavings: 0,
        message:
          `Nenhuma oportunidade de economia foi identificada nos ${resumoMes.expenseCount} ` +
          `lançamento(s) de ${rotuloMes}: nenhuma categoria fugiu da média dos últimos ` +
          `${MESES_COMPARACAO} meses e não há assinaturas ou padrões que justifiquem uma sugestão.`,
        regeneratedAt: new Date(),
      };
    }

    const entidades = selecionadas.map((c) => {
      const score = this.calculateScore(c.relevance, c.impact, c.ease);

      return this.recommendationRepository.create({
        userId,
        familyId,
        type: c.type,
        title: c.title,
        description: c.description,
        potentialSavings: c.potentialSavings,
        period: c.period,
        relevance: c.relevance,
        impact: c.impact,
        ease: c.ease,
        priority: this.determinePriority(score),
        actionUrl: c.actionUrl,
        isDismissed: false,
        dismissedAt: null,
        metadata: {
          ...c.metadata,
          score: this.arredondar(score),
          baseMensal: this.arredondar(baseMensal),
          geradoEm: new Date().toISOString(),
        },
      });
    });

    await this.recommendationRepository.save(entidades);

    const totalPotentialSavings = this.arredondar(
      selecionadas.reduce((soma, c) => soma + (c.potentialSavings ?? 0), 0),
    );

    return {
      success: true,
      generated: selecionadas.length,
      totalPotentialSavings,
      message:
        `${selecionadas.length} recomendação(ões) geradas a partir de ` +
        `${resumoMes.expenseCount} lançamento(s) de ${rotuloMes}, com economia potencial de ` +
        `${this.formatarMoeda(totalPotentialSavings)}.`,
      regeneratedAt: new Date(),
    };
  }

  /**
   * CATEGORY_HIGH — categoria cujo gasto do mês supera a média dos meses
   * fechados anteriores. `potentialSavings` é o excedente REAL: o que voltaria
   * ao bolso se a categoria retornasse ao próprio patamar histórico.
   */
  private regraCategoriaEmAlta(
    categoriasMes: CategoryAggregate[],
    categoriasAnteriores: CategoryAggregate[],
    baseMensal: number,
    rotuloMes: string,
  ): RecomendacaoCandidata[] {
    const mediaAnterior = new Map(
      categoriasAnteriores.map((c) => [c.category, c.total / MESES_COMPARACAO]),
    );

    const candidatas: RecomendacaoCandidata[] = [];

    for (const categoria of categoriasMes) {
      const media = mediaAnterior.get(categoria.category) ?? 0;

      // Sem histórico não há base de comparação — não se acusa alta.
      if (media <= 0) continue;

      const excedente = categoria.total - media;
      const variacao = (excedente / media) * 100;

      if (variacao < VARIACAO_CATEGORIA_MINIMA || excedente < EXCEDENTE_MINIMO) {
        continue;
      }

      candidatas.push({
        type: RecommendationType.CATEGORY_HIGH,
        title: `${categoria.category} subiu ${this.formatarNumero(variacao, 0)}% em relação à média dos últimos ${MESES_COMPARACAO} meses`,
        description:
          `${categoria.category} soma ${this.formatarMoeda(categoria.total)} em ${rotuloMes} ` +
          `(${categoria.count} lançamento(s)), contra uma média de ${this.formatarMoeda(media)} ` +
          `nos ${MESES_COMPARACAO} meses fechados anteriores — ${this.formatarNumero(variacao, 0)}% a mais. ` +
          `Voltar ao patamar médio devolveria ${this.formatarMoeda(excedente)} ao orçamento do mês. ` +
          `Base do cálculo: lançamentos reais de ${categoria.category} no período.`,
        potentialSavings: this.arredondar(excedente),
        period: RecommendationPeriod.MONTHLY,
        relevance: this.relevanciaPorPeso(categoria.total, baseMensal),
        impact: this.impactoPorEconomia(excedente, baseMensal),
        // Quanto maior o excesso, mais hábito precisa mudar para revertê-lo.
        ease: this.limitar(Math.round(80 - variacao / 2), 20, 80),
        actionUrl: `/expenses?category=${encodeURIComponent(categoria.category)}&period=THIS_MONTH`,
        metadata: {
          categoria: categoria.category,
          totalMes: this.arredondar(categoria.total),
          mediaMesesAnteriores: this.arredondar(media),
          mesesComparados: MESES_COMPARACAO,
          excedente: this.arredondar(excedente),
          variacaoPercentual: this.arredondar(variacao),
          lancamentos: categoria.count,
        },
      });
    }

    // Só as três maiores altas viram recomendação: além disso vira ruído.
    return candidatas
      .sort(
        (a, b) => (b.potentialSavings ?? 0) - (a.potentialSavings ?? 0),
      )
      .slice(0, 3);
  }

  /**
   * UNUSED_SUB — cobrança recorrente de valor baixo e cadência mensal, o
   * perfil típico de assinatura. A economia é o custo anual REAL observado
   * (valor médio cobrado × 12).
   */
  private regraAssinaturas(
    recorrentes: RecurringExpense[],
    baseMensal: number,
  ): RecomendacaoCandidata[] {
    return recorrentes
      .filter(
        (r) =>
          r.averageAmount > 0 &&
          r.averageAmount <= VALOR_MAXIMO_ASSINATURA &&
          r.occurrences >= 3 &&
          r.averageIntervalDays >= INTERVALO_MENSAL_MINIMO &&
          r.averageIntervalDays <= INTERVALO_MENSAL_MAXIMO,
      )
      .map((r) => {
        const custoAnual = r.averageAmount * 12;
        const nome = this.capitalizar(r.description);

        return {
          type: RecommendationType.UNUSED_SUB,
          title: `Revise a assinatura ${nome}: ${this.formatarMoeda(custoAnual)} por ano`,
          description:
            `${nome} é cobrada de forma recorrente em ${r.category}: ${r.occurrences} cobranças ` +
            `com valor médio de ${this.formatarMoeda(r.averageAmount)} e intervalo médio de ` +
            `${r.averageIntervalDays} dias (última em ${this.formatarData(r.lastDate)}). ` +
            `Mantida por 12 meses, custa ${this.formatarMoeda(custoAnual)}. ` +
            `Se o serviço não está mais em uso, cancelar devolve esse valor ao ano. ` +
            `Base do cálculo: ${r.occurrences} cobranças reais dos últimos 6 meses.`,
          potentialSavings: this.arredondar(custoAnual),
          period: RecommendationPeriod.ANNUAL,
          relevance: this.relevanciaPorPeso(r.averageAmount, baseMensal),
          impact: this.impactoPorEconomia(r.averageAmount, baseMensal),
          // Cancelar é uma ação única, sem mudança de hábito.
          ease: 90,
          actionUrl: `/expenses?search=${encodeURIComponent(r.description)}`,
          metadata: {
            descricao: r.description,
            categoria: r.category,
            valorMedio: this.arredondar(r.averageAmount),
            ocorrencias: r.occurrences,
            intervaloMedioDias: r.averageIntervalDays,
            ultimaCobranca: r.lastDate,
            custoAnual: this.arredondar(custoAnual),
          },
        } as RecomendacaoCandidata;
      })
      .sort((a, b) => (b.potentialSavings ?? 0) - (a.potentialSavings ?? 0))
      .slice(0, 3);
  }

  /**
   * CONSOLIDATION — muitas compras pequenas na mesma categoria (delivery,
   * mercado de conveniência). Não há como medir nos lançamentos quanto se
   * economiza agrupando, então `potentialSavings` fica nulo: a recomendação
   * cita a contagem e o valor REAIS em jogo, sem prometer economia.
   */
  private regraComprasPulverizadas(
    despesasMes: Expense[],
    baseMensal: number,
    rotuloMes: string,
  ): RecomendacaoCandidata[] {
    const porCategoria = new Map<string, { total: number; count: number }>();

    for (const despesa of despesasMes) {
      const valor = Number(despesa.amount) || 0;
      if (valor <= 0 || valor > VALOR_COMPRA_PEQUENA) continue;

      const atual = porCategoria.get(despesa.category) ?? {
        total: 0,
        count: 0,
      };
      atual.total += valor;
      atual.count += 1;
      porCategoria.set(despesa.category, atual);
    }

    return [...porCategoria.entries()]
      .filter(([, dados]) => dados.count >= MINIMO_COMPRAS_PEQUENAS)
      .map(([categoria, dados]) => {
        const ticketMedio = dados.total / dados.count;

        return {
          type: RecommendationType.CONSOLIDATION,
          title: `${dados.count} compras pequenas em ${categoria} em ${rotuloMes}`,
          description:
            `Foram ${dados.count} compras de até ${this.formatarMoeda(VALOR_COMPRA_PEQUENA)} ` +
            `em ${categoria} durante ${rotuloMes}, somando ${this.formatarMoeda(dados.total)} ` +
            `(ticket médio de ${this.formatarMoeda(ticketMedio)}). Agrupar essas compras em menos ` +
            `pedidos reduz taxas e deslocamentos repetidos. ` +
            `Base do cálculo: ${dados.count} lançamentos reais da categoria no mês; ` +
            `a economia depende das taxas cobradas e não pode ser medida pelos lançamentos.`,
          potentialSavings: null,
          period: RecommendationPeriod.MONTHLY,
          relevance: this.relevanciaPorPeso(dados.total, baseMensal),
          // Sem economia quantificável, o impacto reflete apenas o valor em
          // jogo e por isso é limitado a 70.
          impact: Math.min(70, this.relevanciaPorPeso(dados.total, baseMensal)),
          // Quanto mais compras, mais hábito a mudar.
          ease: this.limitar(90 - dados.count * 2, 30, 80),
          actionUrl: `/expenses?category=${encodeURIComponent(categoria)}&period=THIS_MONTH`,
          metadata: {
            categoria,
            comprasPequenas: dados.count,
            totalComprasPequenas: this.arredondar(dados.total),
            ticketMedio: this.arredondar(ticketMedio),
            limiteCompraPequena: VALOR_COMPRA_PEQUENA,
          },
        } as RecomendacaoCandidata;
      })
      .sort(
        (a, b) =>
          (b.metadata.totalComprasPequenas as number) -
          (a.metadata.totalComprasPequenas as number),
      )
      .slice(0, 2);
  }

  /**
   * OPPORTUNITY — sobra consistente entre receitas e despesas nos meses
   * fechados. A economia sugerida é a MENOR sobra observada (o valor que
   * sobrou em todos os meses), não a média: aportar a média deixaria o mês
   * mais apertado no vermelho.
   */
  private regraSobraParaInvestir(
    serieReceitas: MonthlyPoint[],
    serieDespesas: MonthlyPoint[],
    baseMensal: number,
  ): RecomendacaoCandidata[] {
    const despesaPorMes = new Map(
      this.mesesFechados(serieDespesas).map((p) => [p.month, p.total]),
    );

    const sobras = this.mesesFechados(serieReceitas)
      .filter((p) => despesaPorMes.has(p.month))
      .map((p) => ({
        month: p.month,
        sobra: p.total - (despesaPorMes.get(p.month) ?? 0),
      }));

    // Precisa de pelo menos 3 meses fechados com receita E despesa.
    if (sobras.length < 3) return [];

    // A sobra tem de existir em TODOS os meses para ser chamada de consistente.
    if (sobras.some((s) => s.sobra <= 0)) return [];

    const sobraMinima = Math.min(...sobras.map((s) => s.sobra));
    const sobraMedia =
      sobras.reduce((soma, s) => soma + s.sobra, 0) / sobras.length;

    if (sobraMinima < SOBRA_MINIMA_RELEVANTE) return [];

    return [
      {
        type: RecommendationType.OPPORTUNITY,
        title: `Sobra recorrente de ${this.formatarMoeda(sobraMinima)} por mês pode ser aplicada`,
        description:
          `Nos últimos ${sobras.length} meses fechados as receitas superaram as despesas em todos eles: ` +
          `sobra média de ${this.formatarMoeda(sobraMedia)} e menor sobra de ` +
          `${this.formatarMoeda(sobraMinima)} (${this.rotuloMesIso(this.mesDaMenorSobra(sobras))}). ` +
          `Programar um aporte mensal de ${this.formatarMoeda(sobraMinima)} usa apenas o valor que ` +
          `sobrou em todos os meses, sem comprometer o caixa. ` +
          `Base do cálculo: séries mensais reais de receitas e despesas.`,
        potentialSavings: this.arredondar(sobraMinima),
        period: RecommendationPeriod.MONTHLY,
        relevance: this.relevanciaPorPeso(sobraMinima, baseMensal),
        impact: this.impactoPorEconomia(sobraMinima, baseMensal),
        // Agendar um aporte automático é uma configuração única.
        ease: 75,
        actionUrl: '/goals',
        metadata: {
          mesesAnalisados: sobras.length,
          sobraMinima: this.arredondar(sobraMinima),
          sobraMedia: this.arredondar(sobraMedia),
          sobrasPorMes: sobras.map((s) => ({
            mes: s.month,
            sobra: this.arredondar(s.sobra),
          })),
        },
      },
    ];
  }

  /**
   * PATTERN — concentração de gastos num único dia da semana. Sem economia
   * quantificável: o valor da recomendação é tornar o padrão visível.
   */
  private regraPadraoSemanal(
    despesasMes: Expense[],
    baseMensal: number,
    rotuloMes: string,
  ): RecomendacaoCandidata[] {
    if (despesasMes.length < MINIMO_LANCAMENTOS_PADRAO) return [];

    const porDia = new Array(7).fill(0).map(() => ({ total: 0, count: 0 }));
    let total = 0;

    for (const despesa of despesasMes) {
      const valor = Number(despesa.amount) || 0;
      if (valor <= 0) continue;

      const dia = new Date(despesa.date).getDay();
      porDia[dia].total += valor;
      porDia[dia].count += 1;
      total += valor;
    }

    if (total <= 0) return [];

    let indiceMaior = 0;
    for (let i = 1; i < porDia.length; i++) {
      if (porDia[i].total > porDia[indiceMaior].total) indiceMaior = i;
    }

    const maior = porDia[indiceMaior];
    const participacao = maior.total / total;

    if (participacao < CONCENTRACAO_DIA_SEMANA) return [];

    return [
      {
        type: RecommendationType.PATTERN,
        title: `${this.formatarNumero(participacao * 100, 0)}% dos gastos de ${rotuloMes} caem na ${DIAS_DA_SEMANA[indiceMaior]}`,
        description:
          `Das despesas de ${rotuloMes}, ${this.formatarMoeda(maior.total)} em ${maior.count} lançamento(s) ` +
          `aconteceram na ${DIAS_DA_SEMANA[indiceMaior]} — ${this.formatarNumero(participacao * 100, 0)}% ` +
          `do total de ${this.formatarMoeda(total)}. Concentrar compras num único dia facilita o controle, ` +
          `mas também concentra a saída de caixa: verifique se esse dia coincide com vencimentos. ` +
          `Base do cálculo: ${despesasMes.length} lançamentos reais do mês agrupados por dia da semana.`,
        potentialSavings: null,
        period: RecommendationPeriod.MONTHLY,
        relevance: this.relevanciaPorPeso(maior.total, baseMensal),
        impact: Math.min(60, this.relevanciaPorPeso(maior.total, baseMensal)),
        // Redistribuir compras ao longo da semana exige mudança de rotina.
        ease: 55,
        actionUrl: '/analysis/patterns',
        metadata: {
          diaDaSemana: DIAS_DA_SEMANA[indiceMaior],
          totalDoDia: this.arredondar(maior.total),
          lancamentosDoDia: maior.count,
          totalDoMes: this.arredondar(total),
          participacao: this.arredondar(participacao, 4),
        },
      },
    ];
  }

  /**
   * PATTERN — três meses fechados consecutivos de alta. A economia sugerida é
   * a diferença REAL entre o último mês e a média dos anteriores: voltar ao
   * patamar de onde a escalada começou.
   */
  private regraTendenciaDeAlta(
    mesesFechados: MonthlyPoint[],
    baseMensal: number,
  ): RecomendacaoCandidata[] {
    if (mesesFechados.length < 3) return [];

    const ultimos = mesesFechados.slice(-3);
    const crescente =
      ultimos[0].total < ultimos[1].total && ultimos[1].total < ultimos[2].total;

    if (!crescente || ultimos[0].total <= 0) return [];

    const alta = ((ultimos[2].total - ultimos[0].total) / ultimos[0].total) * 100;
    if (alta < ALTA_SUSTENTADA_MINIMA) return [];

    const mediaAnteriores = (ultimos[0].total + ultimos[1].total) / 2;
    const excedente = ultimos[2].total - mediaAnteriores;

    return [
      {
        type: RecommendationType.PATTERN,
        title: `Despesas em alta há 3 meses seguidos (+${this.formatarNumero(alta, 0)}%)`,
        description:
          `As despesas cresceram em três meses fechados consecutivos: ` +
          `${this.rotuloMesIso(ultimos[0].month)} ${this.formatarMoeda(ultimos[0].total)} → ` +
          `${this.rotuloMesIso(ultimos[1].month)} ${this.formatarMoeda(ultimos[1].total)} → ` +
          `${this.rotuloMesIso(ultimos[2].month)} ${this.formatarMoeda(ultimos[2].total)}, ` +
          `alta acumulada de ${this.formatarNumero(alta, 0)}%. Voltar ao patamar médio dos dois primeiros ` +
          `meses (${this.formatarMoeda(mediaAnteriores)}) representaria ${this.formatarMoeda(excedente)} por mês. ` +
          `Base do cálculo: série mensal real de despesas dos meses já fechados.`,
        potentialSavings: this.arredondar(excedente),
        period: RecommendationPeriod.MONTHLY,
        relevance: this.relevanciaPorPeso(ultimos[2].total, baseMensal),
        impact: this.impactoPorEconomia(excedente, baseMensal),
        // Reverter uma tendência de três meses é o tipo de ação mais difícil.
        ease: 45,
        actionUrl: '/analysis/trends',
        metadata: {
          meses: ultimos.map((m) => ({
            mes: m.month,
            total: this.arredondar(m.total),
          })),
          altaAcumuladaPercentual: this.arredondar(alta),
          mediaMesesAnteriores: this.arredondar(mediaAnteriores),
          excedente: this.arredondar(excedente),
        },
      },
    ];
  }

  /**
   * Calcula o score de uma recomendação
   * Score = (relevance × 0.4) + (impact × 0.35) + (ease × 0.25)
   */
  calculateScore(relevance: number, impact: number, ease: number): number {
    return relevance * 0.4 + impact * 0.35 + ease * 0.25;
  }

  /**
   * Determina prioridade baseada no score
   */
  determinePriority(score: number): RecommendationPriority {
    if (score >= 75) return RecommendationPriority.HIGH;
    if (score >= 50) return RecommendationPriority.MEDIUM;
    return RecommendationPriority.LOW;
  }

  // ==================== escalas derivadas dos números ====================

  /**
   * Relevância = peso do item sobre a despesa mensal da casa.
   * Um item que representa 20% da despesa mensal satura a escala.
   */
  private relevanciaPorPeso(valorMensal: number, baseMensal: number): number {
    if (baseMensal <= 0) return 10;
    const peso = valorMensal / baseMensal;
    return this.limitar(
      Math.round((peso / PESO_SATURA_RELEVANCIA) * 100),
      10,
      100,
    );
  }

  /**
   * Impacto = peso da economia sobre a despesa mensal da casa.
   * Uma economia equivalente a 25% da despesa mensal satura a escala.
   */
  private impactoPorEconomia(economiaMensal: number, baseMensal: number): number {
    if (baseMensal <= 0) return 5;
    const peso = economiaMensal / baseMensal;
    return this.limitar(
      Math.round((peso / ECONOMIA_SATURA_IMPACTO) * 100),
      5,
      100,
    );
  }

  // ==================== utilitários ====================

  /** Intervalo dos N meses JÁ FECHADOS anteriores ao mês corrente. */
  private mesesFechadosAnteriores(
    quantidade: number,
    referencia = new Date(),
  ): PeriodRange {
    const inicioDoMesAtual = new Date(
      referencia.getFullYear(),
      referencia.getMonth(),
      1,
      0,
      0,
      0,
      0,
    );

    const start = new Date(
      referencia.getFullYear(),
      referencia.getMonth() - quantidade,
      1,
      0,
      0,
      0,
      0,
    );

    return { start, end: new Date(inicioDoMesAtual.getTime() - 1) };
  }

  /** Descarta o mês corrente, ainda incompleto, das séries mensais. */
  private mesesFechados(serie: MonthlyPoint[]): MonthlyPoint[] {
    const agora = new Date();
    const mesAtual = `${agora.getFullYear()}-${String(
      agora.getMonth() + 1,
    ).padStart(2, '0')}`;

    return serie.filter((p) => p.month < mesAtual);
  }

  private mesDaMenorSobra(sobras: Array<{ month: string; sobra: number }>): string {
    return sobras.reduce((menor, atual) =>
      atual.sobra < menor.sobra ? atual : menor,
    ).month;
  }

  /** `agosto/2026` a partir de um Date. */
  private rotuloMes(data: Date): string {
    return `${MESES_PT[data.getMonth()]}/${data.getFullYear()}`;
  }

  /** `agosto/2026` a partir de uma chave `YYYY-MM`. */
  private rotuloMesIso(mes: string): string {
    const [ano, numero] = mes.split('-').map(Number);
    return `${MESES_PT[numero - 1] ?? mes}/${ano}`;
  }

  /** DD/MM/YYYY */
  private formatarData(data: Date): string {
    const d = new Date(data);
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    return `${dia}/${mes}/${d.getFullYear()}`;
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

  private capitalizar(texto: string): string {
    return texto
      .split(' ')
      .filter((parte) => parte.length > 0)
      .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1))
      .join(' ');
  }

  private limitar(valor: number, minimo: number, maximo: number): number {
    if (!Number.isFinite(valor)) return minimo;
    return Math.max(minimo, Math.min(maximo, valor));
  }

  private arredondar(valor: number, casas = 2): number {
    if (!Number.isFinite(valor)) return 0;
    const fator = 10 ** casas;
    return Math.round(valor * fator) / fator;
  }
}
