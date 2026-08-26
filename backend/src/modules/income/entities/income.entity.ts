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

@Entity('incomes')
@Index(['userId'])
@Index(['accountId'])
@Index(['date'])
@Index(['createdAt'])
export class Income {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  accountId: string;

  @Column()
  description: string;

  @Column()
  type: string; // salary, freelance, bonus, etc

  @Column('decimal', { precision: 15, scale: 2 })
  amount: number;

  @Column()
  date: Date;

  @Column() // bruno or giovanna
  responsible: string;

  @Column({ default: false })
  isRecurring: boolean;

  @Column({ nullable: true })
  frequency?: 'daily' | 'weekly' | 'monthly' | 'yearly';

  @Column({ nullable: true })
  observation?: string;

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

  @ManyToOne(() => Account)
  @JoinColumn({ name: 'accountId' })
  account: Account;
}
