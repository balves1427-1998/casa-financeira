import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  JoinColumn,
} from 'typeorm';
import { Family } from '../../families/entities/family.entity';

export enum AnomalyType {
  UNUSUAL_AMOUNT = 'UNUSUAL_AMOUNT',
  DUPLICATE = 'DUPLICATE',
  SPIKE = 'SPIKE',
  PATTERN_BREAK = 'PATTERN_BREAK',
}

export enum AnomalySeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export enum TransactionType {
  EXPENSE = 'EXPENSE',
  INCOME = 'INCOME',
}

export enum ConfirmationStatus {
  NORMAL = 'NORMAL',
  UNUSUAL_BUT_OK = 'UNUSUAL_BUT_OK',
  FRAUDULENT = 'FRAUDULENT',
}

@Entity('transaction_anomalies')
@Index('idx_anomalies_family_severity', ['family', 'severity'])
@Index('idx_anomalies_transaction', ['transactionId'])
export class TransactionAnomaly {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'family_id', type: 'uuid' })
  familyId: string;

  @Column({ name: 'transaction_id', type: 'uuid' })
  transactionId: string;

  @ManyToOne(() => Family, (family) => family.id)
  @JoinColumn({ name: 'family_id' })
  family: Family;

  @Column({ name: 'transaction_type', type: 'varchar', length: 50 })
  transactionType: TransactionType;

  @Column({ name: 'anomaly_type', type: 'varchar', length: 50 })
  anomalyType: AnomalyType;

  @Column('varchar', { length: 20 })
  severity: AnomalySeverity;

  /**
   * Score de anomalia (0-1)
   * Quanto maior, mais anômalo
   */
  @Column({ name: 'anomaly_score', type: 'decimal', precision: 5, scale: 2 })
  anomalyScore: number;

  /**
   * Razão da detecção de anomalia
   * Ex: "Valor 150% acima da média para esta categoria"
   */
  @Column('text')
  reason: string;

  /**
   * Ação sugerida ao usuário
   */
  @Column({ name: 'suggested_action', type: 'text', nullable: true })
  suggestedAction: string | null;

  /**
   * Flag se anomalia foi confirmada pelo usuário
   */
  @Column({ name: 'is_confirmed', type: 'boolean', default: false })
  isConfirmed: boolean;

  /**
   * Status da confirmação
   */
  @Column({
    name: 'confirmation_status',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  confirmationStatus: ConfirmationStatus | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
