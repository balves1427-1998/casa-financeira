import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CreditCard } from '../entities/credit-card.entity';
import { Expense } from '../../expenses/entities/expense.entity';
import { User } from '../../users/entities/user.entity';
import { FamiliesService } from '../../families/families.service';

/** Um ciclo de fatura: quando abriu, quando fecha e quando vence. */
export interface CicloFatura {
  inicio: Date;
  fechamento: Date;
  vencimento: Date;
}

export interface LinhaCategoria {
  category: string;
  total: number;
  count: number;
  percentage: number;
}

export interface MesHistorico {
  competencia: string;
  total: number;
  count: number;
}

/**
 * Faturas, limite e ciclo do cartão de crédito — calculados a partir dos
 * LANÇAMENTOS, não de um saldo digitado à mão.
 *
 * O problema que isto resolve: o cartão tinha uma coluna `currentBalance` que só
 * mudava se alguém a atualizasse manualmente. O limite utilizado nunca refletia
 * as compras, e "limite disponível" era um número que ninguém mantinha. Uma
 * fatura importada de PDF não movia esse saldo em nada.
 *
 * Aqui tudo sai das despesas com `creditCardId`:
 *
 *  - **limite utilizado** = compras ainda NÃO PAGAS no cartão. Pagar a fatura
 *    (marcar as despesas como pagas) devolve o limite, que é o que acontece na
 *    vida real;
 *  - **fatura atual** = compras dentro do ciclo aberto;
 *  - **próxima fatura** = o que já caiu no ciclo seguinte.
 */
@Injectable()
export class CardStatementService {
  private readonly logger = new Logger(CardStatementService.name);

  constructor(
    @InjectRepository(CreditCard)
    private cardsRepository: Repository<CreditCard>,
    @InjectRepository(Expense)
    private expensesRepository: Repository<Expense>,
    private familiesService: FamiliesService,
  ) {}

  /**
   * Ciclo da fatura que está ABERTA numa data de referência.
   *
   * O fechamento é o `closingDay` do cartão. Uma compra feita depois dele já
   * pertence ao ciclo seguinte — é essa regra que faz o "melhor dia para
   * comprar" existir.
   *
   * O vencimento cai no `dueDay`; quando ele é anterior ao dia de fechamento,
   * significa que a fatura vence no mês seguinte ao do fechamento.
   */
  calcularCiclo(card: CreditCard, referencia: Date = new Date()): CicloFatura {
    const fechamentoDia = this.diaValido(card.closingDay, referencia);
    const hoje = new Date(referencia);
    hoje.setHours(0, 0, 0, 0);

    // Fechamento deste mês.
    let fechamento = this.dataNoMes(
      referencia.getFullYear(),
      referencia.getMonth(),
      card.closingDay,
    );

    // Passou do fechamento: o ciclo aberto é o que fecha no mês que vem.
    if (hoje.getDate() > fechamentoDia) {
      fechamento = this.dataNoMes(
        referencia.getFullYear(),
        referencia.getMonth() + 1,
        card.closingDay,
      );
    }

    // O ciclo começa no dia seguinte ao fechamento anterior.
    const inicio = this.dataNoMes(
      fechamento.getFullYear(),
      fechamento.getMonth() - 1,
      card.closingDay,
    );
    inicio.setDate(inicio.getDate() + 1);

    // Vencimento: mesmo mês do fechamento se o dia for posterior; senão, o mês
    // seguinte. Sem essa checagem, um cartão que fecha dia 28 e vence dia 5
    // teria vencimento ANTES do fechamento.
    const vencimento =
      card.dueDay > card.closingDay
        ? this.dataNoMes(
            fechamento.getFullYear(),
            fechamento.getMonth(),
            card.dueDay,
          )
        : this.dataNoMes(
            fechamento.getFullYear(),
            fechamento.getMonth() + 1,
            card.dueDay,
          );

    return { inicio, fechamento, vencimento };
  }

