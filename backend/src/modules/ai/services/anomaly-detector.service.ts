import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionAnomaly } from '../entities/transaction-anomaly.entity';
import {
  AnomalySeverity,
  AnomalyType,
  TransactionType,
} from '../entities/transaction-anomaly.entity';
import {
  ListAnomaliesDto,
  AnomalyDto,
  ConfirmAnomalyDto,
} from '../dtos/analysis.dto';
import { FinancialDataService } from '../../financial-data/financial-data.service';
import { Expense } from '../../expenses/entities/expense.entity';
import { CategoryStatistics } from '../../financial-data/financial-data.types';

/**
 * Dias distintos mínimos para avaliar se uma descrição é gasto de hábito.
 * Abaixo disso não há cadência observável.
 */
const DIAS_MINIMOS_HABITO = 5;

/**
 * Fração dos dias do intervalo em que a descrição precisa aparecer para ser
 * considerada rotina (e portanto isenta da regra de duplicidade).
 */
const COBERTURA_HABITO = 0.6;

/** Variação mínima de valor para considerar quebra de padrão em recorrência. */
const VARIACAO_RECORRENTE_MINIMA = 0.4;

/** Mínimo de lançamentos numa categoria para que o z-score tenha sentido. */
const AMOSTRA_MINIMA_CATEGORIA = 3;

/**
 * Afastamento mínimo em relação à média (30%) para acusar valor atípico.
 * Funciona junto com o z-score: em categorias muito homogêneas o desvio padrão
 * é tão pequeno que valores quase idênticos à média ultrapassariam 2σ.
 */
const DESVIO_RELATIVO_MINIMO = 0.3;

/** Mínimo de dias com movimento para avaliar picos diários. */
const DIAS_MINIMOS_PARA_PICO = 7;

/**
 * Detector de anomalias sobre os lançamentos REAIS da família.
 *
 * Toda a leitura de dados passa pelo `FinancialDataService`; este serviço não
 * consulta as tabelas de despesas diretamente e nunca gera números fictícios.
 * Quando não há amostra suficiente para julgar um lançamento, ele simplesmente
 * não gera anomalia (regra 27 do projeto: a IA não inventa informação).
 *
 * Tipos detectados:
 * - `UNUSUAL_AMOUNT`: valor distante da média da própria categoria (z-score).
 * - `DUPLICATE`: mesmo valor e mesma descrição em até 48 horas.
 * - `SPIKE`: dia cujo total foge muito da média diária do período.
 * - `PATTERN_BREAK`: recorrência que mudou de valor ou deixou de ocorrer.
 */
@Injectable()
export class AnomalyDetectorService {
  private readonly logger = new Logger(AnomalyDetectorService.name);

  constructor(
    @InjectRepository(TransactionAnomaly)
    private anomalyRepository: Repository<TransactionAnomaly>,
    private readonly financialData: FinancialDataService,
  ) {}

  /**
   * Lista anomalias detectadas
   */
  async listAnomalies(
    userId: string,
    familyId: string,
    filters: {
      severity?: string;
      limit: number;
      offset: number;
      confirmed?: boolean;
    },
  ): Promise<ListAnomaliesDto> {
    const query = this.anomalyRepository
      .createQueryBuilder('a')
      // Anomalias são escopadas por família (a entidade TransactionAnomaly
      // não possui coluna `userId` nem soft delete).
      .where('a.familyId = :familyId', { familyId });

    if (filters.severity) {
      query.andWhere('a.severity = :severity', { severity: filters.severity });
    }

    if (filters.confirmed !== undefined) {
      query.andWhere('a.isConfirmed = :isConfirmed', {
        isConfirmed: filters.confirmed,
      });
    }

    // `addOrderBy` preserva a ordenação primária por score;
    // um segundo `orderBy` a substituiria.
    query.orderBy('a.anomalyScore', 'DESC').addOrderBy('a.createdAt', 'DESC');

    const [anomalies, total] = await query
      .skip(filters.offset)
      .take(filters.limit)
      .getManyAndCount();

    return {
      anomalies: anomalies.map((a) => ({
        id: a.id,
        transactionId: a.transactionId,
        anomalyType: a.anomalyType,
        severity: a.severity,
        anomalyScore: Number(a.anomalyScore),
        reason: a.reason,
        suggestedAction: a.suggestedAction ?? undefined,
        createdAt: a.createdAt,
      })),
      total,
      highSeverityCount: anomalies.filter(
        (a) => a.severity === AnomalySeverity.HIGH,
      ).length,
      mediumSeverityCount: anomalies.filter(
        (a) => a.severity === AnomalySeverity.MEDIUM,
      ).length,
      lowSeverityCount: anomalies.filter(
        (a) => a.severity === AnomalySeverity.LOW,
      ).length,
    };
  }

