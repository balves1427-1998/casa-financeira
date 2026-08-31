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

@Entity('planned_accounts')
@Index(['userId'])
@Index(['dueDate'])
@Index(['status'])
export class PlannedAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  description: string;

  @Column({ nullable: true })
  category?: string;

  @Column('decimal', { precision: 15, scale: 2 })
  amount: number;

  @Column()
  dueDate: Date;

  @Column()
  responsible: string; // bruno or giovanna

  @Column({ nullable: true })
  accountId?: string;

  @Column({ nullable: true })
  creditCardId?: string;

  @Column({ default: false })
  isRecurring: boolean;

  @Column({
    type: 'enum',
    enum: ['daily', 'weekly', 'monthly', 'yearly'],
    nullable: true,
  })
  frequency?: 'daily' | 'weekly' | 'monthly' | 'yearly';

  @Column({
    type: 'enum',
    enum: ['pending', 'confirmed', 'paid', 'cancelled', 'overdue'],
    default: 'pending',
  })
  status: 'pending' | 'confirmed' | 'paid' | 'cancelled' | 'overdue';

  @Column({ nullable: true })
  observation?: string;

  /**
   * Despesa recorrente que projetou esta ocorrência.
   *
   * Nulo nas contas cadastradas à mão. É o vínculo que distingue uma projeção
   * de um compromisso digitado pelo usuário — e o que permite encerrar a série
   * sem tocar no que ele criou manualmente.
   */
  @Column({ nullable: true })
  recurringExpenseId?: string;

  @Column({ nullable: true })
  paymentDate?: Date;

  @Column({ default: 0 })
  priority: number; // 0=low, 1=normal, 2=high

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;

  // Relations
  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;
}
