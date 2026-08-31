import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Expense } from '../expenses/entities/expense.entity';
import { Income } from '../income/entities/income.entity';
import { Account } from '../accounts/entities/account.entity';
import { User } from '../users/entities/user.entity';
import { PlannedAccount } from '../planned-accounts/entities/planned-account.entity';
import { CreditCard } from '../credit-cards/entities/credit-card.entity';
import { Goal } from '../goals/entities/goal.entity';
import {
  MonthlyPoint,
  DailyPoint,
  CategoryAggregate,
  ResponsibleAggregate,
  DayOfWeekAggregate,
  CategoryStatistics,
  PeriodRange,
  FinancialSummary,
  RecurringExpense,
} from './financial-data.types';

const DIAS_DA_SEMANA = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
];

/**
 * Camada de leitura dos dados financeiros REAIS da família.
 *
 * Despesas e receitas são gravadas por usuário (`expenses.userId`), mas toda a
 * inteligência financeira raciocina no nível da casa. Este serviço resolve os
 * membros da família a partir de `users.family_id` e agrega os lançamentos de
 * todos eles.
 *
 * É a única porta de entrada dos serviços de IA para o banco: previsões,
 * anomalias, análise comportamental e recomendações consomem exclusivamente
 * estes métodos, o que garante que nenhum número exibido ao usuário seja
 * inventado.
 */
@Injectable()
export class FinancialDataService {
  private readonly logger = new Logger(FinancialDataService.name);

  constructor(
    @InjectRepository(Expense)
    private expenseRepository: Repository<Expense>,
    @InjectRepository(Income)
    private incomeRepository: Repository<Income>,
    @InjectRepository(Account)
    private accountRepository: Repository<Account>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(PlannedAccount)
    private readonly plannedRepository: Repository<PlannedAccount>,
    @InjectRepository(CreditCard)
    private readonly cardRepository: Repository<CreditCard>,
    @InjectRepository(Goal)
    private readonly goalRepository: Repository<Goal>,
  ) {}

  // ==================== escopo da família ====================

  /**
   * Ids de todos os usuários da família.
   *
   * Retorna `[]` quando a família não tem membros — nesse caso todos os
   * agregados devolvem zero em vez de varrer a tabela inteira.
   */
  async getFamilyUserIds(familyId: string): Promise<string[]> {
    const members = await this.userRepository.find({
      where: { familyId },
      select: ['id'],
    });

    return members.map((m) => m.id);
  }

  /**
   * Converte um rótulo de período em intervalo de datas.
   * Aceita tanto os rótulos do chat (`THIS_MONTH`) quanto os de previsão
   * (`30_DAYS`).
   */
  getPeriodRange(period: string, reference = new Date()): PeriodRange {
    const end = new Date(reference);
    const start = new Date(reference);

    switch (period) {
      case 'THIS_MONTH':
        start.setDate(1);
        break;
      case 'LAST_MONTH':
        start.setMonth(start.getMonth() - 1, 1);
        end.setDate(0);
        break;
      case 'LAST_3_MONTHS':
      case '90_DAYS':
        start.setMonth(start.getMonth() - 3);
        break;
      case 'LAST_6_MONTHS':
      case '180_DAYS':
        start.setMonth(start.getMonth() - 6);
        break;
      case 'LAST_12_MONTHS':
      case '365_DAYS':
        start.setFullYear(start.getFullYear() - 1);
        break;
      case 'THIS_YEAR':
        start.setMonth(0, 1);
        break;
      case '30_DAYS':
        start.setDate(start.getDate() - 30);
        break;
      default:
        start.setMonth(start.getMonth() - 6);
    }

    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    return { start, end };
  }

  /** Número de dias que um período de previsão representa. */
  getPeriodDays(period: string): number {
    switch (period) {
      case '30_DAYS':
        return 30;
      case '90_DAYS':
        return 90;
      case '180_DAYS':
        return 180;
      case '365_DAYS':
        return 365;
      default:
        return 90;
    }
  }

