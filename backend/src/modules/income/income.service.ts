import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Income } from './entities/income.entity';
import { User } from '../users/entities/user.entity';
import { FamiliesService } from '../families/families.service';
import { CreateIncomeDto, UpdateIncomeDto } from './dtos/income.dto';
import { RecurrenceService } from '../recurrence/recurrence.service';

/**
 * Service de receitas.
 *
 * ESCOPO: as receitas são LIDAS no escopo da família — Bruno precisa enxergar o
 * salário da Giovanna para que o saldo da casa feche. `userId` continua
 * registrando quem lançou, e `responsible` quem recebeu.
 *
 * Isso mantém o CRUD coerente com a inteligência financeira, que sempre agregou
 * por família: sem isso, a lista de receitas e o dashboard mostrariam números
 * diferentes para o mesmo mês.
 */
@Injectable()
export class IncomeService {
  private readonly logger = new Logger(IncomeService.name);

  constructor(
    @InjectRepository(Income)
    private incomeRepository: Repository<Income>,
    private familiesService: FamiliesService,
    private recurrenceService: RecurrenceService,
  ) {}

  async create(user: User, dto: CreateIncomeDto): Promise<Income> {
    const income = this.incomeRepository.create({
      ...dto,
      userId: user.id,
    });

    const saved = await this.incomeRepository.save(income);
    this.logger.log(`Receita ${saved.id} criada por ${user.id}`);

    // Receita recorrente abre uma SÉRIE, igual à despesa: o salário dos
    // próximos doze meses entra no Planejado como ENTRADA, e a janela é
    // reabastecida conforme o tempo passa.
    //
    // Falhar aqui não pode derrubar o lançamento: o dinheiro que entrou é o
    // fato, a projeção é derivada dele.
    if (saved.isRecurring) {
      try {
        const userIds = await this.scopeUserIds(user);
        await this.recurrenceService.sincronizarSerieReceita(saved, userIds);
      } catch (erro) {
        this.logger.error(
          `Não foi possível projetar a série da receita ${saved.id}: ${
            erro instanceof Error ? erro.message : erro
          }`,
        );
      }
    }

    return saved;
  }

  /**
   * Encerra ou retoma a recorrência de uma receita.
   *
   * Cancelar não apaga a receita — ela é dinheiro que entrou. O que termina é a
   * projeção dos meses seguintes: quem trocou de emprego para de ver o salário
   * antigo caindo no Planejado, sem perder o histórico do que recebeu.
   */
  async setRecurrenceActive(
    id: string,
    user: User,
    ativa: boolean,
  ): Promise<Income> {
    const income = await this.findOne(id, user);

    this.assertPodeAlterar(income, user);

    if (!income.isRecurring) {
      throw new BadRequestException(
        'Esta receita não foi lançada como recorrente.',
      );
    }

    if (ativa) {
      const userIds = await this.scopeUserIds(user);
      await this.recurrenceService.reativarSerieReceita(income, userIds);
    } else {
      await this.recurrenceService.cancelarSerieReceita(income);
    }

    return this.findOne(id, user);
  }

  async findAll(user: User): Promise<Income[]> {
    const userIds = await this.scopeUserIds(user);

    return this.incomeRepository
      .createQueryBuilder('i')
      .where('i.userId IN (:...userIds)', { userIds })
      .leftJoinAndSelect('i.account', 'account')
      .orderBy('i.date', 'DESC')
      .getMany();
  }

  async findOne(id: string, user: User): Promise<Income> {
    const userIds = await this.scopeUserIds(user);

    const income = await this.incomeRepository
      .createQueryBuilder('i')
      .where('i.id = :id', { id })
      .andWhere('i.userId IN (:...userIds)', { userIds })
      .leftJoinAndSelect('i.account', 'account')
      .getOne();

    if (!income) {
      throw new NotFoundException('Receita não encontrada');
    }

    return income;
  }

  async update(
    id: string,
    user: User,
    dto: UpdateIncomeDto,
  ): Promise<Income> {
    const income = await this.findOne(id, user);

    this.assertPodeAlterar(income, user);

    Object.assign(income, dto);
    return this.incomeRepository.save(income);
  }

  async remove(id: string, user: User): Promise<void> {
    const income = await this.findOne(id, user);

    this.assertPodeAlterar(income, user);

    await this.incomeRepository.softRemove(income);
    this.logger.log(`Receita ${id} removida por ${user.id}`);
  }

  // ==================== consultas ====================

  async findByType(user: User, type: string): Promise<Income[]> {
    const userIds = await this.scopeUserIds(user);

    return this.incomeRepository
      .createQueryBuilder('i')
      .where('i.userId IN (:...userIds)', { userIds })
      .andWhere('i.type = :type', { type })
      .orderBy('i.date', 'DESC')
      .getMany();
  }

  async findByResponsible(user: User, responsible: string): Promise<Income[]> {
    const userIds = await this.scopeUserIds(user);

    return this.incomeRepository
      .createQueryBuilder('i')
      .where('i.userId IN (:...userIds)', { userIds })
      .andWhere('i.responsible = :responsible', { responsible })
      .orderBy('i.date', 'DESC')
      .getMany();
  }

