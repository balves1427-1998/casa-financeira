import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreditCard } from './entities/credit-card.entity';
import { CreateCreditCardDto, UpdateCreditCardDto } from './dtos/create-credit-card.dto';
import { User } from '../users/entities/user.entity';

@Injectable()
export class CreditCardsService {
  constructor(
    @InjectRepository(CreditCard)
    private creditCardsRepository: Repository<CreditCard>,
  ) {}

  async create(
    user: User,
    createCreditCardDto: CreateCreditCardDto,
  ): Promise<CreditCard> {
    const creditCard = this.creditCardsRepository.create({
      ...createCreditCardDto,
      userId: user.id,
    });

    return this.creditCardsRepository.save(creditCard);
  }

  async findAll(user: User): Promise<CreditCard[]> {
    return this.creditCardsRepository.find({
      where: { userId: user.id },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, user: User): Promise<CreditCard> {
    const creditCard = await this.creditCardsRepository.findOne({
      where: { id, userId: user.id },
    });

    if (!creditCard) {
      throw new NotFoundException('Credit card not found');
    }

    return creditCard;
  }

  async update(
    id: string,
    user: User,
    updateCreditCardDto: UpdateCreditCardDto,
  ): Promise<CreditCard> {
    const creditCard = await this.findOne(id, user);

    const safeUpdateData = { ...updateCreditCardDto };
    const updateAny = safeUpdateData as any;
    delete updateAny.userId;
    delete updateAny.createdAt;

    Object.assign(creditCard, safeUpdateData);
    return this.creditCardsRepository.save(creditCard);
  }

  async delete(id: string, user: User): Promise<void> {
    const creditCard = await this.findOne(id, user);
    await this.creditCardsRepository.softRemove(creditCard);
  }

  async getCardUtilization(id: string, user: User): Promise<any> {
    const card = await this.findOne(id, user);

    // Colunas `decimal` chegam do driver do PostgreSQL como string; sem a
    // conversão explícita os valores viram texto no JSON de resposta.
    const limit = Number(card.limit);
    const currentBalance = Number(card.currentBalance);

    const utilizationPercentage =
      limit > 0 ? (currentBalance / limit) * 100 : 0;
    const availableLimit = limit - currentBalance;

    return {
      cardId: id,
      cardName: card.name,
      limit,
      currentBalance,
      availableLimit,
      utilizationPercentage: Math.round(utilizationPercentage * 100) / 100,
      status: card.status,
    };
  }

  async getTotalUtilization(user: User): Promise<any> {
    const cards = await this.findAll(user);

    // `sum + card.limit` concatenava strings ("0" + "10000.00") em vez de somar.
    const totalLimit = cards.reduce((sum, card) => sum + Number(card.limit), 0);
    const totalBalance = cards.reduce(
      (sum, card) => sum + Number(card.currentBalance),
      0,
    );

    const utilizationPercentage = totalLimit > 0 ? (totalBalance / totalLimit) * 100 : 0;

    return {
      totalCards: cards.length,
      totalLimit,
      totalBalance,
      availableLimit: totalLimit - totalBalance,
      utilizationPercentage: Math.round(utilizationPercentage * 100) / 100,
      cards: await Promise.all(
        cards.map((card) => this.getCardUtilization(card.id, user)),
      ),
    };
  }

  async getUpcomingDueDates(user: User): Promise<any[]> {
    const cards = await this.findAll(user);
    const today = new Date();
    const currentDay = today.getDate();
    const currentMonth = today.getMonth();

    return cards
      .map((card) => {
        // O vencimento já passou neste mês; a fatura rola para o mês seguinte.
        const isOverdue = card.dueDay < currentDay;

        let daysUntilDue = card.dueDay - currentDay;
        if (daysUntilDue < 0) {
          daysUntilDue += 30; // Simple approximation
        }

        return {
          cardId: card.id,
          cardName: card.name,
          dueDay: card.dueDay,
          daysUntilDue,
          balance: Number(card.currentBalance),
          // Antes era `daysUntilDue < 0`, sempre falso após a normalização acima.
          isOverdue,
          isDueSoon: daysUntilDue <= 7,
        };
      })
      .filter((card) => card.daysUntilDue <= 30)
      .sort((a, b) => a.daysUntilDue - b.daysUntilDue);
  }

  async updateBalance(
    id: string,
    user: User,
    newBalance: number,
  ): Promise<CreditCard> {
    const creditCard = await this.findOne(id, user);
    creditCard.currentBalance = newBalance;
    return this.creditCardsRepository.save(creditCard);
  }
}