  /**
   * Obtém detalhes de uma anomalia
   */
  async getAnomaly(
    userId: string,
    familyId: string,
    anomalyId: string,
  ): Promise<AnomalyDto | null> {
    const anomaly = await this.anomalyRepository.findOne({
      where: {
        id: anomalyId,
        familyId,
      },
    });

    if (!anomaly) {
      return null;
    }

    return {
      id: anomaly.id,
      transactionId: anomaly.transactionId,
      anomalyType: anomaly.anomalyType,
      severity: anomaly.severity,
      anomalyScore: Number(anomaly.anomalyScore),
      reason: anomaly.reason,
      suggestedAction: anomaly.suggestedAction ?? undefined,
      createdAt: anomaly.createdAt,
    };
  }

  /**
   * Confirma ou rejeita uma anomalia
   */
  async confirmAnomaly(
    userId: string,
    familyId: string,
    anomalyId: string,
    dto: ConfirmAnomalyDto,
  ): Promise<AnomalyDto | null> {
    const anomaly = await this.anomalyRepository.findOne({
      where: {
        id: anomalyId,
        familyId,
      },
    });

    if (!anomaly) {
      return null;
    }

    anomaly.isConfirmed = true;
    anomaly.confirmationStatus = dto.status;

    const updated = await this.anomalyRepository.save(anomaly);

    return {
      id: updated.id,
      transactionId: updated.transactionId,
      anomalyType: updated.anomalyType,
      severity: updated.severity,
      anomalyScore: Number(updated.anomalyScore),
      reason: updated.reason,
      suggestedAction: updated.suggestedAction ?? undefined,
      createdAt: updated.createdAt,
    };
  }

  // ==================== detecção ====================

  /**
   * Varre as despesas REAIS da família no período e grava as anomalias
   * encontradas.
   *
   * Sem lançamentos no período nada é gravado e a lista volta vazia — não
   * existe anomalia "de exemplo".
   */
  async detectAnomalies(
    userId: string,
    familyId: string,
    period = 'LAST_6_MONTHS',
  ): Promise<TransactionAnomaly[]> {
    const range = this.financialData.getPeriodRange(period);
    const despesas = await this.financialData.getExpenses(familyId, range);

    if (despesas.length === 0) {
      this.logger.debug(
        `Nenhuma despesa no período ${period} para a família ${familyId}: nada a analisar.`,
      );
      return [];
    }

    // Ordem cronológica crescente facilita a comparação entre vizinhos.
    const ordenadas = [...despesas].sort(
      (a, b) => this.dataDe(a).getTime() - this.dataDe(b).getTime(),
    );

    const dias = Math.max(
      1,
      Math.round((range.end.getTime() - range.start.getTime()) / 86_400_000),
    );
    const meses = Math.max(1, Math.ceil(dias / 30));

    const [estatisticas, serieDiaria, recorrentes] = await Promise.all([
      this.financialData.getCategoryStatistics(familyId, range),
      this.financialData.getDailyExpenseSeries(familyId, dias),
      this.financialData.getRecurringExpenses(familyId, meses),
    ]);

    const candidatas: TransactionAnomaly[] = [
      ...this.detectarValoresAtipicos(familyId, ordenadas, estatisticas),
      ...this.detectarDuplicidades(familyId, ordenadas),
      ...this.detectarPicosDiarios(familyId, ordenadas, serieDiaria),
      ...this.detectarQuebrasDePadrao(
        familyId,
        ordenadas,
        recorrentes,
        range.end,
      ),
    ];

    // Um mesmo lançamento pode ser sinalizado por motivos diferentes, mas nunca
    // duas vezes pelo mesmo motivo.
    const vistos = new Set<string>();
    const anomalias = candidatas.filter((a) => {
      const chave = `${a.transactionId}:${a.anomalyType}`;
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    });

    if (anomalias.length > 0) {
      await this.anomalyRepository.save(anomalias);
    }

    return anomalias;
  }

