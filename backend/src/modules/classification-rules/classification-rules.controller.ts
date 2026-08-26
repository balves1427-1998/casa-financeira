import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClassificationRulesService } from './classification-rules.service';
import {
  CreateClassificationRuleDto,
  UpdateClassificationRuleDto,
  ClassifyTransactionDto,
} from './dtos/create-classification-rule.dto';
import {
  CreateCustomRuleDto,
  UpdateCustomRuleDto,
  TestPatternDto,
  BulkApplyRulesDto,
  ShareRulesDto,
} from './dtos/manage-rules.dto';

@Controller('classification-rules')
@UseGuards(JwtAuthGuard)
export class ClassificationRulesController {
  constructor(private readonly service: ClassificationRulesService) {}

  @Post()
  async create(@Req() req: any, @Body() dto: CreateClassificationRuleDto) {
    return this.service.createRule(req.user, dto);
  }

  @Get()
  async findAll(@Req() req: any) {
    return this.service.findAll(req.user);
  }

  @Get('defaults')
  async getDefaults() {
    return this.service.getDefaultRules();
  }

  @Post('defaults/create')
  async bulkCreateDefaults(@Req() req: any) {
    return this.service.bulkCreateDefaultRules(req.user);
  }

  @Post('classify')
  async classify(@Req() req: any, @Body() dto: ClassifyTransactionDto) {
    return this.service.classify(req.user, dto.description, dto.amount);
  }

  @Get(':id')
  async findOne(@Req() req: any, @Param('id') id: string) {
    return this.service.findOne(id, req.user);
  }

  @Put(':id')
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateClassificationRuleDto,
  ) {
    return this.service.updateRule(id, req.user, dto);
  }

  @Delete(':id')
  async delete(@Req() req: any, @Param('id') id: string) {
    return this.service.deleteRule(id, req.user);
  }

  @Post(':id/increment-usage')
  async incrementUsage(@Param('id') id: string) {
    return this.service.incrementUsageCount(id);
  }

  /**
   * Test a pattern against sample strings (regex tester)
   * POST /classification-rules/test-pattern
   */
  @Post('test-pattern')
  async testPattern(@Body() dto: TestPatternDto) {
    return this.service.testPattern(dto);
  }

  /**
   * Create custom rule with validation
   * POST /classification-rules/custom
   */
  @Post('custom')
  async createCustomRule(
    @Req() req: any,
    @Body() dto: CreateCustomRuleDto,
  ) {
    return this.service.createCustomRule(req.user, dto);
  }

  /**
   * Update custom rule
   * PUT /classification-rules/custom/:id
   */
  @Put('custom/:id')
  async updateCustomRule(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateCustomRuleDto,
  ) {
    return this.service.updateRule(id, req.user, dto);
  }

  /**
   * Apply multiple rules in bulk
   * POST /classification-rules/bulk-apply
   */
  @Post('bulk-apply')
  async bulkApply(@Req() req: any, @Body() dto: BulkApplyRulesDto) {
    return this.service.bulkApply(req.user, dto);
  }

  /**
   * Export all rules for backup
   * GET /classification-rules/export
   */
  @Get('export')
  async exportRules(@Req() req: any) {
    return this.service.exportRules(req.user);
  }

  /**
   * Share rules with other users or make public
   * POST /classification-rules/share
   */
  @Post('share')
  async shareRules(@Req() req: any, @Body() dto: ShareRulesDto) {
    return this.service.shareRules(req.user, dto);
  }

  /**
   * Get rule statistics and analytics
   * GET /classification-rules/stats
   */
  @Get('stats')
  async getStats(@Req() req: any) {
    return this.service.getRuleStats(req.user);
  }
}
