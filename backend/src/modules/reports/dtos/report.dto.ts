import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { ReportFormat } from '../reports.types';

/** Formatos aceitos na geração e no download. */
export const FORMATOS_SUPORTADOS: ReportFormat[] = ['pdf', 'xlsx', 'csv'];

/**
 * Geração do Relatório Mensal — `POST /reports/monthly`.
 *
 * Sem competência informada o relatório é do MÊS CORRENTE, que é o caso do
 * botão "Gerar Relatório do Mês" (item 28 do escopo).
 */
export class GenerateMonthlyReportDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'O mês deve ser um número inteiro.' })
  @Min(1, { message: 'O mês deve estar entre 1 e 12.' })
  @Max(12, { message: 'O mês deve estar entre 1 e 12.' })
  month?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'O ano deve ser um número inteiro.' })
  @Min(1970)
  @Max(2999)
  year?: number;

  /** Formatos a exportar. Omitido, gera os três. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(FORMATOS_SUPORTADOS, {
    each: true,
    message: 'Formato inválido. Use pdf, xlsx ou csv.',
  })
  formats?: ReportFormat[];
}

/** Query de `GET /reports/monthly/preview`. */
export class PreviewMonthlyReportDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1970)
  @Max(2999)
  year?: number;
}

/** Paginação de `GET /reports`. */
export class ListReportsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

/** Query de `GET /reports/:id/download`. */
export class DownloadReportDto {
  @IsOptional()
  @IsIn(FORMATOS_SUPORTADOS, {
    message: 'Formato inválido. Use pdf, xlsx ou csv.',
  })
  format?: ReportFormat;
}

/** Um relatório na resposta da API (sem o `payload`, que é grande). */
export interface ReportSummaryDto {
  id: string;
  reportType: string;
  status: string;
  month: number;
  year: number;
  periodLabel: string;
  formats: ReportFormat[];
  files: {
    format: ReportFormat;
    fileName: string;
    size: number;
    downloadUrl: string;
  }[];
  metadata?: Record<string, unknown>;
  errorMessage?: string;
  viewCount: number;
  createdAt: Date;
  updatedAt: Date;
}
