import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlannedAccount } from './entities/planned-account.entity';
import { Expense } from '../expenses/entities/expense.entity';
import { Income } from '../income/entities/income.entity';
import { Account } from '../accounts/entities/account.entity';
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
    // `Expense` e `Income` entram pelo repositório: confirmar uma conta
    // planejada MATERIALIZA o lançamento real, e importar os módulos deles
    // fecharia um ciclo (ambos já dependem da recorrência).
    // `Account` entra pelo mesmo motivo: quando uma entrada prevista não tem
    // conta de destino, é preciso achar a conta padrão do usuário para poder
    // registrar a receita — antes o sistema desistia em silêncio.
    TypeOrmModule.forFeature([PlannedAccount, Expense, Income, Account]),
    FamiliesModule,
    RecurrenceModule,
  ],
  providers: [PlannedAccountsService],
  controllers: [PlannedAccountsController],
  exports: [PlannedAccountsService],
})
export class PlannedAccountsModule {}
