import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsDate,
  IsOptional,
  IsEnum,
  IsUUID,
  Min,
  Max,
} from 'class-validator';
import { Transform } from 'class-transformer';

/** Entrada ou saída. O banco já tinha a coluna; o DTO é que não a deixava passar. */
export enum PlannedAccountType {
  EXPENSE = 'expense',
  INCOME = 'income',
}

export enum PlannedAccountStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  PAID = 'paid',
  CANCELLED = 'cancelled',
  OVERDUE = 'overdue',
}

export enum RecurrenceFrequency {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

export class CreatePlannedAccountDto {
  @IsNotEmpty()
  @IsString()
  description: string;

  /**
   * Entrada ou saída — o padrão é saída.
   *
   * A coluna `type` existe na tabela desde sempre e a tela inteira já se
   * comportava de acordo com ela, mas o DTO não a declarava: com `whitelist`
   * ligado, o campo era descartado no caminho e TODO compromisso criado à mão
   * virava despesa. Só as entradas projetadas a partir de uma receita
   * recorrente nasciam com `income`, porque essas o serviço grava direto.
   */
  @IsOptional()
  @IsEnum(PlannedAccountType)
  type?: PlannedAccountType;

  @IsOptional()
  @IsString()
  category?: string;

  @IsNotEmpty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsNotEmpty()
  @Transform(({ value }: { value: any }) => new Date(value))
  @IsDate()
  dueDate: Date;

  @IsNotEmpty()
  @IsString()
  @IsEnum(['bruno', 'giovanna'], {
    message: 'responsible must be either bruno or giovanna',
  })
  responsible: string;

  @IsOptional()
  @IsUUID()
  accountId?: string;

  @IsOptional()
  @IsUUID()
  creditCardId?: string;

  @IsOptional()
  isRecurring?: boolean;

  @IsOptional()
  @IsEnum(RecurrenceFrequency)
  frequency?: RecurrenceFrequency;

  @IsOptional()
  @IsEnum(PlannedAccountStatus)
  status?: PlannedAccountStatus;

  @IsOptional()
  @IsString()
  observation?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  priority?: number;
}

export class UpdatePlannedAccountDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(PlannedAccountType)
  type?: PlannedAccountType;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @Transform(({ value }: { value: any }) => new Date(value))
  @IsDate()
  dueDate?: Date;

  @IsOptional()
  @IsEnum(PlannedAccountStatus)
  status?: PlannedAccountStatus;

  @IsOptional()
  @IsString()
  observation?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  priority?: number;
}

/**
 * Corpo (opcional) da confirmação de um compromisso planejado.
 *
 * Existe por um motivo prático: o dinheiro raramente se move no dia em que
 * você lembra de registrar. Gravar sempre "hoje" jogava o salário que caiu
 * dia 5 no dia 12, e o extrato deixava de bater com o banco.
 */
export class ConfirmarPlanejadoDto {
  @IsOptional()
  @Transform(({ value }: { value: any }) =>
    value === undefined || value === null || value === '' ? undefined : new Date(value),
  )
  @IsDate()
  paymentDate?: Date;
}
