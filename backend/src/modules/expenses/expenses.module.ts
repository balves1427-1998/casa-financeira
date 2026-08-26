import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Expense } from './entities/expense.entity';
import { ExpensesService } from './expenses.service';
import { ExpensesController } from './expenses.controller';
import { FamiliesModule } from '../families/families.module';

/**
 * Módulo de Despesas.
 *
 * Importa `FamiliesModule` porque a leitura é escopada por família: qualquer
 * membro enxerga as despesas da casa, e é isso que faz a lista bater com o
 * dashboard.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Expense]), FamiliesModule],
  providers: [ExpensesService],
  controllers: [ExpensesController],
  exports: [ExpensesService],
})
export class ExpensesModule {}
