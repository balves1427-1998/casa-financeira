import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClassificationRule } from './entities/classification-rule.entity';
import { User } from '../users/entities/user.entity';
import {
  CreateCustomRuleDto,
  UpdateCustomRuleDto,
  TestPatternDto,
  TestPatternResultDto,
  BulkApplyRulesDto,
  BulkApplyResultDto,
  ExportRulesDto,
  ShareRulesDto,
  RuleStatsDto,
  MatchType,
} from './dtos/manage-rules.dto';

export interface ClassificationResult {
  category: string;
  subcategory?: string;
  confidence: number;
  ruleId: string;
}

@Injectable()
export class ClassificationRulesService {
  // Default classification rules
  private defaultRules: Array<{ keyword: string; category: string; matchType: string }> = [
    { keyword: 'IFOOD', category: 'Alimentação', matchType: 'keyword' },
    { keyword: 'UBER', category: 'Transporte', matchType: 'keyword' },
    { keyword: 'UBER EATS', category: 'Alimentação', matchType: 'keyword' },
    { keyword: 'POSTO', category: 'Combustível', matchType: 'keyword' },
    { keyword: 'NETFLIX', category: 'Assinaturas', matchType: 'keyword' },
    { keyword: 'SPOTIFY', category: 'Assinaturas', matchType: 'keyword' },
    { keyword: 'DROGARIA', category: 'Saúde', matchType: 'keyword' },
    { keyword: 'FARMACIA', category: 'Saúde', matchType: 'keyword' },
    { keyword: 'MERCADO', category: 'Supermercado', matchType: 'keyword' },
    { keyword: 'AMAZON', category: 'Compras', matchType: 'keyword' },
    { keyword: 'SHOPEE', category: 'Compras', matchType: 'keyword' },
    { keyword: 'RESTAURANTE', category: 'Alimentação', matchType: 'keyword' },
    { keyword: 'PIZZARIA', category: 'Alimentação', matchType: 'keyword' },
    { keyword: 'BURGER', category: 'Alimentação', matchType: 'keyword' },
    { keyword: 'PADARIA', category: 'Alimentação', matchType: 'keyword' },
    { keyword: 'ACADEMIA', category: 'Lazer', matchType: 'keyword' },
    { keyword: 'GYM', category: 'Lazer', matchType: 'keyword' },
    { keyword: 'CINEMA', category: 'Lazer', matchType: 'keyword' },
    { keyword: 'THEATER', category: 'Lazer', matchType: 'keyword' },
    { keyword: 'HOTEL', category: 'Viagem', matchType: 'keyword' },
    { keyword: 'AIRBNB', category: 'Viagem', matchType: 'keyword' },
    { keyword: 'ALUGUEL', category: 'Moradia', matchType: 'keyword' },
    { keyword: 'ENERGIA', category: 'Moradia', matchType: 'keyword' },
    { keyword: 'AGUA', category: 'Moradia', matchType: 'keyword' },
    { keyword: 'INTERNET', category: 'Moradia', matchType: 'keyword' },
    { keyword: 'TELEFONE', category: 'Moradia', matchType: 'keyword' },
  ];

  constructor(
    @InjectRepository(ClassificationRule)
    private rulesRepository: Repository<ClassificationRule>,
  ) {}

  async classify(
    user: User,
    description: string,
    amount?: number,
  ): Promise<ClassificationResult | null> {
    // Get user's custom rules
    const rules = await this.rulesRepository.find({
      where: {
        userId: user.id,
        isActive: true,
      },
      order: { priority: 'DESC', timesApplied: 'DESC' },
    });

    // Try to match against custom rules
    for (const rule of rules) {
      if (this.matchesRule(description, rule)) {
        return {
          category: rule.category,
          subcategory: rule.subcategory,
          confidence: 0.95,
          ruleId: rule.id,
        };
      }
    }

    // Try default rules
    for (const defaultRule of this.defaultRules) {
      if (this.matchesRuleData(description, defaultRule)) {
        return {
          category: defaultRule.category,
          subcategory: undefined,
          confidence: 0.85,
          ruleId: 'default',
        };
      }
    }

    return null;
  }

  async createRule(user: User, ruleData: any): Promise<ClassificationRule> {
    const rule = this.rulesRepository.create({
      ...ruleData,
      userId: user.id,
    });
    const saved = await this.rulesRepository.save(rule);
    return Array.isArray(saved) ? saved[0] : saved;
  }

  async findAll(user: User): Promise<ClassificationRule[]> {
    return this.rulesRepository.find({
      where: { userId: user.id },
      order: { priority: 'DESC', createdAt: 'DESC' },
    });
  }

  async findOne(id: string, user: User): Promise<ClassificationRule> {
    const rule = await this.rulesRepository.findOne({
      where: { id, userId: user.id },
    });

    if (!rule) {
      throw new NotFoundException('Classification rule not found');
    }

    return rule;
  }

  async updateRule(
    id: string,
    user: User,
    updateData: any,
  ): Promise<ClassificationRule> {
    const rule = await this.findOne(id, user);

    delete updateData.userId;
    delete updateData.createdAt;

    Object.assign(rule, updateData);
    return this.rulesRepository.save(rule);
  }

