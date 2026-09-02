import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PdfImport } from '../entities/pdf-import.entity';
import { User } from '../../users/entities/user.entity';
import { Expense } from '../../expenses/entities/expense.entity';
import { CreditCard } from '../../credit-cards/entities/credit-card.entity';
import { PlannedAccount } from '../../planned-accounts/entities/planned-account.entity';
import { ClassificationRulesService } from '../../classification-rules/classification-rules.service';
import { PdfParserService } from './pdf-parser.service';
import { DuplicateDetectorService } from './duplicate-detector.service';

@Injectable()
export class PdfImportService {
  constructor(
    @InjectRepository(PdfImport)
    private pdfImportRepository: Repository<PdfImport>,
    @InjectRepository(Expense)
    private expensesRepository: Repository<Expense>,
    @InjectRepository(CreditCard)
    private cardsRepository: Repository<CreditCard>,
    @InjectRepository(PlannedAccount)
    private plannedRepository: Repository<PlannedAccount>,
    private pdfParserService: PdfParserService,
    private duplicateDetectorService: DuplicateDetectorService,
    private classificationRulesService: ClassificationRulesService,
  ) {}

  /**
   * Upload and parse PDF file
   */
  async uploadPdf(
    user: User,
    fileName: string,
    fileContent: Buffer,
    creditCardId?: string,
  ): Promise<PdfImport> {
    try {
      // Parse PDF to extract transactions
      const parseResult = await this.pdfParserService.parseTransactions(
        fileContent,
        fileName,
      );

      // Validate extracted transactions
      const { valid: validTransactions, invalid: invalidTransactions } =
        this.pdfParserService.validateTransactions(parseResult.transactions);

      // Detect duplicates
      const duplicateMatches = await this.duplicateDetectorService.detectDuplicates(
        user,
        validTransactions,
      );

      // Auto-classify transactions
      const classifiedTransactions = await this.classifyTransactions(
        user,
        validTransactions,
      );

      // Create PDF import record
      const pdfImport = this.pdfImportRepository.create({
      // Cartão da fatura: é o vínculo que faz as compras importadas contarem
      // no limite utilizado do cartão certo.
      creditCardId,
        userId: user.id,
        fileName,
        importType: parseResult.type,
        bankName: parseResult.bankName,
        cardName: parseResult.cardName,
        extractedData: classifiedTransactions,
        transactionCount: validTransactions.length,
        duplicateCount: duplicateMatches.size,
        status: 'pending_review',
        duplicateMatches: Array.from(duplicateMatches.entries()).map(([txId, matches]) => ({
          transactionId: txId,
          matches,
        })),
      });

      return this.pdfImportRepository.save(pdfImport);
    } catch (error) {
      // Save error state
      const errorImport = this.pdfImportRepository.create({
        userId: user.id,
        fileName,
        status: 'error',
        errorMessage: error.message,
        extractedData: null,
        transactionCount: 0,
        duplicateCount: 0,
      });

      return this.pdfImportRepository.save(errorImport);
    }
  }

  /**
   * Auto-classify transactions using classification rules
   */
  private async classifyTransactions(
    user: User,
    transactions: any[],
  ): Promise<any[]> {
    const classified = [];

    for (const transaction of transactions) {
      const classification = await this.classificationRulesService.classify(
        user,
        transaction.description,
        transaction.amount,
      );

      classified.push({
        ...transaction,
        suggestedCategory: classification?.category,
        suggestedSubcategory: classification?.subcategory,
        classificationConfidence: classification?.confidence,
        classificationRuleId: classification?.ruleId,
      });
    }

    return classified;
  }

  /**
   * Get import status
   */
  async getImportStatus(id: string, user: User): Promise<PdfImport> {
    const pdfImport = await this.pdfImportRepository.findOne({
      where: { id, userId: user.id },
    });

    if (!pdfImport) {
      throw new NotFoundException('PDF import not found');
    }

    return pdfImport;
  }