  /**
   * Retrato completo de um cartão: fatura aberta, próxima, limite e categorias.
   */
  async getStatement(cardId: string, user: User, referencia = new Date()) {
    const userIds = await this.scopeUserIds(user);

    const card = await this.cardsRepository.findOne({
      where: { id: cardId, userId: In(userIds) },
    });

    if (!card) {
      return null;
    }

    const ciclo = this.calcularCiclo(card, referencia);

    const proximoFechamento = this.dataNoMes(
      ciclo.fechamento.getFullYear(),
      ciclo.fechamento.getMonth() + 1,
      card.closingDay,
    );

    const despesas = await this.expensesRepository
      .createQueryBuilder('expense')
      .where('expense.creditCardId = :cardId', { cardId })
      .andWhere('expense.userId IN (:...userIds)', { userIds })
      .orderBy('expense.date', 'DESC')
      .getMany();

    const noCiclo = despesas.filter(
      (d) => new Date(d.date) >= ciclo.inicio && new Date(d.date) <= ciclo.fechamento,
    );

    const noProximo = despesas.filter(
      (d) =>
        new Date(d.date) > ciclo.fechamento &&
        new Date(d.date) <= proximoFechamento,
    );

    const faturaAtual = this.somar(noCiclo);
    const proximaFatura = this.somar(noProximo);

    // Limite utilizado: tudo o que ainda não foi pago no cartão. Restringir ao
    // ciclo aberto mentiria — a fatura do mês passado ainda não paga continua
    // ocupando limite.
    const naoPagas = despesas.filter((d) => !d.isPaid);
    const limiteUtilizado = this.somar(naoPagas);

    const limite = Number(card.limit) || 0;
    const disponivel = Math.max(0, limite - limiteUtilizado);

    return {
      cardId: card.id,
      cardName: card.name,
      bank: card.bank,
      limit: limite,
      usedLimit: this.arredondar(limiteUtilizado),
      availableLimit: this.arredondar(disponivel),
      utilizationPercentage:
        limite > 0 ? this.arredondar((limiteUtilizado / limite) * 100) : 0,

      closingDate: ciclo.fechamento,
      dueDate: ciclo.vencimento,
      cycleStart: ciclo.inicio,

      currentInvoice: {
        total: this.arredondar(faturaAtual),
        count: noCiclo.length,
        categories: this.porCategoria(noCiclo),
      },
      nextInvoice: {
        total: this.arredondar(proximaFatura),
        count: noProximo.length,
        closingDate: proximoFechamento,
      },

      // Quantos dias faltam para o fechamento — é o que informa a decisão de
      // adiar ou não uma compra.
      daysUntilClosing: this.diasEntre(referencia, ciclo.fechamento),
      daysUntilDue: this.diasEntre(referencia, ciclo.vencimento),
    };
  }

  /**
   * Gasto mês a mês no cartão, para acompanhar a evolução.
   */
  async getHistory(
    cardId: string,
    user: User,
    meses = 12,
    referencia = new Date(),
  ): Promise<MesHistorico[]> {
    const userIds = await this.scopeUserIds(user);

    const inicio = new Date(referencia);
    inicio.setMonth(inicio.getMonth() - (meses - 1));
    inicio.setDate(1);
    inicio.setHours(0, 0, 0, 0);

    const linhas = await this.expensesRepository
      .createQueryBuilder('expense')
      .select("TO_CHAR(expense.date, 'YYYY-MM')", 'competencia')
      .addSelect('COALESCE(SUM(expense.amount), 0)', 'total')
      .addSelect('COUNT(expense.id)', 'count')
      .where('expense.creditCardId = :cardId', { cardId })
      .andWhere('expense.userId IN (:...userIds)', { userIds })
      .andWhere('expense.date >= :inicio', { inicio })
      .groupBy('competencia')
      .getRawMany();

    const porCompetencia = new Map(
      linhas.map((l) => [
        l.competencia,
        { total: Number(l.total) || 0, count: Number(l.count) || 0 },
      ]),
    );

    // Meses sem gasto entram com zero: um buraco no gráfico sugeriria que o
    // dado não existe, quando na verdade não houve compra.
    const historico: MesHistorico[] = [];
    for (let i = meses - 1; i >= 0; i--) {
      const data = new Date(referencia);
      data.setMonth(data.getMonth() - i);
      const chave = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
      const registro = porCompetencia.get(chave);

      historico.push({
        competencia: chave,
        total: this.arredondar(registro?.total ?? 0),
        count: registro?.count ?? 0,
      });
    }

    return historico;
  }

