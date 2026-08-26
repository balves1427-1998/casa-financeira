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
  OneToMany,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Expense } from '../../expenses/entities/expense.entity';

@Entity('accounts')
@Index(['userId'])
@Index(['createdAt'])
export class Account {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  name: string;

  @Column({
    type: 'enum',
    enum: ['checking', 'savings', 'wallet', 'digital', 'credit_card'],
  })
  type: 'checking' | 'savings' | 'wallet' | 'digital' | 'credit_card';

  @Column()
  institution: string;

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  balance: number;

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  initialBalance: number;

  @Column('decimal', { precision: 15, scale: 2, nullable: true })
  limit?: number;

  @Column({ nullable: true })
  closingDay?: number;

  @Column({ nullable: true })
  dueDay?: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;

  // Relations
  @ManyToOne(() => User, (user) => user.accounts)
  @JoinColumn({ name: 'userId' })
  user: User;

  @OneToMany(() => Expense, (expense) => expense.account, { lazy: true })
  expenses: Expense[];

}
