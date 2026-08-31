import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreditCard } from './entities/credit-card.entity';
import { CreditCardsService } from './credit-cards.service';
import { CreditCardsController } from './credit-cards.controller';
import { CardStatementService } from './services/card-statement.service';
import { Expense } from '../expenses/entities/expense.entity';
import { FamiliesModule } from '../families/families.module';

/**
 * Módulo de Cartões.
 *
 * `Expense` entra pelo repositório porque a fatura, o limite utilizado e o
 * histórico são DERIVADOS dos lançamentos — não de um saldo digitado à mão.
 * `FamiliesModule` porque o cartão é da casa: qualquer membro precisa enxergar
 * o que foi gasto nele.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([CreditCard, Expense]),
    FamiliesModule,
  ],
  providers: [CreditCardsService, CardStatementService],
  controllers: [CreditCardsController],
  exports: [CreditCardsService, CardStatementService],
})
export class CreditCardsModule {}
