'use strict';

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { MLFeedback } from '../entities/ml-feedback.entity';
import { MLPattern } from '../entities/ml-pattern.entity';
import { Expense } from '../../expenses/entities/expense.entity';
import { Category } from '../../categories/entities/category.entity';
import { CreateMLFeedbackDto, MLPredictionDto, GetMLFeedbackStatsDto } from '../dtos/create-ml-feedback.dto';
import { ClassificationRulesService } from '../../classification-rules/classification-rules.service';

interface CategoryScore {
  categoryId: string;
  categoryName: string;
  score: number;
  reasons: string[];
  confidence: number;
}

@Injectable()
export class MLClassifierService {
  constructor(
    @InjectRepository(MLFeedback)
    private readonly feedbackRepository: Repository<MLFeedback>,

    @InjectRepository(MLPattern)
    private readonly patternRepository: Repository<MLPattern>,

    @InjectRepository(Expense)
    private readonly expenseRepository: Repository<Expense>,

    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,

    private readonly classificationRulesService: ClassificationRulesService,
  ) {}

  /**
   * Predict category for a new transaction using ML patterns + rules
   * Combina padrões aprendidos com regras de classificação existentes
   */
  async predict(
    user: any,
    description: string,
    establishment?: string,
    amount?: number,
    date?: Date,
  ): Promise<MLPredictionDto> {
    const userId = user.id;

    // 1. Buscar padrões aprendidos do usuário
    const patterns = await this.patternRepository.find({
      where: { userId, status: In(['auto', 'approved']) },
      order: { confidence: 'DESC', matchCount: 'DESC' },
    });

    // 2. Score cada padrão contra a transação
    const categoryScores: Map<string, CategoryScore> = new Map();

    // Aplicar padrões
    for (const pattern of patterns) {
      const match = this.matchPattern(pattern, description, establishment, amount, date);
      if (match.matched) {
        const key = pattern.categoryId;
        const existing = categoryScores.get(key) || {
          categoryId: pattern.categoryId,
          categoryName: pattern.category?.name || '',
          score: 0,
          reasons: [],
          confidence: 0,
        };

        existing.score += pattern.confidence * match.strength;
        existing.reasons.push(`Pattern: ${pattern.patternType} (${pattern.pattern})`);
        categoryScores.set(key, existing);
      }
    }

    // 3. Tentar classificação por regra (fallback)
    if (categoryScores.size === 0) {
      try {
        const ruleResult = await this.classificationRulesService.classify(user, description, amount);
        if (ruleResult) {
          categoryScores.set(ruleResult.category, {
            categoryId: ruleResult.category,
            categoryName: ruleResult.category,
            score: ruleResult.confidence,
            reasons: [`Rule match: ${description}`],
            confidence: ruleResult.confidence,
          });
        }
      } catch (error) {
        // Ignorar erro de regra
      }
    }

    // 4. Buscar alternativas baseado em histórico
    const alternativeSuggestions = await this.getAlternativeSuggestions(
      userId,
      Array.from(categoryScores.keys()),
      3,
    );

    // 5. Retornar melhor match
    if (categoryScores.size === 0) {
      // Retornar fallback com todas as categorias padrão
      return {
        categoryId: '',
        categoryName: 'Não classificada',
        confidence: 0,
        reasons: ['Nenhum padrão correspondente encontrado'],
        alternativeSuggestions: alternativeSuggestions.slice(0, 5),
      };
    }

    const sorted = Array.from(categoryScores.values()).sort((a, b) => b.score - a.score);
    const best = sorted[0];

    // Normalizar confidence (0-1)
    const maxPossibleScore = patterns.length > 0 ? patterns.length : 1;
    const confidence = Math.min(best.score / maxPossibleScore, 1);

    return {
      categoryId: best.categoryId,
      categoryName: best.categoryName,
      confidence: Math.round(confidence * 100) / 100,
      reasons: best.reasons.slice(0, 3),
      alternativeSuggestions: sorted.slice(1, 4),
    };
  }

