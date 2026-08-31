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
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Tipos de receita previstos no escopo do projeto.
 *
 * É um enum aberto na prática: `type` continua sendo texto na entidade, mas
 * validar contra esta lista evita que a mesma origem entre grafada de três
 * jeitos diferentes e estrague os agrupamentos.
 */
export enum IncomeType {
  SALARY = 'salary',
  OVERTIME = 'overtime',
  FREELANCE = 'freelance',
  REIMBURSEMENT = 'reimbursement',
  BONUS = 'bonus',
  COMMISSION = 'commission',
  PIX = 'pix',
  TRANSFER = 'transfer',
  INVESTMENT = 'investment',
  OTHER = 'other',
}

export enum IncomeFrequency {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

export class CreateIncomeDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  description: string;

  @IsNotEmpty()
  @IsEnum(IncomeType, {
    message:
      'Tipo inválido. Use: salary, overtime, freelance, reimbursement, bonus, commission, pix, transfer, investment ou other.',
  })
  type: IncomeType;

  @IsNotEmpty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'O valor da receita deve ser maior que zero' })
  amount: number;

  @IsNotEmpty()
  @Transform(({ value }: { value: any }) => new Date(value))
  @IsDate({ message: 'Data inválida' })
  date: Date;

  /** Conta em que o dinheiro entrou. */
  @IsNotEmpty()
  @IsUUID('4', { message: 'Informe uma conta de destino válida' })
  accountId: string;

  /** Quem recebeu — `bruno`, `giovanna` ou outro responsável cadastrado. */
  @IsNotEmpty()
  @IsString()
  responsible: string;

  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @IsOptional()
  @IsEnum(IncomeFrequency)
  frequency?: IncomeFrequency;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observation?: string;
}

/**
 * Classe própria (em vez de `Partial<CreateIncomeDto>`) porque o
 * `ValidationPipe` precisa de uma CLASSE em tempo de execução — um tipo
 * `Partial<>` desaparece na compilação e o corpo passaria sem validação alguma.
 */
export class UpdateIncomeDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @IsEnum(IncomeType)
  type?: IncomeType;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @Transform(({ value }: { value: any }) => new Date(value))
  @IsDate()
  date?: Date;

  @IsOptional()
  @IsUUID('4')
  accountId?: string;

  @IsOptional()
  @IsString()
  responsible?: string;

  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @IsOptional()
  @IsEnum(IncomeFrequency)
  frequency?: IncomeFrequency;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observation?: string;
}

/**
 * Encerra ou retoma a recorrência de uma receita.
 *
 * `active: false` para de projetar os meses seguintes e limpa as entradas
 * futuras ainda não recebidas. A receita em si permanece — ela é dinheiro que
 * entrou de fato.
 */
export class SetIncomeRecurrenceDto {
  @IsNotEmpty()
  @IsBoolean()
  active: boolean;
}
