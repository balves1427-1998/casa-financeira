import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { createReadStream } from 'fs';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { GetCurrentUser } from '../../../common/decorators/get-current-user.decorator';
import { CurrentFamily } from '../../../common/decorators/current-family.decorator';
import { User } from '../../users/entities/user.entity';
import { ReportsService } from '../services/reports.service';
import { Report } from '../entities/report.entity';
import { MonthlyReport, ReportFormat } from '../reports.types';
import {
  DownloadReportDto,
  GenerateMonthlyReportDto,
  ListReportsDto,
  PreviewMonthlyReportDto,
  ReportSummaryDto,
} from '../dtos/report.dto';
import { formatarMesAno } from '../utils/br-format';

/**
 * Controller do Relatório Mensal (item 28 do escopo do projeto).
 *
 * ESCOPO: `@CurrentFamily()` resolve a família do usuário AUTENTICADO — nenhum
 * id de família trafega na URL, então não há como ler o relatório de outra casa.
 *
 * ORDEM DAS ROTAS: as estáticas (`monthly`, `monthly/preview`) vêm ANTES de
 * `@Get(':id')`. Na versão anterior `@Get(':reportId')` era declarado primeiro e
 * capturava `GET /reports/templates/list`, que nunca chegava a executar.
 */
@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  // ==================== rotas estáticas ====================

  /**
   * `POST /reports/monthly` — botão "Gerar Relatório do Mês".
   *
   * Monta o relatório, grava os arquivos em disco e devolve o registro salvo.
   */
  @Post('monthly')
  @HttpCode(HttpStatus.CREATED)
  async generateMonthly(
    @CurrentFamily() familyId: string,
    @GetCurrentUser() user: User,
    @Body() dto: GenerateMonthlyReportDto,
  ): Promise<ReportSummaryDto> {
    const { mes, ano } = this.resolverCompetencia(dto.month, dto.year);

    const report = await this.reportsService.generateMonthly(
      familyId,
      user,
      mes,
      ano,
      dto.formats ?? ['pdf', 'xlsx', 'csv'],
    );

    return this.mapear(report);
  }

  /**
   * `GET /reports/monthly/preview?month&year` — relatório em JSON, sem persistir
   * e sem gerar arquivo. É o que a tela usa para exibir o relatório antes de o
   * usuário decidir exportá-lo.
   */
  @Get('monthly/preview')
  async previewMonthly(
    @CurrentFamily() familyId: string,
    @GetCurrentUser() user: User,
    @Query() query: PreviewMonthlyReportDto,
  ): Promise<MonthlyReport> {
    const { mes, ano } = this.resolverCompetencia(query.month, query.year);

    return this.reportsService.preview(familyId, user, mes, ano);
  }

  /** `GET /reports` — histórico de relatórios da família. */
  @Get()
  async list(
    @CurrentFamily() familyId: string,
    @Query() query: ListReportsDto,
  ): Promise<{
    reports: ReportSummaryDto[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    const { reports, total } = await this.reportsService.findAll(
      familyId,
      limit,
      offset,
    );

    return {
      reports: reports.map((r) => this.mapear(r)),
      total,
      limit,
      offset,
    };
  }

  // ==================== rotas dinâmicas ====================

  /**
   * `GET /reports/:id/download?format=pdf|xlsx|csv`
   *
   * Devolve o ARQUIVO com `Content-Type` e `Content-Disposition: attachment`.
   */
  @Get(':id/download')
  async download(
    @CurrentFamily() familyId: string,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST }))
    id: string,
    @Query() query: DownloadReportDto,
    @Res() res: Response,
  ): Promise<void> {
    const formato: ReportFormat = query.format ?? 'pdf';
    const arquivo = await this.reportsService.getFile(familyId, id, formato);

    res.setHeader('Content-Type', arquivo.mimeType);
    res.setHeader('Content-Length', arquivo.size);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${arquivo.fileName}"`,
    );

    createReadStream(arquivo.filePath).pipe(res);
  }

  /** `GET /reports/:id` — relatório completo, com a estrutura consolidada. */
  @Get(':id')
  async findOne(
    @CurrentFamily() familyId: string,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST }))
    id: string,
  ): Promise<ReportSummaryDto & { report: MonthlyReport | null }> {
    const report = await this.reportsService.findOne(familyId, id);
    await this.reportsService.incrementViewCount(id);

    return {
      ...this.mapear(report),
      // A entidade foi lida ANTES do incremento; sem o +1 a resposta devolveria
      // um contador defasado em relação ao que acabou de ser gravado.
      viewCount: report.viewCount + 1,
      report: report.payload ?? null,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentFamily() familyId: string,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST }))
    id: string,
  ): Promise<void> {
    await this.reportsService.remove(familyId, id);
  }

  // ==================== helpers ====================

  /** Competência informada ou, na ausência dela, o mês corrente. */
  private resolverCompetencia(
    mes?: number,
    ano?: number,
  ): { mes: number; ano: number } {
    const hoje = new Date();

    // Informar só um dos dois é ambíguo demais para adivinhar.
    if ((mes === undefined) !== (ano === undefined)) {
      throw new BadRequestException(
        'Informe mês e ano juntos, ou nenhum dos dois para usar o mês corrente.',
      );
    }

    return {
      mes: mes ?? hoje.getMonth() + 1,
      ano: ano ?? hoje.getFullYear(),
    };
  }

  private mapear(report: Report): ReportSummaryDto {
    const arquivos = report.files ?? {};

    return {
      id: report.id,
      reportType: report.reportType,
      status: report.status,
      month: report.startMonth,
      year: report.startYear,
      periodLabel: formatarMesAno(report.startMonth, report.startYear),
      formats: report.config?.formats ?? [],
      files: (Object.keys(arquivos) as ReportFormat[]).map((formato) => ({
        format: formato,
        fileName: arquivos[formato]!.fileName,
        size: arquivos[formato]!.size,
        downloadUrl: `/reports/${report.id}/download?format=${formato}`,
      })),
      metadata: report.metadata as unknown as Record<string, unknown>,
      errorMessage: report.errorMessage,
      viewCount: report.viewCount,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
    };
  }
}
