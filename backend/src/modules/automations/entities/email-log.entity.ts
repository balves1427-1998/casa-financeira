import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum EmailType {
  REPORT = 'report', // Relatório agendado
  ALERT = 'alert', // Alerta crítico
  WEEKLY_SUMMARY = 'weekly_summary', // Resumo semanal
  CONFIRMATION = 'confirmation', // Confirmação de ação
  NOTIFICATION = 'notification', // Notificação geral
}

export enum EmailStatus {
  PENDING = 'pending',
  SENT = 'sent',
  FAILED = 'failed',
  BOUNCED = 'bounced',
  OPENED = 'opened', // Rastreamento futuro
}

@Entity('email_logs')
@Index(['userId', 'status', 'createdAt'])
@Index(['userId', 'type', 'createdAt'])
@Index(['status', 'createdAt'])
export class EmailLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 100 })
  recipient: string; // Email destinatário

  @Column({ type: 'enum', enum: EmailType })
  type: EmailType;

  @Column({ type: 'varchar', length: 300 })
  subject: string;

  @Column({ type: 'text', nullable: true })
  htmlContent?: string; // Conteúdo renderizado

  @Column({ type: 'varchar', length: 50 })
  templateName: string; // Nome do template usado

  @Column({ type: 'jsonb', nullable: true })
  templateData: Record<string, any>; // Dados passados ao template

  @Column({ type: 'enum', enum: EmailStatus, default: EmailStatus.PENDING })
  status: EmailStatus;

  @Column({ type: 'text', nullable: true })
  errorMessage?: string; // Se falhou, motivo

  @Column({ type: 'int', default: 0 })
  retryCount: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  messageId?: string; // ID do provedor (SES, Mailgun, etc)

  @Column({ type: 'varchar', length: 255, nullable: true })
  relatedEntityId?: string; // ID da entidade relacionada (report, alert, etc)

  @Column({ type: 'varchar', length: 100, nullable: true })
  relatedEntityType?: string; // Tipo da entidade (report, alert, etc)

  @Column({ type: 'timestamp', nullable: true })
  sentAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  openedAt?: Date; // Rastreamento futuro

  @Column({ type: 'timestamp', nullable: true })
  bouncedAt?: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    // Dados adicionais para análise
    ipAddress?: string;
    userAgent?: string;
    attachmentCount?: number;
    attachmentSizes?: number[];
  };

  @CreateDateColumn()
  createdAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;
}
