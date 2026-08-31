import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Expense } from './entities/expense.entity';
import { CreateExpenseDto, UpdateExpenseDto } from './dtos/create-expense.dto';
import { User } from '../users/entities/user.entity';
import { FamiliesService } from '../families/families.service';
import { PlannedAccount } from '../planned-accounts/entities/planned-account.entity';
import { RecurrenceService } from '../recurrence/recurrence.service';

/**
 * Service de despesas.
 *
 * ESCOPO: as despesas são LIDAS no escopo da família — Bruno precisa enxergar o
 * mercado que a Giovanna pagou para que o saldo da casa feche. `userId` continua
 * registrando quem lançou, e `responsible` de quem é o gasto.
 *
 * Isso mantém o CRUD coerente com a inteligência financeira, que sempre agregou
 * por família: sem isso, a lista de despesas e o dashboard mostrariam números
 * diferentes para o mesmo mês.
 */
@Injectable()
export class ExpensesService {
  private readonly logger = new Logger(ExpensesService.name);

  constructor(
    @InjectRepository(Expense)
    private expensesRepository: Repository<Expense>,
    @InjectRepository(PlannedAccount)
    private plannedAccountsRepository: Repository<PlannedAccount>,
    private familiesService: FamiliesService,
    private recurrenceService: RecurrenceService,
  ) {}

  async create(
    user: User,
    createExpenseDto: CreateExpenseDto,
  ): Promise<Expense> {
    const expense = this.expensesRepository.create({
      ...createExpenseDto,
      userId: user.id,
    });

    // Formas de pagamento à vista SÃO a saída do dinheiro: quando a despesa é
    // lançada com data passada, ela já nasce paga. No crédito, não — a fatura
    // ainda vai vencer.
    if (expense.isPaid === undefined || expense.isPaid === null) {
      const aVista = ['cash', 'debit', 'pix', 'transfer'].includes(
        expense.paymentMethod,
      );
      expense.isPaid = aVista && new Date(expense.date) <= new Date();
      expense.paidAt = expense.isPaid ? new Date(expense.date) : undefined;
    }

    const saved = await this.expensesRepository.save(expense);
    this.logger.log(`Despesa ${saved.id} criada por ${user.id}`);

    // Despesa recorrente abre uma SÉRIE: as ocorrências dos próximos doze meses
    // entram no Planejado de uma vez, e a janela é reabastecida conforme o
    // tempo passa. A recorrência só termina quando o usuário cancelar.
    //
    // Falhar aqui não pode derrubar o lançamento: o gasto é o fato, a projeção
    // é derivada dele.
    if (saved.isRecurring) {
      try {
        const userIds = await this.scopeUserIds(user);
        await this.recurrenceService.sincronizarSerie(saved, userIds);
      } catch (erro) {
        this.logger.error(
          `Não foi possível projetar a série da despesa ${saved.id}: ${
            erro instanceof Error ? erro.message : erro
          }`,
        );
      }
    }

    return saved;
  }

  /**
   * Encerra (ou retoma) a recorrência de uma despesa.
   *
   * Cancelar não apaga a despesa — ela é um gasto que aconteceu. O que acaba é
   * a projeção para a frente: as ocorrências futuras ainda não pagas saem do
   * Planejado, e as já pagas ficam como histórico.
   */
  async setRecurrenceActive(
    id: string,
    user: User,
    ativa: boolean,
  ): Promise<Expense> {
    const expense = await this.findOne(id, user);

    this.assertPodeAlterar(expense, user);

    if (!expense.isRecurring) {
      throw new BadRequestException(
        'Esta despesa não foi lançada como recorrente.',
      );
    }

    if (ativa) {
      const userIds = await this.scopeUserIds(user);
      await this.recurrenceService.reativarSerie(expense, userIds);
    } else {
      await this.recurrenceService.cancelarSerie(expense);
    }

    return this.findOne(id, user);
  }

  /**
   * Marca (ou desmarca) uma despesa como paga.
   *
   * Quando a despesa nasceu de uma conta do Planejado, o status das duas anda
   * junto: marcar aqui e deixar o Planejado como "previsto" faria a mesma conta
   * aparecer como pendente na tela de contas a pagar.
   */
  async setPaid(id: string, user: User, isPaid: boolean): Promise<Expense> {
    const expense = await this.findOne(id, user);

    this.assertPodeAlterar(expense, user);

    expense.isPaid = isPaid;
    expense.paidAt = isPaid ? new Date() : undefined;

    const saved = await this.expensesRepository.save(expense);

    if (saved.plannedAccountId) {
      await this.plannedAccountsRepository.update(saved.plannedAccountId, {
        status: isPaid ? 'paid' : 'pending',
        paymentDate: isPaid ? saved.paidAt : undefined,
      });
    }

    this.logger.log(
      `Despesa ${id} marcada como ${isPaid ? 'paga' : 'não paga'} por ${user.id}`,
    );

    return saved;
  }

