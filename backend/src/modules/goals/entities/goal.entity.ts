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
/**
 * Classificação do investimento.
 *
 * Os seis primeiros valores são os objetivos que a antiga aba Metas conhecia e
 * continuam valendo — a "caixinha da viagem" é TRAVEL. Os demais descrevem onde
 * o dinheiro está aplicado, que é o que faltava para acompanhar rendimento.
 */
export enum GoalType {
  EMERGENCY_FUND = 'EMERGENCY_FUND',
  TRAVEL = 'TRAVEL',
  CAR = 'CAR',
  HOUSE = 'HOUSE',
  INVESTMENT = 'INVESTMENT',
  OTHER = 'OTHER',
  SAVINGS = 'SAVINGS',
  BOX = 'BOX',
  CDB = 'CDB',
  TREASURY = 'TREASURY',
  FUND = 'FUND',
  STOCKS = 'STOCKS',
  CRYPTO = 'CRYPTO',
  PENSION = 'PENSION',
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

  /**
   * Valor objetivo.
   *
   * Opcional: um CDB não tem objetivo, tem valor. Fica nulo nos investimentos
   * que existem só para acompanhar rendimento.
   */
  @Column({
    name: 'target_amount',
    type: 'decimal',
    precision: 15,
    scale: 2,
    nullable: true,
  })
  targetAmount?: number;

  /** Onde o dinheiro está aplicado (Nubank, XP, Caixa…). */
  @Column({ name: 'institution', type: 'varchar', length: 255, nullable: true })
  institution?: string;

  /**
   * Quanto foi APORTADO, do próprio bolso.
   *
   * Separado de `currentAmount` de propósito: sem os dois números não há como
   * calcular rendimento — "tenho R$ 10.000" não distingue o que foi guardado do
   * que a aplicação rendeu.
   */
  @Column({
    name: 'invested_amount',
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
  })
  investedAmount: number;

  /** Vencimento, para CDB, Tesouro e afins. */
  @Column({ name: 'maturity_date', type: 'timestamp', nullable: true })
  maturityDate?: Date;

  /** Em quanto tempo o dinheiro fica disponível (D+0, D+1, no vencimento…). */
  @Column({ name: 'liquidity', type: 'varchar', length: 30, nullable: true })
  liquidity?: string;

  /**
   * Valor ATUAL da aplicação.
   *
   * Cresce com os aportes e pode ser corrigido pelo usuário para refletir o
   * rendimento. A diferença para `investedAmount` é o ganho (ou a perda).
   */
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
