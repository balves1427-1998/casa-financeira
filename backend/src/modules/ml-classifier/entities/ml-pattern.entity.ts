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
import { Category } from '../../categories/entities/category.entity';

@Entity('ml_patterns')
@Index(['userId'])
@Index(['userId', 'categoryId'])
@Index(['userId', 'confidence'])
export class MLPattern {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  // Categoria identificada
  @Column('uuid')
  categoryId: string;

  @ManyToOne(() => Category, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'category_id' })
  category: Category;

  // Tipo de padrão
  @Column('enum', {
    enum: ['keyword', 'regex', 'establishment', 'amount_range', 'time_based', 'multi_criteria'],
  })
  patternType: 'keyword' | 'regex' | 'establishment' | 'amount_range' | 'time_based' | 'multi_criteria';

  // Padrão em si
  @Column('text')
  pattern: string;

  // Confiança do padrão (baseada em histórico)
  @Column('decimal', { precision: 3, scale: 2 })
  confidence: number;

  // Quantidade de matches
  @Column('integer', { default: 0 })
  matchCount: number;

  // Última vez que foi usado
  @Column('timestamp', { nullable: true })
  lastMatchedAt?: Date;

  // Se foi aprovado ou rejeitado pelo usuário
  @Column('enum', {
    enum: ['auto', 'approved', 'rejected'],
    default: 'auto',
  })
  status: 'auto' | 'approved' | 'rejected';

  // Descrição humana do padrão
  @Column('text', { nullable: true })
  description?: string;

  // Metadata adicional
  @Column('json', { nullable: true })
  metadata?: {
    keywords?: string[];
    establishments?: string[];
    amountMin?: number;
    amountMax?: number;
    daysOfWeek?: number[];
    derivedFrom?: 'feedback' | 'training' | 'manual';
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