  /**
   * `UNUSUAL_AMOUNT`: valor distante da média da própria categoria.
   *
   * Categorias com menos de 3 lançamentos ou desvio padrão zero são ignoradas:
   * não há amostra para afirmar que o valor é atípico.
   */
  private detectarValoresAtipicos(
    familyId: string,
    despesas: Expense[],
    estatisticas: CategoryStatistics[],
  ): TransactionAnomaly[] {
    const porCategoria = new Map<string, CategoryStatistics>();
    for (const estatistica of estatisticas) {
      porCategoria.set(estatistica.category, estatistica);
    }

    const anomalias: TransactionAnomaly[] = [];

    for (const despesa of despesas) {
      const estatistica = porCategoria.get(despesa.category);

      if (
        !estatistica ||
        estatistica.count < AMOSTRA_MINIMA_CATEGORIA ||
        estatistica.stdDev === 0 ||
        estatistica.mean <= 0
      ) {
        continue;
      }

      const valor = Number(despesa.amount);
      const zScore = Math.abs(valor - estatistica.mean) / estatistica.stdDev;

      if (zScore < 1) continue;

      // Numa categoria muito homogênea o desvio padrão é minúsculo, e valores
      // praticamente iguais à média chegam a 2σ. Exigir também um afastamento
      // relevante em relação à média evita alertar sobre R$ 350 quando a média
      // é R$ 311 — tecnicamente 1,8σ, mas irrelevante para quem lê.
      const desvioRelativo =
        Math.abs(valor - estatistica.mean) / estatistica.mean;

      if (desvioRelativo < DESVIO_RELATIVO_MINIMO) continue;

      const severidade =
        zScore > 3
          ? AnomalySeverity.HIGH
          : zScore >= 2
            ? AnomalySeverity.MEDIUM
            : AnomalySeverity.LOW;

      const razaoSobreMedia = valor / estatistica.mean;
      const acimaDaMedia = valor > estatistica.mean;

      anomalias.push(
        this.anomalyRepository.create({
          familyId,
          transactionId: despesa.id,
          transactionType: TransactionType.EXPENSE,
          anomalyType: AnomalyType.UNUSUAL_AMOUNT,
          severity: severidade,
          anomalyScore: this.normalizarZScore(zScore),
          reason:
            `${this.formatarMoeda(valor)} é ${this.formatarNumero(razaoSobreMedia)}x a média de ` +
            `${despesa.category} (${this.formatarMoeda(estatistica.mean)}) — ` +
            `${this.formatarNumero(zScore)} desvios padrão ${acimaDaMedia ? 'acima' : 'abaixo'} da média.`,
          suggestedAction: acimaDaMedia
            ? 'Revisar o lançamento e confirmar se o valor está correto.'
            : 'Confirmar se o lançamento foi registrado com o valor completo.',
        }),
      );
    }

    return anomalias;
  }

  /**
   * `DUPLICATE`: mesmo valor e mesma descrição no MESMO DIA.
   *
   * Duas ressalvas evitam encher o usuário de alarme falso:
   *
   * 1. A janela é o dia corrido, não 48 horas. `expenses.date` é um `date` sem
   *    hora, então lançamentos em dias seguidos apareciam como "24 horas de
   *    diferença" — mas um almoço pedido ontem e outro hoje são duas compras,
   *    não uma cobrança repetida.
   * 2. Descrições com cadência praticamente diária (almoço, transporte) são
   *    hábito, não duplicidade, e ficam de fora mesmo quando repetem no dia.
   */
  private detectarDuplicidades(
    familyId: string,
    despesas: Expense[],
  ): TransactionAnomaly[] {
    const anomalias: TransactionAnomaly[] = [];
    const habituais = this.descricoesDeCadenciaDiaria(despesas);

    // chave = valor + descrição normalizada + dia -> primeira ocorrência do dia
    const primeiraDoDia = new Map<string, Expense>();

    for (const despesa of despesas) {
      const valor = Number(despesa.amount);
      const descricao = (despesa.description ?? '').trim().toLowerCase();

      if (habituais.has(descricao)) continue;

      const dia = this.chaveDoDia(this.dataDe(despesa));
      const chave = `${valor.toFixed(2)}|${descricao}|${dia}`;
      const anterior = primeiraDoDia.get(chave);

      if (!anterior) {
        primeiraDoDia.set(chave, despesa);
        continue;
      }

      anomalias.push(
        this.anomalyRepository.create({
          familyId,
          transactionId: despesa.id,
          transactionType: TransactionType.EXPENSE,
          anomalyType: AnomalyType.DUPLICATE,
          severity: AnomalySeverity.HIGH,
          anomalyScore: 0.9,
          reason:
            `Dois lançamentos de ${this.formatarMoeda(valor)} com a descrição ` +
            `"${despesa.description}" no mesmo dia ` +
            `(${this.formatarDataHora(this.dataDe(despesa))}).`,
          suggestedAction:
            'Conferir o extrato e excluir o lançamento repetido, se for o caso.',
        }),
      );
    }

    return anomalias;
  }