  /**
   * Registrar feedback do usuário sobre categorização
   */
  async recordFeedback(
    user: any,
    dto: CreateMLFeedbackDto,
  ): Promise<MLFeedback> {
    const userId = user.id;

    // Criar feedback
    const feedback = this.feedbackRepository.create({
      userId,
      description: dto.description,
      expenseId: dto.expenseId,
      suggestedCategoryId: dto.suggestedCategoryId,
      correctCategoryId: dto.correctCategoryId,
      originalConfidence: dto.originalConfidence || 0,
      feedbackType: dto.feedbackType || 'incorrect',
      isPositive: dto.feedbackType === 'correct',
      notes: dto.notes,
      metadata: dto.metadata,
    });

    const saved = await this.feedbackRepository.save(feedback);

    // Atualizar patterns baseado em feedback
    if (dto.feedbackType !== 'partial') {
      await this.updatePatternsFromFeedback(userId, saved);
    }

    return saved;
  }

  /**
   * Atualizar padrões baseado em feedback do usuário
   * Isso implementa o "feedback loop" de aprendizado
   */
  private async updatePatternsFromFeedback(userId: string, feedback: MLFeedback): Promise<void> {
    const isCorrect = feedback.isPositive;

    if (!isCorrect) {
      // Usuário corrigiu → criar/atualizar padrão para categoria correta
      await this.createOrUpdatePattern(
        userId,
        feedback.correctCategoryId,
        feedback.description,
        'keyword',
        isCorrect,
      );
    }

    // Se a sugestão foi errada, diminuir confiança do padrão anterior
    if (feedback.suggestedCategoryId && !isCorrect) {
      const wrongPattern = await this.patternRepository.findOne({
        where: { userId, categoryId: feedback.suggestedCategoryId },
        order: { confidence: 'DESC' },
      });

      if (wrongPattern) {
        // Diminuir confiança
        wrongPattern.confidence = Math.max(0.1, wrongPattern.confidence - 0.05);
        await this.patternRepository.save(wrongPattern);
      }
    }
  }

  /**
   * Criar ou atualizar padrão existente
   */
  private async createOrUpdatePattern(
    userId: string,
    categoryId: string,
    description: string,
    patternType: string,
    isCorrect: boolean,
  ): Promise<void> {
    // Extrair keywords principais
    const keywords = this.extractKeywords(description);

    for (const keyword of keywords) {
      let pattern = await this.patternRepository.findOne({
        where: {
          userId,
          categoryId,
          pattern: keyword,
          patternType: 'keyword',
        },
      });

      if (!pattern) {
        pattern = this.patternRepository.create({
          userId,
          categoryId,
          pattern: keyword,
          patternType: 'keyword',
          confidence: 0.6,
          matchCount: 1,
          status: 'auto',
          metadata: {
            keywords: [keyword],
            derivedFrom: 'feedback',
          },
        });
      } else {
        // Aumentar confiança de padrão existente
        pattern.matchCount += 1;
        pattern.confidence = Math.min(0.99, pattern.confidence + 0.03);
        pattern.lastMatchedAt = new Date();
      }

      await this.patternRepository.save(pattern);
    }
  }

  /**
   * Extrair keywords de uma descrição
   */
  private extractKeywords(description: string): string[] {
    // Normalizar
    const normalized = description.toUpperCase().trim();

    // Remover stopwords comuns
    const stopwords = [
      'O', 'A', 'DE', 'DA', 'DO', 'E', 'OU', 'POR', 'PARA', 'EM', 'NA', 'NO', 'NOS', 'NAS',
      'UM', 'UMA', 'UNIDADE', 'VALOR', 'OPERAÇÃO', 'TRANSAÇÃO', 'COMPRA', 'VENDA',
    ];

    const words = normalized.split(/\s+/).filter((w) => w.length > 3 && !stopwords.includes(w));

    // Retornar os 3 principais palavras
    return words.slice(0, 3);
  }

