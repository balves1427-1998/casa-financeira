import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { Account } from '../../accounts/entities/account.entity';
import { Expense } from '../../expenses/entities/expense.entity';
import { Family } from '../../families/entities/family.entity';

@Entity('users')
@Index(['email'], { unique: true })
@Index(['createdAt'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  email: string;

  /**
   * Hash bcrypt. `@Exclude()` impede que ele saia em qualquer resposta HTTP,
   * mesmo quando uma consulta carrega a relação `user` por engano.
   */
  @Exclude()
  @Column()
  password: string;

  @Column({ nullable: true })
  avatar?: string;

  @Column({ type: 'enum', enum: ['admin', 'user'], default: 'user' })
  role: 'admin' | 'user';

  @Column({ default: false })
  emailVerified: boolean;

  @Exclude()
  @Column({ nullable: true })
  refreshToken?: string;

  /**
   * Família à qual o usuário pertence.
   *
   * Todo o módulo de inteligência financeira é escopado por família; é daqui
   * que os controllers resolvem o `familyId` do usuário autenticado.
   */
  @Column({ name: 'family_id', type: 'uuid', nullable: true })
  familyId?: string;

  @ManyToOne(() => Family, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'family_id' })
  family?: Family;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;

  // Relations
  @OneToMany(() => Account, (account) => account.user, { lazy: true })
  accounts: Account[];


  @OneToMany(() => Expense, (expense) => expense.user, { lazy: true })
  expenses: Expense[];
}
