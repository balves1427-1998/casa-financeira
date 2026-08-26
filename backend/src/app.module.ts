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
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    // Environment Variables
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.development', '.env'],
    }),

    // Database
    //
    // Serviços gerenciados (Railway, Render, Heroku, Neon, Supabase) entregam
    // UMA `DATABASE_URL` em vez de host/porta/usuário separados, e quase sempre
    // exigem TLS. Sem tratar os dois casos, o deploy falha na conexão.
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('DATABASE_URL');

        const base = {
          type: 'postgres' as const,
          entities: [`${__dirname}/**/entities/*.entity{.ts,.js}`],
          migrations: [`${__dirname}/database/migrations/*{.ts,.js}`],
          synchronize: false,
          logging: config.get('NODE_ENV') === 'development',
          migrationsRun: false,
          // O certificado dos bancos gerenciados costuma ser assinado por uma
          // CA que o Node não conhece; `rejectUnauthorized: false` mantém a
          // conexão criptografada sem exigir a cadeia completa.
          ssl:
            config.get('DB_SSL') === 'true'
              ? { rejectUnauthorized: false }
              : false,
        };

        return url
          ? { ...base, url }
          : {
              ...base,
              host: config.get<string>('DB_HOST'),
              port: parseInt(config.get<string>('DB_PORT') || '5432', 10),
              username: config.get<string>('DB_USER'),
              password: config.get<string>('DB_PASSWORD'),
              database: config.get<string>('DB_NAME'),
            };
      },
    }),

    // Redis / Queue
    //
    // Mesma lógica: em produção normalmente chega `REDIS_URL`.
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('REDIS_URL');

        if (url) {
          return { url };
        }

        return {
          redis: {
            host: config.get<string>('REDIS_HOST') || 'localhost',
            port: parseInt(config.get<string>('REDIS_PORT') || '6379', 10),
          },
        };
      },
    }),

    // Scheduling
    ScheduleModule.forRoot(),

    // Feature Modules
    // Health check — precisa estar disponível para a plataforma de deploy
    HealthModule,
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
