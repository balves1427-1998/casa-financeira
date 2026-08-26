import {
  IsString,
  IsEnum,
  IsArray,
  IsEmail,
  IsOptional,
  IsBoolean,
  IsObject,
  ValidateNested,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ReportFrequency } from '../entities/report-schedule.entity';

/**
 * DTO para configuração de relatório
 */
export class ReportConfigDto {
  @IsOptional()
  @IsBoolean()
  includeSummary?: boolean;

  @IsOptional()
  @IsBoolean()
  includeSpendingPatterns?: boolean;

  @IsOptional()
  @IsBoolean()
  includeAnomalies?: boolean;

  @IsOptional()
  @IsBoolean()
  includeTrends?: boolean;

  @IsOptional()
  @IsBoolean()
  includeComparison?: boolean;

  @IsOptional()
  @IsBoolean()
  includeForecasting?: boolean;

  @IsOptional()
  @IsBoolean()
  includeMetas?: boolean;

  @IsOptional()
  @IsEnum(['pdf', 'csv', 'xlsx'])
  format?: 'pdf' | 'csv' | 'xlsx';
}

/**
 * DTO para criar/atualizar agendamento
 */
export class CreateReportScheduleDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  name: string;

  @IsString()
  @MaxLength(50)
  reportType: string; // 'monthly', 'custom', 'summary'

  @IsEnum(ReportFrequency)
  frequency: ReportFrequency;

  @IsOptional()
  @Type(() => ReportConfigDto)
  @ValidateNested()
  config?: ReportConfigDto;

  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  recipientEmails?: string[];

  @IsOptional()
  dayOfMonth?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  daysOfWeek?: string[];

  @IsOptional()
  @Matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'executionTime deve estar no formato HH:mm',
  })
  executionTime?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/**
 * DTO para atualizar agendamento
 */
export class UpdateReportScheduleDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsEnum(ReportFrequency)
  frequency?: ReportFrequency;

  @IsOptional()
  @Type(() => ReportConfigDto)
  @ValidateNested()
  config?: ReportConfigDto;

  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  recipientEmails?: string[];

  @IsOptional()
  dayOfMonth?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  daysOfWeek?: string[];

  @IsOptional()
  @Matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
  executionTime?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/**
 * DTO para resposta
 */
export class ReportScheduleDto {
  id: string;
  userId: string;
  name: string;
  reportType: string;
  frequency: ReportFrequency;
  config: ReportConfigDto;
  recipientEmails: string[];
  dayOfMonth?: number;
  daysOfWeek?: string[];
  executionTime: string;
  isActive: boolean;
  lastExecution: Date;
  nextExecution: Date;
  executionCount: number;
  lastStatus: 'pending' | 'success' | 'failed';
  lastErrorMessage?: string;
  metadata: any;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * DTO para executar agenda manualmente
 */
export class ExecuteScheduleDto {
  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean;
}

/**
 * DTO para resposta de execução
 */
export class ExecutionResultDto {
  success: boolean;
  scheduleId: string;
  executedAt: Date;
  nextExecutionAt?: Date;
  reportId?: string;
  emailsSent?: number;
  errorMessage?: string;
}
