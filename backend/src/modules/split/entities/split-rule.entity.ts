import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Family } from '../../families/entities/family.entity';

/**
 * Critério de rateio das despesas compartilhadas da casa (item 15 do escopo).
 *
 * - `EQUAL`               → 50/50 (ou 1/N, se a casa tiver mais responsáveis).
 * - `INCOME_PROPORTIONAL` → proporcional à renda recorrente real de cada um.
 * - `CUSTOM`              → percentuais definidos manualmente pela família.
 */
export enum SplitMode {
  EQUAL = 'EQUAL',
  INCOME_PROPORTIONAL = 'INCOME_PROPORTIONAL',
  CUSTOM = 'CUSTOM',
}

/**
 * Regra de rateio da família.
 *
 * Existe no máximo UMA regra vigente por família (índice único em `family_id`).
 * Quando não há nenhuma cadastrada, o serviço assume `EQUAL` — a divisão
 * igualitária é o comportamento padrão descrito no escopo.
 *
 * ATENÇÃO ÀS COLUNAS: a tabela `split_rules` usa snake_case e a entidade
 * camelCase. Toda coluna divergente declara `name` explicitamente — sem isso o
 * TypeORM monta o SELECT com o nome da propriedade e o PostgreSQL responde
 * `QueryFailedError: column ... does not exist`.
 */
@Entity('split_rules')
@Index('idx_split_rules_family', ['familyId'], { unique: true })
export class SplitRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'family_id', type: 'uuid' })
  familyId: string;

  /**
   * Modo do rateio.
   *
   * Gravado como `varchar` com CHECK constraint no banco (e não como tipo ENUM
   * do PostgreSQL) para que incluir um novo modo seja uma migration de
   * constraint, sem `ALTER TYPE`.
   */
  @Column({ name: 'mode', type: 'varchar', length: 30, default: SplitMode.EQUAL })
  mode: SplitMode;

  /**
   * Percentuais manuais por responsável, usados apenas no modo `CUSTOM`.
   * Exemplo: `{ "bruno": 70, "giovanna": 30 }` — a soma precisa dar 100.
   */
  @Column({ name: 'custom_percentages', type: 'jsonb', nullable: true })
  customPercentages: Record<string, number> | null;

  /** Observação livre sobre o acordo de rateio da casa. */
  @Column({ name: 'notes', type: 'varchar', length: 500, nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Family, (family) => family.id)
  @JoinColumn({ name: 'family_id' })
  family: Family;
}
