import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../../users/entities/user.entity';
import { EmailService } from '../services/email.service';
import {
  SendEmailDto,
  TestEmailDto,
  TestEmailResultDto,
  EmailSendResultDto,
  ListEmailLogsDto,
  EmailType,
  EmailStatus,
} from '../dtos/email.dto';

/**
 * Controller para gerenciamento de emails
 * Endpoints para envio, templates, preferências e histórico
 */
@Controller('emails')
@UseGuards(JwtAuthGuard)
export class EmailController {
  constructor(private emailService: EmailService) {}

  /**
   * POST /emails/send
   * Enviar email com template
   */
  @Post('send')
  @HttpCode(HttpStatus.ACCEPTED)
  async sendEmail(
    @CurrentUser() user: User,
    @Body() dto: SendEmailDto,
  ): Promise<EmailSendResultDto> {
    return this.emailService.sendEmail(user.id, dto);
  }

  /**
   * POST /emails/test
   * Enviar email de teste para validar configuração
   */
  @Post('test')
  @HttpCode(HttpStatus.ACCEPTED)
  async sendTestEmail(
    @CurrentUser() user: User,
    @Body() dto: TestEmailDto,
  ): Promise<TestEmailResultDto> {
    return this.emailService.sendTestEmail(user.id, dto.recipient);
  }

  /**
   * GET /emails/logs
   * Listar histórico de emails enviados
   */
  @Get('logs')
  async listEmailLogs(
    @CurrentUser() user: User,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('limit') limit: number = 50,
    @Query('offset') offset: number = 0,
  ): Promise<ListEmailLogsDto> {
    return this.emailService.listEmailLogs(user.id, {
      type: type as EmailType,
      status: status as EmailStatus,
      limit: Math.min(limit, 100),
      offset,
    });
  }

  /**
   * POST /emails/retry-failed
   * Retentativas de emails que falharam
   * Normalmente chamado por cron job
   */
  @Post('retry-failed')
  @HttpCode(HttpStatus.OK)
  async retryFailedEmails(): Promise<{ retriedCount: number }> {
    const count = await this.emailService.retryFailedEmails();
    return { retriedCount: count };
  }
}
