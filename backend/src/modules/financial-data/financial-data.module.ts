import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FinancialDataService } from './financial-data.service';
import { Expense } from '../expenses/entities/expense.entity';
import { Income } from '../income/entities/income.entity';
import { Account } from '../accounts/entities/account.entity';
import { User } from '../users/entities/user.entity';

/**
 * Módulo da camada de leitura dos dados financeiros da família.
 *
 * Exporta apenas o `FinancialDataService`, que é a porta de entrada dos
 * módulos analíticos (IA hoje; relatórios avançados na sequência) para as
 * tabelas de lançamentos.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Expense, Income, Account, User])],
  providers: [FinancialDataService],
  exports: [FinancialDataService],
})
export class FinancialDataModule {}
