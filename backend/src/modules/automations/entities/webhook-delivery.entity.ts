import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';

/**
 * Entidade de Webhook Delivery - Histórico de tentativas de envio
 *
 * Rastreia cada tentativa de entrega de webhook
 * Inclui payload, response, status HTTP, retry count
 * Permite auditoria completa de todas as chamadas
 */
@Entity('webhook_deliveries')
@Index('idx_webhook_deliveries_webhook_status', ['webhookId', 'status'])
@Index('idx_webhook_deliveries_webhook_created', ['webhookId', 'createdAt'])
@Index('idx_webhook_deliveries_event_status', ['eventType', 'status'])
export class WebhookDelivery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { nullable: false })
  webhookId: string; // FK to Webhook

  @Column('uuid', { nullable: false })
  userId: string;

  @Column('varchar', { length: 255, nullable: false })
  eventType: string; // Tipo de evento que disparou

  @Column('jsonb', { nullable: true })
  payload: Record<string, any>; // Dados enviados no webhook

  @Column('varchar', { length: 2083, nullable: false })
  url: string; // URL do webhook (armazenar para audit)

  @Column('int', { default: 0 })
  attemptNumber: number; // Tentativa 1, 2, 3, etc

  @Column('enum', {
    enum: ['pending', 'delivered', 'failed', 'timeout', 'invalid_url'],
    default: 'pending',
  })
  status: string;

  @Column('int', { nullable: true })
  httpStatus: number; // Status HTTP da response (ex: 200, 404, 500)

  @Column('text', { nullable: true })
  httpResponse: string; // Conteúdo da response

  @Column('int', { nullable: true })
  responseTime: number; // Tempo de resposta em ms

  @Column('text', { nullable: true })
  errorMessage: string; // Erro se falhar

  @Column('timestamp', { nullable: true })
  deliveredAt: Date; // Quando foi entregue

  @Column('timestamp', { nullable: true })
  nextRetryAt: Date; // Quando tentar novamente

  @Column('int', { default: 0 })
  maxRetries: number; // Total de retries configurados

  @Column('jsonb', { nullable: true })
  requestHeaders: Record<string, string>; // Headers enviados

  @Column('varchar', { length: 100, nullable: true })
  userAgent: string; // User agent

  @Column('varchar', { length: 45, nullable: true })
  clientIp: string; // IP interno da origem

  @CreateDateColumn()
  createdAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date;
}
