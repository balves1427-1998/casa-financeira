import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Income } from './entities/income.entity';
import { IncomeService } from './income.service';
import { IncomeController } from './income.controller';
import { FamiliesModule } from '../families/families.module';
import { RecurrenceModule } from '../recurrence/recurrence.module';

/**
 * Módulo de Receitas.
 *
 * Importa `FamiliesModule` porque a leitura é escopada por família: qualquer
 * membro enxerga as receitas da casa, e é isso que faz o saldo fechar.
 *
 * `RecurrenceModule` porque o salário recorrente projeta as entradas dos
 * próximos meses no Planejado.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Income]),
    FamiliesModule,
    RecurrenceModule,
  ],
  providers: [IncomeService],
  controllers: [IncomeController],
  exports: [IncomeService, TypeOrmModule],
})
export class IncomeModule {}
