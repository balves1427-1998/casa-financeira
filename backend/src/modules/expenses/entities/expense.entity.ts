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
import { Account } from '../../accounts/entities/account.entity';

@Entity('expenses')
@Index(['userId'])
@Index(['accountId'])
@Index(['date'])
@Index(['category'])
@Index(['createdAt'])
export class Expense {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ nullable: true })
  accountId?: string;

  @Column({ nullable: true })
  creditCardId?: string;

  @Column()
  description: string;

  @Column({ nullable: true })
  establishment?: string;

  @Column('decimal', { precision: 15, scale: 2 })
  amount: number;

  @Column()
  date: Date;

  @Column()
  category: string;

  @Column({ nullable: true })
  subcategory?: string;

  @Column()
  responsible: string; // bruno or giovanna

  @Column({
    type: 'enum',
    enum: ['cash', 'debit', 'credit', 'transfer', 'pix'],
  })
  paymentMethod: 'cash' | 'debit' | 'credit' | 'transfer' | 'pix';

  @Column({ default: false })
  isRecurring: boolean;

  @Column({ nullable: true })
  frequency?: 'daily' | 'weekly' | 'monthly' | 'yearly';

  @Column({ nullable: true })
  installments?: number;

  @Column({ nullable: true })
  currentInstallment?: number;

  @Column({ nullable: true })
  observation?: string;

  @Column({
    type: 'enum',
    enum: ['manual', 'bank_statement', 'credit_card', 'import', 'recurring'],
    default: 'manual',
  })
  origin: 'manual' | 'bank_statement' | 'credit_card' | 'import' | 'recurring';

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;

  // Relations
  @ManyToOne(() => User, (user) => user.expenses)
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Account, (account) => account.expenses, { nullable: true })
  @JoinColumn({ name: 'accountId' })
  account?: Account;
}
