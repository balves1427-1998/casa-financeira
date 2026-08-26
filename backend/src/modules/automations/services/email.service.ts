import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';
import { EmailLog, EmailType, EmailStatus } from '../entities/email-log.entity';
import {
  SendEmailDto,
  EmailSendResultDto,
  EmailLogDto,
  TestEmailResultDto,
} from '../dtos/email.dto';

/**
 * Serviço de Email com suporte a templates Handlebars
 * Integra-se com providers SMTP/SES
 * Suporta enfileiramento via Bull (futuro)
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private templatesCache: Map<string, HandlebarsTemplateDelegate<any>> = new Map();

  constructor(
    @InjectRepository(EmailLog)
    private emailLogRepository: Repository<EmailLog>,
  ) {
    this.registerHandlebarsHelpers();
  }

  /**
   * Enviar email renderizando template
   */
  async sendEmail(userId: string, dto: SendEmailDto): Promise<EmailSendResultDto> {
    try {
      // Validar template
      const template = this.loadTemplate(dto.templateName);
      if (!template) {
        throw new BadRequestException(`Template '${dto.templateName}' não encontrado`);
      }

      // Renderizar template com dados
      const htmlContent = template(dto.templateData || {});

      // Criar log de email
      const emailLog = this.emailLogRepository.create({
        userId,
        recipient: dto.recipient,
        type: dto.type,
        subject: dto.subject,
        templateName: dto.templateName,
        templateData: dto.templateData,
        htmlContent,
        status: EmailStatus.PENDING,
        relatedEntityId: dto.relatedEntityId,
        relatedEntityType: dto.relatedEntityType,
      });

      const savedLog = await this.emailLogRepository.save(emailLog);

      // Aqui seria enfileirado em Bull para envio assíncrono
      // Por enquanto, simular envio
      await this.simulateSend(savedLog);

      this.logger.log(
        `Email enfileirado para ${dto.recipient}: ${dto.subject} (${dto.type})`,
      );

      return {
        success: true,
        emailLogId: savedLog.id,
        recipient: savedLog.recipient,
        sentAt: new Date(),
        messageId: `msg-${Date.now()}`, // Mock message ID
      };
    } catch (error) {
      this.logger.error(`Erro ao enviar email: ${error.message}`, error.stack);

      throw new BadRequestException(
        `Falha ao enviar email: ${error.message}`,
      );
    }
  }

  /**
   * Enviar email de teste
   */
  async sendTestEmail(userId: string, recipient: string): Promise<TestEmailResultDto> {
    try {
      const result = await this.sendEmail(userId, {
        recipient,
        type: EmailType.NOTIFICATION,
        subject: 'Casa Financeira - Email de Teste',
        templateName: 'test-email',
        templateData: {
          userName: 'Usuário',
          reportEmails: true,
          alertEmails: true,
          weeklyEmails: true,
          preferencesLink: 'https://seu-app.com/preferences',
          unsubscribeLink: 'https://seu-app.com/unsubscribe',
        },
      });

      return {
        success: true,
        message: 'Email de teste enviado com sucesso',
        recipient,
        sentAt: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        message: 'Falha ao enviar email de teste',
        recipient,
        sentAt: new Date(),
        error: error.message,
      };
    }
  }

  /**
   * Listar emails de um usuário
   */
  async listEmailLogs(
    userId: string,
    options?: {
      type?: EmailType;
      status?: EmailStatus;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ logs: EmailLogDto[]; total: number; pendingCount: number; failedCount: number }> {
    const query = this.emailLogRepository.createQueryBuilder('email')
      .where('email.userId = :userId', { userId });

    if (options?.type) {
      query.andWhere('email.type = :type', { type: options.type });
    }

    if (options?.status) {
      query.andWhere('email.status = :status', { status: options.status });
    }

    const total = await query.getCount();

    const pendingCount = await query.clone()
      .andWhere('email.status = :status', { status: EmailStatus.PENDING })
      .getCount();

    const failedCount = await query.clone()
      .andWhere('email.status = :status', { status: EmailStatus.FAILED })
      .getCount();

    const logs = await query
      .orderBy('email.createdAt', 'DESC')
      .limit(options?.limit || 50)
      .offset(options?.offset || 0)
      .getMany();

    return {
      logs: logs.map((l) => this.toDto(l)),
      total,
      pendingCount,
      failedCount,
    };
  }

  /**
   * Retentativas de emails falhados
   * Chamado por cron job
   */
  async retryFailedEmails(): Promise<number> {
    const maxRetries = 5;
    const failedEmails = await this.emailLogRepository.find({
      where: {
        status: EmailStatus.FAILED,
      },
    });

    let retryCount = 0;

    for (const email of failedEmails) {
      if (email.retryCount < maxRetries) {
        try {
          await this.simulateSend(email);
          email.retryCount++;
          email.status = EmailStatus.SENT;
          email.sentAt = new Date();
          await this.emailLogRepository.save(email);
          retryCount++;
        } catch (error) {
          email.retryCount++;
          email.errorMessage = error.message;

          if (email.retryCount >= maxRetries) {
            email.status = EmailStatus.BOUNCED;
            this.logger.error(
              `Email ${email.id} atingiu máximo de retentativas`,
            );
          }

          await this.emailLogRepository.save(email);
        }
      }
    }

    this.logger.log(`Retentativas de email: ${retryCount} sucesso(s)`);
    return retryCount;
  }

  /**
   * Carregar template Handlebars
   */
  private loadTemplate(
    templateName: string,
  ): HandlebarsTemplateDelegate<any> | undefined {
    // Verificar cache
    if (this.templatesCache.has(templateName)) {
      return this.templatesCache.get(templateName);
    }

    // Carregar do arquivo
    const templatePath = path.join(
      __dirname,
      '../templates',
      `${templateName}.hbs`,
    );

    try {
      const templateSource = fs.readFileSync(templatePath, 'utf-8');
      const template = handlebars.compile(templateSource);
      this.templatesCache.set(templateName, template);
      return template;
    } catch (error) {
      this.logger.error(`Falha ao carregar template ${templateName}: ${error.message}`);
      return undefined;
    }
  }

  /**
   * Registrar helpers customizados para Handlebars
   */
  private registerHandlebarsHelpers(): void {
    // Helper para formatação de moeda
    handlebars.registerHelper('currency', (value: number) => {
      if (!value) return 'R$ 0,00';
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }).format(value);
    });

    // Helper para formatação de data
    handlebars.registerHelper('date', (date: Date, format: string) => {
      if (!date) return '';
      const d = new Date(date);
      return new Intl.DateTimeFormat('pt-BR').format(d);
    });

    // Helper para comparação >= (não built-in no Handlebars)
    handlebars.registerHelper('gte', (a, b) => {
      return a >= b;
    });

    // Helper para comparação <= (não built-in)
    handlebars.registerHelper('lte', (a, b) => {
      return a <= b;
    });

    // Helper para colorir texto
    handlebars.registerHelper('colorIf', (condition: boolean, color: string) => {
      return condition ? color : '#333';
    });
  }

  /**
   * Simular envio de email (antes de integração real com SES/SMTP)
   */
  private async simulateSend(emailLog: EmailLog): Promise<void> {
    // Simular delay de envio
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Simular 95% de sucesso (5% de falha)
    const willFail = Math.random() < 0.05;

    if (willFail) {
      throw new Error('Falha simulada ao enviar email');
    }

    emailLog.status = EmailStatus.SENT;
    emailLog.sentAt = new Date();
    emailLog.messageId = `msg-${Date.now()}-${Math.random().toString(36)}`;

    await this.emailLogRepository.save(emailLog);

    this.logger.debug(
      `Email simulado enviado para ${emailLog.recipient} (${emailLog.type})`,
    );
  }

  /**
   * Converter entidade para DTO
   */
  private toDto(emailLog: EmailLog): EmailLogDto {
    return {
      id: emailLog.id,
      userId: emailLog.userId,
      recipient: emailLog.recipient,
      type: emailLog.type,
      subject: emailLog.subject,
      templateName: emailLog.templateName,
      status: emailLog.status,
      retryCount: emailLog.retryCount,
      sentAt: emailLog.sentAt,
      openedAt: emailLog.openedAt,
      errorMessage: emailLog.errorMessage,
      createdAt: emailLog.createdAt,
    };
  }
}