  /**
   * Quantas contas a casa pagou no mês, e quanto isso somou.
   *
   * Conta as despesas com `isPaid` no período; o Planejado é somado à parte
   * pela sua própria tela para não contar duas vezes o que já está vinculado.
   */
  async getPaidSummary(
    user: User,
    month: number,
    year: number,
  ): Promise<{ count: number; total: number }> {
    const userIds = await this.scopeUserIds(user);

    const result = await this.expensesRepository
      .createQueryBuilder('expense')
      .select('COUNT(expense.id)', 'count')
      .addSelect('COALESCE(SUM(expense.amount), 0)', 'total')
      .where('expense.userId IN (:...userIds)', { userIds })
      .andWhere('expense.isPaid = true')
      // `paidAt` pode ser nulo em registros antigos; nesses casos a data do
      // lançamento é a melhor aproximação disponível.
      .andWhere('EXTRACT(MONTH FROM COALESCE(expense.paidAt, expense.date)) = :month', { month })
      .andWhere('EXTRACT(YEAR FROM COALESCE(expense.paidAt, expense.date)) = :year', { year })
      .getRawOne();

    return {
      count: Number(result?.count) || 0,
      total: Number(result?.total) || 0,
    };
  }

  async findAll(user: User): Promise<Expense[]> {
    const userIds = await this.scopeUserIds(user);

    return this.expensesRepository
      .createQueryBuilder('expense')
      .where('expense.userId IN (:...userIds)', { userIds })
      .leftJoinAndSelect('expense.account', 'account')
      .orderBy('expense.date', 'DESC')
      .getMany();
  }

  async findByCategory(user: User, category: string): Promise<Expense[]> {
    const userIds = await this.scopeUserIds(user);

    return this.expensesRepository
      .createQueryBuilder('expense')
      .where('expense.userId IN (:...userIds)', { userIds })
      .andWhere('expense.category = :category', { category })
      .leftJoinAndSelect('expense.account', 'account')
      .orderBy('expense.date', 'DESC')
      .getMany();
  }

  async findByResponsible(user: User, responsible: string): Promise<Expense[]> {
    const userIds = await this.scopeUserIds(user);

    return this.expensesRepository
      .createQueryBuilder('expense')
      .where('expense.userId IN (:...userIds)', { userIds })
      .andWhere('expense.responsible = :responsible', { responsible })
      .leftJoinAndSelect('expense.account', 'account')
      .orderBy('expense.date', 'DESC')
      .getMany();
  }

