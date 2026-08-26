import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';

/**
 * Entidade de Webhooks - Integração com sistemas externos
 *
 * Armazena configurações de webhooks e histórico de deliveries
 * Suporta retry com exponential backoff
 * Audit trail completo com soft delete
 */
@Entity('webhooks')
@Index('idx_webhooks_user_active', ['userId', 'isActive'])
@Index('idx_webhooks_user_created', ['userId', 'createdAt'])
@Index('idx_webhooks_event_active', ['eventType', 'isActive'])
export class Webhook {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { nullable: false })
  userId: string;

  @Column('varchar', { length: 255, nullable: false })
  name: string;

  @Column('varchar', { length: 500, nullable: false })
  url: string;

  @Column('enum', {
    enum: [
      'alert.created',
      'alert.updated',
      'report.generated',
      'expense.created',
      'receipt.created',
      'account.balance_changed',
      'goal.updated',
    ],
    nullable: false,
  })
  eventType: string;

  @Column('simple-array', { nullable: true })
  events: string[]; // Array de eventos que disparam este webhook

  @Column('jsonb', { nullable: true })
  headers: Record<string, string>; // Headers customizados (ex: Authorization)

  @Column('jsonb', { nullable: true })
  filters: Record<string, any>; // Filtros para quando o webhook dispara

  @Column('boolean', { default: true })
  isActive: boolean;

  @Column('varchar', { length: 50, default: 'http' })
  protocol: string; // http, https

  @Column('int', { default: 0 })
  deliveryCount: number; // Total de deliveries tentadas

  @Column('int', { default: 0 })
  successCount: number; // Deliveries bem-sucedidas

  @Column('int', { default: 0 })
  failureCount: number; // Deliveries falhadas

  @Column('timestamp', { nullable: true })
  lastDeliveredAt: Date; // Última entrega bem-sucedida

  @Column('timestamp', { nullable: true })
  lastFailedAt: Date; // Última entrega falhada

  @Column('text', { nullable: true })
  lastErrorMessage: string; // Mensagem do último erro

  @Column('int', { default: 3 })
  maxRetries: number; // Máximo de tentativas (default: 3)

  @Column('int', { default: 5000 })
  initialRetryDelay: number; // Delay inicial em ms (default: 5000 = 5s)

  @Column('float', { default: 2 })
  retryExponent: number; // Expoente para backoff (default: 2)

  @Column('varchar', { length: 50, default: 'pending' })
  status: string; // active, inactive, paused, error

  @Column('jsonb', { nullable: true })
  metadata: Record<string, any>; // Campos adicionais (description, tags, etc)

  @Column('uuid', { nullable: true })
  signature: string; // Token para validar webhook (HMAC)

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date;
}
