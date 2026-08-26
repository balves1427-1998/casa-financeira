import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import PDFDocument from 'pdfkit';
import * as ExcelJS from 'exceljs';

import {
  formatarData,
  formatarDataHora,
  formatarNumero,
  formatarPercentual,
  formatarReal,
  formatarVariacao,
} from '../utils/br-format';
import {
  GeneratedFile,
  MonthlyReport,
  ReportFormat,
} from '../reports.types';

/** Diretório onde os arquivos exportados são realmente gravados. */
const DIRETORIO_PADRAO = path.resolve(process.cwd(), 'storage', 'reports');

/** Separador do CSV: no Brasil a vírgula é o separador DECIMAL. */
const SEPARADOR_CSV = ';';

const MIME: Record<ReportFormat, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
};

/**
 * Exportação REAL do Relatório Mensal para disco.
 *
 * A versão anterior deste módulo devolvia uma URL falsa e `size` igual ao
 * comprimento de uma string de texto (ou zero, no caso do XLSX): nenhum arquivo
 * chegava a existir. Aqui os três formatos são gravados em `storage/reports/` e
 * o tamanho devolvido vem de `fs.statSync` — é o byte count do arquivo no disco.
 *
 * Toda formatação segue o padrão brasileiro (item 25 do escopo): `R$ 0.000,00`
 * e `DD/MM/YYYY`.
 */
@Injectable()
export class ReportExportService {
  private readonly logger = new Logger(ReportExportService.name);

  /**
   * Diretório de gravação. Configurável por `REPORTS_STORAGE_DIR` para o caso
   * de o disco da aplicação ser somente leitura em produção.
   */
  private readonly diretorio: string =
    process.env.REPORTS_STORAGE_DIR ?? DIRETORIO_PADRAO;

  /** Diretório de armazenamento, criado sob demanda. */
  get storageDir(): string {
    if (!fs.existsSync(this.diretorio)) {
      fs.mkdirSync(this.diretorio, { recursive: true });
    }

    return this.diretorio;
  }

  async export(
    report: MonthlyReport,
    reportId: string,
    formato: ReportFormat,
  ): Promise<GeneratedFile> {
    switch (formato) {
      case 'pdf':
        return this.exportPDF(report, reportId);
      case 'xlsx':
        return this.exportXLSX(report, reportId);
      case 'csv':
        return this.exportCSV(report, reportId);
      default:
        throw new Error(`Formato de exportação não suportado: ${formato}`);
    }
  }

  // ==================== PDF ====================

  async exportPDF(report: MonthlyReport, reportId: string): Promise<GeneratedFile> {
    const { filePath, fileName } = this.resolverCaminho(report, reportId, 'pdf');

    // As fontes padrão do PDFKit (Helvetica) usam WinAnsi, que cobre os
    // acentos do português — não é preciso embutir fonte externa.
    const doc = new PDFDocument({
      size: 'A4',
      margin: 40,
      info: {
        Title: `Relatório Mensal — ${report.period.label}`,
        Author: 'Casa Financeira',
      },
    });

    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    this.escreverCabecalhoPDF(doc, report);

    if (!report.hasData) {
      // REGRA 27: sem lançamentos o PDF diz isso — não imprime tabelas zeradas
      // que pareçam dados reais.
      this.tituloSecaoPDF(doc, 'Sem lançamentos no período');
      for (const aviso of report.notices) {
        doc.fontSize(10).fillColor('#444444').text(`• ${aviso}`, { align: 'left' });
        doc.moveDown(0.3);
      }
      doc.end();
      await this.aguardarStream(stream);
      return this.descreverArquivo(filePath, fileName, 'pdf');
    }

    this.escreverResumoPDF(doc, report);
    this.escreverComparacaoPDF(doc, report);
    this.escreverTabelaCategoriasPDF(doc, report);
    this.escreverTabelaResponsaveisPDF(doc, report);
    this.escreverContasPDF(doc, report);
    this.escreverCartoesPDF(doc, report);
    this.escreverParcelamentosPDF(doc, report);
    this.escreverEvolucaoPDF(doc, report);
    this.escreverMetasPDF(doc, report);
    this.escreverAlertasPDF(doc, report);
    this.escreverSugestoesPDF(doc, report);
    this.escreverAvisosPDF(doc, report);

    doc.end();
    await this.aguardarStream(stream);

    return this.descreverArquivo(filePath, fileName, 'pdf');
  }

