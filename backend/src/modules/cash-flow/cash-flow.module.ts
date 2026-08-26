import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashFlowController } from './controllers/cash-flow.controller';
import { CashFlowService } from './services/cash-flow.service';
import { CashFlowSnapshot } from './entities/cash-flow-snapshot.entity';
import { Expense } from '../expenses/entities/expense.entity';
import { Income } from '../income/entities/income.entity';
import { PlannedAccount } from '../planned-accounts/entities/planned-account.entity';
import { CreditCard } from '../credit-cards/entities/credit-card.entity';
import { Account } from '../accounts/entities/account.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CashFlowSnapshot,
      Expense,
      Income,
      PlannedAccount,
      CreditCard,
      Account,
    ]),
  ],
  controllers: [CashFlowController],
  providers: [CashFlowService],
  exports: [CashFlowService],
})
export class CashFlowModule {}
