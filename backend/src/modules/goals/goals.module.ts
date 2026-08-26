import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Goal } from './entities/goal.entity';
import { GoalsService } from './goals.service';
import { GoalsController } from './goals.controller';
import { FamiliesModule } from '../families/families.module';

/**
 * Módulo de Metas Financeiras.
 *
 * Importa `FamiliesModule` porque a leitura é escopada por família: a reserva
 * de emergência e a viagem são da casa, e os dois responsáveis precisam
 * enxergar — e alimentar — as mesmas metas.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Goal]), FamiliesModule],
  providers: [GoalsService],
  controllers: [GoalsController],
  exports: [GoalsService, TypeOrmModule],
})
export class GoalsModule {}
