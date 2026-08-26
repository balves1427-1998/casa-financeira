import { IsString, IsEnum, IsOptional, IsBoolean, IsObject } from 'class-validator';
import { AlertType, AlertSeverity, AlertStatus } from '../entities/alert.entity';

/**
 * DTO para criar alerta (interno, usado pelos serviços)
 */
export class CreateAlertDto {
  @IsString()
  userId: string;

  @IsEnum(AlertType)
  type: AlertType;

  @IsOptional()
  @IsEnum(AlertSeverity)
  severity?: AlertSeverity;

  @IsString()
  title: string;

  @IsString()
  message: string;

  @IsOptional()
  @IsObject()
  data?: any;

  @IsOptional()
  @IsString()
  relatedEntityId?: string;

  @IsOptional()
  @IsString()
  relatedEntityType?: string;
}

/**
 * DTO para atualizar status de alerta
 */
export class UpdateAlertDto {
  @IsOptional()
  @IsEnum(AlertStatus)
  status?: AlertStatus;

  @IsOptional()
  @IsBoolean()
  isRead?: boolean;
}

/**
 * DTO para marcar alerta como lido
 */
export class MarkAsReadDto {
  @IsOptional()
  @IsBoolean()
  read?: boolean;
}

/**
 * DTO para resposta de alerta
 */
export class AlertDto {
  id: string;
  userId: string;
  type: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  message: string;
  data: any;
  isRead: boolean;
  readAt?: Date;
  notificationSent: boolean;
  notificationChannel?: string;
  relatedEntityId?: string;
  relatedEntityType?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * DTO para listar alertas com filtros
 */
export class ListAlertsDto {
  alerts: AlertDto[];
  total: number;
  unreadCount: number;
  criticalCount: number;
}

/**
 * DTO para preferências de notificação
 */
export class NotificationPreferencesDto {
  userId: string;
  emailNotifications: boolean;
  smsNotifications: boolean;
  inAppNotifications: boolean;
  alertTypes: {
    accountDue: boolean;
    creditCard: boolean;
    lowBalance: boolean;
    anomaly: boolean;
    goal: boolean;
  };
  daysBeforeDue: number; // Quantos dias antes enviar notificação de vencimento
}

/**
 * DTO para atualizar preferências
 */
export class UpdateNotificationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  emailNotifications?: boolean;

  @IsOptional()
  @IsBoolean()
  smsNotifications?: boolean;

  @IsOptional()
  @IsBoolean()
  inAppNotifications?: boolean;

  @IsOptional()
  alertTypes?: {
    accountDue?: boolean;
    creditCard?: boolean;
    lowBalance?: boolean;
    anomaly?: boolean;
    goal?: boolean;
  };

  @IsOptional()
  daysBeforeDue?: number;
}
