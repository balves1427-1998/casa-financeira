import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlannedAccount } from './entities/planned-account.entity';
import { PlannedAccountsService } from './planned-accounts.service';
import { PlannedAccountsController } from './planned-accounts.controller';
import { FamiliesModule } from '../families/families.module';
import { RecurrenceModule } from '../recurrence/recurrence.module';

/**
 * Módulo de Contas Planejadas.
 *
 * `FamiliesModule` porque a leitura é escopada por casa; `RecurrenceModule`
 * porque é na leitura do Planejado que a janela das despesas recorrentes é
 * reabastecida.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([PlannedAccount]),
    FamiliesModule,
    RecurrenceModule,
  ],
  providers: [PlannedAccountsService],
  controllers: [PlannedAccountsController],
  exports: [PlannedAccountsService],
})
export class PlannedAccountsModule {}
