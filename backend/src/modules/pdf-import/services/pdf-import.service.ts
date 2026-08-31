import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PdfImport } from '../entities/pdf-import.entity';
import { User } from '../../users/entities/user.entity';
import { Expense } from '../../expenses/entities/expense.entity';
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
    selectedTransactionIds?: string[],
  ): Promise<{ imported: number; skipped: number; errors: any[] }> {
    const pdfImport = await this.getImportStatus(id, user);

    if (!['pending_review', 'reviewing'].includes(pdfImport.status)) {
      throw new BadRequestException('Import cannot be confirmed in current state');
    }

    const transactions = Array.isArray(pdfImport.extractedData)
      ? pdfImport.extractedData
      : Object.values(pdfImport.extractedData || {});

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

        // Create expense
        const expense = this.expensesRepository.create({
          userId: user.id,
          date: new Date(tx.date),
          description: tx.description,
          establishment: tx.establishment,
          amount: tx.amount,
          category: tx.suggestedCategory || 'Outros',
          subcategory: tx.suggestedSubcategory,
          responsible: 'bruno', // Default, should be user-selectable
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

    return { imported, skipped, errors };
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
