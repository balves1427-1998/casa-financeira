import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Account } from './entities/account.entity';
import { CreateAccountDto, UpdateAccountDto } from './dtos/create-account.dto';
import { User } from '../users/entities/user.entity';
import { SaldoService } from '../saldo/saldo.service';

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(Account)
    private accountsRepository: Repository<Account>,
    private readonly saldoService: SaldoService,
  ) {}

  /**
   * Substitui o `balance` gravado pelo saldo derivado dos lançamentos.
   *
   * A coluna continua no banco, mas deixou de ser a verdade: ela guarda o
   * saldo INICIAL, e nada no sistema jamais a atualizou. Quem responde
   * "quanto tem na conta" é o `SaldoService`, somando o que de fato entrou e
   * saiu. Sobrescrever aqui mantém o contrato da API intacto — o frontend
   * continua lendo `account.balance` — sem herdar o número congelado.
   */
  private async comSaldoDerivado(
    user: User,
    contas: Account[],
  ): Promise<Account[]> {
    if (contas.length === 0) return contas;

    const saldo = await this.saldoService.getSaldo(user);
    const porId = new Map(saldo.porConta.map((c) => [c.accountId, c.saldo]));

    return contas.map((conta) => {
      // Cartão de crédito não tem "saldo em caixa": o que ele tem é fatura.
      if (conta.type === 'credit_card') return conta;

      const derivado = porId.get(conta.id);
      if (derivado === undefined) return conta;

      return Object.assign(conta, { balance: derivado });
    });
  }

  async create(user: User, createAccountDto: CreateAccountDto): Promise<Account> {
    const account = this.accountsRepository.create({
      ...createAccountDto,
      userId: user.id,
      balance: createAccountDto.initialBalance || 0,
    });

    return this.accountsRepository.save(account);
  }

  async findAll(user: User): Promise<Account[]> {
    const contas = await this.accountsRepository.find({
      where: { userId: user.id },
      order: { createdAt: 'DESC' },
    });

    return this.comSaldoDerivado(user, contas);
  }

  async findOne(id: string, user: User): Promise<Account> {
    const account = await this.accountsRepository.findOne({
      where: { id, userId: user.id },
    });

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    const [comSaldo] = await this.comSaldoDerivado(user, [account]);
    return comSaldo;
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

  /**
   * Saldo em caixa da casa.
   *
   * Antes somava a coluna `balance` filtrando por `userId` do usuário logado —
   * dois erros no mesmo `SELECT`: somava um número congelado no cadastro, e
   * deixava as contas do outro morador de fora enquanto contava as despesas
   * dele. Cartões também entravam na soma, somando dívida ao disponível.
   */
  async getTotalBalance(user: User): Promise<number> {
    return this.saldoService.getSaldoTotal(user);
  }

  /** Saldo aberto: quanto veio do cadastro, quanto veio dos lançamentos. */
  async getBalanceBreakdown(user: User) {
    return this.saldoService.getSaldo(user);
  }
}
