import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsDate,
  IsBoolean,
  IsOptional,
  IsEnum,
  IsUUID,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';

export enum PaymentMethod {
  CASH = 'cash',
  DEBIT = 'debit',
  CREDIT = 'credit',
  TRANSFER = 'transfer',
  PIX = 'pix',
}

export enum ExpenseOrigin {
  MANUAL = 'manual',
  BANK_STATEMENT = 'bank_statement',
  CREDIT_CARD = 'credit_card',
  IMPORT = 'import',
  RECURRING = 'recurring',
}

export enum RecurrenceFrequency {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

export class CreateExpenseDto {
  @IsNotEmpty()
  @IsString()
  description: string;

  @IsOptional()
  @IsString()
  establishment?: string;

  @IsNotEmpty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsNotEmpty()
  @Transform(({ value }: { value: any }) => new Date(value))
  @IsDate()
  date: Date;

  @IsNotEmpty()
  @IsString()
  category: string;

  @IsOptional()
  @IsString()
  subcategory?: string;

  @IsNotEmpty()
  @IsString()
  @IsEnum(['bruno', 'giovanna'], {
    message: 'responsible must be either bruno or giovanna',
  })
  responsible: string;

  @IsNotEmpty()
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @IsOptional()
  @IsUUID()
  accountId?: string;

  @IsOptional()
  @IsUUID()
  creditCardId?: string;

  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @IsOptional()
  @IsEnum(RecurrenceFrequency)
  frequency?: RecurrenceFrequency;

  @IsOptional()
  @IsNumber()
  @Min(1)
  installments?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  currentInstallment?: number;

  @IsOptional()
  @IsString()
  observation?: string;

  @IsOptional()
  @IsEnum(ExpenseOrigin)
  origin?: ExpenseOrigin;

  /**
   * Opcional: quando omitido, o serviço decide pela forma de pagamento — à
   * vista com data passada já nasce paga; no crédito, não.
   */
  @IsOptional()
  @IsBoolean()
  isPaid?: boolean;
}

/**
 * Marca ou desmarca uma despesa como paga.
 */
export class SetExpensePaidDto {
  @IsNotEmpty()
  @IsBoolean()
  isPaid: boolean;
}

/**
 * DTO de atualização de despesa.
 *
 * Mesma correção aplicada em contas: `Partial<CreateExpenseDto>` no controller
 * não sobrevive à compilação, então o PUT aceitava qualquer corpo sem validação.
 */
export class UpdateExpenseDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  establishment?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @Transform(({ value }: { value: any }) => new Date(value))
  @IsDate()
  date?: Date;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  subcategory?: string;

  @IsOptional()
  @IsEnum(['bruno', 'giovanna'], {
    message: 'responsible must be either bruno or giovanna',
  })
  responsible?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsUUID()
  accountId?: string;

  @IsOptional()
  @IsUUID()
  creditCardId?: string;

  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @IsOptional()
  @IsEnum(RecurrenceFrequency)
  frequency?: RecurrenceFrequency;

  @IsOptional()
  @IsNumber()
  @Min(1)
  installments?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  currentInstallment?: number;

  @IsOptional()
  @IsString()
  observation?: string;

  @IsOptional()
  @IsEnum(ExpenseOrigin)
  origin?: ExpenseOrigin;

  @IsOptional()
  @IsBoolean()
  isPaid?: boolean;
}
