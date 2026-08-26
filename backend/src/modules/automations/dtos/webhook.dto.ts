import { IsString, IsUrl, IsEnum, IsOptional, IsArray, IsNumber, IsObject, Min, Max, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Webhook Event Types
 */
export enum WebhookEventType {
  ALERT_CREATED = 'alert.created',
  ALERT_UPDATED = 'alert.updated',
  REPORT_GENERATED = 'report.generated',
  EXPENSE_CREATED = 'expense.created',
  RECEIPT_CREATED = 'receipt.created',
  ACCOUNT_BALANCE_CHANGED = 'account.balance_changed',
  GOAL_UPDATED = 'goal.updated',
}

/**
 * Webhook Status
 */
export enum WebhookStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  PAUSED = 'paused',
  ERROR = 'error',
}

/**
 * Delivery Status
 */
export enum DeliveryStatus {
  PENDING = 'pending',
  DELIVERED = 'delivered',
  FAILED = 'failed',
  TIMEOUT = 'timeout',
  INVALID_URL = 'invalid_url',
}

/**
 * DTO para criar webhook
 */
export class CreateWebhookDto {
  @IsString()
  name: string;

  @IsUrl()
  url: string;

  @IsEnum(WebhookEventType)
  eventType: WebhookEventType;

  @IsArray()
  @IsString({ each: true })
  events: string[];

  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;

  @IsOptional()
  @IsObject()
  filters?: Record<string, any>;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  maxRetries?: number;

  @IsOptional()
  @IsNumber()
  @Min(1000)
  initialRetryDelay?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  retryExponent?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

/**
 * DTO para atualizar webhook
 */
export class UpdateWebhookDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsUrl()
  url?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  events?: string[];

  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;

  @IsOptional()
  @IsObject()
  filters?: Record<string, any>;

  @IsOptional()
  isActive?: boolean;

  @IsOptional()
  @IsEnum(WebhookStatus)
  status?: WebhookStatus;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  maxRetries?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

/**
 * DTO para resposta de webhook
 */
export class WebhookDto {
  id: string;
  userId: string;
  name: string;
  url: string;
  eventType: WebhookEventType;
  events: string[];
  isActive: boolean;
  status: WebhookStatus;
  deliveryCount: number;
  successCount: number;
  failureCount: number;
  lastDeliveredAt: Date;
  lastFailedAt: Date;
  lastErrorMessage: string;
  maxRetries: number;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * DTO para listagem de webhooks
 */
export class ListWebhooksDto {
  webhooks: WebhookDto[];
  total: number;
  activeCount: number;
  inactiveCount: number;
}

/**
 * DTO para teste de webhook
 */
export class TestWebhookDto {
  @IsString()
  eventType: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, any>;
}

/**
 * DTO para resultado de teste
 */
export class TestWebhookResultDto {
  success: boolean;
  webhookId: string;
  deliveryId: string;
  httpStatus: number;
  responseTime: number;
  message: string;
  response?: any;
  error?: string;
}

/**
 * DTO para entrega de webhook
 */
export class WebhookDeliveryDto {
  id: string;
  webhookId: string;
  eventType: string;
  status: DeliveryStatus;
  httpStatus: number;
  responseTime: number;
  attemptNumber: number;
  errorMessage: string;
  deliveredAt: Date;
  nextRetryAt: Date;
  createdAt: Date;
}

/**
 * DTO para listagem de entregas
 */
export class ListDeliveriesDto {
  deliveries: WebhookDeliveryDto[];
  total: number;
  successCount: number;
  failureCount: number;
  pendingCount: number;
}

/**
 * DTO para retrying webhook manually
 */
export class RetryWebhookDto {
  @IsString()
  deliveryId: string;
}

/**
 * DTO para payload do webhook (enviado para URL externa)
 */
export class WebhookPayloadDto {
  id: string; // Webhook ID
  event: string; // Event type
  timestamp: Date; // Quando ocorreu
  data: any; // Dados específicos do evento
  signature: string; // HMAC-SHA256(payload, secret)
}

/**
 * DTO para validação de assinatura
 */
export class ValidateWebhookSignatureDto {
  @IsString()
  payload: string; // Raw payload recebido

  @IsString()
  signature: string; // Assinatura no header
}