  private escreverCabecalhoPDF(doc: PDFKit.PDFDocument, report: MonthlyReport): void {
    doc
      .fontSize(20)
      .fillColor('#111111')
      .font('Helvetica-Bold')
      .text('Relatório Mensal — Casa Financeira', { align: 'left' });

    doc
      .moveDown(0.2)
      .fontSize(12)
      .font('Helvetica')
      .fillColor('#444444')
      .text(`Competência: ${report.period.label}`)
      .text(
        `Período: ${formatarData(report.period.start)} a ${formatarData(report.period.end)}`,
      )
      .text(`Gerado em: ${formatarDataHora(report.generatedAt)}`);

    doc.moveDown(0.6);
    this.linhaHorizontalPDF(doc);
    doc.moveDown(0.6);
  }

  private escreverResumoPDF(doc: PDFKit.PDFDocument, report: MonthlyReport): void {
    const o = report.overview;

    this.tituloSecaoPDF(doc, 'Resumo do mês');

    this.tabelaPDF(
      doc,
      ['Indicador', 'Valor'],
      [
        ['Receitas', formatarReal(o.totalIncome)],
        ['Despesas', formatarReal(o.totalExpenses)],
        ['Saldo do mês', formatarReal(o.balance)],
        ['Taxa de poupança', formatarPercentual(o.savingsRate)],
        ['Média diária de despesas', formatarReal(o.averageDailyExpense)],
        ['Lançamentos', String(o.transactionCount)],
        ['Maior despesa', o.highestExpense === null ? '—' : formatarReal(o.highestExpense)],
        ['Menor despesa', o.lowestExpense === null ? '—' : formatarReal(o.lowestExpense)],
        ['Saldo atual em conta', formatarReal(o.currentBalance)],
      ],
      [280, 200],
    );
  }

  private escreverComparacaoPDF(doc: PDFKit.PDFDocument, report: MonthlyReport): void {
    const c = report.comparison;

    this.tituloSecaoPDF(doc, `Comparação com ${c.previousLabel}`);

    if (!c.previousHasData) {
      this.paragrafoPDF(
        doc,
        `Não há lançamentos em ${c.previousLabel}; as variações percentuais não puderam ser calculadas.`,
      );
    }

    this.tabelaPDF(
      doc,
      ['Indicador', report.period.label, c.previousLabel, 'Variação'],
      [
        [
          'Receitas',
          formatarReal(c.income.current),
          formatarReal(c.income.previous),
          formatarVariacao(c.income.absolute, c.income.percent),
        ],
        [
          'Despesas',
          formatarReal(c.expenses.current),
          formatarReal(c.expenses.previous),
          formatarVariacao(c.expenses.absolute, c.expenses.percent),
        ],
        [
          'Saldo',
          formatarReal(c.balance.current),
          formatarReal(c.balance.previous),
          formatarVariacao(c.balance.absolute, c.balance.percent),
        ],
        [
          'Cartão de crédito',
          formatarReal(c.creditCard.current),
          formatarReal(c.creditCard.previous),
          formatarVariacao(c.creditCard.absolute, c.creditCard.percent),
        ],
      ],
      [120, 110, 110, 175],
    );
  }

  private escreverTabelaCategoriasPDF(
    doc: PDFKit.PDFDocument,
    report: MonthlyReport,
  ): void {
    this.tituloSecaoPDF(doc, 'Gastos por categoria');

    if (report.byCategory.length === 0) {
      this.paragrafoPDF(doc, 'Nenhuma despesa categorizada no período.');
      return;
    }

    this.tabelaPDF(
      doc,
      ['Categoria', 'Total', 'Lanç.', 'Part.', 'Mês anterior', 'Variação'],
      report.byCategory.map((c) => [
        c.category,
        formatarReal(c.total),
        String(c.count),
        formatarPercentual(c.share, 1),
        formatarReal(c.previousTotal),
        formatarVariacao(c.variationAbsolute, c.variationPercent),
      ]),
      [110, 85, 40, 50, 85, 145],
    );
  }

