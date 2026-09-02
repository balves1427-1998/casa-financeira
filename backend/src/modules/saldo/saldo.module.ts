import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SaldoService } from './saldo.service';
import { Account } from '../accounts/entities/account.entity';
import { Expense } from '../expenses/entities/expense.entity';
import { Income } from '../income/entities/income.entity';
import { PlannedAccount } from '../planned-accounts/entities/planned-account.entity';
import { FamiliesModule } from '../families/families.module';

/**
 * Módulo do saldo derivado.
 *
 * Fica sozinho, e não dentro de Contas ou do Fluxo de Caixa, porque os dois
 * precisam dele: se cada um calculasse o seu, o "saldo em caixa" da aba
 * Despesas e o "saldo até hoje" do extrato voltariam a divergir — que é
 * exatamente o problema que este módulo existe para não deixar acontecer.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Account, Expense, Income, PlannedAccount]),
    FamiliesModule,
  ],
  providers: [SaldoService],
  exports: [SaldoService],
})
export class SaldoModule {}