  // ==================== despesas ====================

  async getExpenses(
    familyId: string,
    range: PeriodRange,
    filters: { category?: string; responsible?: string } = {},
  ): Promise<Expense[]> {
    const userIds = await this.getFamilyUserIds(familyId);
    if (userIds.length === 0) return [];

    const query = this.expenseRepository
      .createQueryBuilder('e')
      .where('e.userId IN (:...userIds)', { userIds })
      .andWhere('e.date BETWEEN :start AND :end', {
        start: range.start,
        end: range.end,
      });

    if (filters.category) {
      query.andWhere('e.category = :category', { category: filters.category });
    }

    if (filters.responsible) {
      query.andWhere('e.responsible = :responsible', {
        responsible: filters.responsible,
      });
    }

    return query.orderBy('e.date', 'DESC').getMany();
  }

  /**
   * Série mensal de despesas dos últimos N meses.
   *
   * É a entrada dos modelos de previsão: sem histórico suficiente, o serviço de
   * forecast deve informar isso ao usuário em vez de extrapolar.
   */
  async getMonthlyExpenseSeries(
    familyId: string,
    months = 12,
  ): Promise<MonthlyPoint[]> {
    const userIds = await this.getFamilyUserIds(familyId);
    if (userIds.length === 0) return [];

    const start = new Date();
    start.setMonth(start.getMonth() - months, 1);
    start.setHours(0, 0, 0, 0);

    const rows = await this.expenseRepository
      .createQueryBuilder('e')
      .select("TO_CHAR(e.date, 'YYYY-MM')", 'month')
      .addSelect('SUM(e.amount)', 'total')
      .addSelect('COUNT(*)', 'count')
      .where('e.userId IN (:...userIds)', { userIds })
      .andWhere('e.date >= :start', { start })
      .groupBy("TO_CHAR(e.date, 'YYYY-MM')")
      .orderBy("TO_CHAR(e.date, 'YYYY-MM')", 'ASC')
      .getRawMany();

    return rows.map((r) => ({
      month: r.month,
      total: Number(r.total) || 0,
      count: Number(r.count) || 0,
    }));
  }

  /** Série diária de despesas dos últimos N dias. */
  async getDailyExpenseSeries(
    familyId: string,
    days = 90,
  ): Promise<DailyPoint[]> {
    const userIds = await this.getFamilyUserIds(familyId);
    if (userIds.length === 0) return [];

    const start = new Date();
    start.setDate(start.getDate() - days);
    start.setHours(0, 0, 0, 0);

    const rows = await this.expenseRepository
      .createQueryBuilder('e')
      .select("TO_CHAR(e.date, 'YYYY-MM-DD')", 'date')
      .addSelect('SUM(e.amount)', 'total')
      .addSelect('COUNT(*)', 'count')
      .where('e.userId IN (:...userIds)', { userIds })
      .andWhere('e.date >= :start', { start })
      .groupBy("TO_CHAR(e.date, 'YYYY-MM-DD')")
      .orderBy("TO_CHAR(e.date, 'YYYY-MM-DD')", 'ASC')
      .getRawMany();

    return rows.map((r) => ({
      date: r.date,
      total: Number(r.total) || 0,
      count: Number(r.count) || 0,
    }));
  }

  async getExpensesByCategory(
    familyId: string,
    range: PeriodRange,
  ): Promise<CategoryAggregate[]> {
    const userIds = await this.getFamilyUserIds(familyId);
    if (userIds.length === 0) return [];

    const rows = await this.expenseRepository
      .createQueryBuilder('e')
      .select('e.category', 'category')
      .addSelect('SUM(e.amount)', 'total')
      .addSelect('COUNT(*)', 'count')
      .addSelect('AVG(e.amount)', 'average')
      .where('e.userId IN (:...userIds)', { userIds })
      .andWhere('e.date BETWEEN :start AND :end', {
        start: range.start,
        end: range.end,
      })
      .groupBy('e.category')
      .orderBy('SUM(e.amount)', 'DESC')
      .getRawMany();

    const grandTotal = rows.reduce((sum, r) => sum + Number(r.total), 0);

    return rows.map((r) => ({
      category: r.category,
      total: Number(r.total) || 0,
      count: Number(r.count) || 0,
      average: Number(r.average) || 0,
      share: grandTotal > 0 ? Number(r.total) / grandTotal : 0,
    }));
  }