  private escreverTabelaResponsaveisPDF(
    doc: PDFKit.PDFDocument,
    report: MonthlyReport,
  ): void {
    this.tituloSecaoPDF(doc, 'Gastos por responsável');

    if (report.byResponsible.length === 0) {
      this.paragrafoPDF(doc, 'Nenhuma despesa lançada por responsável no período.');
      return;
    }

    this.tabelaPDF(
      doc,
      ['Responsável', 'Total', 'Lanç.', 'Participação', 'Mês anterior'],
      report.byResponsible.map((r) => [
        r.responsible,
        formatarReal(r.total),
        String(r.count),
        formatarPercentual(r.share, 1),
        formatarReal(r.previousTotal),
      ]),
      [130, 110, 50, 100, 110],
    );

    if (report.split.available && report.split.difference) {
      this.paragrafoPDF(
        doc,
        `${report.split.difference.paidMore} desembolsou ` +
          `${formatarReal(report.split.difference.amount)} a mais que ` +
          `${report.split.difference.paidLess}. Critério de rateio: ${report.split.criteria ?? '—'}.`,
      );
    } else if (report.split.notice) {
      this.paragrafoPDF(doc, report.split.notice);
    }
  }

  private escreverContasPDF(doc: PDFKit.PDFDocument, report: MonthlyReport): void {
    const p = report.plannedAccounts;

    this.tituloSecaoPDF(doc, 'Contas do mês');

    this.tabelaPDF(
      doc,
      ['Situação', 'Quantidade', 'Total'],
      [
        ['Pagas', String(p.paid.count), formatarReal(p.paid.total)],
        ['Pendentes', String(p.pending.count), formatarReal(p.pending.total)],
        ['Vencidas', String(p.overdue.count), formatarReal(p.overdue.total)],
        ['Canceladas', String(p.cancelled.count), formatarReal(p.cancelled.total)],
      ],
      [200, 140, 140],
    );

    const detalhe = [...p.paid.items, ...p.pending.items, ...p.overdue.items];

    if (detalhe.length > 0) {
      this.tabelaPDF(
        doc,
        ['Descrição', 'Vencimento', 'Responsável', 'Valor', 'Situação'],
        detalhe.map((c) => [
          c.description,
          formatarData(c.dueDate),
          c.responsible,
          formatarReal(c.amount),
          c.status,
        ]),
        [160, 90, 90, 100, 75],
      );
    } else {
      this.paragrafoPDF(doc, 'Nenhuma conta planejada cadastrada para este mês.');
    }
  }

  private escreverCartoesPDF(doc: PDFKit.PDFDocument, report: MonthlyReport): void {
    const c = report.creditCards;

    this.tituloSecaoPDF(doc, 'Gastos no cartão de crédito');

    this.paragrafoPDF(
      doc,
      `Total gasto no cartão: ${formatarReal(c.totalSpent)} em ${c.transactionCount} ` +
        `lançamento(s), ${formatarPercentual(c.shareOfExpenses, 1)} das despesas do mês.`,
    );

    if (c.cards.length === 0) {
      this.paragrafoPDF(doc, 'Nenhum cartão de crédito cadastrado.');
      return;
    }

    this.tabelaPDF(
      doc,
      ['Cartão', 'Limite', 'Utilizado', 'Disponível', 'Uso', 'Vencimento'],
      c.cards.map((card) => [
        `${card.name} (${card.bank})`,
        formatarReal(card.limit),
        formatarReal(card.currentBalance),
        formatarReal(card.availableLimit),
        formatarPercentual(card.utilizationPercent, 1),
        `dia ${card.dueDay}`,
      ]),
      [130, 80, 80, 80, 60, 65],
    );
  }