  /**
   * Descrições que se repetem quase todo dia — gasto de hábito, não duplicidade.
   *
   * O critério é a cobertura do intervalo: se a descrição aparece em mais de
   * 60% dos dias entre a primeira e a última ocorrência (com pelo menos
   * `DIAS_MINIMOS_HABITO` dias distintos), trata-se de rotina.
   */
  private descricoesDeCadenciaDiaria(despesas: Expense[]): Set<string> {
    const diasPorDescricao = new Map<string, Set<string>>();

    for (const despesa of despesas) {
      const descricao = (despesa.description ?? '').trim().toLowerCase();
      if (!descricao) continue;

      const dias = diasPorDescricao.get(descricao) ?? new Set<string>();
      dias.add(this.chaveDoDia(this.dataDe(despesa)));
      diasPorDescricao.set(descricao, dias);
    }

    const habituais = new Set<string>();

    for (const [descricao, dias] of diasPorDescricao) {
      if (dias.size < DIAS_MINIMOS_HABITO) continue;

      const ordenados = [...dias].sort();
      const primeiro = new Date(ordenados[0]).getTime();
      const ultimo = new Date(ordenados[ordenados.length - 1]).getTime();
      const intervalo = Math.round((ultimo - primeiro) / 86_400_000) + 1;

      if (dias.size / intervalo >= COBERTURA_HABITO) {
        habituais.add(descricao);
      }
    }

    return habituais;
  }

  /**
   * `SPIKE`: dia cujo total supera em muito a média diária do período.
   *
   * A anomalia é ancorada na maior despesa do dia, já que a entidade guarda
   * sempre um `transactionId`.
   */
  private detectarPicosDiarios(
    familyId: string,
    despesas: Expense[],
    serieDiaria: { date: string; total: number; count: number }[],
  ): TransactionAnomaly[] {
    if (serieDiaria.length < DIAS_MINIMOS_PARA_PICO) return [];

    const totais = serieDiaria.map((p) => p.total);
    const media = this.media(totais);
    const desvio = this.desvioPadrao(totais);

    if (media <= 0 || desvio === 0) return [];

    // Maior despesa de cada dia, para ancorar a anomalia num lançamento real.
    const maiorDoDia = new Map<string, Expense>();
    for (const despesa of despesas) {
      const chave = this.chaveDoDia(this.dataDe(despesa));
      const atual = maiorDoDia.get(chave);
      if (!atual || Number(despesa.amount) > Number(atual.amount)) {
        maiorDoDia.set(chave, despesa);
      }
    }

    const anomalias: TransactionAnomaly[] = [];

    for (const ponto of serieDiaria) {
      const zScore = (ponto.total - media) / desvio;
      if (zScore < 2) continue;

      const ancora = maiorDoDia.get(ponto.date);
      // Sem lançamento correspondente no período analisado não há o que apontar.
      if (!ancora) continue;

      anomalias.push(
        this.anomalyRepository.create({
          familyId,
          transactionId: ancora.id,
          transactionType: TransactionType.EXPENSE,
          anomalyType: AnomalyType.SPIKE,
          severity:
            zScore > 3 ? AnomalySeverity.HIGH : AnomalySeverity.MEDIUM,
          anomalyScore: this.normalizarZScore(zScore),
          reason:
            `Em ${this.formatarDataIso(ponto.date)} a casa gastou ${this.formatarMoeda(ponto.total)} ` +
            `em ${ponto.count} lançamento(s), ${this.formatarNumero(ponto.total / media)}x a média diária ` +
            `do período (${this.formatarMoeda(media)}).`,
          suggestedAction:
            'Revisar os lançamentos desse dia e confirmar se a concentração era esperada.',
        }),
      );
    }

    return anomalias;
  }

