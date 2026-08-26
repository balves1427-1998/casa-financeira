import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Report } from './entities/report.entity';
import { User } from '../users/entities/user.entity';

import { FinancialDataModule } from '../financial-data/financial-data.module';
import { GoalsModule } from '../goals/goals.module';
import { SplitModule } from '../split/split.module';
import { CategoriesModule } from '../categories/categories.module';
import { PlannedAccountsModule } from '../planned-accounts/planned-accounts.module';
import { CreditCardsModule } from '../credit-cards/credit-cards.module';
import { AiModule } from '../ai/ai.module';

import { MonthlyReportService } from './services/monthly-report.service';
import { ReportExportService } from './services/report-export.service';
import { ReportsService } from './services/reports.service';
import { ReportsController } from './controllers/reports.controller';

/**
 * Módulo de Relatórios (item 28 do escopo do projeto).
 *
 * Não possui repositório de lançamentos próprio: despesas e receitas entram
 * exclusivamente pelo `FinancialDataService`, que é a porta de entrada do
 * sistema para as tabelas financeiras e já agrega por FAMÍLIA.
 *
 * Metas, rateio, orçamentos, contas planejadas, cartões e sugestões de economia
 * vêm dos módulos que já os implementam — o relatório consolida, não recalcula.
 * O repositório de `User` entra para resolver os membros da família, já que
 * contas planejadas, cartões e orçamentos são escopados por usuário.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Report, User]),
    FinancialDataModule,
    GoalsModule,
    SplitModule,
    CategoriesModule,
    PlannedAccountsModule,
    CreditCardsModule,
    AiModule,
  ],
  providers: [MonthlyReportService, ReportExportService, ReportsService],
  controllers: [ReportsController],
  exports: [MonthlyReportService, ReportsService],
})
export class ReportsModule {}
