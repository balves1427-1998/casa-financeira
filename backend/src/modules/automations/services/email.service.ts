import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';
import * as nodemailer from 'nodemailer';
import { EmailLog, EmailType, EmailStatus } from '../entities/email-log.entity';
import {
  SendEmailDto,
  EmailSendResultDto,
  EmailLogDto,
  TestEmailResultDto,
} from '../dtos/email.dto';

/**
 * Serviço de Email — envio real por SMTP, com templates Handlebars.
 *
 * O QUE MUDOU E POR QUÊ
 * ---------------------
 * Este serviço NÃO enviava e-mail nenhum. O método `simulateSend` esperava
 * 100ms, sorteava 5% de falha e gravava `status = SENT` no log. Ou seja: o
 * histórico dizia "enviado" e nada tinha saído — pior do que não enviar, porque
 * escondia a ausência.
 *
 * Agora o envio é real, via `nodemailer`. E quando o SMTP não está configurado,
 * o e-mail é marcado como FALHO com o motivo explícito, nunca como enviado. Um
 * lembrete de vencimento que o sistema jura ter mandado, e que não chegou, é a
 * pior falha possível para esta funcionalidade.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private templatesCache: Map<string, HandlebarsTemplateDelegate<any>> = new Map();

  /** Criado sob demanda; nulo quando não há SMTP configurado. */
  private transporter: nodemailer.Transporter | null = null;
  private transporterVerificado = false;

  constructor(
    @InjectRepository(EmailLog)
    private emailLogRepository: Repository<EmailLog>,
  ) {
    this.registerHandlebarsHelpers();
  }

  /**
   * Qual canal de envio está configurado.
   *
   * `api` tem precedência sobre `smtp` porque é o único que funciona onde o
   * sistema roda: o plano gratuito do Render BLOQUEIA tráfego de saída nas
   * portas 25, 465 e 587, então qualquer tentativa por SMTP morre em
   * "Connection timeout" depois de dois minutos pendurada. A API do Brevo fala
   * HTTPS na 443, que passa.
   *
   * O caminho SMTP continua aqui de propósito: é o que se usa em
   * desenvolvimento (contra um servidor local) e é o que volta a valer se o
   * serviço um dia migrar para um plano pago.
   */
  get canalDeEnvio(): 'api' | 'smtp' | null {
    if (process.env.BREVO_API_KEY) return 'api';
    if (
      process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASSWORD
    ) {
      return 'smtp';
    }
    return null;
  }

  /**
   * Diz se o envio de e-mail está configurado.
   *
   * Usado pelo motor de lembretes para avisar no log — e pelo endpoint de
   * diagnóstico — em vez de acumular falhas silenciosas. O nome ficou de
   * quando SMTP era o único caminho; hoje significa "há como entregar".
   */
  get smtpConfigurado(): boolean {
    return this.canalDeEnvio !== null;
  }

  /** Remetente declarado nas variáveis de ambiente. */
  private get remetente(): { email: string; nome: string } {
    const bruto =
      process.env.EMAIL_FROM ||
      process.env.SMTP_USER ||
      'nao-responda@casa-financeira';

    // Aceita tanto "fulano@x.com" quanto "Nome <fulano@x.com>".
    const comNome = bruto.match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/);
    return comNome
      ? { nome: comNome[1] || 'Controle Financeiro da Casa', email: comNome[2] }
      : { nome: 'Controle Financeiro da Casa', email: bruto };
  }

  /**
   * Transporter SMTP, criado na primeira necessidade.
   *
   * As credenciais vêm SEMPRE de variáveis de ambiente — nunca do banco, nunca
   * de parâmetro de requisição. Senha de e-mail não trafega pela API.
   */
  private getTransporter(): nodemailer.Transporter | null {
    if (this.canalDeEnvio !== 'smtp') {
      return null;
    }

    if (this.transporter) {
      return this.transporter;
    }

    const porta = Number(process.env.SMTP_PORT) || 587;

    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: porta,
      // 465 é TLS implícito; 587 usa STARTTLS, negociado depois da conexão.
      secure: porta === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
      // Sem estes limites o nodemailer fica pendurado ~2 minutos quando a
      // porta está bloqueada — tempo suficiente para o disparo inteiro estourar
      // o timeout de quem o chamou, sem nunca dizer o que houve.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });

    return this.transporter;
  }

  /**
   * Entrega via API HTTP do Brevo.
   *
   * Devolve o messageId. Erros sobem com o corpo da resposta junto: uma chave
   * inválida ou um remetente não verificado precisam aparecer no histórico com
   * o motivo, senão o usuário fica sem saber por que nada chegou.
   */
  private async enviarPelaApi(emailLog: EmailLog): Promise<string> {
    const de = this.remetente;
    const limite = Number(process.env.EMAIL_HTTP_TIMEOUT_MS) || 20_000;
    const controlador = new AbortController();
    const expira = setTimeout(() => controlador.abort(), limite);

    try {
      const resposta = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': process.env.BREVO_API_KEY as string,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          sender: { name: de.nome, email: de.email },
          to: [{ email: emailLog.recipient }],
          subject: emailLog.subject,
          htmlContent: emailLog.htmlContent,
        }),
        signal: controlador.signal,
      });

      const corpo = await resposta.text();

      if (!resposta.ok) {
        throw new Error(
          `Brevo respondeu ${resposta.status}: ${corpo.slice(0, 300)}`,
        );
      }

      try {
        return (JSON.parse(corpo).messageId as string) || 'brevo';
      } catch {
        return 'brevo';
      }
    } catch (erro) {
      if (erro instanceof Error && erro.name === 'AbortError') {
        throw new Error(`Brevo não respondeu em ${limite / 1000}s.`);
      }
      throw erro;
    } finally {
      clearTimeout(expira);
    }
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

      // Envio síncrono: o volume aqui é de poucas mensagens por dia, e
      // enfileirar acrescentaria uma peça a mais para falhar.
      await this.entregar(savedLog);

      this.logger.log(
        `Email enfileirado para ${dto.recipient}: ${dto.subject} (${dto.type})`,
      );

      return {
        success: true,
        emailLogId: savedLog.id,
        recipient: savedLog.recipient,
        sentAt: new Date(),
        messageId: savedLog.messageId,
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
          await this.entregar(email);
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
   * Envia o e-mail de verdade e atualiza o log com o resultado.
   *
   * Nunca marca como enviado sem ter enviado: sem SMTP configurado, o registro
   * fica FAILED com o motivo. É o que permite descobrir, olhando o histórico,
   * por que um lembrete não chegou.
   */
  private async entregar(emailLog: EmailLog): Promise<void> {
    const canal = this.canalDeEnvio;

    if (canal === null) {
      emailLog.status = EmailStatus.FAILED;
      emailLog.errorMessage =
        'Nenhum canal de envio configurado. Defina BREVO_API_KEY e EMAIL_FROM ' +
        '(recomendado) ou SMTP_HOST, SMTP_PORT, SMTP_USER e SMTP_PASSWORD nas ' +
        'variáveis de ambiente do servidor.';

      await this.emailLogRepository.save(emailLog);

      // Um aviso por processo: repetir a cada e-mail encheria o log sem
      // acrescentar informação.
      if (!this.transporterVerificado) {
        this.transporterVerificado = true;
        this.logger.warn(
          'Envio de e-mail não configurado: nada será entregue. Os lembretes ' +
            'continuam sendo registrados e aparecem como alerta na aplicação.',
        );
      }

      throw new Error(emailLog.errorMessage);
    }

    try {
      let messageId: string;

      if (canal === 'api') {
        messageId = await this.enviarPelaApi(emailLog);
      } else {
        const de = this.remetente;
        const resultado = await this.getTransporter()!.sendMail({
          from: `"${de.nome}" <${de.email}>`,
          to: emailLog.recipient,
          subject: emailLog.subject,
          html: emailLog.htmlContent,
        });
        messageId = resultado.messageId;
      }

      emailLog.status = EmailStatus.SENT;
      emailLog.sentAt = new Date();
      emailLog.messageId = messageId;

      await this.emailLogRepository.save(emailLog);

      this.logger.log(
        `E-mail entregue a ${emailLog.recipient} (${emailLog.type})`,
      );
    } catch (erro) {
      emailLog.status = EmailStatus.FAILED;
      emailLog.errorMessage =
        erro instanceof Error ? erro.message : String(erro);

      await this.emailLogRepository.save(emailLog);

      this.logger.error(
        `Falha ao entregar e-mail a ${emailLog.recipient}: ${emailLog.errorMessage}`,
      );

      throw erro;
    }
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
