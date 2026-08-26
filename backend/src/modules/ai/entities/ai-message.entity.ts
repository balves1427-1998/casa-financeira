import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Family } from '../../families/entities/family.entity';

@Entity('ai_messages')
@Index('idx_ai_messages_family_user', ['family', 'user'])
@Index('idx_ai_messages_created', ['createdAt'])
@Index('idx_ai_messages_intent', ['intent'])
export class AiMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'family_id', type: 'uuid' })
  familyId: string;

  @ManyToOne(() => User, (user) => user.id)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Family, (family) => family.id)
  @JoinColumn({ name: 'family_id' })
  family: Family;

  @Column('text')
  question: string;

  @Column('text')
  answer: string;

  @Column('varchar', { length: 100, nullable: true })
  intent: string | null;

  /**
   * Confiança da detecção de intenção (0-100)
   */
  @Column('decimal', { precision: 5, scale: 2, nullable: true })
  confidence: number | null;

  /**
   * Array de fontes de dados utilizadas para a resposta
   * Exemplo: ["expenses", "forecasts", "goals"]
   */
  @Column('jsonb', { default: '[]' })
  sources: string[];

  /**
   * Sugestões de perguntas de follow-up
   */
  @Column({
    name: 'follow_up_questions',
    type: 'text',
    array: true,
    nullable: true,
    default: '{}',
  })
  followUpQuestions: string[] | null;

  /**
   * Metadados adicionais
   */
  @Column('jsonb', { default: '{}' })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
