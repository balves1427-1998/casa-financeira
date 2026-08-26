import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Income } from './entities/income.entity';
import { IncomeService } from './income.service';
import { IncomeController } from './income.controller';
import { FamiliesModule } from '../families/families.module';

/**
 * Módulo de Receitas.
 *
 * Importa `FamiliesModule` porque a leitura é escopada por família: qualquer
 * membro enxerga as receitas da casa, e é isso que faz o saldo fechar.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Income]), FamiliesModule],
  providers: [IncomeService],
  controllers: [IncomeController],
  exports: [IncomeService, TypeOrmModule],
})
export class IncomeModule {}
