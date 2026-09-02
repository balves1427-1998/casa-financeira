import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UploadPdfDto {
  @IsString()
  fileName: string;

  @IsString()
  fileContent: string; // Base64 encoded content

  /**
   * Cartão da fatura. Obrigatório na prática para faturas de cartão: é o que
   * faz as compras importadas contarem no limite utilizado.
   */
  @IsOptional()
  @IsUUID()
  creditCardId?: string;
}

export class ReviewPdfImportDto {
  @IsArray()
  confirmedTransactions: any[]; // Transactions user confirmed

  @IsArray()
  @IsOptional()
  rejectedTransactions?: any[]; // Transactions to reject

  @IsArray()
  @IsOptional()
  correctedTransactions?: any[]; // Transactions with corrections

  @IsOptional()
  @IsString()
  notes?: string; // User notes about the import
}

/** Correção que o usuário faz na tela de conferência, antes de gravar. */
export class AjusteLancamentoDto {
  @IsString()
  transactionId: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  responsible?: string;
}

/**
 * Corpo do `PUT /pdf-import/:id/confirm`.
 *
 * A versão anterior exigia `importId` — que já vem na URL — e um `action`
 * declarado com `@IsEnum(['confirm', ...])`. `IsEnum` espera um objeto enum, e
 * não um array: com array ele nunca aceita valor nenhum e a mensagem de erro
 * sai literalmente como "action must be one of the following values: ", com a
 * lista vazia.
 *
 * O efeito prático: TODA confirmação de importação respondia 400 e nada era
 * gravado. A rota nunca funcionou desde que existe.
 */
export class ImportConfirmationDto {
  /** Sem isto, grava todos os lançamentos lidos. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedTransactionIds?: string[];

  /** Categoria e responsável corrigidos na conferência. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AjusteLancamentoDto)
  ajustes?: AjusteLancamentoDto[];

  /** Responsável por toda a fatura, quando o usuário não ajusta linha a linha. */
  @IsOptional()
  @IsString()
  responsible?: string;
}

export class ExtractedTransactionDto {
  date: string; // YYYY-MM-DD format
  description: string;
  establishment?: string;
  amount: number;
  type: 'debit' | 'credit'; // For bank statements
  transactionId?: string; // For duplicate detection
  confidence?: number; // Extraction confidence (0-1)
  potentialDuplicate?: {
    existingId: string;
    matchScore: number;
    reason: string;
  };
}

export class PdfImportStatusDto {
  importId: string;
  status: 'pending_review' | 'reviewing' | 'confirmed' | 'imported' | 'rejected' | 'error';
  transactionCount: number;
  duplicateCount: number;
  errorMessage?: string;
  extractedData?: ExtractedTransactionDto[];
}
