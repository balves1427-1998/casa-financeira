import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Expense } from '../expenses/entities/expense.entity';
import { Income } from '../income/entities/income.entity';
import { PlannedAccount } from '../planned-accounts/entities/planned-account.entity';
import { RecurrenceService } from './recurrence.service';

/**
 * Módulo da recorrência.
 *
 * Existe separado porque a série é usada pelos dois lados: Despesas cria,
 * Planejado mantém a janela viva. Se o serviço morasse em qualquer um deles, o
 * outro precisaria importá-lo e os dois módulos se referenciariam em ciclo.
 *
 * As entidades entram por `forFeature`, não pelos módulos de origem, pela mesma
 * razão.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Expense, Income, PlannedAccount])],
  providers: [RecurrenceService],
  exports: [RecurrenceService],
})
export class RecurrenceModule {}
