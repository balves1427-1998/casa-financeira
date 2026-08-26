import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Query,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../../users/entities/user.entity';
import { WebhookService } from '../services/webhook.service';
import {
  CreateWebhookDto,
  UpdateWebhookDto,
  ListWebhooksDto,
  WebhookDto,
  TestWebhookDto,
  TestWebhookResultDto,
  ListDeliveriesDto,
} from '../dtos/webhook.dto';

/**
 * Controller para gerenciamento de webhooks
 * Endpoints para criar, atualizar, deletar e testar webhooks
 * Inclui histórico de deliveries com retry automático
 */
@Controller('webhooks')
@UseGuards(JwtAuthGuard)
export class WebhookController {
  constructor(private webhookService: WebhookService) {}

  /**
   * POST /webhooks
   * Criar webhook
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createWebhook(
    @CurrentUser() user: User,
    @Body() dto: CreateWebhookDto,
  ): Promise<WebhookDto> {
    return this.webhookService.createWebhook(user.id, dto);
  }

  /**
   * GET /webhooks
   * Listar webhooks do usuário
   */
  @Get()
  async listWebhooks(
    @CurrentUser() user: User,
    @Query('eventType') eventType?: string,
    @Query('limit') limit: number = 50,
    @Query('offset') offset: number = 0,
  ): Promise<ListWebhooksDto> {
    return this.webhookService.listWebhooks(user.id, {
      eventType,
      limit: Math.min(limit, 100),
      offset,
    });
  }

  /**
   * GET /webhooks/:webhookId
   * Obter detalhes de um webhook
   */
  @Get(':webhookId')
  async getWebhook(
    @CurrentUser() user: User,
    @Param('webhookId') webhookId: string,
  ): Promise<WebhookDto> {
    return this.webhookService.getWebhook(user.id, webhookId);
  }

  /**
   * PUT /webhooks/:webhookId
   * Atualizar webhook
   */
  @Put(':webhookId')
  @HttpCode(HttpStatus.OK)
  async updateWebhook(
    @CurrentUser() user: User,
    @Param('webhookId') webhookId: string,
    @Body() dto: UpdateWebhookDto,
  ): Promise<WebhookDto> {
    return this.webhookService.updateWebhook(user.id, webhookId, dto);
  }

  /**
   * DELETE /webhooks/:webhookId
   * Deletar webhook (soft delete)
   */
  @Delete(':webhookId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteWebhook(
    @CurrentUser() user: User,
    @Param('webhookId') webhookId: string,
  ): Promise<void> {
    return this.webhookService.deleteWebhook(user.id, webhookId);
  }

  /**
   * POST /webhooks/:webhookId/test
   * Testar webhook com payload de teste
   */
  @Post(':webhookId/test')
  @HttpCode(HttpStatus.OK)
  async testWebhook(
    @CurrentUser() user: User,
    @Param('webhookId') webhookId: string,
    @Body() dto: TestWebhookDto,
  ): Promise<TestWebhookResultDto> {
    return this.webhookService.testWebhook(user.id, webhookId, dto);
  }

  /**
   * GET /webhooks/:webhookId/deliveries
   * Listar histórico de entregas
   */
  @Get(':webhookId/deliveries')
  async listDeliveries(
    @CurrentUser() user: User,
    @Param('webhookId') webhookId: string,
    @Query('status') status?: string,
    @Query('limit') limit: number = 50,
    @Query('offset') offset: number = 0,
  ): Promise<ListDeliveriesDto> {
    return this.webhookService.listDeliveries(user.id, webhookId, {
      status,
      limit: Math.min(limit, 100),
      offset,
    });
  }
}