  private escreverParcelamentosPDF(
    doc: PDFKit.PDFDocument,
    report: MonthlyReport,
  ): void {
    this.tituloSecaoPDF(doc, 'Parcelamentos');

    if (report.installments.count === 0) {
      this.paragrafoPDF(doc, 'Nenhuma compra parcelada lançada no período.');
      return;
    }

    this.paragrafoPDF(
      doc,
      `${report.installments.count} parcelamento(s) no mês, somando ` +
        `${formatarReal(report.installments.totalInMonth)}. Impacto restante nos ` +
        `próximos meses: ${formatarReal(report.installments.totalRemaining)}.`,
    );

    this.tabelaPDF(
      doc,
      ['Descrição', 'Parcela', 'Valor', 'Restam', 'A pagar'],
      report.installments.items.map((i) => [
        i.description,
        `${i.currentInstallment}/${i.totalInstallments}`,
        formatarReal(i.installmentAmount),
        String(i.remainingInstallments),
        formatarReal(i.remainingAmount),
      ]),
      [180, 70, 100, 60, 105],
    );
  }

  private escreverEvolucaoPDF(doc: PDFKit.PDFDocument, report: MonthlyReport): void {
    this.tituloSecaoPDF(doc, 'Evolução patrimonial (12 meses)');

    this.tabelaPDF(
      doc,
      ['Mês', 'Receitas', 'Despesas', 'Resultado', 'Acumulado'],
      report.netWorth.points.map((p) => [
        p.label,
        formatarReal(p.income),
        formatarReal(p.expenses),
        formatarReal(p.net),
        formatarReal(p.accumulated),
      ]),
      [90, 105, 105, 105, 110],
    );

    this.paragrafoPDF(
      doc,
      `Resultado acumulado na janela: ${formatarReal(report.netWorth.accumulatedResult)}. ` +
        `Saldo atual em conta: ${formatarReal(report.netWorth.currentBalance)}.`,
    );
  }

  private escreverMetasPDF(doc: PDFKit.PDFDocument, report: MonthlyReport): void {
    this.tituloSecaoPDF(doc, 'Metas');

    if (report.goals.items.length === 0) {
      this.paragrafoPDF(doc, 'Nenhuma meta cadastrada.');
      return;
    }

    this.tabelaPDF(
      doc,
      ['Meta', 'Objetivo', 'Acumulado', 'Falta', 'Progresso', 'Prazo'],
      report.goals.items.map((m) => [
        m.name,
        formatarReal(m.targetAmount),
        formatarReal(m.currentAmount),
        formatarReal(m.remainingAmount),
        formatarPercentual(m.progressPercent, 1),
        formatarData(m.deadline),
      ]),
      [120, 85, 85, 85, 65, 75],
    );
  }

  private escreverAlertasPDF(doc: PDFKit.PDFDocument, report: MonthlyReport): void {
    this.tituloSecaoPDF(doc, 'Alertas');

    if (report.alerts.length === 0) {
      this.paragrafoPDF(doc, 'Nenhum alerta identificado neste mês.');
      return;
    }

    for (const alerta of report.alerts) {
      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .fillColor(alerta.severity === 'critical' ? '#B00020' : '#8A6D00')
        .text(alerta.title);
      doc
        .font('Helvetica')
        .fillColor('#333333')
        .text(alerta.message);
      doc.moveDown(0.4);
    }
  }

  private escreverSugestoesPDF(doc: PDFKit.PDFDocument, report: MonthlyReport): void {
    this.tituloSecaoPDF(doc, 'Sugestões de economia');

    if (report.suggestions.length === 0) {
      this.paragrafoPDF(
        doc,
        'Nenhuma sugestão foi gerada: não há lançamentos suficientes para sustentar uma recomendação.',
      );
      return;
    }

    for (const s of report.suggestions) {
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#111111').text(s.title);
      doc.font('Helvetica').fillColor('#333333').text(s.description);

      if (s.potentialSavings !== null) {
        doc.fillColor('#0B6B3A').text(
          `Economia estimada: ${formatarReal(s.potentialSavings)}`,
        );
      }

      doc.moveDown(0.4);
    }
  }

