import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bull';

// Modules
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { FamiliesModule } from './modules/families/families.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { IncomeModule } from './modules/income/income.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { CreditCardsModule } from './modules/credit-cards/credit-cards.module';
import { PlannedAccountsModule } from './modules/planned-accounts/planned-accounts.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { ReportsModule } from './modules/reports/reports.module';
import { AutomationsModule } from './modules/automations/automations.module';
import { ForecastingModule } from './modules/forecasting/forecasting.module';
import { CashFlowModule } from './modules/cash-flow/cash-flow.module';
import { PdfImportModule } from './modules/pdf-import/pdf-import.module';
import { ClassificationRulesModule } from './modules/classification-rules/classification-rules.module';
import { MLClassifierModule } from './modules/ml-classifier/ml-classifier.module';
import { AiModule } from './modules/ai/ai.module';
import { GoalsModule } from './modules/goals/goals.module';
import { SplitModule } from './modules/split/split.module';

@Module({
  imports: [
    // Environment Variables
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.development', '.env'],
    }),

    // Database
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST'),
        port: config.get('DB_PORT'),
        username: config.get('DB_USER'),
        password: config.get('DB_PASSWORD'),
        database: config.get('DB_NAME'),
        entities: [`${__dirname}/**/entities/*.entity{.ts,.js}`],
        migrations: [`${__dirname}/database/migrations/*{.ts,.js}`],
        synchronize: false,
        logging: process.env.NODE_ENV === 'development',
        migrationsRun: false,
      }),
    }),

    // Redis / Queue
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get('REDIS_HOST'),
          port: config.get('REDIS_PORT'),
        },
      }),
    }),

    // Scheduling
    ScheduleModule.forRoot(),

    // Feature Modules
    AuthModule,
    UsersModule,
    FamiliesModule,
    AccountsModule,
    IncomeModule,
    ExpensesModule,
    CategoriesModule,
    CreditCardsModule,
    PlannedAccountsModule,
    GoalsModule,
    ForecastingModule,
    CashFlowModule,
    PdfImportModule,
    ClassificationRulesModule,
    MLClassifierModule,
    AiModule,
    SplitModule,
    AnalyticsModule,
    ReportsModule,
    AutomationsModule,
  ],
  providers: [],
})
export class AppModule {}
