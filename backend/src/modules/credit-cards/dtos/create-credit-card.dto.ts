import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  IsDateString,
  Min,
  Max,
  Matches,
} from 'class-validator';

export enum CreditCardStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  BLOCKED = 'blocked',
  EXPIRED = 'expired',
}

export class CreateCreditCardDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  bank: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{4}$/, {
    message: 'cardNumber must be the last 4 digits (e.g., 1234)',
  })
  cardNumber: string;

  @IsNotEmpty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  limit: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  @Max(31)
  closingDay: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  @Max(31)
  dueDay: number;

  @IsOptional()
  @IsEnum(CreditCardStatus)
  status?: CreditCardStatus;

  @IsOptional()
  @IsString()
  cardholderName?: string;

  @IsOptional()
  @IsString()
  cardType?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  interestRate?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateCreditCardDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  limit?: number;

  @IsOptional()
  @IsEnum(CreditCardStatus)
  status?: CreditCardStatus;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(31)
  closingDay?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(31)
  dueDay?: number;

  @IsOptional()
  @IsString()
  cardholderName?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  interestRate?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