  private escreverAvisosPDF(doc: PDFKit.PDFDocument, report: MonthlyReport): void {
    if (report.notices.length === 0) {
      return;
    }

    this.tituloSecaoPDF(doc, 'Observações sobre os dados');

    for (const aviso of report.notices) {
      doc.fontSize(9).font('Helvetica').fillColor('#555555').text(`• ${aviso}`);
      doc.moveDown(0.2);
    }
  }

  // ---------- primitivas de desenho do PDF ----------

  private tituloSecaoPDF(doc: PDFKit.PDFDocument, titulo: string): void {
    this.quebrarPaginaSeNecessario(doc, 80);

    doc.moveDown(0.6);
    doc.fontSize(13).font('Helvetica-Bold').fillColor('#111111').text(titulo);
    doc.moveDown(0.3);
  }

  private paragrafoPDF(doc: PDFKit.PDFDocument, texto: string): void {
    this.quebrarPaginaSeNecessario(doc, 60);

    doc.fontSize(10).font('Helvetica').fillColor('#333333').text(texto);
    doc.moveDown(0.4);
  }

  private linhaHorizontalPDF(doc: PDFKit.PDFDocument): void {
    const y = doc.y;
    doc
      .strokeColor('#CCCCCC')
      .lineWidth(1)
      .moveTo(doc.page.margins.left, y)
      .lineTo(doc.page.width - doc.page.margins.right, y)
      .stroke();
  }

  /**
   * Tabela simples de largura fixa.
   *
   * O PDFKit não tem tabelas; cada célula é posicionada por coluna e a linha
   * avança pela altura do texto mais alto — assim uma descrição longa não
   * sobrescreve a linha seguinte.
   */
  private tabelaPDF(
    doc: PDFKit.PDFDocument,
    cabecalho: string[],
    linhas: string[][],
    larguras: number[],
  ): void {
    const esquerda = doc.page.margins.left;

    const desenharLinha = (celulas: string[], negrito: boolean): void => {
      const alturaEstimada = 16;
      this.quebrarPaginaSeNecessario(doc, alturaEstimada + 20);

      const y = doc.y;
      let x = esquerda;
      let maiorAltura = 0;

      doc
        .fontSize(9)
        .font(negrito ? 'Helvetica-Bold' : 'Helvetica')
        .fillColor(negrito ? '#000000' : '#333333');

      celulas.forEach((celula, indice) => {
        const largura = larguras[indice] ?? 80;
        const texto = celula ?? '';

        doc.text(texto, x, y, { width: largura - 6, ellipsis: true });
        maiorAltura = Math.max(maiorAltura, doc.y - y);
        x += largura;
      });

      doc.y = y + Math.max(maiorAltura, 12) + 2;
      doc.x = esquerda;
    };

    desenharLinha(cabecalho, true);
    this.linhaHorizontalPDF(doc);
    doc.moveDown(0.2);

    for (const linha of linhas) {
      desenharLinha(linha, false);
    }

    doc.moveDown(0.4);
  }

  private quebrarPaginaSeNecessario(doc: PDFKit.PDFDocument, altura: number): void {
    const limite = doc.page.height - doc.page.margins.bottom;

    if (doc.y + altura > limite) {
      doc.addPage();
    }
  }

  private aguardarStream(stream: fs.WriteStream): Promise<void> {
    return new Promise((resolve, reject) => {
      stream.on('finish', () => resolve());
      stream.on('error', reject);
    });
  }

  // ==================== XLSX ====================

  /** Uma aba por seção: Resumo, Categorias, Responsáveis, Lançamentos, Metas. */
  async exportXLSX(report: MonthlyReport, reportId: string): Promise<GeneratedFile> {
    const { filePath, fileName } = this.resolverCaminho(report, reportId, 'xlsx');

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Casa Financeira';
    workbook.created = report.generatedAt;

    this.abaResumo(workbook, report);
    this.abaCategorias(workbook, report);
    this.abaResponsaveis(workbook, report);
    this.abaLancamentos(workbook, report);
    this.abaMetas(workbook, report);

    await workbook.xlsx.writeFile(filePath);

    return this.descreverArquivo(filePath, fileName, 'xlsx');
  }

