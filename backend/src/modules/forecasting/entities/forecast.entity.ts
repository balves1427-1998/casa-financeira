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
 * Forecast - Previsão financeira futura
 * Armazena projeções de saldo para períodos (30, 90, 365 dias)
 */
@Entity('forecasts')
@Index(['userId', 'forecastDate'])
@Index(['userId', 'period', 'createdAt'])
export class Forecast {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, user => user.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  // Período da previsão
  @Column({ type: 'varchar', enum: ['30-days', '90-days', '365-days'] })
  period: '30-days' | '90-days' | '365-days';

  // Data de início da previsão
  @Column('date')
  forecastDate: Date;

  // Saldo inicial
  @Column('decimal', { precision: 12, scale: 2 })
  initialBalance: number;

  // Saldo projetado ao final do período
  @Column('decimal', { precision: 12, scale: 2 })
  projectedEndBalance: number;

  // Saldo mínimo projetado durante o período
  @Column('decimal', { precision: 12, scale: 2 })
  minProjectedBalance: number;

  // Data do saldo mínimo
  @Column('date', { nullable: true })
  minBalanceDate?: Date;

  // Renda total projetada
  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  projectedIncome: number;

  // Despesas totais projetadas
  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  projectedExpenses: number;

  // Despesas fixas projetadas
  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  fixedExpenses: number;

  // Despesas variáveis projetadas (baseadas em média)
  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  variableExpenses: number;

  // Parcelamentos futuros
  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  installmentPayments: number;

  // Dias abaixo do saldo mínimo (se houver)
  @Column('int', { default: 0 })
  daysWithLowBalance: number;

  // Risco de saldo negativo
  @Column('boolean', { default: false })
  hasNegativeRisk: boolean;

  // Data em que poderia ficar negativo (se risco existir)
  @Column('date', { nullable: true })
  negativeRiskDate?: Date;

  // Confiança da previsão (0-1, baseada em dados históricos)
  @Column('decimal', { precision: 3, scale: 2, default: 0.5 })
  confidence: number;

  // Dados detalhados por semana/mês (JSON)
  @Column('jsonb', { nullable: true })
  detailedProjections?: Array<{
    week?: number;
    month?: number;
    date: Date;
    projectedBalance: number;
    income: number;
    expenses: number;
    minBalance: number;
  }>;

  // Análise de sazonalidade
  @Column('jsonb', { nullable: true })
  seasonalityAnalysis?: {
    pattern: string; // 'high', 'low', 'stable'
    variance: number; // variação percentual esperada
    peakDates: Date[];
    lowDates: Date[];
  };

  // Recomendações
  @Column('text', { array: true, nullable: true })
  recommendations?: string[];

  // Metadata
  @Column('jsonb', { nullable: true })
  metadata?: {
    dataPoints?: number;
    historyMonths?: number;
    averageMonthlyIncome?: number;
    averageMonthlyExpenses?: number;
    consistencyScore?: number;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;
}
