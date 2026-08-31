import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In } from 'typeorm';
import { PlannedAccount } from './entities/planned-account.entity';
import {
  CreatePlannedAccountDto,
  UpdatePlannedAccountDto,
} from './dtos/create-planned-account.dto';
import { User } from '../users/entities/user.entity';
import { FamiliesService } from '../families/families.service';
import { RecurrenceService } from '../recurrence/recurrence.service';

/**
 * Service de contas planejadas.
 *
 * ESCOPO: as contas são LIDAS no escopo da família, como todo o resto do
 * sistema. Antes cada pessoa só enxergava as próprias — o que fazia a tela
 * Planejado discordar do Fluxo de Caixa e do Dashboard, que sempre agregaram
 * por casa. Escrever continua individual: só quem cadastrou altera ou apaga.
 *
 * A leitura também REABASTECE a janela das despesas recorrentes. Isso é
 * deliberado: no plano gratuito do Render o serviço hiberna sem tráfego, então
 * uma tarefa noturna não roda. Amarrar a perpetuação da recorrência a um cron
 * seria amarrá-la a algo que não acontece.
 */
@Injectable()
export class PlannedAccountsService {
  private readonly logger = new Logger(PlannedAccountsService.name);

  constructor(
    @InjectRepository(PlannedAccount)
    private plannedAccountsRepository: Repository<PlannedAccount>,
    private familiesService: FamiliesService,
    private recurrenceService: RecurrenceService,
  ) {}

  /**
   * Ids dos usuários cujas contas este usuário pode ler: todos os membros da
   * família, ou apenas ele mesmo enquanto não pertencer a nenhuma.
   */
  private async scopeUserIds(user: User): Promise<string[]> {
    if (!user.familyId) {
      return [user.id];
    }

    const memberIds = await this.familiesService.getMemberIds(user.familyId);
    return memberIds.length > 0 ? memberIds : [user.id];
  }

  /** Ler é coletivo, escrever é individual. */
  private assertPodeAlterar(conta: PlannedAccount, user: User): void {
    if (conta.userId !== user.id) {
      throw new ForbiddenException(
        'Apenas quem cadastrou esta conta pode alterá-la ou removê-la.',
      );
    }
  }

  /**
   * Reabastece a janela das séries recorrentes da casa.
   *
   * Falhar aqui não pode impedir a listagem: é melhor mostrar o Planejado sem
   * as ocorrências mais distantes do que não mostrar nada.
   */
  private async manterRecorrentes(userIds: string[]): Promise<void> {
    try {
      await this.recurrenceService.sincronizarTodas(userIds);
    } catch (erro) {
      this.logger.error(
        `Falha ao reabastecer as séries recorrentes: ${
          erro instanceof Error ? erro.message : erro
        }`,
      );
    }
  }

  async create(
    user: User,
    createPlannedAccountDto: CreatePlannedAccountDto,
  ): Promise<PlannedAccount> {
    const plannedAccount = this.plannedAccountsRepository.create({
      ...createPlannedAccountDto,
      userId: user.id,
    });

    return this.plannedAccountsRepository.save(plannedAccount);
  }

  async findAll(user: User): Promise<PlannedAccount[]> {
    const userIds = await this.scopeUserIds(user);

    await this.manterRecorrentes(userIds);

    return this.plannedAccountsRepository.find({
      where: { userId: In(userIds) },
      order: { dueDate: 'ASC' },
    });
  }

  async findOne(id: string, user: User): Promise<PlannedAccount> {
    const userIds = await this.scopeUserIds(user);

    const plannedAccount = await this.plannedAccountsRepository.findOne({
      where: { id, userId: In(userIds) },
    });

    if (!plannedAccount) {
      throw new NotFoundException('Planned account not found');
    }

    return plannedAccount;
  }

  async update(
    id: string,
    user: User,
    updatePlannedAccountDto: UpdatePlannedAccountDto,
  ): Promise<PlannedAccount> {
    const plannedAccount = await this.findOne(id, user);

    this.assertPodeAlterar(plannedAccount, user);

    // Prevent updating certain fields
    const safeUpdateData = { ...updatePlannedAccountDto };
    const updateAny = safeUpdateData as any;
    delete updateAny.userId;
    delete updateAny.createdAt;

    Object.assign(plannedAccount, safeUpdateData);
    return this.plannedAccountsRepository.save(plannedAccount);
  }

  async delete(id: string, user: User): Promise<void> {
    const plannedAccount = await this.findOne(id, user);

    this.assertPodeAlterar(plannedAccount, user);

    await this.plannedAccountsRepository.softRemove(plannedAccount);
  }

  async findUpcoming(user: User, days: number = 30): Promise<PlannedAccount[]> {
    const userIds = await this.scopeUserIds(user);
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    return this.plannedAccountsRepository.find({
      where: {
        userId: In(userIds),
        dueDate: Between(today, futureDate),
        status: 'pending',
      },
      order: { dueDate: 'ASC' },
    });
  }

  async findOverdue(user: User): Promise<PlannedAccount[]> {
    const userIds = await this.scopeUserIds(user);
    const today = new Date();

    return this.plannedAccountsRepository.find({
      where: {
        userId: In(userIds),
        dueDate: Between(new Date('1970-01-01'), today),
        status: 'pending',
      },
      order: { dueDate: 'ASC' },
    });
  }

  async getMonthlyPlan(
    user: User,
    month: number,
    year: number,
  ): Promise<PlannedAccount[]> {
    const userIds = await this.scopeUserIds(user);

    await this.manterRecorrentes(userIds);

    return this.plannedAccountsRepository
      .createQueryBuilder('account')
      .where('account.userId IN (:...userIds)', { userIds })
      .andWhere('EXTRACT(MONTH FROM account.dueDate) = :month', { month })
      .andWhere('EXTRACT(YEAR FROM account.dueDate) = :year', { year })
      .orderBy('account.dueDate', 'ASC')
      .getMany();
  }

  async getTotalByResponsible(
    user: User,
    responsible: string,
    status?: string,
  ): Promise<number> {
    const userIds = await this.scopeUserIds(user);

    let query = this.plannedAccountsRepository
      .createQueryBuilder('account')
      .where('account.userId IN (:...userIds)', { userIds })
      .andWhere('account.responsible = :responsible', { responsible });

    if (status) {
      query = query.andWhere('account.status = :status', { status });
    }

    const result = await query
      .select('SUM(account.amount)', 'total')
      .getRawOne();

    return Number(result?.total) || 0;
  }

  async markAsPaid(id: string, user: User): Promise<PlannedAccount> {
    const plannedAccount = await this.findOne(id, user);
    plannedAccount.status = 'paid';
    plannedAccount.paymentDate = new Date();
    return this.plannedAccountsRepository.save(plannedAccount);
  }

  async getUpcomingAlerts(user: User): Promise<any[]> {
    const upcoming = await this.findUpcoming(user, 7);
    const overdue = await this.findOverdue(user);

    return [
      ...overdue.map((account) => ({
        ...account,
        type: 'overdue',
        priority: 2,
      })),
      ...upcoming
        .filter((account) => {
          const daysUntil =
            (account.dueDate.getTime() - new Date().getTime()) /
            (1000 * 60 * 60 * 24);
          return daysUntil <= 3;
        })
        .map((account) => ({
          ...account,
          type: 'due-soon',
          priority: 1,
        })),
    ];
  }
}