  async getExpensesByResponsible(
    familyId: string,
    range: PeriodRange,
  ): Promise<ResponsibleAggregate[]> {
    const userIds = await this.getFamilyUserIds(familyId);
    if (userIds.length === 0) return [];

    const rows = await this.expenseRepository
      .createQueryBuilder('e')
      .select('e.responsible', 'responsible')
      .addSelect('SUM(e.amount)', 'total')
      .addSelect('COUNT(*)', 'count')
      .where('e.userId IN (:...userIds)', { userIds })
      .andWhere('e.date BETWEEN :start AND :end', {
        start: range.start,
        end: range.end,
      })
      .groupBy('e.responsible')
      .orderBy('SUM(e.amount)', 'DESC')
      .getRawMany();

    const grandTotal = rows.reduce((sum, r) => sum + Number(r.total), 0);

    return rows.map((r) => ({
      responsible: r.responsible,
      total: Number(r.total) || 0,
      count: Number(r.count) || 0,
      share: grandTotal > 0 ? Number(r.total) / grandTotal : 0,
    }));
  }

  /** Gasto médio por dia da semana — base da análise de padrões temporais. */
  async getExpensesByDayOfWeek(
    familyId: string,
    range: PeriodRange,
  ): Promise<DayOfWeekAggregate[]> {
    const userIds = await this.getFamilyUserIds(familyId);
    if (userIds.length === 0) return [];

    const rows = await this.expenseRepository
      .createQueryBuilder('e')
      .select('EXTRACT(DOW FROM e.date)', 'dow')
      .addSelect('SUM(e.amount)', 'total')
      .addSelect('COUNT(*)', 'count')
      .addSelect('AVG(e.amount)', 'average')
      .where('e.userId IN (:...userIds)', { userIds })
      .andWhere('e.date BETWEEN :start AND :end', {
        start: range.start,
        end: range.end,
      })
      .groupBy('EXTRACT(DOW FROM e.date)')
      .orderBy('EXTRACT(DOW FROM e.date)', 'ASC')
      .getRawMany();

    return rows.map((r) => {
      const dayOfWeek = Number(r.dow);
      return {
        dayOfWeek,
        label: DIAS_DA_SEMANA[dayOfWeek] ?? String(dayOfWeek),
        total: Number(r.total) || 0,
        count: Number(r.count) || 0,
        average: Number(r.average) || 0,
      };
    });
  }

  /**
   * Média e desvio padrão do valor das despesas por categoria.
   *
   * Usado pelo detector de anomalias para calcular z-score
   * (`|valor - média| / desvio`).
   */
  async getCategoryStatistics(
    familyId: string,
    range: PeriodRange,
  ): Promise<CategoryStatistics[]> {
    const userIds = await this.getFamilyUserIds(familyId);
    if (userIds.length === 0) return [];

    const rows = await this.expenseRepository
      .createQueryBuilder('e')
      .select('e.category', 'category')
      .addSelect('AVG(e.amount)', 'mean')
      // STDDEV_SAMP devolve NULL com uma única amostra; COALESCE evita NaN.
      .addSelect('COALESCE(STDDEV_SAMP(e.amount), 0)', 'stddev')
      .addSelect('MIN(e.amount)', 'min')
      .addSelect('MAX(e.amount)', 'max')
      .addSelect('COUNT(*)', 'count')
      .where('e.userId IN (:...userIds)', { userIds })
      .andWhere('e.date BETWEEN :start AND :end', {
        start: range.start,
        end: range.end,
      })
      .groupBy('e.category')
      .getRawMany();

    return rows.map((r) => ({
      category: r.category,
      mean: Number(r.mean) || 0,
      stdDev: Number(r.stddev) || 0,
      min: Number(r.min) || 0,
      max: Number(r.max) || 0,
      count: Number(r.count) || 0,
    }));
  }

