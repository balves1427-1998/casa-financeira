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
import { User } from '../../../modules/users/entities/user.entity';
import { MonthlyReport, ReportFormat } from '../reports.types';

/** Um arquivo exportado e realmente gravado em disco. */
export interface ReportFileRef {
  fileName: string;
  /** Caminho absoluto no disco. */
  filePath: string;
  /** Tamanho lido com `fs.statSync` — nunca o comprimento de uma string. */
  size: number;
  mimeType: string;
  generatedAt: string;
}

/** Indicadores resumidos, gravados para listar o histórico sem reabrir o JSON. */
export interface ReportMetadata {
  totalIncome: number;
  totalExpenses: number;
  balance: number;
  transactionCount: number;
  averageDailyExpense: number;
  /** `null` quando não há despesas no mês — e não um "N/A" inventado. */
  topCategory: string | null;
  topCategoryTotal: number | null;
  alertCount: number;
  /** `false` quando o mês não tem nenhum lançamento (regra 27). */
  hasData: boolean;
}

/**
 * Relatório gerado e persistido.
 *
 * ESCOPO: `familyId` é o que define quem enxerga o relatório — todo o sistema
 * agrega por família. `userId` continua registrando QUEM gerou.
 *
 * O `payload` guarda a estrutura consolidada do mês (`MonthlyReport`) no momento
 * da geração: um relatório é uma fotografia, e reabri-lo não pode recalcular
 * números diferentes dos que foram exportados para PDF/XLSX/CSV.
 *
 * As colunas `familyId`, `payload` e `files` são criadas pela migration 022.
 */
@Entity('reports')
@Index(['userId', 'reportType', 'createdAt'])
@Index(['userId', 'status', 'createdAt'])
export class Report {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, (user) => user.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  /** Família dona do relatório. Nulo apenas em registros anteriores à 022. */
  @Column({ name: 'familyId', type: 'uuid', nullable: true })
  familyId?: string;

  @Column('varchar')
  reportType: 'monthly' | 'quarterly' | 'annual' | 'custom' | 'comparison';

  @Column('varchar')
  status: 'pending' | 'generating' | 'ready' | 'failed';

  // Competência coberta pelo relatório
  @Column('int')
  startMonth: number; // 1-12

  @Column('int')
  startYear: number;

  @Column('int', { nullable: true })
  endMonth?: number;

  @Column('int', { nullable: true })
  endYear?: number;

  /** Opções usadas na geração (formatos pedidos, inclusão de lançamentos…). */
  @Column('jsonb')
  config: {
    formats: ReportFormat[];
    includeTransactions: boolean;
  };

  @Column('jsonb', { nullable: true })
  metadata?: ReportMetadata;

  /** Estrutura consolidada do mês, congelada no momento da geração. */
  @Column({ name: 'payload', type: 'jsonb', nullable: true })
  payload?: MonthlyReport;

  /** Arquivos gravados, indexados pelo formato. */
  @Column({ name: 'files', type: 'jsonb', nullable: true })
  files?: Partial<Record<ReportFormat, ReportFileRef>>;

  // ---- formato principal (o primeiro pedido), mantido para compatibilidade ----

  @Column('varchar', { nullable: true })
  fileUrl?: string;

  @Column('varchar', { nullable: true })
  fileName?: string;

  @Column('varchar', { nullable: true })
  fileFormat?: ReportFormat;

  @Column('int', { nullable: true })
  fileSize?: number;

  // Envio por e-mail
  @Column('boolean', { default: false })
  sentToEmail: boolean;

  @Column('timestamp', { nullable: true })
  sentAt?: Date;

  @Column('varchar', { array: true, nullable: true })
  recipientEmails?: string[];

  @Column('text', { nullable: true })
  errorMessage?: string;

  @Column('boolean', { default: false })
  isTemplate: boolean;

  @Column('varchar', { nullable: true })
  templateName?: string;

  @Column('int', { default: 0 })
  viewCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;
}
