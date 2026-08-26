import { IsNotEmpty, IsString, IsEnum, IsOptional, IsNumber } from 'class-validator';

export enum AccountType {
  CHECKING = 'checking',
  SAVINGS = 'savings',
  WALLET = 'wallet',
  DIGITAL = 'digital',
  CREDIT_CARD = 'credit_card',
}

export class CreateAccountDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsEnum(AccountType)
  type: AccountType;

  @IsNotEmpty()
  @IsString()
  institution: string;

  @IsOptional()
  @IsNumber()
  initialBalance?: number;

  @IsOptional()
  @IsNumber()
  limit?: number;

  @IsOptional()
  @IsNumber()
  closingDay?: number;

  @IsOptional()
  @IsNumber()
  dueDay?: number;
}

/**
 * DTO de atualização de conta.
 *
 * O controller tipava o corpo do PUT como `Partial<CreateAccountDto>`. Como
 * esse tipo desaparece na compilação, o ValidationPipe não recebia nenhuma
 * classe para validar e o corpo passava inteiro, sem `whitelist`: era possível
 * gravar campos arbitrários (`campoInvalido`) e sobrescrever `balance`
 * diretamente. Declarar a classe restaura a validação.
 */
export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(AccountType)
  type?: AccountType;

  @IsOptional()
  @IsString()
  institution?: string;

  @IsOptional()
  @IsNumber()
  limit?: number;

  @IsOptional()
  @IsNumber()
  closingDay?: number;

  @IsOptional()
  @IsNumber()
  dueDay?: number;
}
