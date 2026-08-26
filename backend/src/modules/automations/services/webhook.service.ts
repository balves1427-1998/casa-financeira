import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import * as crypto from 'crypto';
import axios, { AxiosError } from 'axios';
import { Webhook } from '../entities/webhook.entity';
import { WebhookDelivery } from '../entities/webhook-delivery.entity';
import {
  CreateWebhookDto,
  UpdateWebhookDto,
  WebhookDto,
  ListWebhooksDto,
  TestWebhookDto,
  TestWebhookResultDto,
  WebhookDeliveryDto,
  ListDeliveriesDto,
} from '../dtos/webhook.dto';

/**
 * Serviço de Webhooks
 *
 * Gerencia webhooks com:
 * - Retry automático com exponential backoff
 * - HMAC-SHA256 signature para segurança
 * - Histórico completo de deliveries
 * - Validação de URL e health checks
 */
@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  private readonly TIMEOUT = 10000; // 10 segundos

  constructor(
    @InjectRepository(Webhook)
    private webhookRepository: Repository<Webhook>,
    @InjectRepository(WebhookDelivery)
    private deliveryRepository: Repository<WebhookDelivery>,
  ) {}

  /**
   * Criar webhook
   */
  async createWebhook(userId: string, dto: CreateWebhookDto): Promise<WebhookDto> {
    try {
      // Gerar signature (token para HMAC)
      const signature = crypto.randomBytes(32).toString('hex');

      const webhook = this.webhookRepository.create({
        userId,
        ...dto,
        signature,
        status: 'active',
        deliveryCount: 0,
        successCount: 0,
        failureCount: 0,
      });

      const saved = await this.webhookRepository.save(webhook);

      this.logger.log(`Webhook criado para usuário ${userId}: ${saved.id}`);

      return this.toDto(saved);
    } catch (error) {
      this.logger.error(`Erro ao criar webhook: ${error.message}`);
      throw new BadRequestException(`Falha ao criar webhook: ${error.message}`);
    }
  }

  /**
   * Obter webhook
   */
  async getWebhook(userId: string, webhookId: string): Promise<WebhookDto> {
    const webhook = await this.webhookRepository.findOne({
      where: { id: webhookId, userId },
    });

    if (!webhook) {
      throw new NotFoundException('Webhook não encontrado');
    }

    return this.toDto(webhook);
  }

  /**
   * Listar webhooks do usuário
   */
  async listWebhooks(
    userId: string,
    options?: { limit?: number; offset?: number; eventType?: string },
  ): Promise<ListWebhooksDto> {
    const query = this.webhookRepository.createQueryBuilder('webhook').where('webhook.userId = :userId', { userId });

    if (options?.eventType) {
      query.andWhere('webhook.eventType = :eventType', { eventType: options.eventType });
    }

    const total = await query.getCount();

    const activeCount = await query.clone().andWhere('webhook.isActive = :active', { active: true }).getCount();

    const inactiveCount = await query.clone().andWhere('webhook.isActive = :active', { active: false }).getCount();

    const webhooks = await query
      .orderBy('webhook.createdAt', 'DESC')
      .limit(options?.limit || 50)
      .offset(options?.offset || 0)
      .getMany();

    return {
      webhooks: webhooks.map((w) => this.toDto(w)),
      total,
      activeCount,
      inactiveCount,
    };
  }

  /**
   * Atualizar webhook
   */
  async updateWebhook(userId: string, webhookId: string, dto: UpdateWebhookDto): Promise<WebhookDto> {
    const webhook = await this.webhookRepository.findOne({
      where: { id: webhookId, userId },
    });

    if (!webhook) {
      throw new NotFoundException('Webhook não encontrado');
    }

    Object.assign(webhook, dto);
    const saved = await this.webhookRepository.save(webhook);

    this.logger.log(`Webhook atualizado: ${webhookId}`);

    return this.toDto(saved);
  }

  /**
   * Deletar webhook (soft delete)
   */
  async deleteWebhook(userId: string, webhookId: string): Promise<void> {
    const webhook = await this.webhookRepository.findOne({
      where: { id: webhookId, userId },
    });

    if (!webhook) {
      throw new NotFoundException('Webhook não encontrado');
    }

    await this.webhookRepository.softRemove(webhook);

    this.logger.log(`Webhook deletado: ${webhookId}`);
  }

  /**
   * Testar webhook enviando payload de teste
   */
  async testWebhook(userId: string, webhookId: string, dto: TestWebhookDto): Promise<TestWebhookResultDto> {
    const webhook = await this.webhookRepository.findOne({
      where: { id: webhookId, userId },
    });

    if (!webhook) {
      throw new NotFoundException('Webhook não encontrado');
    }

    // Payload de teste
    const payload = {
      id: webhook.id,
      event: dto.eventType,
      timestamp: new Date(),
      data: dto.payload || { test: true },
    };

    // Calcular assinatura
    const signature = this.calculateSignature(JSON.stringify(payload), webhook.signature);

    try {
      const startTime = Date.now();

      const response = await axios.post(webhook.url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-ID': webhook.id,
          'X-Webhook-Event': dto.eventType,
          'X-Webhook-Signature': signature,
          ...webhook.headers,
        },
        timeout: this.TIMEOUT,
        validateStatus: () => true, // Aceitar qualquer status
      });

      const responseTime = Date.now() - startTime;

      // Criar registro de delivery
      const deliveryData = {
        webhookId: webhook.id,
        userId,
        eventType: dto.eventType,
        payload,
        url: webhook.url,
        attemptNumber: 1,
        status: this.isSuccessStatus(response.status) ? 'delivered' : 'failed',
        httpStatus: response.status,
        httpResponse: JSON.stringify(response.data),
        responseTime,
        maxRetries: webhook.maxRetries,
        deliveredAt: this.isSuccessStatus(response.status) ? new Date() : undefined,
      } as any;

      const delivery = this.deliveryRepository.create(deliveryData);
      const savedDelivery = await this.deliveryRepository.save(delivery);

      // Handle case where save returns array
      const deliveryId = Array.isArray(savedDelivery) ? savedDelivery[0].id : (savedDelivery as any).id;

      // Atualizar estatísticas do webhook
      webhook.deliveryCount++;
      if (this.isSuccessStatus(response.status)) {
        webhook.successCount++;
        webhook.lastDeliveredAt = new Date();
      } else {
        webhook.failureCount++;
        webhook.lastFailedAt = new Date();
        webhook.lastErrorMessage = `HTTP ${response.status}`;
      }
      await this.webhookRepository.save(webhook);

      this.logger.log(`Webhook testado com sucesso: ${webhookId} - HTTP ${response.status}`);

      return {
        success: this.isSuccessStatus(response.status),
        webhookId: webhook.id,
        deliveryId,
        httpStatus: response.status,
        responseTime,
        message: `Webhook entregue com status ${response.status}`,
        response: response.data,
      };
    } catch (error) {
      this.logger.error(`Erro ao testar webhook ${webhookId}: ${error.message}`);

      // Registrar erro
      const errorMessage = error instanceof AxiosError ? error.message : 'Erro desconhecido';

      const delivery = this.deliveryRepository.create({
        webhookId: webhook.id,
        userId,
        eventType: dto.eventType,
        payload,
        url: webhook.url,
        attemptNumber: 1,
        status: error instanceof AxiosError && error.code === 'ECONNABORTED' ? 'timeout' : 'failed',
        errorMessage,
        maxRetries: webhook.maxRetries,
      });

      await this.deliveryRepository.save(delivery);

      // Atualizar webhook
      webhook.deliveryCount++;
      webhook.failureCount++;
      webhook.lastFailedAt = new Date();
      webhook.lastErrorMessage = errorMessage;
      webhook.status = 'error';
      await this.webhookRepository.save(webhook);

      return {
        success: false,
        webhookId: webhook.id,
        deliveryId: delivery.id,
        httpStatus: 0,
        responseTime: 0,
        message: 'Falha ao entregar webhook',
        error: errorMessage,
      };
    }
  }

  /**
   * Disparar webhook quando evento ocorre
   */
  async triggerWebhook(userId: string, eventType: string, data: any): Promise<void> {
    const webhooks = await this.webhookRepository.find({
      where: {
        userId,
        eventType: eventType.split('.')[0], // ex: 'alert' de 'alert.created'
        isActive: true,
      },
    });

    for (const webhook of webhooks) {
      await this.enqueueDelivery(webhook, eventType, data);
    }
  }

  /**
   * Enfileirar entrega de webhook
   */
  private async enqueueDelivery(webhook: Webhook, eventType: string, data: any): Promise<void> {
    const payload = {
      id: webhook.id,
      event: eventType,
      timestamp: new Date(),
      data,
    };

    const delivery = this.deliveryRepository.create({
      webhookId: webhook.id,
      userId: webhook.userId,
      eventType,
      payload,
      url: webhook.url,
      attemptNumber: 1,
      status: 'pending',
      maxRetries: webhook.maxRetries,
      nextRetryAt: new Date(), // Tentar imediatamente
    });

    await this.deliveryRepository.save(delivery);
  }

  /**
   * Cron job para processar entregas pendentes
   * Executado a cada 1 minuto
   */
  @Cron('* * * * *')
  async processWebhookDeliveries(): Promise<void> {
    const pendingDeliveries = await this.deliveryRepository.find({
      where: {
        status: 'pending' as any,
      },
      // `webhookId` é uma coluna simples (não há relação ORM mapeada em WebhookDelivery),
      // por isso não pode ser usada em `relations`. O webhook é carregado logo abaixo.
    });

    for (const delivery of pendingDeliveries) {
      const webhook = await this.webhookRepository.findOne({
        where: { id: delivery.webhookId },
      });

      if (!webhook) continue;

      // Se já passou do nextRetryAt, tentar novamente
      if (new Date() >= (delivery.nextRetryAt || delivery.createdAt)) {
        await this.sendWebhookDelivery(webhook, delivery);
      }
    }
  }

  /**
   * Enviar entrega de webhook com retry logic
   */
  private async sendWebhookDelivery(webhook: Webhook, delivery: WebhookDelivery): Promise<void> {
    const signature = this.calculateSignature(JSON.stringify(delivery.payload), webhook.signature);

    try {
      const startTime = Date.now();

      const response = await axios.post(webhook.url, delivery.payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-ID': webhook.id,
          'X-Webhook-Event': delivery.eventType,
          'X-Webhook-Signature': signature,
          ...webhook.headers,
        },
        timeout: this.TIMEOUT,
        validateStatus: () => true,
      });

      const responseTime = Date.now() - startTime;

      if (this.isSuccessStatus(response.status)) {
        // Sucesso
        delivery.status = 'delivered';
        delivery.httpStatus = response.status;
        delivery.httpResponse = JSON.stringify(response.data);
        delivery.responseTime = responseTime;
        delivery.deliveredAt = new Date();

        await this.deliveryRepository.save(delivery);

        // Atualizar webhook
        webhook.successCount++;
        webhook.lastDeliveredAt = new Date();
        webhook.status = 'active';
        await this.webhookRepository.save(webhook);

        this.logger.log(`Webhook entregue com sucesso: ${webhook.id}`);
      } else {
        // Falha HTTP
        await this.handleWebhookFailure(webhook, delivery, response.status, response.data);
      }
    } catch (error) {
      // Erro de conexão
      const errorMessage = error instanceof AxiosError ? error.message : 'Erro desconhecido';
      await this.handleWebhookFailure(webhook, delivery, 0, errorMessage);
    }
  }

  /**
   * Processar falha de webhook com exponential backoff
   */
  private async handleWebhookFailure(webhook: Webhook, delivery: WebhookDelivery, httpStatus: number, error: any): Promise<void> {
    const nextAttempt = delivery.attemptNumber + 1;

    if (nextAttempt <= webhook.maxRetries) {
      // Calcular próxima tentativa com exponential backoff
      // delay = initialDelay * (exponent ^ (attemptNumber - 1))
      // Ex: 5000ms * (2 ^ 0) = 5s
      //     5000ms * (2 ^ 1) = 10s
      //     5000ms * (2 ^ 2) = 20s
      const backoffDelay = webhook.initialRetryDelay * Math.pow(webhook.retryExponent, delivery.attemptNumber - 1);
      const nextRetryAt = new Date(Date.now() + backoffDelay);

      delivery.status = 'pending';
      delivery.attemptNumber = nextAttempt;
      delivery.nextRetryAt = nextRetryAt;
      delivery.httpStatus = httpStatus;
      delivery.errorMessage = typeof error === 'string' ? error : JSON.stringify(error);

      await this.deliveryRepository.save(delivery);

      this.logger.warn(
        `Webhook ${webhook.id} falhou. Tentativa ${nextAttempt}/${webhook.maxRetries} em ${Math.round(backoffDelay / 1000)}s`,
      );
    } else {
      // Máximo de retries atingido
      delivery.status = 'failed';
      delivery.attemptNumber = nextAttempt - 1;
      delivery.httpStatus = httpStatus;
      delivery.errorMessage = typeof error === 'string' ? error : JSON.stringify(error);

      await this.deliveryRepository.save(delivery);

      // Atualizar webhook
      webhook.failureCount++;
      webhook.lastFailedAt = new Date();
      webhook.lastErrorMessage = typeof error === 'string' ? error : JSON.stringify(error);
      webhook.status = 'error';
      await this.webhookRepository.save(webhook);

      this.logger.error(`Webhook ${webhook.id} falhou após ${webhook.maxRetries} tentativas`);
    }
  }

  /**
   * Listar deliveries de um webhook
   */
  async listDeliveries(
    userId: string,
    webhookId: string,
    options?: { limit?: number; offset?: number; status?: string },
  ): Promise<ListDeliveriesDto> {
    // Verificar que webhook pertence ao usuário
    const webhook = await this.webhookRepository.findOne({
      where: { id: webhookId, userId },
    });

    if (!webhook) {
      throw new NotFoundException('Webhook não encontrado');
    }

    const query = this.deliveryRepository.createQueryBuilder('delivery').where('delivery.webhookId = :webhookId', { webhookId });

    if (options?.status) {
      query.andWhere('delivery.status = :status', { status: options.status });
    }

    const total = await query.getCount();
    const successCount = await query.clone().andWhere('delivery.status = :status', { status: 'delivered' }).getCount();
    const failureCount = await query.clone().andWhere('delivery.status = :status', { status: 'failed' }).getCount();
    const pendingCount = await query.clone().andWhere('delivery.status = :status', { status: 'pending' }).getCount();

    const deliveries = await query
      .orderBy('delivery.createdAt', 'DESC')
      .limit(options?.limit || 50)
      .offset(options?.offset || 0)
      .getMany();

    return {
      deliveries: deliveries.map((d) => this.deliveryToDto(d)),
      total,
      successCount,
      failureCount,
      pendingCount,
    };
  }

  /**
   * Cron job para limpeza de entregas antigas
   * Executado diariamente às 02:00
   */
  @Cron('0 2 * * *')
  async cleanupOldDeliveries(): Promise<void> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const result = await this.deliveryRepository
      .createQueryBuilder()
      .softDelete()
      .where('createdAt < :date', { date: thirtyDaysAgo })
      .andWhere('status IN (:...statuses)', { statuses: ['delivered', 'failed'] })
      .execute();

    this.logger.log(`Limpeza de webhooks: ${result.affected} entregas antigas removidas`);
  }

  /**
   * Calcular HMAC-SHA256 signature
   */
  private calculateSignature(payload: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  /**
   * Verificar se status HTTP é sucesso
   */
  private isSuccessStatus(status: number): boolean {
    return status >= 200 && status < 300;
  }

  /**
   * Converter Webhook para DTO
   */
  private toDto(webhook: Webhook): WebhookDto {
    return {
      id: webhook.id,
      userId: webhook.userId,
      name: webhook.name,
      url: webhook.url,
      eventType: webhook.eventType as any,
      events: webhook.events,
      isActive: webhook.isActive,
      status: webhook.status as any,
      deliveryCount: webhook.deliveryCount,
      successCount: webhook.successCount,
      failureCount: webhook.failureCount,
      lastDeliveredAt: webhook.lastDeliveredAt,
      lastFailedAt: webhook.lastFailedAt,
      lastErrorMessage: webhook.lastErrorMessage,
      maxRetries: webhook.maxRetries,
      metadata: webhook.metadata,
      createdAt: webhook.createdAt,
      updatedAt: webhook.updatedAt,
    };
  }

  /**
   * Converter WebhookDelivery para DTO
   */
  private deliveryToDto(delivery: WebhookDelivery): WebhookDeliveryDto {
    return {
      id: delivery.id,
      webhookId: delivery.webhookId,
      eventType: delivery.eventType,
      status: delivery.status as any,
      httpStatus: delivery.httpStatus,
      responseTime: delivery.responseTime,
      attemptNumber: delivery.attemptNumber,
      errorMessage: delivery.errorMessage,
      deliveredAt: delivery.deliveredAt,
      nextRetryAt: delivery.nextRetryAt,
      createdAt: delivery.createdAt,
    };
  }
}
