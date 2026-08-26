import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Account } from './entities/account.entity';
import { CreateAccountDto, UpdateAccountDto } from './dtos/create-account.dto';
import { User } from '../users/entities/user.entity';

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(Account)
    private accountsRepository: Repository<Account>,
  ) {}

  async create(user: User, createAccountDto: CreateAccountDto): Promise<Account> {
    const account = this.accountsRepository.create({
      ...createAccountDto,
      userId: user.id,
      balance: createAccountDto.initialBalance || 0,
    });

    return this.accountsRepository.save(account);
  }

  async findAll(user: User): Promise<Account[]> {
    return this.accountsRepository.find({
      where: { userId: user.id },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, user: User): Promise<Account> {
    const account = await this.accountsRepository.findOne({
      where: { id, userId: user.id },
    });

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    return account;
  }

  async update(
    id: string,
    user: User,
    updateData: UpdateAccountDto,
  ): Promise<Account> {
    const account = await this.findOne(id, user);

    // Prevent updating certain fields
    const safeUpdateData = { ...updateData };
    const updateAny = safeUpdateData as any;
    delete updateAny.userId;
    delete updateAny.createdAt;

    Object.assign(account, safeUpdateData);
    return this.accountsRepository.save(account);
  }

  async delete(id: string, user: User): Promise<void> {
    const account = await this.findOne(id, user);
    await this.accountsRepository.softRemove(account);
  }

  async getTotalBalance(user: User): Promise<number> {
    const result = await this.accountsRepository
      .createQueryBuilder('account')
      .where('account.userId = :userId', { userId: user.id })
      .select('SUM(account.balance)', 'total')
      .getRawOne();

    return parseFloat(result.total) || 0;
  }
}
