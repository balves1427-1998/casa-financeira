import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  IsDate,
  IsEnum,
  Min,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { GoalType, GoalStatus } from '../entities/goal.entity';

/**
 * DTOs das metas financeiras.
 *
 * O `UpdateGoalDto` é uma CLASSE própria — nunca `Partial<CreateGoalDto>`. Um
 * tipo `Partial<>` some na compilação e o `ValidationPipe`, que resolve o
 * esquema em tempo de execução, deixaria o corpo inteiro passar sem validação
 * (e com `forbidNonWhitelisted: true` no pipe global, sem whitelist alguma).
 */
export class CreateGoalDto {
  @IsNotEmpty({ message: 'Informe o nome da meta' })
  @IsString()
  @MaxLength(255)
  name: string;

  @IsNotEmpty({ message: 'Informe o tipo da meta' })
  @IsEnum(GoalType, {
    message:
      'Tipo inválido. Use: EMERGENCY_FUND, TRAVEL, CAR, HOUSE, INVESTMENT ou OTHER.',
  })
  type: GoalType;

  @IsNotEmpty({ message: 'Informe o valor objetivo da meta' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'O valor objetivo deve ser maior que zero' })
  targetAmount: number;

  /** Quanto já existe guardado no momento do cadastro. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'O valor atual não pode ser negativo' })
  currentAmount?: number;

  /** Prazo para bater a meta. Opcional — nem toda meta tem data. */
  @IsOptional()
  @Transform(({ value }: { value: any }) => (value ? new Date(value) : value))
  @IsDate({ message: 'Prazo inválido. Use uma data no formato ISO.' })
  deadline?: Date;

  /** Aporte mensal PLANEJADO (o necessário é calculado pelo sistema). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'O aporte mensal não pode ser negativo' })
  monthlyContribution?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class UpdateGoalDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsEnum(GoalType, {
    message:
      'Tipo inválido. Use: EMERGENCY_FUND, TRAVEL, CAR, HOUSE, INVESTMENT ou OTHER.',
  })
  type?: GoalType;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'O valor objetivo deve ser maior que zero' })
  targetAmount?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'O valor atual não pode ser negativo' })
  currentAmount?: number;

  @IsOptional()
  @Transform(({ value }: { value: any }) => (value ? new Date(value) : value))
  @IsDate({ message: 'Prazo inválido. Use uma data no formato ISO.' })
  deadline?: Date;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  monthlyContribution?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  /**
   * Permite reabrir (`ACTIVE`), cancelar ou concluir manualmente uma meta.
   * A conclusão automática continua acontecendo nos aportes.
   */
  @IsOptional()
  @IsEnum(GoalStatus, {
    message: 'Status inválido. Use: ACTIVE, COMPLETED ou CANCELLED.',
  })
  status?: GoalStatus;
}

/** Aporte feito na meta: valor e, opcionalmente, a data em que ocorreu. */
export class AddContributionDto {
  @IsNotEmpty({ message: 'Informe o valor do aporte' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'O valor do aporte deve ser maior que zero' })
  amount: number;

  @IsOptional()
  @Transform(({ value }: { value: any }) => (value ? new Date(value) : value))
  @IsDate({ message: 'Data do aporte inválida. Use uma data no formato ISO.' })
  date?: Date;
}
