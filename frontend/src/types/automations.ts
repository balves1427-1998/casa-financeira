/**
 * Types para o módulo de Automações (Fase 4 Seção A)
 * Espelha DTOs do backend
 */

// ==================== REPORT SCHEDULING ====================

export enum ReportFrequency {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  ANNUAL = 'annual',
}

export interface ReportConfig {
  includeSummary?: boolean;
  includeSpendingPatterns?: boolean;
  includeAnomalies?: boolean;
  includeTrends?: boolean;
  includeComparison?: boolean;
  includeForecasting?: boolean;
  includeMetas?: boolean;
  format?: 'pdf' | 'csv' | 'xlsx';
}

export interface CreateReportScheduleDto {
  name: string;
  reportType: string;
  frequency: ReportFrequency;
  config?: ReportConfig;
  recipientEmails?: string[];
  dayOfMonth?: number;
  daysOfWeek?: string[];
  executionTime?: string;
  isActive?: boolean;
}

export interface UpdateReportScheduleDto {
  name?: string;
  frequency?: ReportFrequency;
  config?: ReportConfig;
  recipientEmails?: string[];
  dayOfMonth?: number;
  daysOfWeek?: string[];
  executionTime?: string;
  isActive?: boolean;
}

export interface ReportScheduleDto {
  id: string;
  userId: string;
  name: string;
  reportType: string;
  frequency: ReportFrequency;
  config: ReportConfig;
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

export interface ExecutionResultDto {
  success: boolean;
  scheduleId: string;
  executedAt: Date;
  nextExecutionAt?: Date;
  reportId?: string;
  emailsSent?: number;
  errorMessage?: string;
}

// ==================== ALERTS ====================

export enum AlertType {
  ACCOUNT_DUE = 'account_due',
  CREDIT_CARD = 'credit_card',
  LOW_BALANCE = 'low_balance',
  ANOMALY = 'anomaly',
  GOAL = 'goal',
}

export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

export enum AlertStatus {
  UNREAD = 'unread',
  READ = 'read',
  DISMISSED = 'dismissed',
  ACTED = 'acted',
}

export interface AlertData {
  accountId?: string;
  accountName?: string;
  dueDate?: string;
  amount?: number;
  daysUntilDue?: number;
  creditCardId?: string;
  creditCardName?: string;
  creditLimit?: number;
  usedLimit?: number;
  percentageUsed?: number;
  currentBalance?: number;
  minimumBalance?: number;
  category?: string;
  normalAmount?: number;
  currentAmount?: number;
  percentageIncrease?: number;
  goalId?: string;
  goalName?: string;
  goalProgress?: number;
}

export interface AlertDto {
  id: string;
  userId: string;
  type: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  message: string;
  data: AlertData;
  isRead: boolean;
  readAt?: Date;
  notificationSent: boolean;
  notificationChannel?: 'email' | 'in-app' | 'sms';
  relatedEntityId?: string;
  relatedEntityType?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListAlertsDto {
  alerts: AlertDto[];
  total: number;
  unreadCount: number;
  criticalCount: number;
}

export interface UpdateAlertDto {
  status?: AlertStatus;
  isRead?: boolean;
}

export interface NotificationPreferencesDto {
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
  daysBeforeDue: number;
}

export interface UpdateNotificationPreferencesDto {
  emailNotifications?: boolean;
  smsNotifications?: boolean;
  inAppNotifications?: boolean;
  alertTypes?: {
    accountDue?: boolean;
    creditCard?: boolean;
    lowBalance?: boolean;
    anomaly?: boolean;
    goal?: boolean;
  };
  daysBeforeDue?: number;
}

// ==================== UTILITIES ====================

export const frequencyLabels: Record<ReportFrequency, string> = {
  [ReportFrequency.DAILY]: 'Diária',
  [ReportFrequency.WEEKLY]: 'Semanal',
  [ReportFrequency.MONTHLY]: 'Mensal',
  [ReportFrequency.QUARTERLY]: 'Trimestral',
  [ReportFrequency.ANNUAL]: 'Anual',
};

export const alertTypeLabels: Record<AlertType, string> = {
  [AlertType.ACCOUNT_DUE]: 'Vencimento de Conta',
  [AlertType.CREDIT_CARD]: 'Cartão de Crédito',
  [AlertType.LOW_BALANCE]: 'Saldo Baixo',
  [AlertType.ANOMALY]: 'Anomalia de Gasto',
  [AlertType.GOAL]: 'Meta',
};

export const alertSeverityLabels: Record<AlertSeverity, string> = {
  [AlertSeverity.INFO]: 'Informação',
  [AlertSeverity.WARNING]: 'Aviso',
  [AlertSeverity.CRITICAL]: 'Crítico',
};

export const alertSeverityColors: Record<AlertSeverity, string> = {
  [AlertSeverity.INFO]: 'blue',
  [AlertSeverity.WARNING]: 'orange',
  [AlertSeverity.CRITICAL]: 'red',
};

// ==================== WEBHOOKS ====================

export enum WebhookEventType {
  ALERT_CREATED = 'alert.created',
  ALERT_UPDATED = 'alert.updated',
  REPORT_GENERATED = 'report.generated',
  EXPENSE_CREATED = 'expense.created',
  RECEIPT_CREATED = 'receipt.created',
  ACCOUNT_BALANCE_CHANGED = 'account.balance_changed',
  GOAL_UPDATED = 'goal.updated',
}

export enum WebhookStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  PAUSED = 'paused',
  ERROR = 'error',
}

export enum DeliveryStatus {
  PENDING = 'pending',
  DELIVERED = 'delivered',
  FAILED = 'failed',
  TIMEOUT = 'timeout',
  INVALID_URL = 'invalid_url',
}

export interface CreateWebhookRequest {
  name: string;
  url: string;
  eventType: WebhookEventType;
  events: string[];
  headers?: Record<string, string>;
  filters?: Record<string, any>;
  maxRetries?: number;
  initialRetryDelay?: number;
  retryExponent?: number;
  metadata?: Record<string, any>;
}

export interface Webhook {
  id: string;
  userId: string;
  name: string;
  url: string;
  eventType: WebhookEventType;
  events: string[];
  isActive: boolean;
  status: WebhookStatus;
  deliveryCount: number;
  successCount: number;
  failureCount: number;
  lastDeliveredAt: Date;
  lastFailedAt: Date;
  lastErrorMessage: string;
  maxRetries: number;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListWebhooksResponse {
  webhooks: Webhook[];
  total: number;
  activeCount: number;
  inactiveCount: number;
}

export interface TestWebhookRequest {
  eventType: string;
  payload?: Record<string, any>;
}

export interface TestWebhookResult {
  success: boolean;
  webhookId: string;
  deliveryId: string;
  httpStatus: number;
  responseTime: number;
  message: string;
  response?: any;
  error?: string;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  eventType: string;
  status: DeliveryStatus;
  httpStatus: number;
  responseTime: number;
  attemptNumber: number;
  errorMessage: string;
  deliveredAt: Date;
  nextRetryAt: Date;
  createdAt: Date;
}

export interface ListDeliveriesResponse {
  deliveries: WebhookDelivery[];
  total: number;
  successCount: number;
  failureCount: number;
  pendingCount: number;
}

export const webhookEventTypeLabels: Record<WebhookEventType, string> = {
  [WebhookEventType.ALERT_CREATED]: 'Alerta Criado',
  [WebhookEventType.ALERT_UPDATED]: 'Alerta Atualizado',
  [WebhookEventType.REPORT_GENERATED]: 'Relatório Gerado',
  [WebhookEventType.EXPENSE_CREATED]: 'Despesa Criada',
  [WebhookEventType.RECEIPT_CREATED]: 'Receita Criada',
  [WebhookEventType.ACCOUNT_BALANCE_CHANGED]: 'Saldo Alterado',
  [WebhookEventType.GOAL_UPDATED]: 'Meta Atualizada',
};

export const webhookStatusColors: Record<WebhookStatus, string> = {
  [WebhookStatus.ACTIVE]: '#10b981',
  [WebhookStatus.INACTIVE]: '#6b7280',
  [WebhookStatus.PAUSED]: '#f59e0b',
  [WebhookStatus.ERROR]: '#ef4444',
};

export const deliveryStatusLabels: Record<DeliveryStatus, string> = {
  [DeliveryStatus.PENDING]: 'Pendente',
  [DeliveryStatus.DELIVERED]: 'Entregue',
  [DeliveryStatus.FAILED]: 'Falhou',
  [DeliveryStatus.TIMEOUT]: 'Timeout',
  [DeliveryStatus.INVALID_URL]: 'URL Inválida',
};

export const deliveryStatusColors: Record<DeliveryStatus, string> = {
  [DeliveryStatus.PENDING]: '#3b82f6',
  [DeliveryStatus.DELIVERED]: '#10b981',
  [DeliveryStatus.FAILED]: '#ef4444',
  [DeliveryStatus.TIMEOUT]: '#f59e0b',
  [DeliveryStatus.INVALID_URL]: '#ef4444',
};
