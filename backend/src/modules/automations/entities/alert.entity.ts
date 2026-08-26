import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum AlertType {
  ACCOUNT_DUE = 'account_due', // Vencimento de contas
  CREDIT_CARD = 'credit_card', // Cartão de crédito
  LOW_BALANCE = 'low_balance', // Saldo baixo
  ANOMALY = 'anomaly', // Anomalias de gasto
  GOAL = 'goal', // Metas
}

export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

export enum AlertStatus {
  UNREAD = 'unread',
  READ = 'read',
  DISMISSED = 'dismissed',
  ACTED = 'acted', // Usuário realizou ação baseado no alerta
}

@Entity('alerts')
@Index(['userId', 'isRead', 'createdAt'])
@Index(['userId', 'type', 'severity'])
@Index(['userId', 'createdAt'])
export class Alert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'enum', enum: AlertType })
  type: AlertType;

  @Column({ type: 'enum', enum: AlertSeverity, default: AlertSeverity.INFO })
  severity: AlertSeverity;

  @Column({ type: 'enum', enum: AlertStatus, default: AlertStatus.UNREAD })
  status: AlertStatus;

  @Column({ type: 'varchar', length: 300 })
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'jsonb', nullable: true })
  data: {
    // Dados específicos do alerta
    accountId?: string;
    accountName?: string;
    dueDate?: string;
    amount?: number;
    daysUntilDue?: number;

    // Para cartão de crédito
    creditCardId?: string;
    creditCardName?: string;
    creditLimit?: number;
    usedLimit?: number;
    percentageUsed?: number;

    // Para saldo baixo
    currentBalance?: number;
    minimumBalance?: number;

    // Para anomalias
    category?: string;
    normalAmount?: number;
    currentAmount?: number;
    percentageIncrease?: number;

    // Para metas
    goalId?: string;
    goalName?: string;
    goalProgress?: number;
  };

  @Column({ type: 'boolean', default: false })
  isRead: boolean;

  @Column({ type: 'timestamp', nullable: true })
  readAt: Date;

  @Column({ type: 'boolean', default: false })
  notificationSent: boolean;

  @Column({ type: 'varchar', length: 50, nullable: true })
  notificationChannel: 'email' | 'in-app' | 'sms'; // Em-app é sempre, email e SMS são opcionais

  @Column({ type: 'timestamp', nullable: true })
  notificationSentAt: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  relatedEntityId: string; // ID da conta, cartão, meta, etc que gerou o alerta

  @Column({ type: 'varchar', length: 100, nullable: true })
  relatedEntityType: string; // 'account', 'credit_card', 'goal', 'transaction'

  @Column({ type: 'boolean', default: true })
  isActive: boolean; // Se o alerta ainda é válido

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;
}
