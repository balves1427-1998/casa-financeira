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
 * SpendingPattern - Padrão de gasto identificado
 * Armazena análise de tendências e hábitos de consumo
 */
@Entity('spending_patterns')
@Index(['userId', 'categoryId', 'month'])
@Index(['userId', 'createdAt'])
export class SpendingPattern {
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

  // Período analisado (mês)
  @Column('int')
  month: number; // 1-12

  @Column('int')
  year: number;

  // Estatísticas
  @Column('decimal', { precision: 12, scale: 2 })
  totalSpent: number;

  @Column('decimal', { precision: 12, scale: 2 })
  averageTransaction: number;

  @Column('decimal', { precision: 12, scale: 2 })
  medianTransaction: number;

  @Column('decimal', { precision: 12, scale: 2 })
  minTransaction: number;

  @Column('decimal', { precision: 12, scale: 2 })
  maxTransaction: number;

  @Column('decimal', { precision: 5, scale: 2 })
  standardDeviation: number;

  @Column('int')
  transactionCount: number;

  // Comparação com mês anterior
  @Column('decimal', { precision: 5, scale: 2, nullable: true })
  monthOverMonthChange?: number; // percentual

  // Comparação com média histórica (últimos 6 meses)
  @Column('decimal', { precision: 5, scale: 2, nullable: true })
  deviationFromAverage?: number; // percentual

  // Dias mais gastos
  @Column('int', { array: true, nullable: true })
  highSpendingDays?: number[]; // dias do mês com gasto > média

  // Frequência (quantos dias teve gasto nesta categoria)
  @Column('int')
  activeDays: number;

  // Dias do mês com maior gasto
  @Column('varchar', { array: true, nullable: true })
  topDays?: string[]; // ISO dates dos top 3 dias

  // Padrão identificado
  @Column('varchar', { nullable: true })
  pattern?: string; // 'daily', 'weekly', 'monthly', 'irregular'

  // Metadata com histórico
  @Column('jsonb', { nullable: true })
  historicalComparison?: {
    last3Months: number[];
    last6Months: number[];
    last12Months: number[];
    trend: 'increasing' | 'decreasing' | 'stable';
  };

  // Análise por dia da semana
  @Column('jsonb', { nullable: true })
  dayOfWeekAnalysis?: {
    monday: number;
    tuesday: number;
    wednesday: number;
    thursday: number;
    friday: number;
    saturday: number;
    sunday: number;
    mostExpensiveDay: string;
  };

  // Estabelecimentos mais frequentes (top 5)
  @Column('jsonb', { nullable: true })
  topEstablishments?: Array<{
    name: string;
    count: number;
    totalSpent: number;
    averageTransaction: number;
  }>;

  // Insights gerados
  @Column('text', { array: true, nullable: true })
  insights?: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;
}
