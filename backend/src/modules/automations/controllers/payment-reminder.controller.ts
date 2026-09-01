import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { GetCurrentUser } from '../../../common/decorators/get-current-user.decorator';
import { User } from '../../users/entities/user.entity';
import {
  PaymentReminderService,
  ResultadoDoDisparo,
} from '../services/payment-reminder.service';
import { JanelaLembrete } from '../entities/payment-reminder.entity';

/**
 * Disparo dos lembretes de vencimento.
 *
 * POR QUE EXISTE UM ENDPOINT, SE JÁ HÁ UM AGENDADOR INTERNO
 * ---------------------------------------------------------
 * No plano gratuito do Render o serviço HIBERNA depois de ~15 minutos sem
 * tráfego. Um `@Cron` vive dentro do processo: com o processo dormindo às 10h,
 * o disparo simplesmente não acontece — e o usuário não recebe aviso nenhum,
 * sem nenhum erro aparecer em lugar algum.
 *
 * Este endpoint permite que um agendador EXTERNO e gratuito (cron-job.org,
 * UptimeRobot e afins) chame o disparo no horário certo. A chamada acorda o
 * serviço e executa o envio. Os dois caminhos convivem sem duplicar nada: cada
 * lembrete é registrado com índice único por (conta, dia, janela).
 *
 * A rota é protegida por um segredo em cabeçalho, e não por JWT, porque quem
 * chama é uma máquina que não faz login. Sem `REMINDER_DISPATCH_TOKEN`
 * configurado, a rota recusa qualquer chamada — deixá-la aberta permitiria que
 * qualquer um disparasse e-mails para a casa.
 */
@Controller('reminders')
export class PaymentReminderController {
  constructor(private readonly reminderService: PaymentReminderService) {}

  /**
   * POST /reminders/dispatch
   *
   * Chamado pelo agendador externo. Cabeçalho `x-reminder-token`.
   */
  @Post('dispatch')
  @HttpCode(HttpStatus.OK)
  async dispatch(
    @Headers('x-reminder-token') token: string,
    @Body() body: { window?: string },
  ): Promise<ResultadoDoDisparo> {
    const esperado = process.env.REMINDER_DISPATCH_TOKEN;

    if (!esperado) {
      throw new ForbiddenException(
        'Disparo externo desativado: defina REMINDER_DISPATCH_TOKEN no servidor.',
      );
    }

    if (token !== esperado) {
      throw new ForbiddenException('Token de disparo inválido.');
    }

    const janela = this.resolverJanela(body?.window);

    return this.reminderService.dispatch(janela);
  }

  /**
   * GET /reminders/status
   *
   * Diagnóstico para o usuário logado: diz se o envio de e-mail está
   * configurado e se o disparo externo está habilitado. Serve para responder
   * "por que não recebi o aviso?" sem precisar abrir o log do servidor.
   */
  @Get('status')
  @UseGuards(JwtAuthGuard)
  async status(@GetCurrentUser() _user: User) {
    return this.reminderService.getStatus();
  }

  /**
   * POST /reminders/test
   *
   * Executa o disparo agora, para o usuário logado conferir o funcionamento.
   * Respeita a mesma idempotência: se o aviso do dia já saiu, não sai de novo.
   */
  @Post('test')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async test(
    @GetCurrentUser() _user: User,
    @Body() body: { window?: string },
  ): Promise<ResultadoDoDisparo> {
    return this.reminderService.dispatch(this.resolverJanela(body?.window));
  }

  /**
   * A janela é obrigatória e só aceita os dois valores previstos: um terceiro
   * valor furaria a idempotência, permitindo um envio extra por dia.
   */
  private resolverJanela(valor?: string): JanelaLembrete {
    if (valor === 'morning' || valor === 'evening') {
      return valor;
    }

    if (valor) {
      throw new BadRequestException(
        'Janela inválida. Use "morning" (10h) ou "evening" (19h).',
      );
    }

    // Sem janela informada, decide pelo horário de Brasília: antes das 15h é a
    // janela da manhã.
    const horaBrasilia = Number(
      new Date().toLocaleString('en-US', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        hour12: false,
      }),
    );

    return horaBrasilia < 15 ? 'morning' : 'evening';
  }
}
