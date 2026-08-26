import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('categories')
@Index(['userId'])
@Index(['name'])
@Index(['type'])
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description?: string;

  @Column('enum', {
    enum: ['income', 'expense'],
    default: 'expense',
  })
  type: 'income' | 'expense';

  @Column({ nullable: true })
  parentCategoryId?: string;

  @Column({ nullable: true })
  color?: string; // Hex color for UI

  @Column({ nullable: true })
  icon?: string; // Icon name

  @Column('decimal', { precision: 15, scale: 2, nullable: true })
  monthlyBudget?: number;

  @Column({ default: false })
  isRecurring: boolean;

  @Column({ default: 0 })
  displayOrder: number;

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

  @ManyToOne(() => Category, (category) => category.subcategories, {
    nullable: true,
  })
  @JoinColumn({ name: 'parentCategoryId' })
  parentCategory?: Category;

  @OneToMany(() => Category, (category) => category.parentCategory)
  subcategories: Category[];
}
