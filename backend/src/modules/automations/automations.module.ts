import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ReportSchedule } from './entities/report-schedule.entity';
import { Alert } from './entities/alert.entity';
import { EmailLog } from './entities/email-log.entity';
import { Webhook } from './entities/webhook.entity';
import { WebhookDelivery } from './entities/webhook-delivery.entity';
import { PaymentReminder } from './entities/payment-reminder.entity';
import { PlannedAccount } from '../planned-accounts/entities/planned-account.entity';
import { Expense } from '../expenses/entities/expense.entity';
import { User } from '../users/entities/user.entity';
import { ReportSchedulerService } from './services/report-scheduler.service';
import { AlertService } from './services/alert.service';
import { EmailService } from './services/email.service';
import { WebhookService } from './services/webhook.service';
import { ReportScheduleController } from './controllers/report-schedule.controller';
import { AlertController } from './controllers/alert.controller';
import { EmailController } from './controllers/email.controller';
import { WebhookController } from './controllers/webhook.controller';
import { PaymentReminderService } from './services/payment-reminder.service';
import { PaymentReminderController } from './controllers/payment-reminder.controller';

/**
 * Módulo de Automações - Seção A Fase 4
 *
 * Responsável por:
 * - Agendamento de relatórios (cron jobs, Bull queue)
 * - Sistema de alertas (5 tipos de alerta com severidade)
 * - Email automation (integrado com notificações)
 * - Webhook integrations (retries com exponential backoff)
 *
 * Importar em app.module.ts:
 * imports: [
 *   ...
 *   AutomationsModule,
 * ]
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ReportSchedule,
      Alert,
      EmailLog,
      Webhook,
      WebhookDelivery,
      // Lembretes de vencimento: `PlannedAccount`, `Expense` e `User` entram
      // pelo repositório para não importar os módulos deles aqui.
      //
      // `Expense` porque o aviso também cobre despesa ainda não paga: a
      // primeira ocorrência de uma recorrente não vira conta planejada, e sem
      // isso ela vencia em silêncio.
      PaymentReminder,
      PlannedAccount,
      Expense,
      User,
    ]),
    ScheduleModule.forRoot(), // Necessário para @Cron decorators
  ],
  controllers: [
    ReportScheduleController,
    AlertController,
    EmailController,
    WebhookController,
    PaymentReminderController,
  ],
  providers: [
    ReportSchedulerService,
    AlertService,
    EmailService,
    WebhookService,
    PaymentReminderService,
  ],
  exports: [
    ReportSchedulerService,
    AlertService,
    EmailService,
    WebhookService,
    PaymentReminderService,
  ],
})
export class AutomationsModule {}
