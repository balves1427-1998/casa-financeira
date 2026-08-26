import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ReportSchedule } from './entities/report-schedule.entity';
import { Alert } from './entities/alert.entity';
import { EmailLog } from './entities/email-log.entity';
import { Webhook } from './entities/webhook.entity';
import { WebhookDelivery } from './entities/webhook-delivery.entity';
import { ReportSchedulerService } from './services/report-scheduler.service';
import { AlertService } from './services/alert.service';
import { EmailService } from './services/email.service';
import { WebhookService } from './services/webhook.service';
import { ReportScheduleController } from './controllers/report-schedule.controller';
import { AlertController } from './controllers/alert.controller';
import { EmailController } from './controllers/email.controller';
import { WebhookController } from './controllers/webhook.controller';

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
    TypeOrmModule.forFeature([ReportSchedule, Alert, EmailLog, Webhook, WebhookDelivery]),
    ScheduleModule.forRoot(), // Necessário para @Cron decorators
  ],
  controllers: [ReportScheduleController, AlertController, EmailController, WebhookController],
  providers: [ReportSchedulerService, AlertService, EmailService, WebhookService],
  exports: [ReportSchedulerService, AlertService, EmailService, WebhookService],
})
export class AutomationsModule {}