  /**
   * Despesas que se repetem: mesma descrição em 3 ou mais meses distintos.
   *
   * Detecta assinaturas e contas fixas sem depender da flag `isRecurring`,
   * que o usuário raramente preenche em lançamentos importados.
   */
  async getRecurringExpenses(
    familyId: string,
    months = 6,
  ): Promise<RecurringExpense[]> {
    const userIds = await this.getFamilyUserIds(familyId);
    if (userIds.length === 0) return [];

    const start = new Date();
    start.setMonth(start.getMonth() - months);

    const rows = await this.expenseRepository
      .createQueryBuilder('e')
      .select('LOWER(e.description)', 'description')
      .addSelect('MIN(e.category)', 'category')
      .addSelect('AVG(e.amount)', 'average')
      .addSelect('COUNT(*)', 'occurrences')
      .addSelect("COUNT(DISTINCT TO_CHAR(e.date, 'YYYY-MM'))", 'months')
      .addSelect('MIN(e.date)', 'firstDate')
      .addSelect('MAX(e.date)', 'lastDate')
      .where('e.userId IN (:...userIds)', { userIds })
      .andWhere('e.date >= :start', { start })
      .groupBy('LOWER(e.description)')
      .having("COUNT(DISTINCT TO_CHAR(e.date, 'YYYY-MM')) >= 3")
      .orderBy('AVG(e.amount)', 'DESC')
      .getRawMany();

    return rows.map((r) => {
      const first = new Date(r.firstDate);
      const last = new Date(r.lastDate);
      const occurrences = Number(r.occurrences) || 1;
      const spanDays = Math.max(
        1,
        Math.round((last.getTime() - first.getTime()) / 86_400_000),
      );

      return {
        description: r.description,
        category: r.category,
        averageAmount: Number(r.average) || 0,
        occurrences,
        averageIntervalDays:
          occurrences > 1 ? Math.round(spanDays / (occurrences - 1)) : spanDays,
        lastDate: last,
      };
    });
  }

  // ==================== receitas ====================

  async getIncomes(familyId: string, range: PeriodRange): Promise<Income[]> {
    const userIds = await this.getFamilyUserIds(familyId);
    if (userIds.length === 0) return [];

    return this.incomeRepository
      .createQueryBuilder('i')
      .where('i.userId IN (:...userIds)', { userIds })
      .andWhere('i.date BETWEEN :start AND :end', {
        start: range.start,
        end: range.end,
      })
      .orderBy('i.date', 'DESC')
      .getMany();
  }

  async getMonthlyIncomeSeries(
    familyId: string,
    months = 12,
  ): Promise<MonthlyPoint[]> {
    const userIds = await this.getFamilyUserIds(familyId);
    if (userIds.length === 0) return [];

    const start = new Date();
    start.setMonth(start.getMonth() - months, 1);
    start.setHours(0, 0, 0, 0);

    const rows = await this.incomeRepository
      .createQueryBuilder('i')
      .select("TO_CHAR(i.date, 'YYYY-MM')", 'month')
      .addSelect('SUM(i.amount)', 'total')
      .addSelect('COUNT(*)', 'count')
      .where('i.userId IN (:...userIds)', { userIds })
      .andWhere('i.date >= :start', { start })
      .groupBy("TO_CHAR(i.date, 'YYYY-MM')")
      .orderBy("TO_CHAR(i.date, 'YYYY-MM')", 'ASC')
      .getRawMany();

    return rows.map((r) => ({
      month: r.month,
      total: Number(r.total) || 0,
      count: Number(r.count) || 0,
    }));
  }

  // ==================== consolidado ====================