  async findByDateRange(
    user: User,
    startDate: Date,
    endDate: Date,
  ): Promise<Expense[]> {
    const userIds = await this.scopeUserIds(user);

    return this.expensesRepository
      .createQueryBuilder('expense')
      .where('expense.userId IN (:...userIds)', { userIds })
      .andWhere('expense.date BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .orderBy('expense.date', 'DESC')
      .leftJoinAndSelect('expense.account', 'account')
      .getMany();
  }

  async findOne(id: string, user: User): Promise<Expense> {
    const userIds = await this.scopeUserIds(user);

    const expense = await this.expensesRepository
      .createQueryBuilder('expense')
      .where('expense.id = :id', { id })
      .andWhere('expense.userId IN (:...userIds)', { userIds })
      .leftJoinAndSelect('expense.account', 'account')
      .getOne();

    if (!expense) {
      throw new NotFoundException('Expense not found');
    }

    return expense;
  }

  async update(
    id: string,
    user: User,
    updateData: UpdateExpenseDto,
  ): Promise<Expense> {
    const expense = await this.findOne(id, user);

    this.assertPodeAlterar(expense, user);

    // Campos de autoria e auditoria não são editáveis pelo cliente.
    const safeUpdateData = { ...updateData };
    const updateAny = safeUpdateData as any;
    delete updateAny.userId;
    delete updateAny.createdAt;

    Object.assign(expense, safeUpdateData);
    return this.expensesRepository.save(expense);
  }

  async delete(id: string, user: User): Promise<void> {
    const expense = await this.findOne(id, user);

    this.assertPodeAlterar(expense, user);

    await this.expensesRepository.softRemove(expense);
    this.logger.log(`Despesa ${id} removida por ${user.id}`);
  }

  async getTotalByCategory(user: User, category: string): Promise<number> {
    const userIds = await this.scopeUserIds(user);

    const result = await this.expensesRepository
      .createQueryBuilder('expense')
      .select('COALESCE(SUM(expense.amount), 0)', 'total')
      .where('expense.userId IN (:...userIds)', { userIds })
      .andWhere('expense.category = :category', { category })
      .getRawOne();

    // Colunas `decimal` voltam como string no driver do Postgres; sem `Number`
    // a soma vira concatenação.
    return Number(result?.total) || 0;
  }

  async getTotalByResponsible(user: User, responsible: string): Promise<number> {
    const userIds = await this.scopeUserIds(user);

    const result = await this.expensesRepository
      .createQueryBuilder('expense')
      .select('COALESCE(SUM(expense.amount), 0)', 'total')
      .where('expense.userId IN (:...userIds)', { userIds })
      .andWhere('expense.responsible = :responsible', { responsible })
      .getRawOne();

    return Number(result?.total) || 0;
  }

  async getMonthlyTotal(
    user: User,
    month: number,
    year: number,
  ): Promise<number> {
    const userIds = await this.scopeUserIds(user);

    const result = await this.expensesRepository
      .createQueryBuilder('expense')
      .select('COALESCE(SUM(expense.amount), 0)', 'total')
      .where('expense.userId IN (:...userIds)', { userIds })
      .andWhere('EXTRACT(MONTH FROM expense.date) = :month', { month })
      .andWhere('EXTRACT(YEAR FROM expense.date) = :year', { year })
      .getRawOne();

    return Number(result?.total) || 0;
  }

  /** Composição do gasto por categoria (base dos gráficos do dashboard). */
  async getCategoryBreakdown(
    user: User,
  ): Promise<{ category: string; total: number; count: number }[]> {
    const userIds = await this.scopeUserIds(user);

    const rows = await this.expensesRepository
      .createQueryBuilder('expense')
      .select('expense.category', 'category')
      .addSelect('SUM(expense.amount)', 'total')
      .addSelect('COUNT(expense.id)', 'count')
      .where('expense.userId IN (:...userIds)', { userIds })
      .groupBy('expense.category')
      .orderBy('total', 'DESC')
      .getRawMany();

    return rows.map((r) => ({
      category: r.category,
      total: Number(r.total) || 0,
      count: Number(r.count) || 0,
    }));
  }

  /** Despesas marcadas como recorrentes (assinaturas, aluguel, academia…). */
  async findRecurring(user: User): Promise<Expense[]> {
    const userIds = await this.scopeUserIds(user);

    return this.expensesRepository
      .createQueryBuilder('expense')
      .where('expense.userId IN (:...userIds)', { userIds })
      .andWhere('expense.isRecurring = true')
      .leftJoinAndSelect('expense.account', 'account')
      .orderBy('expense.date', 'DESC')
      .getMany();
  }

  async findInstallments(
    user: User,
    installmentNumber?: number,
  ): Promise<Expense[]> {
    const userIds = await this.scopeUserIds(user);

    const query = this.expensesRepository
      .createQueryBuilder('expense')
      .where('expense.userId IN (:...userIds)', { userIds })
      .andWhere('expense.installments IS NOT NULL');

    if (installmentNumber !== undefined) {
      query.andWhere('expense.currentInstallment = :installmentNumber', {
        installmentNumber,
      });
    }

    return query.orderBy('expense.date', 'DESC').getMany();
  }

  async getDailyAverage(user: User, days: number = 30): Promise<number> {
    const userIds = await this.scopeUserIds(user);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const result = await this.expensesRepository
      .createQueryBuilder('expense')
      .select('COALESCE(SUM(expense.amount), 0)', 'total')
      .where('expense.userId IN (:...userIds)', { userIds })
      .andWhere('expense.date >= :startDate', { startDate })
      .getRawOne();

    const total = Number(result?.total) || 0;
    return total / days;
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
   * Ler é coletivo, escrever é individual: qualquer membro consulta as despesas
   * da casa, mas só quem lançou pode alterar ou apagar o próprio registro.
   */
  private assertPodeAlterar(expense: Expense, user: User): void {
    if (expense.userId !== user.id) {
      throw new ForbiddenException(
        'Apenas quem lançou esta despesa pode alterá-la ou removê-la.',
      );
    }
  }
}
