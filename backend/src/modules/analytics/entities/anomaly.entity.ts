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
import { Category } from '../../../modules/categories/entities/category.entity';

/**
 * Anomaly - Gasto anômalo identificado
 * Registra gastos que saem do padrão esperado
 */
@Entity('anomalies')
@Index(['userId', 'anomalyType', 'month'])
@Index(['userId', 'severity', 'createdAt'])
export class Anomaly {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, user => user.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column('uuid', { nullable: true })
  categoryId?: string;

  @ManyToOne(() => Category, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'categoryId' })
  category?: Category;

  // Tipo de anomalia
  @Column('varchar')
  anomalyType:
    | 'spike'
    | 'pattern_change'
    | 'duplicate'
    | 'suspicious'
    | 'unusual_merchant'
    | 'frequency_increase';

  // Descrição da anomalia
  @Column('varchar')
  description: string;

  // Período analisado
  @Column('int')
  month: number; // 1-12

  @Column('int')
  year: number;

  // Análise estatística
  @Column('decimal', { precision: 12, scale: 2 })
  detectedValue: number; // Valor da transação/gasto anômalo

  @Column('decimal', { precision: 12, scale: 2 })
  expectedValue: number; // Valor esperado baseado na histórico

  @Column('decimal', { precision: 5, scale: 2 })
  deviationPercentage: number; // % de desvio (Ex: 75%)

  @Column('decimal', { precision: 5, scale: 2 })
  zscore: number; // Z-score da anomalia (quantos desvios padrão)

  // Severidade
  @Column('varchar')
  severity: 'low' | 'medium' | 'high' | 'critical'; // Baseado em z-score

  // Contexto
  @Column('varchar', { nullable: true })
  merchantName?: string; // Nome do estabelecimento

  @Column('int', { nullable: true })
  frequencyChange?: number; // Mudança de frequência em %

  @Column('int', { nullable: true })
  occurrenceCount?: number; // Quantas vezes esse padrão ocorreu

  // Análise temporal
  @Column('date', { nullable: true })
  anomalyDate?: string; // Data da anomalia (para spikes)

  @Column('int', { nullable: true })
  daysIntoMonth?: number; // Em qual dia do mês foi detectado

  // Comparação com histórico
  @Column('jsonb', { nullable: true })
  historicalComparison?: {
    lastMonthAverage: number;
    last3MonthsAverage: number;
    last6MonthsAverage: number;
    trendDirection: 'increasing' | 'decreasing' | 'stable';
  };

  // Recomendações
  @Column('text', { nullable: true })
  recommendation?: string;

  // Flag de ação do usuário
  @Column('boolean', { default: false })
  isReviewed: boolean;

  @Column('varchar', { nullable: true })
  userAction?: 'confirmed' | 'dismissed' | 'needs_investigation'; // Ação do usuário

  @Column('text', { nullable: true })
  userNote?: string; // Notas do usuário

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;
}