  /** Saldo somado de todas as contas dos membros da família. */
  async getCurrentBalance(familyId: string): Promise<number> {
    const userIds = await this.getFamilyUserIds(familyId);
    if (userIds.length === 0) return 0;

    const row = await this.accountRepository
      .createQueryBuilder('a')
      .select('COALESCE(SUM(a.balance), 0)', 'total')
      .where('a.userId IN (:...userIds)', { userIds })
      .getRawOne();

    return Number(row?.total) || 0;
  }

  /** Resumo de receitas, despesas e saldo do período. */
  async getSummary(
    familyId: string,
    range: PeriodRange,
  ): Promise<FinancialSummary> {
    const userIds = await this.getFamilyUserIds(familyId);

    if (userIds.length === 0) {
      return {
        totalExpenses: 0,
        totalIncomes: 0,
        balance: 0,
        expenseCount: 0,
        incomeCount: 0,
        averageDailyExpense: 0,
        days: 0,
      };
    }

    const [expenseRow, incomeRow] = await Promise.all([
      this.expenseRepository
        .createQueryBuilder('e')
        .select('COALESCE(SUM(e.amount), 0)', 'total')
        .addSelect('COUNT(*)', 'count')
        .where('e.userId IN (:...userIds)', { userIds })
        .andWhere('e.date BETWEEN :start AND :end', {
          start: range.start,
          end: range.end,
        })
        .getRawOne(),
      this.incomeRepository
        .createQueryBuilder('i')
        .select('COALESCE(SUM(i.amount), 0)', 'total')
        .addSelect('COUNT(*)', 'count')
        .where('i.userId IN (:...userIds)', { userIds })
        .andWhere('i.date BETWEEN :start AND :end', {
          start: range.start,
          end: range.end,
        })
        .getRawOne(),
    ]);

    const totalExpenses = Number(expenseRow?.total) || 0;
    const totalIncomes = Number(incomeRow?.total) || 0;
    const days = Math.max(
      1,
      Math.round(
        (range.end.getTime() - range.start.getTime()) / 86_400_000,
      ),
    );

    return {
      totalExpenses,
      totalIncomes,
      balance: totalIncomes - totalExpenses,
      expenseCount: Number(expenseRow?.count) || 0,
      incomeCount: Number(incomeRow?.count) || 0,
      averageDailyExpense: totalExpenses / days,
      days,
    };
  }

  /**
   * Indica se há histórico suficiente para os modelos preditivos.
   *
   * Abaixo do mínimo os serviços devem dizer isso claramente ao usuário —
   * a regra 27 do projeto proíbe inventar informação quando faltam dados.
   */
  async hasSufficientHistory(
    familyId: string,
    minMonths = 3,
  ): Promise<boolean> {
    const series = await this.getMonthlyExpenseSeries(familyId, 12);
    return series.length >= minMonths;
  }

  // ==================== Planejado, cartões e investimentos ====================
  //
  // Estes três blocos existem porque o assistente respondia "não sei" para
  // perguntas cujos dados o sistema TINHA — vencimentos, limite de cartão,
  // quanto está investido. A camada de leitura só conhecia despesas, receitas e
  // contas, então o roteador da IA classificava tudo isso como fora de escopo.

  /**
   * Contas a pagar em aberto, da mais próxima para a mais distante.
   *
   * Só `type = 'expense'`: entradas previstas (salário projetado) não são
   * compromisso a pagar. E só o que ainda está pendente — o que já foi pago
   * virou lançamento real e é contado como despesa.
   */
  async getUpcomingBills(
    familyId: string,
    dias = 30,
  ): Promise<PlannedAccount[]> {
    const userIds = await this.getFamilyUserIds(familyId);
    if (userIds.length === 0) return [];

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const limite = new Date(hoje);
    limite.setDate(limite.getDate() + dias);

    return this.plannedRepository
      .createQueryBuilder('planned')
      .where('planned.userId IN (:...userIds)', { userIds })
      .andWhere("planned.type = 'expense'")
      .andWhere("planned.status IN ('pending', 'confirmed', 'overdue')")
      .andWhere('planned.dueDate BETWEEN :hoje AND :limite', { hoje, limite })
      .orderBy('planned.dueDate', 'ASC')
      .getMany();
  }

