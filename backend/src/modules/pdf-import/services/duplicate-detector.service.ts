import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Expense } from '../../expenses/entities/expense.entity';
import { User } from '../../users/entities/user.entity';

interface DuplicateMatch {
  existingId: string;
  matchScore: number;
  reason: string;
  details: {
    dateDiff: number; // Days difference
    amountMatch: boolean;
    descriptionSimilarity: number; // 0-1
  };
}

@Injectable()
export class DuplicateDetectorService {
  constructor(
    @InjectRepository(Expense)
    private expensesRepository: Repository<Expense>,
  ) {}

  /**
   * Detect potential duplicates for extracted transactions
   */
  async detectDuplicates(
    user: User,
    extractedTransactions: any[],
  ): Promise<Map<string, DuplicateMatch[]>> {
    const duplicateMatches = new Map<string, DuplicateMatch[]>();

    // Get all recent expenses for comparison (last 90 days)
    const recentExpenses = await this.getRecentExpenses(user, 90);

    for (const transaction of extractedTransactions) {
      const matches = this.findMatches(transaction, recentExpenses);
      if (matches.length > 0) {
        duplicateMatches.set(transaction.transactionId || transaction.date, matches);
      }
    }

    return duplicateMatches;
  }

  /**
   * Get recent expenses for duplicate comparison
   */
  private async getRecentExpenses(user: User, days: number): Promise<Expense[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return this.expensesRepository
      .createQueryBuilder('expense')
      .where('expense.userId = :userId', { userId: user.id })
      .andWhere('expense.date >= :startDate', { startDate })
      .orderBy('expense.date', 'DESC')
      .getMany();
  }

  /**
   * Find matching expenses for a transaction
   */
  private findMatches(
    transaction: any,
    existingExpenses: Expense[],
  ): DuplicateMatch[] {
    const matches: DuplicateMatch[] = [];

    for (const expense of existingExpenses) {
      const score = this.calculateMatchScore(transaction, expense);

      // Consider it a match if score is above threshold (0.7 = 70% similarity)
      if (score >= 0.7) {
        const dateDiff = this.calculateDateDifference(
          new Date(transaction.date),
          new Date(expense.date),
        );

        matches.push({
          existingId: expense.id,
          matchScore: score,
          reason: this.getMatchReason(score, dateDiff),
          details: {
            dateDiff,
            amountMatch: Math.abs(transaction.amount - expense.amount) < 0.01,
            descriptionSimilarity: this.calculateStringSimilarity(
              transaction.description,
              expense.description,
            ),
          },
        });
      }
    }

    // Sort by match score descending
    return matches.sort((a, b) => b.matchScore - a.matchScore);
  }

  /**
   * Calculate match score (0-1) between extracted and existing transaction
   */
  private calculateMatchScore(extractedTx: any, existingTx: Expense): number {
    let score = 0;

    // Exact amount match (50% weight)
    if (Math.abs(extractedTx.amount - existingTx.amount) < 0.01) {
      score += 0.5;
    } else if (Math.abs(extractedTx.amount - existingTx.amount) / existingTx.amount < 0.05) {
      // Within 5% difference
      score += 0.25;
    }

    // Date proximity (30% weight)
    const dateDiff = this.calculateDateDifference(
      new Date(extractedTx.date),
      new Date(existingTx.date),
    );
    if (dateDiff === 0) {
      score += 0.3; // Same day
    } else if (dateDiff <= 1) {
      score += 0.25; // Within 1 day
    } else if (dateDiff <= 3) {
      score += 0.15; // Within 3 days
    } else if (dateDiff <= 5) {
      score += 0.05; // Within 5 days
    }

    // Description similarity (20% weight)
    const similarity = this.calculateStringSimilarity(
      extractedTx.description,
      existingTx.description,
    );
    score += similarity * 0.2;

    return Math.min(score, 1);
  }

  /**
   * Calculate days difference between two dates
   */
  private calculateDateDifference(date1: Date, date2: Date): number {
    const diffTime = Math.abs(date1.getTime() - date2.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Calculate string similarity using Levenshtein distance
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();

    // Exact match
    if (s1 === s2) return 1;

    // One contains the other
    if (s1.includes(s2) || s2.includes(s1)) return 0.8;

    // Check if either is substring after removing common words
    const cleaned1 = this.cleanDescription(s1);
    const cleaned2 = this.cleanDescription(s2);

    if (cleaned1.includes(cleaned2) || cleaned2.includes(cleaned1)) return 0.7;

    // Calculate Levenshtein distance
    const distance = this.levenshteinDistance(s1, s2);
    const maxLength = Math.max(s1.length, s2.length);
    const similarity = Math.max(0, 1 - distance / maxLength);

    return Math.min(similarity, 1);
  }

  /**
   * Clean description for comparison (remove stop words, normalize)
   */
  private cleanDescription(desc: string): string {
    const stopWords = [
      'o',
      'a',
      'de',
      'do',
      'da',
      'por',
      'e',
      'em',
      'que',
      'r$',
      'reais',
    ];
    return desc
      .split(' ')
      .filter((word) => !stopWords.includes(word) && word.length > 2)
      .join(' ');
  }

  /**
   * Levenshtein distance algorithm
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1,
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Get human-readable reason for match
   */
  private getMatchReason(score: number, dateDiff: number): string {
    if (score >= 0.9) {
      return 'Extremely likely duplicate (exact or near-exact match)';
    } else if (score >= 0.8) {
      return 'Very likely duplicate (amount and date match)';
    } else if (score >= 0.7) {
      if (dateDiff <= 1) {
        return 'Possible duplicate (same day transaction)';
      }
      return 'Possible duplicate (similar amount and description)';
    }
    return 'Similar transaction found';
  }

  /**
   * Check if transaction exists (simple direct match)
   */
  async transactionExists(
    user: User,
    date: string,
    amount: number,
    description: string,
  ): Promise<Expense | null> {
    return this.expensesRepository.findOne({
      where: {
        userId: user.id,
        date: new Date(date),
        amount,
        description,
      },
    });
  }
}
