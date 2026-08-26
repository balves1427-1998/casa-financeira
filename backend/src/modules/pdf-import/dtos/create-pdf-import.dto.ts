import { IsString, IsOptional, IsEnum, IsArray } from 'class-validator';

export class UploadPdfDto {
  @IsString()
  fileName: string;

  @IsString()
  fileContent: string; // Base64 encoded content
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

export class ImportConfirmationDto {
  @IsString()
  importId: string;

  @IsEnum(['confirm', 'reject', 'review_later'])
  action: string;

  @IsOptional()
  @IsArray()
  selectedTransactionIds?: string[]; // If partial import
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