  private abaResumo(workbook: ExcelJS.Workbook, report: MonthlyReport): void {
    const aba = workbook.addWorksheet('Resumo');
    aba.columns = [
      { header: 'Indicador', key: 'indicador', width: 34 },
      { header: report.period.label, key: 'atual', width: 20 },
      { header: report.comparison.previousLabel, key: 'anterior', width: 20 },
      { header: 'Variação', key: 'variacao', width: 32 },
    ];
    this.estilizarCabecalho(aba);

    const o = report.overview;
    const c = report.comparison;

    aba.addRow({
      indicador: 'Receitas',
      atual: formatarReal(o.totalIncome),
      anterior: formatarReal(c.income.previous),
      variacao: formatarVariacao(c.income.absolute, c.income.percent),
    });
    aba.addRow({
      indicador: 'Despesas',
      atual: formatarReal(o.totalExpenses),
      anterior: formatarReal(c.expenses.previous),
      variacao: formatarVariacao(c.expenses.absolute, c.expenses.percent),
    });
    aba.addRow({
      indicador: 'Saldo do mês',
      atual: formatarReal(o.balance),
      anterior: formatarReal(c.balance.previous),
      variacao: formatarVariacao(c.balance.absolute, c.balance.percent),
    });
    aba.addRow({
      indicador: 'Gasto no cartão de crédito',
      atual: formatarReal(c.creditCard.current),
      anterior: formatarReal(c.creditCard.previous),
      variacao: formatarVariacao(c.creditCard.absolute, c.creditCard.percent),
    });

    aba.addRow({});
    aba.addRow({ indicador: 'Taxa de poupança', atual: formatarPercentual(o.savingsRate) });
    aba.addRow({
      indicador: 'Média diária de despesas',
      atual: formatarReal(o.averageDailyExpense),
    });
    aba.addRow({ indicador: 'Lançamentos no mês', atual: String(o.transactionCount) });
    aba.addRow({ indicador: 'Saldo atual em conta', atual: formatarReal(o.currentBalance) });

    aba.addRow({});
    aba.addRow({ indicador: 'Contas pagas', atual: formatarReal(report.plannedAccounts.paid.total) });
    aba.addRow({
      indicador: 'Contas pendentes',
      atual: formatarReal(report.plannedAccounts.pending.total),
    });
    aba.addRow({
      indicador: 'Contas vencidas',
      atual: formatarReal(report.plannedAccounts.overdue.total),
    });
    aba.addRow({
      indicador: 'Parcelamentos (a pagar nos próximos meses)',
      atual: formatarReal(report.installments.totalRemaining),
    });

    aba.addRow({});
    aba.addRow({ indicador: 'Evolução patrimonial (12 meses)' });
    aba.addRow({ indicador: 'Mês', atual: 'Receitas', anterior: 'Despesas', variacao: 'Acumulado' });
    for (const ponto of report.netWorth.points) {
      aba.addRow({
        indicador: ponto.label,
        atual: formatarReal(ponto.income),
        anterior: formatarReal(ponto.expenses),
        variacao: formatarReal(ponto.accumulated),
      });
    }

    if (report.alerts.length > 0) {
      aba.addRow({});
      aba.addRow({ indicador: 'Alertas' });
      for (const alerta of report.alerts) {
        aba.addRow({ indicador: alerta.title, atual: alerta.message });
      }
    }

    if (report.suggestions.length > 0) {
      aba.addRow({});
      aba.addRow({ indicador: 'Sugestões de economia' });
      for (const s of report.suggestions) {
        aba.addRow({
          indicador: s.title,
          atual: s.potentialSavings === null ? '—' : formatarReal(s.potentialSavings),
          anterior: s.description,
        });
      }
    }

    if (report.notices.length > 0) {
      aba.addRow({});
      aba.addRow({ indicador: 'Observações sobre os dados' });
      for (const aviso of report.notices) {
        aba.addRow({ indicador: aviso });
      }
    }
  }