  /**
   * Match padrão contra descrição
   */
  private matchPattern(
    pattern: MLPattern,
    description: string,
    establishment?: string,
    amount?: number,
    date?: Date,
  ): { matched: boolean; strength: number } {
    const desc = description.toUpperCase();

    let matched = false;
    let strength = 0.5;

    switch (pattern.patternType) {
      case 'keyword':
        matched = desc.includes(pattern.pattern.toUpperCase());
        strength = matched ? 0.8 : 0;
        break;

      case 'regex':
        try {
          const regex = new RegExp(pattern.pattern, 'i');
          matched = regex.test(desc);
          strength = matched ? 0.9 : 0;
        } catch {
          matched = false;
          strength = 0;
        }
        break;

      case 'establishment':
        matched = establishment
          ? establishment.toUpperCase().includes(pattern.pattern.toUpperCase())
          : false;
        strength = matched ? 0.85 : 0;
        break;

      case 'amount_range':
        if (amount && pattern.metadata?.amountMin && pattern.metadata?.amountMax) {
          matched = amount >= pattern.metadata.amountMin && amount <= pattern.metadata.amountMax;
          strength = matched ? 0.6 : 0;
        }
        break;

      case 'time_based':
        if (date && pattern.metadata?.daysOfWeek) {
          const dayOfWeek = date.getDay();
          matched = pattern.metadata.daysOfWeek.includes(dayOfWeek);
          strength = matched ? 0.5 : 0;
        }
        break;

      case 'multi_criteria':
        // Combinar múltiplos critérios
        let multiScore = 0;
        if (desc.includes(pattern.pattern.toUpperCase())) multiScore += 0.4;
        if (establishment?.toUpperCase().includes(pattern.pattern.toUpperCase())) multiScore += 0.3;
        matched = multiScore > 0;
        strength = multiScore;
        break;
    }

    return { matched, strength };
  }

  /**
   * Obter sugestões alternativas baseado em histórico similar
   */
  private async getAlternativeSuggestions(
    userId: string,
    excludeCategories: string[],
    limit: number,
  ): Promise<CategoryScore[]> {
    const patterns = await this.patternRepository.find({
      where: { userId, status: In(['auto', 'approved']) },
      order: { confidence: 'DESC', matchCount: 'DESC' },
      take: limit * 2,
    });

    const suggestions: Map<string, CategoryScore> = new Map();

    for (const pattern of patterns) {
      if (excludeCategories.includes(pattern.categoryId)) continue;

      const key = pattern.categoryId;
      if (!suggestions.has(key)) {
        suggestions.set(key, {
          categoryId: pattern.categoryId,
          categoryName: pattern.category?.name || '',
          score: 0,
          reasons: [],
          confidence: pattern.confidence,
        });
      }
    }

    return Array.from(suggestions.values()).slice(0, limit);
  }

  /**
   * Obter estatísticas de feedback
   */
  async getFeedbackStats(user: any): Promise<GetMLFeedbackStatsDto> {
    const userId = user.id;

    const feedback = await this.feedbackRepository.find({
      where: { userId },
      relations: ['suggestedCategory', 'correctCategory'],
    });

    const totalFeedback = feedback.length;
    const correctCount = feedback.filter((f) => f.feedbackType === 'correct').length;
    const incorrectCount = feedback.filter((f) => f.feedbackType === 'incorrect').length;
    const partialCount = feedback.filter((f) => f.feedbackType === 'partial').length;

    // Categorias mais corrigidas
    const categoryCorrections = new Map<string, { name: string; count: number }>();
    feedback
      .filter((f) => f.feedbackType === 'incorrect')
      .forEach((f) => {
        const key = f.correctCategoryId;
        if (!categoryCorrections.has(key)) {
          categoryCorrections.set(key, { name: f.correctCategory?.name || '', count: 0 });
        }
        const item = categoryCorrections.get(key);
        item!.count += 1;
      });

    const mostCorrectedCategories = Array.from(categoryCorrections.entries())
      .map(([catId, data]) => ({
        categoryId: catId,
        categoryName: data.name,
        correctionCount: data.count,
        percentage: Math.round((data.count / incorrectCount) * 100),
      }))
      .sort((a, b) => b.correctionCount - a.correctionCount)
      .slice(0, 5);

    // Feedback recente
    const recentFeedback = feedback
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 10)
      .map((f) => ({
        id: f.id,
        description: f.description,
        suggestedCategory: f.suggestedCategory?.name || 'N/A',
        correctCategory: f.correctCategory?.name || 'N/A',
        feedbackType: f.feedbackType,
        createdAt: f.createdAt,
      }));

