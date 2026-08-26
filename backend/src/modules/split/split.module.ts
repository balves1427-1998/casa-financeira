import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SplitRule } from './entities/split-rule.entity';
import { SplitService } from './split.service';
import { SplitController } from './split.controller';
import { FinancialDataModule } from '../financial-data/financial-data.module';
import { IncomeModule } from '../income/income.module';

/**
 * Módulo da divisão Bruno × Giovanna (item 15 do escopo).
 *
 * Não possui repositório de despesas próprio: toda leitura de lançamentos passa
 * pelo `FinancialDataService`, que é a única porta de entrada do sistema para as
 * tabelas financeiras. O `IncomeModule` entra por causa do rateio proporcional à
 * renda, que usa a renda recorrente real de cada responsável.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([SplitRule]),
    FinancialDataModule,
    IncomeModule,
  ],
  providers: [SplitService],
  controllers: [SplitController],
  exports: [SplitService],
})
export class SplitModule {}
