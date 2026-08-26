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

@Entity('behavior_analyses')
@Index('idx_behavior_analyses_family', ['family'])
@Index('idx_behavior_analyses_created', ['createdAt'])
export class BehaviorAnalysis {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'family_id', type: 'uuid' })
  familyId: string;

  @ManyToOne(() => Family, (family) => family.id)
  @JoinColumn({ name: 'family_id' })
  family: Family;

  /**
   * Análise de padrões temporais
   * {
   *   bestSpendingDays: string[],
   *   worstSpendingDays: string[],
   *   averageSpendByDayOfWeek: Record<string, number>,
   *   seasonalPatterns: [{month, average, variance}]
   * }
   */
  @Column({ name: 'period_analysis', type: 'jsonb', nullable: true })
  periodAnalysis: Record<string, any> | null;

  /**
   * Transações anormais detectadas
   * [{
   *   transactionId: string,
   *   reason: string,
   *   severity: 'LOW' | 'MEDIUM' | 'HIGH',
   *   suggestedAction: string,
   *   anomalyScore: number
   * }]
   */
  @Column('jsonb', { nullable: true })
  anomalies: any[] | null;

  /**
   * Padrões identificados
   * [{
   *   description: string,
   *   frequency: 'daily' | 'weekly' | 'monthly',
   *   affectedCategories: string[],
   *   trend: 'increasing' | 'decreasing' | 'stable'
   * }]
   */
  @Column('jsonb', { nullable: true })
  patterns: any[] | null;

  /**
   * Correlações entre variáveis
   * [{
   *   variable1: string,
   *   variable2: string,
   *   coefficient: number,
   *   interpretation: string
   * }]
   */
  @Column('jsonb', { nullable: true })
  correlations: any[] | null;

  /**
   * Análise de clusters
   * [{
   *   clusterId: number,
   *   size: number,
   *   centroid: Record<string, number>,
   *   characteristics: string
   * }]
   */
  @Column('jsonb', { nullable: true })
  clustering: any[] | null;

  /**
   * Score de sazonalidade (0-1)
   */
  @Column({
    name: 'seasonality_score',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  seasonalityScore: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