  async deleteRule(id: string, user: User): Promise<void> {
    const rule = await this.findOne(id, user);
    await this.rulesRepository.softRemove(rule);
  }

  async incrementUsageCount(id: string): Promise<void> {
    if (id !== 'default') {
      await this.rulesRepository.increment({ id }, 'timesApplied', 1);
    }
  }

  async getDefaultRules(): Promise<any[]> {
    return this.defaultRules;
  }

  async bulkCreateDefaultRules(user: User): Promise<ClassificationRule[]> {
    const existingCount = await this.rulesRepository.count({
      where: { userId: user.id },
    });

    if (existingCount > 0) {
      throw new Error('User already has custom rules');
    }

    const rules = this.defaultRules.map((rule, index) =>
      this.rulesRepository.create({
        userId: user.id,
        keyword: rule.keyword,
        category: rule.category,
        matchType: rule.matchType as any,
        priority: this.defaultRules.length - index,
      }),
    );

    const saved = await this.rulesRepository.save(rules);
    return Array.isArray(saved) ? saved : [saved];
  }

  private matchesRule(
    description: string,
    rule: ClassificationRule,
  ): boolean {
    switch (rule.matchType) {
      case 'keyword':
        return description.toUpperCase().includes(rule.keyword.toUpperCase());
      case 'exact':
        return description.toUpperCase() === rule.keyword.toUpperCase();
      case 'regex':
        try {
          const regex = new RegExp(rule.keyword, 'i');
          return regex.test(description);
        } catch {
          return false;
        }
      default:
        return false;
    }
  }

  private matchesRuleData(
    description: string,
    rule: any,
  ): boolean {
    const matchType = rule.matchType || 'keyword';

    switch (matchType) {
      case 'keyword':
        return description.toUpperCase().includes(rule.keyword.toUpperCase());
      case 'exact':
        return description.toUpperCase() === rule.keyword.toUpperCase();
      case 'regex':
        try {
          const regex = new RegExp(rule.keyword, 'i');
          return regex.test(description);
        } catch {
          return false;
        }
      default:
        return false;
    }
  }

  /**
   * Test a pattern against sample strings
   * Validates regex syntax and shows match results
   */
  async testPattern(dto: TestPatternDto): Promise<TestPatternResultDto> {
    const results = [];
    let matchCount = 0;

    // Validate pattern syntax first
    if (dto.matchType === 'regex') {
      try {
        new RegExp(dto.pattern, 'i');
      } catch (error) {
        throw new BadRequestException(
          `Invalid regex pattern: ${error.message}`,
        );
      }
    }

    // Test against all provided strings
    for (const testString of dto.testStrings) {
      let matched = false;
      let error = undefined;

      try {
        switch (dto.matchType) {
          case 'keyword':
            matched = testString.toUpperCase().includes(dto.pattern.toUpperCase());
            break;
          case 'exact':
            matched = testString.toUpperCase() === dto.pattern.toUpperCase();
            break;
          case 'regex':
            const regex = new RegExp(dto.pattern, 'i');
            matched = regex.test(testString);
            break;
          default:
            throw new BadRequestException(`Unknown match type: ${dto.matchType}`);
        }

        if (matched) {
          matchCount++;
        }
      } catch (err) {
        error = err.message;
      }

      results.push({
        input: testString,
        matched,
        error,
      });
    }

    const successRate =
      dto.testStrings.length > 0
        ? matchCount / dto.testStrings.length
        : 0;

    return {
      pattern: dto.pattern,
      matchType: dto.matchType,
      testResults: results,
      matchCount,
      successRate,
    };
  }

  /**
   * Apply multiple rules in bulk
   * Creates or updates rules with error handling
   */
  async bulkApply(
    user: User,
    dto: BulkApplyRulesDto,
  ): Promise<BulkApplyResultDto> {
    const result: BulkApplyResultDto = {
      created: 0,
      updated: 0,
      failed: 0,
      errors: [],
    };

    for (const ruleData of dto.rules) {
      try {
        // Find existing rule by pattern
        const existing = await this.rulesRepository.findOne({
          where: {
            userId: user.id,
            keyword: (ruleData as any).pattern || (ruleData as any).keyword,
            matchType: ruleData.matchType,
          },
        });

        if (existing && dto.overwrite) {
          // Update existing rule
          Object.assign(existing, {
            keyword: (ruleData as any).pattern || (ruleData as any).keyword,
            category: (ruleData as any).category,
            matchType: ruleData.matchType,
          });
          await this.rulesRepository.save(existing);
          result.updated++;
        } else if (!existing) {
          // Create new rule
          const rule = this.rulesRepository.create({
            userId: user.id,
            keyword: (ruleData as any).pattern || (ruleData as any).keyword,
            category: (ruleData as any).category,
            matchType: ruleData.matchType,
          });
          await this.rulesRepository.save(rule);
          result.created++;
        } else {
          result.failed++;
          result.errors.push({
            rule: ruleData,
            error: 'Rule already exists and overwrite is disabled',
          });
        }
      } catch (error) {
        result.failed++;
        result.errors.push({
          rule: ruleData,
          error: error.message,
        });
      }
    }

    return result;
  }

