import {
  IsString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsArray,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EmailType, EmailStatus } from '../entities/email-log.entity';

// Export types for use in other modules
export { EmailType, EmailStatus };

/**
 * DTO para enviar email
 */
export class SendEmailDto {
  @IsString()
  @IsEmail()
  recipient: string;

  @IsEnum(EmailType)
  type: EmailType;

  @IsString()
  subject: string;

  @IsString()
  templateName: string; // Nome do arquivo template (sem extensão)

  @IsOptional()
  @IsObject()
  templateData?: Record<string, any>;

  @IsOptional()
  @IsString()
  relatedEntityId?: string;

  @IsOptional()
  @IsString()
  relatedEntityType?: string;
}

/**
 * DTO para resposta de envio
 */
export class EmailSendResultDto {
  success: boolean;
  emailLogId: string;
  recipient: string;
  messageId?: string;
  sentAt: Date;
  errorMessage?: string;
}

/**
 * DTO para email log
 */
export class EmailLogDto {
  id: string;
  userId: string;
  recipient: string;
  type: EmailType;
  subject: string;
  templateName: string;
  status: EmailStatus;
  retryCount: number;
  sentAt?: Date;
  openedAt?: Date;
  errorMessage?: string;
  createdAt: Date;
}

/**
 * DTO para listar emails
 */
export class ListEmailLogsDto {
  logs: EmailLogDto[];
  total: number;
  pendingCount: number;
  failedCount: number;
}

/**
 * DTO para resend email (retry)
 */
export class ResendEmailDto {
  @IsOptional()
  @IsString()
  newRecipient?: string; // Se quiser reenviar para outro email
}

/**
 * DTO para preferências de email
 */
export class EmailPreferencesDto {
  userId: string;
  emailAddress: string;
  reportEmails: boolean;
  alertEmails: boolean;
  weeklyEmails: boolean;
  marketingEmails: boolean;
  unsubscribeToken: string; // Para link de unsubscribe
}

/**
 * DTO para atualizar preferências
 */
export class UpdateEmailPreferencesDto {
  @IsOptional()
  emailAddress?: string;

  @IsOptional()
  reportEmails?: boolean;

  @IsOptional()
  alertEmails?: boolean;

  @IsOptional()
  weeklyEmails?: boolean;

  @IsOptional()
  marketingEmails?: boolean;
}

/**
 * DTO para testar envio de email
 */
export class TestEmailDto {
  @IsString()
  @IsEmail()
  recipient: string;

  @IsOptional()
  @IsString()
  templateName?: string; // Default: 'test'
}

/**
 * DTO para resposta de teste
 */
export class TestEmailResultDto {
  success: boolean;
  message: string;
  recipient: string;
  sentAt: Date;
  error?: string;
}

/**
 * DTO para integração com Bull Queue
 */
export class EmailQueueJobDto {
  emailLogId: string;
  recipient: string;
  subject: string;
  htmlContent: string;
  type: EmailType;
  retryCount: number;
  maxRetries: number;
}
