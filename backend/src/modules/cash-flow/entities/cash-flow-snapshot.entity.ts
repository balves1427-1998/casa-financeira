import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
  JoinColumn,
} from 'typeorm';
import { User } from '../../../modules/users/entities/user.entity';

/**
 * CashFlowSnapshot - Captura diária do fluxo de caixa
 * Armazena estado do saldo em um ponto específico do tempo
 */
@Entity('cash_flow_snapshots')
@Index(['userId', 'snapshotDate'])
@Index(['userId', 'createdAt'])
export class CashFlowSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, user => user.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  // Data do snapshot
  @Column('date')
  snapshotDate: Date;

  // Saldo inicial do dia
  @Column('decimal', { precision: 12, scale: 2 })
  openingBalance: number;

  // Entradas do dia
  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  dailyIncome: number;

  // Saídas do dia
  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  dailyExpenses: number;

  // Contas planejadas do dia
  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  plannedAccountsAmount: number;

  // Saldo final do dia (opening + income - expenses)
  @Column('decimal', { precision: 12, scale: 2 })
  closingBalance: number;

  // Saldo projetado (considerando contas futuras)
  @Column('decimal', { precision: 12, scale: 2 })
  projectedBalance: number;

  // Transações do dia (count)
  @Column('int', { default: 0 })
  transactionCount: number;

  // Se é um dia crítico (muitos pagamentos)
  @Column('boolean', { default: false })
  isCriticalDay: boolean;

  // Reason why it's critical
  @Column('varchar', { nullable: true })
  criticalDayReason?: string; // e.g., "R$ 5.800 em pagamentos"

  // Metadata JSON
  @Column('jsonb', { nullable: true })
  metadata?: {
    topExpenseCategory?: string;
    topExpenseAmount?: number;
    numPayments?: number;
    nearMinimumBalance?: boolean;
    minimumBalanceThreshold?: number;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;
}