  /** Contas cujo vencimento já passou e continuam em aberto. */
  async getOverdueBills(familyId: string): Promise<PlannedAccount[]> {
    const userIds = await this.getFamilyUserIds(familyId);
    if (userIds.length === 0) return [];

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    return this.plannedRepository
      .createQueryBuilder('planned')
      .where('planned.userId IN (:...userIds)', { userIds })
      .andWhere("planned.type = 'expense'")
      .andWhere("planned.status IN ('pending', 'confirmed', 'overdue')")
      .andWhere('planned.dueDate < :hoje', { hoje })
      .orderBy('planned.dueDate', 'ASC')
      .getMany();
  }

  /** Entradas previstas — salário e demais receitas recorrentes projetadas. */
  async getUpcomingIncomes(
    familyId: string,
    dias = 30,
  ): Promise<PlannedAccount[]> {
    const userIds = await this.getFamilyUserIds(familyId);
    if (userIds.length === 0) return [];

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const limite = new Date(hoje);
    limite.setDate(limite.getDate() + dias);

    return this.plannedRepository
      .createQueryBuilder('planned')
      .where('planned.userId IN (:...userIds)', { userIds })
      .andWhere("planned.type = 'income'")
      .andWhere("planned.status IN ('pending', 'confirmed')")
      .andWhere('planned.dueDate BETWEEN :hoje AND :limite', { hoje, limite })
      .orderBy('planned.dueDate', 'ASC')
      .getMany();
  }

  /** Cartões da casa, com o limite utilizado derivado das compras não pagas. */
  async getCreditCards(familyId: string): Promise<
    Array<{
      id: string;
      name: string;
      bank: string;
      limit: number;
      used: number;
      available: number;
      closingDay: number;
      dueDay: number;
    }>
  > {
    const userIds = await this.getFamilyUserIds(familyId);
    if (userIds.length === 0) return [];

    const cards = await this.cardRepository
      .createQueryBuilder('card')
      .where('card.userId IN (:...userIds)', { userIds })
      .getMany();

    if (cards.length === 0) return [];

    // Uma consulta agregada para todos os cartões: o utilizado é a soma das
    // compras ainda não pagas de cada um.
    const usos = await this.expenseRepository
      .createQueryBuilder('expense')
      .select('expense.creditCardId', 'cardId')
      .addSelect('COALESCE(SUM(expense.amount), 0)', 'total')
      .where('expense.userId IN (:...userIds)', { userIds })
      .andWhere('expense.creditCardId IN (:...cardIds)', {
        cardIds: cards.map((c) => c.id),
      })
      .andWhere('expense.isPaid = false')
      .groupBy('expense.creditCardId')
      .getRawMany();

    const usoPorCartao = new Map<string, number>(
      usos.map((u) => [u.cardId, Number(u.total) || 0]),
    );

    return cards.map((card) => {
      const limite = Number(card.limit) || 0;
      const usado = usoPorCartao.get(card.id) ?? 0;

      return {
        id: card.id,
        name: card.name,
        bank: card.bank,
        limit: limite,
        used: Math.round(usado * 100) / 100,
        available: Math.round(Math.max(0, limite - usado) * 100) / 100,
        closingDay: card.closingDay,
        dueDay: card.dueDay,
      };
    });
  }

  /**
   * Investimentos da casa.
   *
   * Importante para o assistente: este dinheiro NÃO é receita nem saldo em
   * conta. Está aplicado, e responder "você tem R$ 30.000" somando investimento
   * ao saldo daria uma disponibilidade que não existe.
   */
  async getInvestments(familyId: string): Promise<Goal[]> {
    if (!familyId) return [];

    return this.goalRepository
      .createQueryBuilder('goal')
      .where('goal.familyId = :familyId', { familyId })
      .andWhere("goal.status <> 'CANCELLED'")
      .orderBy('goal.currentAmount', 'DESC')
      .getMany();
  }

}
