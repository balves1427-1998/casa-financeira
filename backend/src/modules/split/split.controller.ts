import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentFamily } from '../../common/decorators/current-family.decorator';
import { User } from '../users/entities/user.entity';
import { SplitService } from './split.service';
import { SetSplitRuleDto } from './dtos/split-rule.dto';
import {
  CategorySplit,
  Settlement,
  SplitRuleView,
  SplitSummary,
} from './split.types';

/**
 * Painel de divisão Bruno × Giovanna (item 15 do escopo).
 *
 * O escopo vem sempre do usuário autenticado (`@CurrentFamily`), nunca de um id
 * na URL — assim ninguém consegue ler o rateio de outra casa.
 *
 * O query param `period` aceita os mesmos rótulos de
 * `FinancialDataService.getPeriodRange`: THIS_MONTH, LAST_MONTH,
 * LAST_3_MONTHS, LAST_6_MONTHS, LAST_12_MONTHS, THIS_YEAR, 30_DAYS, 90_DAYS,
 * 180_DAYS e 365_DAYS. O padrão é o mês corrente.
 */
@Controller('split')
@UseGuards(JwtAuthGuard)
export class SplitController {
  constructor(private splitService: SplitService) {}

  /**
   * GET /split/summary
   * Quanto cada responsável pagou, total da casa, participação e diferença.
   */
  @Get('summary')
  async getSummary(
    @CurrentFamily() familyId: string,
    @Query('period') period = 'THIS_MONTH',
  ): Promise<SplitSummary> {
    return this.splitService.getSplitSummary(familyId, period);
  }

  /**
   * GET /split/settlement
   * Acerto de contas: quanto cada um deveria ter pagado segundo a regra
   * vigente e quem deve (ou recebe) quanto para equilibrar.
   */
  @Get('settlement')
  async getSettlement(
    @CurrentUser() user: User,
    @CurrentFamily() familyId: string,
    @Query('period') period = 'THIS_MONTH',
  ): Promise<Settlement> {
    return this.splitService.getSettlement(familyId, user, period);
  }

  /**
   * GET /split/by-category
   * Detalhamento de quem pagou o quê dentro de cada categoria.
   */
  @Get('by-category')
  async getByCategory(
    @CurrentFamily() familyId: string,
    @Query('period') period = 'THIS_MONTH',
  ): Promise<CategorySplit[]> {
    return this.splitService.getCategorySplit(familyId, period);
  }

  /** GET /split/rule — regra de rateio vigente (padrão EQUAL). */
  @Get('rule')
  async getRule(@CurrentFamily() familyId: string): Promise<SplitRuleView> {
    return this.splitService.getRule(familyId);
  }

  /** PUT /split/rule — define a regra de rateio da família. */
  @Put('rule')
  @HttpCode(HttpStatus.OK)
  async setRule(
    @CurrentFamily() familyId: string,
    @Body() dto: SetSplitRuleDto,
  ): Promise<SplitRuleView> {
    return this.splitService.setRule(familyId, dto);
  }
}
