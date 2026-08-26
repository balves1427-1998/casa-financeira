import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../modules/auth/decorators/current-user.decorator';
import { User } from '../../../modules/users/entities/user.entity';
import { CashFlowService } from '../services/cash-flow.service';
import {
  CashFlowMonthDto,
  BestDayToShopDto,
  GetBestDayToShopDto,
  CashFlowSummaryDto,
} from '../dtos/cash-flow.dto';

@Controller('cash-flow')
@UseGuards(JwtAuthGuard)
export class CashFlowController {
  constructor(private readonly cashFlowService: CashFlowService) {}

  /**
   * Get cash flow summary for current month
   * @param user - Current authenticated user
   *
   * IMPORTANTE: esta rota estática precisa vir ANTES de `:month/:year`. O Nest
   * casa as rotas na ordem de declaração e `summary/current` era capturado pelo
   * padrão de dois parâmetros, fazendo o ParseIntPipe rejeitar "summary" com
   * 400 "numeric string is expected".
   */
  @Get('summary/current')
  @HttpCode(HttpStatus.OK)
  async getCashFlowSummary(
    @CurrentUser() user: User,
  ): Promise<CashFlowSummaryDto> {
    return this.cashFlowService.getCashFlowSummary(user);
  }

  /**
   * Get cash flow for a specific month
   * @param user - Current authenticated user
   * @param month - Month number (1-12)
   * @param year - Year (2000-2100)
   */
  @Get(':month/:year')
  @HttpCode(HttpStatus.OK)
  async getMonthCashFlow(
    @CurrentUser() user: User,
    @Param('month', ParseIntPipe) month: number,
    @Param('year', ParseIntPipe) year: number,
  ): Promise<CashFlowMonthDto> {
    return this.cashFlowService.getMonthCashFlow(user, month, year);
  }

  /**
   * Get best day to make a purchase
   * @param user - Current authenticated user
   * @param dto - Best day query parameters
   */
  @Post('best-day')
  @HttpCode(HttpStatus.OK)
  async getBestDayToShop(
    @CurrentUser() user: User,
    @Body() dto: GetBestDayToShopDto,
  ): Promise<BestDayToShopDto> {
    return this.cashFlowService.getBestDayToShop(user, dto);
  }
}
