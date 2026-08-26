import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlannedAccount } from './entities/planned-account.entity';
import { PlannedAccountsService } from './planned-accounts.service';
import { PlannedAccountsController } from './planned-accounts.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PlannedAccount])],
  providers: [PlannedAccountsService],
  controllers: [PlannedAccountsController],
  exports: [PlannedAccountsService],
})
export class PlannedAccountsModule {}
