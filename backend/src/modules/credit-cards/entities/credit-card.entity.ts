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

@Entity('credit_cards')
@Index(['userId'])
@Index(['closingDay'])
@Index(['dueDay'])
export class CreditCard {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  name: string;

  @Column()
  bank: string;

  @Column()
  cardNumber: string; // Last 4 digits: XXXX1234

  @Column('decimal', { precision: 15, scale: 2 })
  limit: number;

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  currentBalance: number;

  @Column()
  closingDay: number; // Day of month when statement closes

  @Column()
  dueDay: number; // Day of month when payment is due

  @Column('enum', {
    enum: ['active', 'inactive', 'blocked', 'expired'],
    default: 'active',
  })
  status: 'active' | 'inactive' | 'blocked' | 'expired';

  @Column({ nullable: true })
  cardholderName?: string;

  @Column({ nullable: true })
  cardType?: string; // Visa, Mastercard, Elo, etc

  @Column('timestamp', { nullable: true })
  expiryDate?: Date;

  @Column({ nullable: true })
  accountId?: string; // Account used to pay the bill

  // A coluna existe no banco como numeric(5,2); sem declarar o tipo o TypeORM
  // a inferia como integer, divergindo do schema.
  @Column('decimal', { precision: 5, scale: 2, nullable: true, default: 0 })
  interestRate: number; // Monthly interest rate in percentage

  @Column({ type: 'text', nullable: true })
  notes?: string;

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
