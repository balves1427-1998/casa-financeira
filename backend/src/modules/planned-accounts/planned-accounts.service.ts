import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { PlannedAccount } from './entities/planned-account.entity';
import {
  CreatePlannedAccountDto,
  UpdatePlannedAccountDto,
} from './dtos/create-planned-account.dto';
import { User } from '../users/entities/user.entity';

@Injectable()
export class PlannedAccountsService {
  constructor(
    @InjectRepository(PlannedAccount)
    private plannedAccountsRepository: Repository<PlannedAccount>,
  ) {}

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
    return this.plannedAccountsRepository.find({
      where: { userId: user.id },
      order: { dueDate: 'ASC' },
    });
  }

  async findOne(id: string, user: User): Promise<PlannedAccount> {
    const plannedAccount = await this.plannedAccountsRepository.findOne({
      where: { id, userId: user.id },
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
    await this.plannedAccountsRepository.softRemove(plannedAccount);
  }

  async findUpcoming(user: User, days: number = 30): Promise<PlannedAccount[]> {
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    return this.plannedAccountsRepository.find({
      where: {
        userId: user.id,
        dueDate: Between(today, futureDate),
        status: 'pending',
      },
      order: { dueDate: 'ASC' },
    });
  }

  async findOverdue(user: User): Promise<PlannedAccount[]> {
    const today = new Date();

    return this.plannedAccountsRepository.find({
      where: {
        userId: user.id,
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
    return this.plannedAccountsRepository
      .createQueryBuilder('account')
      .where('account.userId = :userId', { userId: user.id })
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
    let query = this.plannedAccountsRepository
      .createQueryBuilder('account')
      .where('account.userId = :userId', { userId: user.id })
      .andWhere('account.responsible = :responsible', { responsible });

    if (status) {
      query = query.andWhere('account.status = :status', { status });
    }

    const result = await query
      .select('SUM(account.amount)', 'total')
      .getRawOne();

    return parseFloat(result.total) || 0;
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