  /**
   * Export all rules for backup or sharing
   */
  async exportRules(user: User): Promise<ExportRulesDto> {
    const rules = await this.rulesRepository.find({
      where: { userId: user.id },
      // `category` é uma coluna de texto simples em ClassificationRule, não uma relação ORM.
    });

    return {
      rules: rules.map(rule => ({
        pattern: rule.keyword,
        matchType: rule.matchType as MatchType,
        categoryId: rule.category,
        subcategoryId: rule.subcategory,
        priority: rule.priority,
        isActive: rule.isActive,
        description: rule.description,
        confidence: 0.85,
        createdAt: rule.createdAt,
      })),
      exportedAt: new Date(),
      count: rules.length,
    };
  }

  /**
   * Share rules with other users or make them public
   */
  async shareRules(
    user: User,
    dto: ShareRulesDto,
  ): Promise<{ sharedCount: number; publicUrl?: string }> {
    // Verify all rules belong to user
    const rules = await this.rulesRepository.find({
      where: {
        userId: user.id,
      },
    });

    const validRuleIds = rules.map(r => r.id);
    const invalidRuleIds = dto.ruleIds.filter(id => !validRuleIds.includes(id));

    if (invalidRuleIds.length > 0) {
      throw new BadRequestException(
        `Invalid rule IDs: ${invalidRuleIds.join(', ')}`,
      );
    }

    // For now, mark rules as shared (simplified implementation)
    // In production, would create SharedRule entity
    for (const ruleId of dto.ruleIds) {
      const rule = rules.find(r => r.id === ruleId);
      if (rule) {
        Object.assign(rule, {
          isPublic: dto.isPublic || false,
          description: dto.description || rule.description,
        });
        await this.rulesRepository.save(rule);
      }
    }

    return {
      sharedCount: dto.ruleIds.length,
      publicUrl: dto.isPublic
        ? `https://casa-financeira.com/shared-rules/${user.id}`
        : undefined,
    };
  }

  /**
   * Get statistics about rule usage and effectiveness
   */
  async getRuleStats(user: User): Promise<RuleStatsDto> {
    const allRules = await this.rulesRepository.find({
      where: { userId: user.id },
      // `category` é uma coluna de texto simples em ClassificationRule, não uma relação ORM.
    });

    const activeRules = allRules.filter(r => r.isActive);
    const inactiveRules = allRules.filter(r => !r.isActive);

    // Count by match type
    const byMatchType = {
      keyword: allRules.filter(r => r.matchType === 'keyword').length,
      regex: allRules.filter(r => r.matchType === 'regex').length,
      exact: allRules.filter(r => r.matchType === 'exact').length,
    };

    // Count by category
    const categoryMap = new Map<
      string,
      { name: string; count: number }
    >();

    for (const rule of allRules) {
      const categoryId = rule.category;
      if (!categoryMap.has(categoryId)) {
        categoryMap.set(categoryId, {
          name: rule.category || 'Unknown',
          count: 0,
        });
      }
      const entry = categoryMap.get(categoryId);
      if (entry) {
        entry.count++;
      }
    }

    const byCategory = Array.from(categoryMap.entries()).map(
      ([categoryId, data]) => ({
        categoryId,
        categoryName: data.name,
        ruleCount: data.count,
      }),
    );

    // Most used rules (by timesApplied)
    const mostUsed = allRules
      .filter(r => r.timesApplied > 0)
      .sort((a, b) => b.timesApplied - a.timesApplied)
      .slice(0, 10)
      .map(r => ({
        ruleId: r.id,
        pattern: r.keyword,
        matchType: r.matchType as MatchType,
        usageCount: r.timesApplied,
        lastUsedAt: r.updatedAt,
      }));

    // Calculate success rate (simplified: rules with usage are considered successful)
    const rulesWithUsage = allRules.filter(r => r.timesApplied > 0).length;
    const successRate =
      allRules.length > 0 ? rulesWithUsage / allRules.length : 0;

    return {
      totalRules: allRules.length,
      activeRules: activeRules.length,
      inactiveRules: inactiveRules.length,
      byMatchType,
      byCategory,
      mostUsed,
      successRate,
    };
  }

  /**
   * Custom rule creation with validation
   */
  async createCustomRule(
    user: User,
    dto: CreateCustomRuleDto,
  ): Promise<ClassificationRule> {
    // Validate pattern syntax for regex
    if (dto.matchType === 'regex') {
      try {
        new RegExp(dto.pattern, 'i');
      } catch (error) {
        throw new BadRequestException(
          `Invalid regex pattern: ${error.message}`,
        );
      }
    }

    const rule = this.rulesRepository.create({
      userId: user.id,
      keyword: dto.pattern,
      matchType: dto.matchType as any,
      category: dto.categoryId,
      subcategory: dto.subcategoryId,
      priority: dto.priority || 50,
      isActive: dto.isActive !== false,
      description: dto.description,
    });

    const saved = await this.rulesRepository.save(rule);
    return Array.isArray(saved) ? saved[0] : saved;
  }
}