  private abaCategorias(workbook: ExcelJS.Workbook, report: MonthlyReport): void {
    const aba = workbook.addWorksheet('Categorias');
    aba.columns = [
      { header: 'Categoria', key: 'categoria', width: 26 },
      { header: 'Total', key: 'total', width: 16 },
      { header: 'Lançamentos', key: 'count', width: 14 },
      { header: 'Ticket médio', key: 'media', width: 16 },
      { header: 'Participação', key: 'share', width: 14 },
      { header: 'Mês anterior', key: 'anterior', width: 16 },
      { header: 'Variação', key: 'variacao', width: 32 },
    ];
    this.estilizarCabecalho(aba);

    if (report.byCategory.length === 0) {
      aba.addRow({ categoria: 'Nenhuma despesa categorizada no período.' });
      return;
    }

    for (const c of report.byCategory) {
      aba.addRow({
        categoria: c.category,
        total: formatarReal(c.total),
        count: c.count,
        media: formatarReal(c.average),
        share: formatarPercentual(c.share, 1),
        anterior: formatarReal(c.previousTotal),
        variacao: formatarVariacao(c.variationAbsolute, c.variationPercent),
      });
    }
  }

  private abaResponsaveis(workbook: ExcelJS.Workbook, report: MonthlyReport): void {
    const aba = workbook.addWorksheet('Responsáveis');
    aba.columns = [
      { header: 'Responsável', key: 'responsavel', width: 22 },
      { header: 'Total', key: 'total', width: 16 },
      { header: 'Lançamentos', key: 'count', width: 14 },
      { header: 'Participação', key: 'share', width: 14 },
      { header: 'Mês anterior', key: 'anterior', width: 16 },
      { header: 'Variação', key: 'variacao', width: 32 },
    ];
    this.estilizarCabecalho(aba);

    if (report.byResponsible.length === 0) {
      aba.addRow({ responsavel: 'Nenhuma despesa lançada no período.' });
      return;
    }

    for (const r of report.byResponsible) {
      aba.addRow({
        responsavel: r.responsible,
        total: formatarReal(r.total),
        count: r.count,
        share: formatarPercentual(r.share, 1),
        anterior: formatarReal(r.previousTotal),
        variacao: formatarVariacao(r.variationAbsolute, r.variationPercent),
      });
    }

    if (report.split.available && report.split.transfers.length > 0) {
      aba.addRow({});
      aba.addRow({ responsavel: 'Acerto sugerido', total: report.split.criteria ?? '' });
      for (const t of report.split.transfers) {
        aba.addRow({
          responsavel: `${t.from} → ${t.to}`,
          total: formatarReal(t.amount),
        });
      }
    }
  }

  private abaLancamentos(workbook: ExcelJS.Workbook, report: MonthlyReport): void {
    const aba = workbook.addWorksheet('Lançamentos');
    aba.columns = [
      { header: 'Data', key: 'data', width: 14 },
      { header: 'Tipo', key: 'tipo', width: 12 },
      { header: 'Descrição', key: 'descricao', width: 34 },
      { header: 'Estabelecimento', key: 'estabelecimento', width: 24 },
      { header: 'Categoria', key: 'categoria', width: 20 },
      { header: 'Responsável', key: 'responsavel', width: 16 },
      { header: 'Forma de pagamento', key: 'pagamento', width: 20 },
      { header: 'Valor', key: 'valor', width: 16 },
    ];
    this.estilizarCabecalho(aba);

    if (report.transactions.length === 0) {
      aba.addRow({ data: 'Nenhum lançamento registrado no período.' });
      return;
    }

    for (const t of report.transactions) {
      aba.addRow({
        data: formatarData(t.date),
        tipo: t.kind,
        descricao: t.description,
        estabelecimento: t.establishment ?? '',
        categoria: t.category,
        responsavel: t.responsible,
        pagamento: t.paymentMethod ?? '',
        valor: formatarReal(t.amount),
      });
    }
  }

