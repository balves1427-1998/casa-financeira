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
import { Family } from '../../families/entities/family.entity';

/** Tipos de meta previstos no item 19 do escopo do projeto. */
export enum GoalType {
  EMERGENCY_FUND = 'EMERGENCY_FUND',
  TRAVEL = 'TRAVEL',
  CAR = 'CAR',
  HOUSE = 'HOUSE',
  INVESTMENT = 'INVESTMENT',
  OTHER = 'OTHER',
}

export enum GoalStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

/**
 * Meta financeira da casa (reserva de emergência, viagem, carro…).
 *
 * ESCOPO: a meta pertence à FAMÍLIA (`familyId`) — a reserva de emergência é da
 * casa, não de quem a cadastrou. `userId` registra apenas quem criou, e é o que
 * autoriza editar ou excluir o registro.
 *
 * NOMES DE COLUNA: o banco deste projeto usa snake_case nas tabelas mais novas
 * e as entidades declaram camelCase. Toda `@Column` divergente traz `name:`
 * explícito — sem isso o TypeORM monta o SELECT com o nome camelCase e o
 * PostgreSQL responde `column ... does not exist` em runtime.
 */
@Entity('goals')
@Index(['familyId'])
@Index(['userId'])
@Index(['status'])
@Index(['deadline'])
export class Goal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Família dona da meta. Nulo apenas no estado transitório de um usuário sem família. */
  @Column({ name: 'family_id', type: 'uuid', nullable: true })
  familyId?: string;

  /** Quem cadastrou a meta — é quem pode editá-la ou removê-la. */
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'name', type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'type', type: 'varchar', length: 30, default: GoalType.OTHER })
  type: GoalType;

  /** Valor objetivo da meta. */
  @Column({ name: 'target_amount', type: 'decimal', precision: 15, scale: 2 })
  targetAmount: number;

  /** Quanto já foi acumulado. Cresce com os aportes. */
  @Column({
    name: 'current_amount',
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
  })
  currentAmount: number;

  /** Prazo para atingir o objetivo. Opcional: nem toda meta tem data. */
  @Column({ name: 'deadline', type: 'timestamp', nullable: true })
  deadline?: Date;

  /** Aporte mensal que o usuário PLANEJA fazer (não o necessário — esse é calculado). */
  @Column({
    name: 'monthly_contribution',
    type: 'decimal',
    precision: 15,
    scale: 2,
    nullable: true,
  })
  monthlyContribution?: number;

  @Column({ name: 'description', type: 'text', nullable: true })
  description?: string;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 20,
    default: GoalStatus.ACTIVE,
  })
  status: GoalStatus;

  /** Data do último aporte registrado, para acompanhar a regularidade. */
  @Column({ name: 'last_contribution_at', type: 'timestamp', nullable: true })
  lastContributionAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt?: Date;

  // ==================== relações ====================

  @ManyToOne(() => Family, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'family_id' })
  family?: Family;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
