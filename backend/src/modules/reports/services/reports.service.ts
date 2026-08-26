import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';

import { User } from '../../users/entities/user.entity';
import { Report, ReportFileRef, ReportMetadata } from '../entities/report.entity';
import { GeneratedFile, MonthlyReport, ReportFormat } from '../reports.types';
import { MonthlyReportService } from './monthly-report.service';
import { ReportExportService } from './report-export.service';

/** Formatos gerados quando o usuário não pede nenhum explicitamente. */
const FORMATOS_PADRAO: ReportFormat[] = ['pdf', 'xlsx', 'csv'];

/**
 * Persistência e ciclo de vida dos relatórios.
 *
 * ESCOPO: leitura, download e exclusão são filtrados por `familyId`. Um membro
 * da casa consegue abrir o relatório que o outro gerou — é o mesmo dinheiro —
 * mas nenhuma outra família alcança o registro.
 */
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    private readonly monthlyReportService: MonthlyReportService,
    private readonly exportService: ReportExportService,
  ) {}

  // ==================== geração ====================

  /**
   * Gera o Relatório Mensal, exporta os arquivos pedidos e persiste tudo.
   *
   * O registro é salvo ANTES da exportação para que o id componha o nome do
   * arquivo; se a exportação falhar, o relatório fica com `status: 'failed'` e a
   * mensagem do erro, em vez de sumir sem explicação.
   */
  async generateMonthly(
    familyId: string,
    user: User,
    mes: number,
    ano: number,
    formatos: ReportFormat[] = FORMATOS_PADRAO,
  ): Promise<Report> {
    const inicio = Date.now();
    const solicitados = this.normalizarFormatos(formatos);

    const payload = await this.monthlyReportService.build(familyId, user, mes, ano);

    const report = this.reportRepository.create({
      userId: user.id,
      familyId,
      reportType: 'monthly',
      status: 'generating',
      startMonth: mes,
      startYear: ano,
      config: { formats: solicitados, includeTransactions: true },
      payload,
      metadata: this.montarMetadata(payload),
      files: {},
    });

    let salvo = await this.reportRepository.save(report);

    try {
      const arquivos = await this.exportarTodos(payload, salvo.id, solicitados);

      salvo.files = arquivos;
      salvo.status = 'ready';

      const principal = arquivos[solicitados[0]];
      if (principal) {
        salvo.fileName = principal.fileName;
        salvo.fileFormat = solicitados[0];
        salvo.fileSize = principal.size;
        salvo.fileUrl = `/reports/${salvo.id}/download?format=${solicitados[0]}`;
      }

      salvo = await this.reportRepository.save(salvo);

      this.logger.log(
        `Relatório ${salvo.id} (${mes}/${ano}) gerado em ${Date.now() - inicio}ms ` +
          `nos formatos ${solicitados.join(', ')}`,
      );

      return salvo;
    } catch (erro) {
      salvo.status = 'failed';
      salvo.errorMessage =
        erro instanceof Error ? erro.message : 'Falha desconhecida na exportação';
      await this.reportRepository.save(salvo);
      throw erro;
    }
  }

  /** Monta o relatório sem persistir nada — usado pela pré-visualização. */
  async preview(
    familyId: string,
    user: User,
    mes: number,
    ano: number,
  ): Promise<MonthlyReport> {
    return this.monthlyReportService.build(familyId, user, mes, ano);
  }

  // ==================== consulta ====================

  async findAll(
    familyId: string,
    limit: number,
    offset: number,
  ): Promise<{ reports: Report[]; total: number }> {
    const [reports, total] = await this.reportRepository.findAndCount({
      where: { familyId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    return { reports, total };
  }

  async findOne(familyId: string, id: string): Promise<Report> {
    const report = await this.reportRepository.findOne({
      where: { id, familyId },
    });

    if (!report) {
      throw new NotFoundException('Relatório não encontrado.');
    }

    return report;
  }

  async incrementViewCount(id: string): Promise<void> {
    await this.reportRepository.increment({ id }, 'viewCount', 1);
  }

  async remove(familyId: string, id: string): Promise<void> {
    const report = await this.findOne(familyId, id);

    // Os arquivos em disco vão junto: manter PDFs órfãos de um relatório
    // excluído só consome espaço.
    for (const arquivo of Object.values(report.files ?? {})) {
      this.apagarArquivo(arquivo);
    }

    await this.reportRepository.softRemove(report);
    this.logger.log(`Relatório ${id} removido.`);
  }

  // ==================== download ====================

  /**
   * Arquivo de um formato, pronto para download.
   *
   * Se o arquivo não existir mais no disco (limpeza, deploy novo), ele é
   * regerado a partir do `payload` congelado — os números continuam sendo os do
   * momento da geração, não recalculados.
   */
  async getFile(
    familyId: string,
    id: string,
    formato: ReportFormat,
  ): Promise<ReportFileRef> {
    const report = await this.findOne(familyId, id);
    const existente = report.files?.[formato];

    if (existente && fs.existsSync(existente.filePath)) {
      return existente;
    }

    if (!report.payload) {
      throw new NotFoundException(
        'Este relatório não possui conteúdo armazenado e não pode ser exportado novamente.',
      );
    }

    this.logger.warn(
      `Arquivo ${formato} do relatório ${id} ausente no disco; regerando a partir do conteúdo salvo.`,
    );

    const arquivo = await this.exportService.export(
      this.reidratar(report.payload),
      report.id,
      formato,
    );

    report.files = { ...(report.files ?? {}), [formato]: this.paraRef(arquivo) };
    await this.reportRepository.save(report);

    return report.files[formato] as ReportFileRef;
  }

  // ==================== helpers ====================

  private async exportarTodos(
    payload: MonthlyReport,
    reportId: string,
    formatos: ReportFormat[],
  ): Promise<Partial<Record<ReportFormat, ReportFileRef>>> {
    const arquivos: Partial<Record<ReportFormat, ReportFileRef>> = {};

    // Sequencial de propósito: o PDF usa um stream de escrita e gerar os três em
    // paralelo só disputaria disco sem ganho real.
    for (const formato of formatos) {
      const arquivo = await this.exportService.export(payload, reportId, formato);
      arquivos[formato] = this.paraRef(arquivo);
    }

    return arquivos;
  }

  private paraRef(arquivo: GeneratedFile): ReportFileRef {
    return {
      fileName: arquivo.fileName,
      filePath: arquivo.filePath,
      size: arquivo.size,
      mimeType: arquivo.mimeType,
      generatedAt: new Date().toISOString(),
    };
  }

  /** Remove duplicatas preservando a ordem pedida; vazio cai no padrão. */
  private normalizarFormatos(formatos: ReportFormat[]): ReportFormat[] {
    const unicos = Array.from(new Set(formatos ?? []));
    return unicos.length > 0 ? unicos : FORMATOS_PADRAO;
  }

  private montarMetadata(payload: MonthlyReport): ReportMetadata {
    const maior = payload.byCategory[0];

    return {
      totalIncome: payload.overview.totalIncome,
      totalExpenses: payload.overview.totalExpenses,
      balance: payload.overview.balance,
      transactionCount: payload.overview.transactionCount,
      averageDailyExpense: payload.overview.averageDailyExpense,
      // Sem despesas não há "maior categoria" — `null` em vez de "N/A".
      topCategory: maior && maior.total > 0 ? maior.category : null,
      topCategoryTotal: maior && maior.total > 0 ? maior.total : null,
      alertCount: payload.alerts.length,
      hasData: payload.hasData,
    };
  }

  /**
   * O `jsonb` devolve datas como STRING. A exportação formata datas em
   * `DD/MM/YYYY`, então elas voltam a ser `Date` antes de reexportar.
   */
  private reidratar(payload: MonthlyReport): MonthlyReport {
    const paraData = (valor: unknown): Date =>
      valor instanceof Date ? valor : new Date(String(valor));

    return {
      ...payload,
      generatedAt: paraData(payload.generatedAt),
      period: {
        ...payload.period,
        start: paraData(payload.period.start),
        end: paraData(payload.period.end),
      },
      transactions: payload.transactions.map((t) => ({
        ...t,
        date: paraData(t.date),
      })),
      goals: {
        ...payload.goals,
        items: payload.goals.items.map((m) => ({
          ...m,
          deadline: m.deadline ? paraData(m.deadline) : null,
        })),
      },
      installments: {
        ...payload.installments,
        items: payload.installments.items.map((i) => ({
          ...i,
          date: paraData(i.date),
        })),
      },
      plannedAccounts: {
        paid: this.reidratarContas(payload.plannedAccounts.paid),
        pending: this.reidratarContas(payload.plannedAccounts.pending),
        overdue: this.reidratarContas(payload.plannedAccounts.overdue),
        cancelled: this.reidratarContas(payload.plannedAccounts.cancelled),
      },
    };
  }

  private reidratarContas(
    grupo: MonthlyReport['plannedAccounts']['paid'],
  ): MonthlyReport['plannedAccounts']['paid'] {
    return {
      ...grupo,
      items: grupo.items.map((c) => ({
        ...c,
        dueDate: new Date(c.dueDate),
        paymentDate: c.paymentDate ? new Date(c.paymentDate) : null,
      })),
    };
  }

  private apagarArquivo(arquivo: ReportFileRef): void {
    try {
      if (arquivo?.filePath && fs.existsSync(arquivo.filePath)) {
        fs.unlinkSync(arquivo.filePath);
      }
    } catch (erro) {
      // Falha ao apagar o arquivo não pode impedir a exclusão do registro.
      this.logger.warn(
        `Não foi possível remover ${arquivo?.filePath}: ${
          erro instanceof Error ? erro.message : erro
        }`,
      );
    }
  }
}
