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

@Entity('classification_rules')
@Index(['userId'])
@Index(['keyword'])
export class ClassificationRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  keyword: string; // Text to match (case insensitive)

  @Column()
  category: string;

  @Column({ nullable: true })
  subcategory?: string;

  @Column({ default: 'keyword' })
  matchType: 'keyword' | 'regex' | 'exact';

  @Column({ default: 0 })
  priority: number; // Higher priority rules applied first

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: 0 })
  timesApplied: number; // Count of successful applications

  @Column({ nullable: true })
  bank?: string; // Optional: specific bank

  @Column({ nullable: true })
  merchant?: string; // Optional: specific merchant

  @Column({ nullable: true })
  description?: string;

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
