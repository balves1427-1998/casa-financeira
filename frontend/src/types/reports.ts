// ==================== REPORT CONFIG ====================

export interface ReportConfig {
  includeSpendingPatterns: boolean;
  includeAnomalies: boolean;
  includeTrends: boolean;
  includeComparison: boolean;
  includeForecasting: boolean;
  includeMetas: boolean;
  includeSummary: boolean;
  categories?: string[];
  excludeCategories?: string[];
  comparisonUser?: string;
  minAnomalySeverity?: 'low' | 'medium' | 'high' | 'critical';
}

// ==================== GENERATE REPORT ====================

export interface GenerateReportDto {
  reportType: 'monthly' | 'quarterly' | 'annual' | 'custom' | 'comparison';
  startMonth: number;
  startYear: number;
  endMonth?: number;
  endYear?: number;
  config: ReportConfig;
  format?: 'pdf' | 'csv' | 'xlsx';
  sendToEmail?: boolean;
  recipientEmails?: string[];
}

// ==================== REPORT RESPONSE ====================

export interface ReportMetadata {
  totalExpenses: number;
  totalIncome: number;
  averageDaily: number;
  topCategory: string;
  topMerchant: string;
  anomalyCount: number;
  highestTransaction: number;
  lowestTransaction: number;
  transactionCount: number;
}

export interface ReportDto {
  id: string;
  reportType: string;
  status: string;
  startMonth: number;
  startYear: number;
  endMonth?: number;
  endYear?: number;
  config: ReportConfig;
  metadata?: ReportMetadata;
  fileUrl?: string;
  fileName?: string;
  fileFormat?: string;
  fileSize?: number;
  sentToEmail: boolean;
  sentAt?: Date;
  viewCount: number;
  createdAt: Date;
  updatedAt: Date;
}

// ==================== SEND REPORT ====================

export interface SendReportDto {
  recipientEmails: string[];
  message?: string;
}

// ==================== SAVE AS TEMPLATE ====================

export interface SaveAsTemplateDto {
  templateName: string;
  description?: string;
}

// ==================== CUSTOM REPORT ====================

export interface ReportSection {
  id: string;
  type: 'summary' | 'spending_pattern' | 'anomalies' | 'trends' | 'comparison' | 'forecast' | 'metas';
  title: string;
  enabled: boolean;
  config?: any;
}

export interface CustomReportBuilderDto {
  title: string;
  description?: string;
  period: 'monthly' | 'quarterly' | 'annual' | 'custom';
  sections: ReportSection[];
  outputFormat: 'pdf' | 'csv' | 'xlsx';
  scheduleMonthly?: boolean;
}

// ==================== REPORT SUMMARY ====================

export interface ReportTemplate {
  id: string;
  name: string;
  type: string;
  createdAt: Date;
}

export interface ReportSummaryDto {
  totalReportsGenerated: number;
  totalReportsSent: number;
  recentReports: ReportDto[];
  savedTemplates: ReportTemplate[];
  lastReportGenerated?: ReportDto;
  averageGenerationTime: number;
}