  private abaMetas(workbook: ExcelJS.Workbook, report: MonthlyReport): void {
    const aba = workbook.addWorksheet('Metas');
    aba.columns = [
      { header: 'Meta', key: 'meta', width: 30 },
      { header: 'Tipo', key: 'tipo', width: 18 },
      { header: 'Objetivo', key: 'objetivo', width: 18 },
      { header: 'Acumulado', key: 'acumulado', width: 18 },
      { header: 'Falta', key: 'falta', width: 18 },
      { header: 'Progresso', key: 'progresso', width: 14 },
      { header: 'Prazo', key: 'prazo', width: 14 },
      { header: 'Situação', key: 'situacao', width: 14 },
    ];
    this.estilizarCabecalho(aba);

    if (report.goals.items.length === 0) {
      aba.addRow({ meta: 'Nenhuma meta cadastrada.' });
      return;
    }

    for (const m of report.goals.items) {
      aba.addRow({
        meta: m.name,
        tipo: m.type,
        objetivo: formatarReal(m.targetAmount),
        acumulado: formatarReal(m.currentAmount),
        falta: formatarReal(m.remainingAmount),
        progresso: formatarPercentual(m.progressPercent, 1),
        prazo: formatarData(m.deadline),
        situacao: m.status,
      });
    }
  }

  private estilizarCabecalho(aba: ExcelJS.Worksheet): void {
    const cabecalho = aba.getRow(1);
    cabecalho.font = { bold: true };
    cabecalho.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8EEF7' },
    };
    aba.views = [{ state: 'frozen', ySplit: 1 }];
  }

  // ==================== CSV ====================

  /**
   * Lançamentos do período.
   *
   * Separador `;` e BOM UTF-8: é o que o Excel em português abre corretamente
   * sem passar pelo assistente de importação — com `,` ele juntaria tudo numa
   * coluna só, porque a vírgula é o separador decimal do formato brasileiro.
   */
  async exportCSV(report: MonthlyReport, reportId: string): Promise<GeneratedFile> {
    const { filePath, fileName } = this.resolverCaminho(report, reportId, 'csv');

    const cabecalho = [
      'Data',
      'Tipo',
      'Descrição',
      'Estabelecimento',
      'Categoria',
      'Responsável',
      'Forma de pagamento',
      'Valor',
    ];

    const linhas = report.transactions.map((t) => [
      formatarData(t.date),
      t.kind,
      t.description,
      t.establishment ?? '',
      t.category,
      t.responsible,
      t.paymentMethod ?? '',
      formatarNumero(t.amount),
    ]);

    const corpo = [cabecalho, ...linhas]
      .map((linha) => linha.map((celula) => this.escaparCSV(celula)).join(SEPARADOR_CSV))
      .join('\r\n');

    // BOM (U+FEFF) para o Excel reconhecer o UTF-8 e não estropiar os acentos.
    fs.writeFileSync(filePath, `\uFEFF${corpo}\r\n`, 'utf8');

    return this.descreverArquivo(filePath, fileName, 'csv');
  }

  /**
   * Escape conforme RFC 4180: aspas duplicadas e célula entre aspas sempre que
   * contiver o separador, aspas ou quebra de linha.
   */
  private escaparCSV(valor: string): string {
    const texto = valor ?? '';

    if (
      texto.includes(SEPARADOR_CSV) ||
      texto.includes('"') ||
      texto.includes('\n') ||
      texto.includes('\r')
    ) {
      return `"${texto.replace(/"/g, '""')}"`;
    }

    return texto;
  }

  // ==================== helpers ====================

  private resolverCaminho(
    report: MonthlyReport,
    reportId: string,
    formato: ReportFormat,
  ): { filePath: string; fileName: string } {
    const competencia = `${report.period.year}-${String(report.period.month).padStart(2, '0')}`;
    // O id entra no nome para dois relatórios da mesma competência não se
    // sobrescreverem no disco.
    const fileName = `relatorio-mensal-${competencia}-${reportId}.${formato}`;

    return { filePath: path.join(this.storageDir, fileName), fileName };
  }

  /** Lê o tamanho REAL do arquivo gravado — nunca o comprimento de uma string. */
  private descreverArquivo(
    filePath: string,
    fileName: string,
    formato: ReportFormat,
  ): GeneratedFile {
    const { size } = fs.statSync(filePath);

    this.logger.log(`Arquivo ${formato} gerado: ${filePath} (${size} bytes)`);

    return {
      format: formato,
      fileName,
      filePath,
      size,
      mimeType: MIME[formato],
    };
  }
}