  /**
   * Get all imports for user
   */
  async getAllImports(user: User, limit: number = 20, offset: number = 0): Promise<PdfImport[]> {
    return this.pdfImportRepository.find({
      where: { userId: user.id },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Review and confirm import
   */
  async reviewImport(
    id: string,
    user: User,
    review: any,
  ): Promise<PdfImport> {
    const pdfImport = await this.getImportStatus(id, user);

    if (pdfImport.status !== 'pending_review') {
      throw new BadRequestException('Import is not in review state');
    }

    pdfImport.userReview = review;
    pdfImport.status = 'reviewing';

    return this.pdfImportRepository.save(pdfImport);
  }

  /**
   * Confirm and import transactions
   */
  async confirmImport(
    id: string,
    user: User,
    opcoes: {
      selectedTransactionIds?: string[];
      ajustes?: Array<{
        transactionId: string;
        category?: string;
        responsible?: string;
      }>;
      responsible?: string;
    } = {},
  ): Promise<{ imported: number; skipped: number; errors: any[] }> {
    const { selectedTransactionIds, ajustes, responsible } = opcoes;

    // Correções feitas na conferência, indexadas para consulta direta.
    const ajustePor = new Map((ajustes ?? []).map((a) => [a.transactionId, a]));

    // Responsável padrão: quem está importando. Antes era o literal 'bruno' —
    // toda fatura importada pela Giovanna era lançada no nome do Bruno, e o
    // painel de divisão ficava errado sem ninguém perceber.
    const responsavelPadrao =
      responsible?.trim() ||
      (user.name || '').trim().split(/\s+/)[0].toLowerCase() ||
      'bruno';

    const pdfImport = await this.getImportStatus(id, user);

    if (!['pending_review', 'reviewing'].includes(pdfImport.status)) {
      throw new BadRequestException('Import cannot be confirmed in current state');
    }

    const transactions = Array.isArray(pdfImport.extractedData)
      ? pdfImport.extractedData
      : Object.values(pdfImport.extractedData || {});

    // Quando a fatura vence — e, por consequência, em que competência ela cai.
    // Vem do cartão; a data de cada compra não serve, porque compras de julho e
    // de agosto pertencem à MESMA fatura.
    const fatura = await this.calcularFatura(pdfImport, transactions);

    const errors: any[] = [];
    let imported = 0;
    let skipped = 0;

    for (const tx of transactions) {
      // Skip if not selected (if specific IDs provided)
      if (selectedTransactionIds && !selectedTransactionIds.includes(tx.transactionId)) {
        skipped++;
        continue;
      }

      // Lançamentos de crédito (salário, estorno, PIX recebido) são ENTRADAS.
      // Antes eram gravados como despesa junto com o resto, o que inflava os
      // totais de gasto — um depósito de salário virava uma despesa do mesmo
      // valor. Entradas ficam de fora da importação de despesas.
      if (tx.type === 'credit') {
        skipped++;
        continue;
      }

      try {
        // Check for existing duplicate
        const existing = await this.duplicateDetectorService.transactionExists(
          user,
          tx.date,
          tx.amount,
          tx.description,
        );

        if (existing) {
          skipped++;
          continue;
        }

        // A correção da conferência tem precedência sobre o palpite da IA:
        // foi o usuário quem olhou o lançamento.
        const ajuste = ajustePor.get(tx.transactionId);

        // Create expense
        const expense = this.expensesRepository.create({
          userId: user.id,
          date: new Date(tx.date),
          description: tx.description,
          establishment: tx.establishment,
          amount: tx.amount,
          category: ajuste?.category || tx.suggestedCategory || 'Outros',
          subcategory: ajuste?.category ? undefined : tx.suggestedSubcategory,
          responsible: ajuste?.responsible || responsavelPadrao,
          // `date` = onde o dinheiro foi gasto. `dueDate` = quando ele sai.
          // Numa compra no crédito as duas são diferentes, e é essa distinção
          // que impede o caixa de debitar a compra no dia em que ela é feita.
          dueDate: fatura?.vencimento ?? new Date(tx.date),
          invoiceCompetencia: fatura?.competencia,
          paymentMethod: 'credit',
          // Sem o cartão, a compra importada não conta no limite utilizado —
          // a fatura entrava e o cartão continuava "zerado".
          creditCardId: pdfImport.creditCardId,
          origin: 'import',
          observation: pdfImport.fileName,
        });

        await this.expensesRepository.save(expense);
        imported++;

        // Increment usage count for classification rule if used
        if (tx.classificationRuleId && tx.classificationRuleId !== 'default') {
          await this.classificationRulesService.incrementUsageCount(tx.classificationRuleId);
        }
      } catch (error) {
        errors.push({
          transaction: tx,
          error: error.message,
        });
      }
    }

    // Update import status
    pdfImport.status = 'imported';
    pdfImport.isProcessed = true;
    pdfImport.processedAt = new Date();
    pdfImport.isAutoClassified = true;

    await this.pdfImportRepository.save(pdfImport);

    // A fatura inteira vira UM compromisso no Planejado.
    const planejado = fatura
      ? await this.registrarFaturaNoPlanejado(
          user,
          pdfImport,
          fatura,
          responsavelPadrao,
        )
      : null;

    return {
      imported,
      skipped,
      errors,
      fatura: planejado
        ? {
            competencia: fatura!.competencia,
            vencimento: fatura!.vencimento,
            total: fatura!.total,
            substituiuProjecao: planejado.substituiu,
          }
        : null,
    } as any;
  }

  /**
   * Vencimento, competência e total da fatura importada.
   *
   * O total é a soma dos lançamentos LIDOS (débitos menos estornos), e não só
   * dos que foram gravados: reimportar a mesma fatura grava zero despesas por
   * duplicidade, mas a fatura continua valendo o que vale. Se o total viesse do
   * que foi inserido, a segunda importação zeraria o compromisso do mês.
   */
  private async calcularFatura(
    pdfImport: PdfImport,
    transactions: any[],
  ): Promise<{
    vencimento: Date;
    competencia: string;
    total: number;
    cardName: string;
  } | null> {
    if (!pdfImport.creditCardId) return null;

    const card = await this.cardsRepository.findOne({
      where: { id: pdfImport.creditCardId },
    });
    if (!card) return null;

    const total = transactions.reduce((soma, tx) => {
      const valor = Number(tx.amount) || 0;
      return tx.type === 'credit' ? soma - valor : soma + valor;
    }, 0);

    // A competência é a da compra mais recente da fatura: é o ciclo que ela
    // fecha. Usar "hoje" erraria ao importar uma fatura antiga.
    const datas = transactions
      .map((tx) => new Date(tx.date))
      .filter((d) => !Number.isNaN(d.getTime()))
      .sort((a, b) => b.getTime() - a.getTime());

    const referencia = datas[0] ?? new Date();

    // Vencimento no mês seguinte ao fechamento quando o dia de vencimento é
    // anterior ao de fechamento — cartão que fecha dia 28 e vence dia 5.
    const mesDoVencimento =
      card.dueDay > card.closingDay
        ? referencia.getMonth()
        : referencia.getMonth() + 1;

    const vencimento = new Date(
      referencia.getFullYear(),
      mesDoVencimento,
      card.dueDay,
      12,
      0,
      0,
    );

    const competencia = `${vencimento.getFullYear()}-${String(
      vencimento.getMonth() + 1,
    ).padStart(2, '0')}`;

    return {
      vencimento,
      competencia,
      total: Number(total.toFixed(2)),
      cardName: card.name,
    };
  }

  /**
   * Cria — ou SUBSTITUI — a fatura do mês no Planejado.
   *
   * A regra pedida: uma projeção de R$ 1.000 para o cartão vira R$ 1.500 quando
   * a fatura real chega. Por isso a busca é por (cartão, competência) e não por
   * descrição: o usuário escreve o nome que quiser na projeção.
   *
   * Uma fatura já marcada como PAGA não é mexida — reimportar o PDF não pode
   * desfazer um pagamento que já aconteceu.
   */
  private async registrarFaturaNoPlanejado(
    user: User,
    pdfImport: PdfImport,
    fatura: { vencimento: Date; competencia: string; total: number; cardName: string },
    responsavel: string,
  ): Promise<{ substituiu: boolean }> {
    // A projeção que o usuário criou à mão NÃO tem competência — ele só
    // escolheu o cartão e uma data. Procurar apenas por competência criaria uma
    // segunda linha e o mês apareceria com a fatura contada duas vezes.
    //
    // Por isso a busca aceita as duas formas: a linha já marcada com esta
    // competência, ou qualquer linha daquele cartão que vença dentro do mês.
    const [ano, mes] = fatura.competencia.split('-').map(Number);
    const inicioDoMes = new Date(ano, mes - 1, 1);
    const fimDoMes = new Date(ano, mes, 0, 23, 59, 59);

    const existente = await this.plannedRepository
      .createQueryBuilder('planned')
      .where('planned.creditCardId = :cardId', {
        cardId: pdfImport.creditCardId,
      })
      .andWhere(
        '(planned.invoiceCompetencia = :competencia OR (planned.invoiceCompetencia IS NULL AND planned.dueDate BETWEEN :inicio AND :fim))',
        { competencia: fatura.competencia, inicio: inicioDoMes, fim: fimDoMes },
      )
      // Uma linha já identificada como esta fatura tem precedência sobre uma
      // projeção solta que só coincide no mês.
      .orderBy(
        'CASE WHEN planned.invoiceCompetencia IS NULL THEN 1 ELSE 0 END',
        'ASC',
      )
      .getOne();

    if (existente) {
      if (existente.status === 'paid') {
        return { substituiu: false };
      }

      const eraProjecao = !existente.invoiceCompetencia;

      existente.amount = fatura.total;
      existente.dueDate = fatura.vencimento;
      existente.pdfImportId = pdfImport.id;
      existente.invoiceCompetencia = fatura.competencia;
      existente.description = `Fatura ${fatura.cardName}`;
      existente.observation = `Importada de ${pdfImport.fileName}`;
      await this.plannedRepository.save(existente);
      return { substituiu: eraProjecao };
    }

    const nova = this.plannedRepository.create({
      userId: user.id,
      description: `Fatura ${fatura.cardName}`,
      category: 'Cartão de crédito',
      amount: fatura.total,
      dueDate: fatura.vencimento,
      responsible: responsavel,
      creditCardId: pdfImport.creditCardId,
      invoiceCompetencia: fatura.competencia,
      pdfImportId: pdfImport.id,
      type: 'expense',
      status: 'pending',
      observation: `Importada de ${pdfImport.fileName}`,
    });

    await this.plannedRepository.save(nova);
    return { substituiu: false };
  }

  /**
   * Reject import
   */
  async rejectImport(id: string, user: User, reason?: string): Promise<PdfImport> {
    const pdfImport = await this.getImportStatus(id, user);

    pdfImport.status = 'rejected';
    pdfImport.errorMessage = reason;

    return this.pdfImportRepository.save(pdfImport);
  }

  /**
   * Delete import
   */
  async deleteImport(id: string, user: User): Promise<void> {
    const pdfImport = await this.getImportStatus(id, user);
    await this.pdfImportRepository.softRemove(pdfImport);
  }

  /**
   * Get import statistics
   */
  async getImportStats(user: User): Promise<any> {
    const stats = await this.pdfImportRepository
      .createQueryBuilder('import')
      .where('import.userId = :userId', { userId: user.id })
      .select('import.status', 'status')
      .addSelect('COUNT(import.id)', 'count')
      .addSelect('SUM(import.transactionCount)', 'totalTransactions')
      .addSelect('SUM(import.duplicateCount)', 'totalDuplicates')
      .groupBy('import.status')
      .getRawMany();

    // COUNT/SUM do PostgreSQL voltam como string; a rota é de estatística e
    // precisa devolver números.
    return stats.map((row) => ({
      status: row.status,
      count: Number(row.count) || 0,
      totalTransactions: Number(row.totalTransactions) || 0,
      totalDuplicates: Number(row.totalDuplicates) || 0,
    }));
  }
}