    return {
      totalFeedback,
      correctCount,
      incorrectCount,
      partialCount,
      accuracyRate: totalFeedback > 0 ? Math.round((correctCount / totalFeedback) * 100) / 100 : 0,
      mostCorrectedCategories,
      recentFeedback,
    };
  }

  /**
   * Treinar modelo com todo o histórico (batch training)
   * Recalcula todos os padrões baseado no histórico completo
   */
  async trainModel(userId: string): Promise<{ patternCount: number; accuracy: number }> {
    // Limpar padrões antigos
    await this.patternRepository.delete({ userId, status: 'auto' });

    // Buscar todo o feedback
    const allFeedback = await this.feedbackRepository.find({
      where: { userId },
      relations: ['correctCategory'],
    });

    // Reconstruir padrões baseado em feedback
    for (const fb of allFeedback) {
      if (fb.feedbackType !== 'partial') {
        await this.createOrUpdatePattern(
          userId,
          fb.correctCategoryId,
          fb.description,
          'keyword',
          fb.isPositive,
        );
      }
    }

    // Buscar padrões criados
    const patterns = await this.patternRepository.find({ where: { userId } });

    // Calcular accuracy
    let correctPredictions = 0;
    for (const fb of allFeedback) {
      const prediction = await this.predict(
        { id: userId },
        fb.description,
      );
      if (prediction.categoryId === fb.correctCategoryId) {
        correctPredictions += 1;
      }
    }

    const accuracy =
      allFeedback.length > 0 ? Math.round((correctPredictions / allFeedback.length) * 100) / 100 : 0;

    return {
      patternCount: patterns.length,
      accuracy,
    };
  }

  /**
   * Obter padrões aprendidos
   */
  async getPatterns(user: any, limit: number = 50): Promise<MLPattern[]> {
    return this.patternRepository.find({
      where: { userId: user.id },
      order: { confidence: 'DESC', matchCount: 'DESC' },
      take: limit,
      relations: ['category'],
    });
  }

  /**
   * Deletar padrão
   */
  async deletePattern(user: any, patternId: string): Promise<void> {
    await this.patternRepository.delete({
      id: patternId,
      userId: user.id,
    });
  }

  /**
   * Aprovar padrão (marcar como confiável)
   */
  async approvePattern(user: any, patternId: string): Promise<MLPattern> {
    const pattern = await this.patternRepository.findOne({
      where: { id: patternId, userId: user.id },
    });

    if (!pattern) {
      throw new Error('Pattern not found');
    }

    pattern.status = 'approved';
    pattern.confidence = Math.min(0.99, pattern.confidence + 0.1);

    return this.patternRepository.save(pattern);
  }

  /**
   * Rejeitar padrão (não usar mais)
   */
  async rejectPattern(user: any, patternId: string): Promise<MLPattern> {
    const pattern = await this.patternRepository.findOne({
      where: { id: patternId, userId: user.id },
    });

    if (!pattern) {
      throw new Error('Pattern not found');
    }

    pattern.status = 'rejected';
    pattern.confidence = 0;

    return this.patternRepository.save(pattern);
  }
}
