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

@Entity('pdf_imports')
@Index(['userId'])
@Index(['status'])
@Index(['importType'])
export class PdfImport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  fileName: string; // Original PDF file name

  // `bytea` é o tipo binário do PostgreSQL; `longblob` é exclusivo do MySQL.
  @Column({ type: 'bytea', nullable: true })
  fileContent?: Buffer; // Store original PDF if needed

  @Column({
    type: 'enum',
    enum: ['bank_statement', 'credit_card_invoice', 'unknown'],
    default: 'unknown',
  })
  importType: string; // Type of document detected

  @Column({ nullable: true })
  bankName?: string; // Bank name if detected

  @Column({ nullable: true })
  cardName?: string; // Card name if detected

  /**
   * Cartão ao qual esta fatura pertence.
   *
   * Informado pelo usuário no upload. Sem ele, as despesas da fatura entravam
   * sem cartão nenhum — e o limite utilizado, que é derivado das compras com
   * `creditCardId`, nunca refletia a fatura importada.
   */
  @Column({ nullable: true })
  creditCardId?: string;

  @Column({ type: 'json' })
  extractedData: any; // Raw extracted data from PDF

  @Column({ default: 0 })
  transactionCount: number; // Number of transactions found

  @Column({ default: 0 })
  duplicateCount: number; // Number of potential duplicates found

  @Column({
    type: 'enum',
    enum: ['pending_review', 'reviewing', 'confirmed', 'imported', 'rejected', 'error'],
    default: 'pending_review',
  })
  status: string; // Import status

  @Column({ nullable: true })
  errorMessage?: string; // Error details if extraction failed

  @Column({ type: 'json', nullable: true })
  duplicateMatches?: any[]; // List of potential duplicate matches

  @Column({ type: 'json', nullable: true })
  userReview?: any; // User's review/corrections

  @Column({ default: false })
  isProcessed: boolean; // Whether import was fully processed

  @Column({ nullable: true })
  processedAt?: Date; // When import was finalized

  @Column({ default: false })
  isAutoClassified: boolean; // Whether transactions were auto-classified

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