  /**
   * `PATTERN_BREAK`: despesa recorrente conhecida que mudou muito de valor ou
   * deixou de ocorrer no intervalo esperado.
   */
  private detectarQuebrasDePadrao(
    familyId: string,
    despesas: Expense[],
    recorrentes: {
      description: string;
      category: string;
      averageAmount: number;
      occurrences: number;
      averageIntervalDays: number;
      lastDate: Date;
    }[],
    referencia: Date,
  ): TransactionAnomaly[] {
    if (recorrentes.length === 0) return [];

    // Última ocorrência de cada descrição dentro do período analisado.
    const ultimaPorDescricao = new Map<string, Expense>();
    for (const despesa of despesas) {
      const chave = (despesa.description ?? '').trim().toLowerCase();
      const atual = ultimaPorDescricao.get(chave);
      if (
        !atual ||
        this.dataDe(despesa).getTime() > this.dataDe(atual).getTime()
      ) {
        ultimaPorDescricao.set(chave, despesa);
      }
    }

    const anomalias: TransactionAnomaly[] = [];

    for (const recorrente of recorrentes) {
      if (recorrente.averageAmount <= 0) continue;

      const ultima = ultimaPorDescricao.get(
        recorrente.description.trim().toLowerCase(),
      );
      // Sem lançamento no período não há transação para ancorar a anomalia.
      if (!ultima) continue;

      const valor = Number(ultima.amount);
      const variacao =
        (valor - recorrente.averageAmount) / recorrente.averageAmount;

      if (Math.abs(variacao) >= VARIACAO_RECORRENTE_MINIMA) {
        anomalias.push(
          this.anomalyRepository.create({
            familyId,
            transactionId: ultima.id,
            transactionType: TransactionType.EXPENSE,
            anomalyType: AnomalyType.PATTERN_BREAK,
            severity:
              Math.abs(variacao) >= 1
                ? AnomalySeverity.HIGH
                : AnomalySeverity.MEDIUM,
            anomalyScore: this.arredondar(
              Math.min(1, Math.abs(variacao) / 2),
            ),
            reason:
              `A despesa recorrente "${recorrente.description}" custava em média ` +
              `${this.formatarMoeda(recorrente.averageAmount)} em ${recorrente.occurrences} ocorrências e ` +
              `passou para ${this.formatarMoeda(valor)} (${variacao > 0 ? '+' : ''}${this.formatarNumero(variacao * 100)}%).`,
            suggestedAction:
              'Verificar reajuste, cobrança extra ou mudança de plano nessa recorrência.',
          }),
        );
        continue;
      }

      // Recorrência que deixou de acontecer no intervalo esperado.
      if (recorrente.averageIntervalDays > 0) {
        const diasSemOcorrer = Math.floor(
          (referencia.getTime() - this.dataDe(ultima).getTime()) / 86_400_000,
        );

        if (diasSemOcorrer > recorrente.averageIntervalDays * 2) {
          anomalias.push(
            this.anomalyRepository.create({
              familyId,
              transactionId: ultima.id,
              transactionType: TransactionType.EXPENSE,
              anomalyType: AnomalyType.PATTERN_BREAK,
              severity: AnomalySeverity.MEDIUM,
              anomalyScore: this.arredondar(
                Math.min(
                  1,
                  diasSemOcorrer / (recorrente.averageIntervalDays * 4),
                ),
              ),
              reason:
                `A despesa recorrente "${recorrente.description}" ocorria a cada ` +
                `${recorrente.averageIntervalDays} dias, mas não é registrada há ${diasSemOcorrer} dias ` +
                `(última em ${this.formatarDataHora(this.dataDe(ultima))}).`,
              suggestedAction:
                'Confirmar se a cobrança foi cancelada ou se o lançamento está faltando.',
            }),
          );
        }
      }
    }

    return anomalias;
  }

  // ==================== utilitários ====================

  /** Converte o z-score em score de anomalia entre 0 e 1 (4σ = 1). */
  private normalizarZScore(zScore: number): number {
    return this.arredondar(Math.min(1, Math.abs(zScore) / 4));
  }

  private arredondar(valor: number, casas = 2): number {
    const fator = 10 ** casas;
    return Math.round(valor * fator) / fator;
  }

  private media(valores: number[]): number {
    if (valores.length === 0) return 0;
    return valores.reduce((soma, v) => soma + v, 0) / valores.length;
  }

  /** Desvio padrão amostral; zero quando há menos de dois pontos. */
  private desvioPadrao(valores: number[]): number {
    if (valores.length < 2) return 0;
    const media = this.media(valores);
    const variancia =
      valores.reduce((soma, v) => soma + (v - media) ** 2, 0) /
      (valores.length - 1);
    return Math.sqrt(variancia);
  }

  private dataDe(despesa: { date: Date | string }): Date {
    return despesa.date instanceof Date ? despesa.date : new Date(despesa.date);
  }

  private chaveDoDia(data: Date): string {
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    return `${data.getFullYear()}-${mes}-${dia}`;
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

  /** DD/MM/YYYY a partir de um Date. */
  private formatarDataHora(data: Date): string {
    const dia = String(data.getDate()).padStart(2, '0');
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    return `${dia}/${mes}/${data.getFullYear()}`;
  }

  /** DD/MM/YYYY a partir de uma chave `YYYY-MM-DD`. */
  private formatarDataIso(iso: string): string {
    const [ano, mes, dia] = iso.split('-');
    return `${dia}/${mes}/${ano}`;
  }
}
