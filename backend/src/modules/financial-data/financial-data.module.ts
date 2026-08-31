import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FinancialDataService } from './financial-data.service';
import { Expense } from '../expenses/entities/expense.entity';
import { Income } from '../income/entities/income.entity';
import { Account } from '../accounts/entities/account.entity';
import { User } from '../users/entities/user.entity';
import { PlannedAccount } from '../planned-accounts/entities/planned-account.entity';
import { CreditCard } from '../credit-cards/entities/credit-card.entity';
import { Goal } from '../goals/entities/goal.entity';

/**
 * Módulo da camada de leitura dos dados financeiros da família.
 *
 * Exporta apenas o `FinancialDataService`, que é a porta de entrada dos
 * módulos analíticos (IA hoje; relatórios avançados na sequência) para as
 * tabelas de lançamentos.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Expense,
      Income,
      Account,
      User,
      // Planejado, cartões e investimentos entram porque o assistente
      // respondia "não sei" para perguntas cujos dados o sistema já tinha.
      PlannedAccount,
      CreditCard,
      Goal,
    ]),
  ],
  providers: [FinancialDataService],
  exports: [FinancialDataService],
})
export class FinancialDataModule {}
