import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Expense } from '../../expenses/entities/expense.entity';
import { Category } from '../../categories/entities/category.entity';

@Entity('ml_feedback')
@Index(['userId'])
@Index(['userId', 'createdAt'])
@Index(['userId', 'isPositive'])
// A entidade não possui `categoryId`; a categoria persistida é `correctCategoryId`.
@Index(['correctCategoryId'])
export class MLFeedback {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  // Transação relacionada
  @Column('uuid', { nullable: true })
  expenseId?: string;

  @ManyToOne(() => Expense, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'expense_id' })
  expense?: Expense;

  // Descrição original da transação
  @Column('text')
  description: string;

  // Categoria sugerida pelo modelo
  @Column('uuid', { nullable: true })
  suggestedCategoryId?: string;

  @ManyToOne(() => Category, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'suggested_category_id' })
  suggestedCategory?: Category;

  // Categoria corrigida pelo usuário
  @Column('uuid')
  correctCategoryId: string;

  @ManyToOne(() => Category, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'correct_category_id' })
  correctCategory: Category;

  // Confiança da sugestão original
  @Column('decimal', { precision: 3, scale: 2, default: 0 })
  originalConfidence: number;

  // Tipo de feedback
  @Column('enum', {
    enum: ['correct', 'incorrect', 'partial'],
    default: 'incorrect',
  })
  feedbackType: 'correct' | 'incorrect' | 'partial';

  // Se o usuário teve que corrigir
  @Column('boolean', { default: false })
  isPositive: boolean;

  // Anotações do usuário
  @Column('text', { nullable: true })
  notes?: string;

  // Metadata para análise
  @Column('json', { nullable: true })
  metadata?: {
    source?: 'import' | 'manual' | 'ai_suggestion';
    establishmentHint?: string;
    timeToCorrect?: number; // ms
    correctionReason?: string;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
