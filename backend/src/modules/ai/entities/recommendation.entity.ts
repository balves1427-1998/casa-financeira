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
import { User } from '../../users/entities/user.entity';
import { Family } from '../../families/entities/family.entity';

export enum RecommendationType {
  CATEGORY_HIGH = 'CATEGORY_HIGH',
  PATTERN = 'PATTERN',
  DUPLICATE = 'DUPLICATE',
  UNUSED_SUB = 'UNUSED_SUB',
  OPPORTUNITY = 'OPPORTUNITY',
  CONSOLIDATION = 'CONSOLIDATION',
  GOAL_OPTIMIZATION = 'GOAL_OPTIMIZATION',
}

export enum RecommendationPriority {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

export enum RecommendationPeriod {
  MONTHLY = 'monthly',
  ANNUAL = 'annual',
  QUARTERLY = 'quarterly',
}

@Entity('recommendations')
@Index('idx_recommendations_family_priority', ['family', 'priority'])
@Index('idx_recommendations_user', ['user'])
@Index('idx_recommendations_dismissed', ['isDismissed'])
export class Recommendation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'family_id', type: 'uuid' })
  familyId: string;

  @ManyToOne(() => User, (user) => user.id)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Family, (family) => family.id)
  @JoinColumn({ name: 'family_id' })
  family: Family;

  @Column('varchar', { length: 50 })
  type: RecommendationType;

  @Column('varchar', { length: 255 })
  title: string;

  @Column('text')
  description: string;

  /**
   * Economia potencial em R$
   */
  @Column({
    name: 'potential_savings',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  potentialSavings: number | null;

  /**
   * Período da economia (monthly | annual | quarterly)
   */
  @Column('varchar', { length: 20, default: 'monthly' })
  period: RecommendationPeriod;

  /**
   * Score de relevância (0-100)
   */
  @Column('int')
  relevance: number;

  /**
   * Score de impacto (0-100)
   */
  @Column('int')
  impact: number;

  /**
   * Score de facilidade (0-100)
   */
  @Column('int')
  ease: number;

  /**
   * Prioridade calculada baseada em relevância, impacto e facilidade
   */
  @Column('varchar', { length: 20, default: 'MEDIUM' })
  priority: RecommendationPriority;

  /**
   * URL para ação (ex: /expenses/category/123)
   */
  @Column({ name: 'action_url', type: 'varchar', length: 500, nullable: true })
  actionUrl: string | null;

  /**
   * Flag se recomendação foi descartada
   */
  @Column({ name: 'is_dismissed', type: 'boolean', default: false })
  isDismissed: boolean;

  /**
   * Data de descarte
   */
  @Column({ name: 'dismissed_at', type: 'timestamp', nullable: true })
  dismissedAt: Date | null;

  /**
   * Metadados adicionais
   */
  @Column('jsonb', { default: '{}' })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
