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

export enum ReportFrequency {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  ANNUAL = 'annual',
}

@Entity('report_schedules')
@Index(['userId', 'isActive', 'nextExecution'])
@Index(['userId', 'createdAt'])
@Index(['nextExecution', 'isActive'])
export class ReportSchedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'varchar', length: 50 })
  reportType: string; // 'monthly', 'custom', 'summary'

  @Column({ type: 'enum', enum: ReportFrequency })
  frequency: ReportFrequency;

  @Column({ type: 'jsonb', nullable: true })
  config: {
    includeSummary?: boolean;
    includeSpendingPatterns?: boolean;
    includeAnomalies?: boolean;
    includeTrends?: boolean;
    includeComparison?: boolean;
    includeForecasting?: boolean;
    includeMetas?: boolean;
    format?: 'pdf' | 'csv' | 'xlsx';
  };

  @Column({ type: 'simple-array', nullable: true })
  recipientEmails: string[];

  @Column({ type: 'int', default: 0 })
  dayOfMonth?: number; // Para monthly/quarterly/annual

  @Column({ type: 'simple-array', nullable: true })
  daysOfWeek?: string[]; // Para weekly: ['monday', 'wednesday']

  @Column({ type: 'varchar', length: 5, default: '08:00' })
  executionTime: string; // HH:mm

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastExecution: Date;

  @Column({ type: 'timestamp', nullable: true })
  nextExecution: Date;

  @Column({ type: 'int', default: 0 })
  executionCount: number;

  @Column({ type: 'varchar', length: 50, default: 'pending' })
  lastStatus: 'pending' | 'success' | 'failed'; // Status da última execução

  @Column({ type: 'text', nullable: true })
  lastErrorMessage: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    totalGenerated?: number;
    totalSent?: number;
    averageExecutionMs?: number;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;
}