  async findByDateRange(
    user: User,
    startDate: Date,
    endDate: Date,
  ): Promise<Income[]> {
    const userIds = await this.scopeUserIds(user);

    return this.incomeRepository
      .createQueryBuilder('i')
      .where('i.userId IN (:...userIds)', { userIds })
      .andWhere('i.date BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .orderBy('i.date', 'DESC')
      .getMany();
  }

  /** Receitas marcadas como recorrentes (salário, aluguel recebido, etc). */
  async findRecurring(user: User): Promise<Income[]> {
    const userIds = await this.scopeUserIds(user);

    return this.incomeRepository
      .createQueryBuilder('i')
      .where('i.userId IN (:...userIds)', { userIds })
      .andWhere('i.isRecurring = true')
      .orderBy('i.date', 'DESC')
      .getMany();
  }

  /**
   * Renda mensal recorrente estimada.
   *
   * Considera apenas a ocorrência MAIS RECENTE de cada descrição recorrente
   * mensal — sem isso, seis meses de "Salário Bruno" somariam seis salários.
   * É a base do rateio proporcional à renda entre Bruno e Giovanna.
   */
  async getRecurringMonthlyIncome(
    user: User,
  ): Promise<{ responsible: string; monthlyAmount: number }[]> {
    const userIds = await this.scopeUserIds(user);

    // `DISTINCT ON` do PostgreSQL fica mais legível — e correto — em SQL puro:
    // o QueryBuilder do TypeORM posiciona a cláusula no lugar errado.
    const rows = await this.incomeRepository.query(
      `
      SELECT ultima.responsible AS responsible,
             SUM(ultima.amount) AS total
      FROM (
        SELECT DISTINCT ON (LOWER(i."description"))
               i."amount"      AS amount,
               i."responsible" AS responsible
        FROM "incomes" i
        WHERE i."userId" = ANY($1)
          AND i."isRecurring" = true
          AND i."frequency" = 'monthly'
          AND i."deletedAt" IS NULL
        ORDER BY LOWER(i."description"), i."date" DESC
      ) ultima
      GROUP BY ultima.responsible
      `,
      [userIds],
    );

    return (rows as { responsible: string; total: string }[]).map((r) => ({
      responsible: r.responsible,
      monthlyAmount: Number(r.total) || 0,
    }));
  }

  async getMonthlyTotal(
    user: User,
    month: number,
    year: number,
  ): Promise<number> {
    const userIds = await this.scopeUserIds(user);

    const row = await this.incomeRepository
      .createQueryBuilder('i')
      .select('COALESCE(SUM(i.amount), 0)', 'total')
      .where('i.userId IN (:...userIds)', { userIds })
      .andWhere('EXTRACT(MONTH FROM i.date) = :month', { month })
      .andWhere('EXTRACT(YEAR FROM i.date) = :year', { year })
      .getRawOne();

    // Colunas `decimal` voltam como string no driver do Postgres; sem `Number`
    // a soma vira concatenação.
    return Number(row?.total) || 0;
  }

  async getTotalByResponsible(
    user: User,
    responsible: string,
  ): Promise<number> {
    const userIds = await this.scopeUserIds(user);

    const row = await this.incomeRepository
      .createQueryBuilder('i')
      .select('COALESCE(SUM(i.amount), 0)', 'total')
      .where('i.userId IN (:...userIds)', { userIds })
      .andWhere('i.responsible = :responsible', { responsible })
      .getRawOne();

    return Number(row?.total) || 0;
  }

  /** Composição da renda por origem (salário, freelance, bônus…). */
  async getTypeBreakdown(
    user: User,
  ): Promise<{ type: string; total: number; count: number }[]> {
    const userIds = await this.scopeUserIds(user);

    const rows = await this.incomeRepository
      .createQueryBuilder('i')
      .select('i.type', 'type')
      .addSelect('SUM(i.amount)', 'total')
      .addSelect('COUNT(*)', 'count')
      .where('i.userId IN (:...userIds)', { userIds })
      .groupBy('i.type')
      .orderBy('SUM(i.amount)', 'DESC')
      .getRawMany();

    return rows.map((r) => ({
      type: r.type,
      total: Number(r.total) || 0,
      count: Number(r.count) || 0,
    }));
  }

  // ==================== helpers ====================

  /**
   * Ids dos usuários cujos lançamentos este usuário pode ler.
   *
   * Com família: todos os membros. Sem família (estado transitório): apenas
   * ele mesmo — melhor mostrar só os próprios lançamentos do que barrar o
   * acesso a algo que ele criou.
   */
  private async scopeUserIds(user: User): Promise<string[]> {
    if (!user.familyId) {
      return [user.id];
    }

    const memberIds = await this.familiesService.getMemberIds(user.familyId);
    return memberIds.length > 0 ? memberIds : [user.id];
  }

  /**
   * Ler é coletivo, escrever é individual: qualquer membro consulta as receitas
   * da casa, mas só quem lançou pode alterar ou apagar o próprio registro.
   */
  private assertPodeAlterar(income: Income, user: User): void {
    if (income.userId !== user.id) {
      throw new ForbiddenException(
        'Apenas quem lançou esta receita pode alterá-la ou removê-la.',
      );
    }
  }
}