  /**
   * Melhor dia para comprar no cartão.
   *
   * A lógica é o ciclo da fatura: uma compra feita logo DEPOIS do fechamento
   * cai na fatura seguinte, e só será paga no vencimento dela — o prazo máximo
   * que o cartão oferece. Comprar um dia antes do fechamento dá o prazo mínimo.
   *
   * O ganho é medido em dias de folga, não em desconto: o valor é o mesmo, o
   * que muda é quando o dinheiro sai.
   */
  async getBestDayToBuy(cardId: string, user: User, referencia = new Date()) {
    const userIds = await this.scopeUserIds(user);

    const card = await this.cardsRepository.findOne({
      where: { id: cardId, userId: In(userIds) },
    });

    if (!card) {
      return null;
    }

    const ciclo = this.calcularCiclo(card, referencia);

    // O dia seguinte ao fechamento abre o ciclo mais longo: a compra cai na
    // fatura SEGUINTE e ganha um mês inteiro antes de ser cobrada.
    const melhorDia = new Date(ciclo.fechamento);
    melhorDia.setDate(melhorDia.getDate() + 1);

    const vencimentoDaCompraHoje = ciclo.vencimento;

    const vencimentoSeEsperar =
      card.dueDay > card.closingDay
        ? this.dataNoMes(
            melhorDia.getFullYear(),
            melhorDia.getMonth() + 1,
            card.dueDay,
          )
        : this.dataNoMes(
            melhorDia.getFullYear(),
            melhorDia.getMonth() + 2,
            card.dueDay,
          );

    const diasAteFechamento = this.diasEntre(referencia, ciclo.fechamento);
    const prazoComprandoHoje = this.diasEntre(referencia, vencimentoDaCompraHoje);
    const prazoSeEsperar =
      this.diasEntre(melhorDia, vencimentoSeEsperar) + diasAteFechamento;
    const ganhoEmDias = prazoSeEsperar - prazoComprandoHoje;

    // O ciclo acabou de abrir: hoje JÁ é o melhor dia, porque a compra de hoje
    // entra numa fatura que só fecha daqui a um mês. Não há o que esperar.
    const hoje = new Date(referencia);
    hoje.setHours(0, 0, 0, 0);
    const cicloRecemAberto = this.diasEntre(ciclo.inicio, hoje) <= 0;

    // A REGRA, dita pelo usuário: a recomendação aponta SEMPRE para depois do
    // fechamento. Enquanto a fatura atual estiver aberta, qualquer compra feita
    // hoje é cobrada no vencimento mais próximo — esperar o fechamento não é
    // uma otimização de beira de prazo, vale o ciclo inteiro.
    //
    // A versão anterior só recomendava esperar faltando 5 dias ou menos para
    // fechar. Com fechamento no dia 07, quem consultasse no dia 01 ouvia
    // "compre hoje" e perdia um mês de prazo.
    const valeEsperar = !cicloRecemAberto && ganhoEmDias > 0;

    const avisoDeFechamento =
      diasAteFechamento === 0
        ? 'A fatura atual fecha HOJE.'
        : diasAteFechamento === 1
          ? `A fatura atual fecha amanhã (${this.formatarData(ciclo.fechamento)}).`
          : `Faltam ${diasAteFechamento} dias para a fatura atual fechar (${this.formatarData(ciclo.fechamento)}).`;

    return {
      cardId: card.id,
      cardName: card.name,
      closingDate: ciclo.fechamento,
      dueDate: ciclo.vencimento,
      daysUntilClosing: diasAteFechamento,

      /** Fica em destaque no painel, acima da recomendação. */
      closingNotice: avisoDeFechamento,

      bestDate: melhorDia,
      recommendation: valeEsperar
        ? `Melhor comprar a partir de ${this.formatarData(melhorDia)} — o dia seguinte ao fechamento. A compra cai na próxima fatura e você ganha ${ganhoEmDias} dia(s) a mais para pagar. Comprando hoje, vence em ${this.formatarData(vencimentoDaCompraHoje)}.`
        : `Hoje é o melhor momento: o ciclo acabou de abrir e a compra só vence em ${this.formatarData(vencimentoDaCompraHoje)}, com ${prazoComprandoHoje} dia(s) de prazo.`,
      shouldWait: valeEsperar,

      daysToPayIfBuyToday: prazoComprandoHoje,
      daysToPayIfWait: prazoSeEsperar,
      extraDaysIfWait: ganhoEmDias,
    };
  }

  // ==================== helpers ====================

  private async scopeUserIds(user: User): Promise<string[]> {
    if (!user.familyId) {
      return [user.id];
    }

    const memberIds = await this.familiesService.getMemberIds(user.familyId);
    return memberIds.length > 0 ? memberIds : [user.id];
  }

  private somar(despesas: Expense[]): number {
    return despesas.reduce((soma, d) => soma + Number(d.amount), 0);
  }

  /** Onde o dinheiro do cartão está indo, do maior para o menor. */
  private porCategoria(despesas: Expense[]): LinhaCategoria[] {
    const total = this.somar(despesas);

    const mapa = new Map<string, { total: number; count: number }>();

    for (const despesa of despesas) {
      const chave = despesa.category || 'Outros';
      const atual = mapa.get(chave) ?? { total: 0, count: 0 };
      atual.total += Number(despesa.amount);
      atual.count += 1;
      mapa.set(chave, atual);
    }

    return Array.from(mapa.entries())
      .map(([category, dados]) => ({
        category,
        total: this.arredondar(dados.total),
        count: dados.count,
        percentage: total > 0 ? this.arredondar((dados.total / total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }

  /**
   * Data segura dentro do mês.
   *
   * Um cartão que fecha dia 31 não pode virar 03/03 em fevereiro: o dia é
   * limitado ao último do mês de destino.
   */
  private dataNoMes(ano: number, mes: number, dia: number): Date {
    const ultimoDia = new Date(ano, mes + 1, 0).getDate();
    const data = new Date(ano, mes, Math.min(dia, ultimoDia));
    data.setHours(0, 0, 0, 0);
    return data;
  }

  private diaValido(dia: number, referencia: Date): number {
    const ultimoDia = new Date(
      referencia.getFullYear(),
      referencia.getMonth() + 1,
      0,
    ).getDate();
    return Math.min(dia, ultimoDia);
  }

  private diasEntre(de: Date, ate: Date): number {
    const inicio = new Date(de);
    inicio.setHours(0, 0, 0, 0);
    const fim = new Date(ate);
    fim.setHours(0, 0, 0, 0);
    return Math.round((fim.getTime() - inicio.getTime()) / 86400000);
  }

  private formatarData(data: Date): string {
    return data.toLocaleDateString('pt-BR');
  }

  private arredondar(valor: number): number {
    return Math.round(valor * 100) / 100;
  }
}
