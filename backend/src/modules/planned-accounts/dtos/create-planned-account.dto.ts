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
