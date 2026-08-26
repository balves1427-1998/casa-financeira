import {
  Controller,
  Get,
  Post,
  Query,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  DefaultValuePipe,
  ParseIntPipe,
  ParseBoolPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { CurrentFamily } from '../../../common/decorators/current-family.decorator';
import { User } from '../../users/entities/user.entity';
import { ForecastService } from '../services/forecast.service';
import {
  ForecastResponseDto,
  ListCategoryForecastsDto,
  BalanceProjectionResponseDto,
  ForecastDetailsDto,
  ListForecastComparisonsDto,
} from '../dtos/forecasts.dto';

/**
 * Controller para Previsões Avançadas (B.4)
 * Endpoints para previsão de gastos, balanço e cenários
 *
 * Funcionalidades:
 * - Previsão de gastos totais
 * - Previsão por categoria
 * - Projeção de saldo
 * - Análise de cenários
 * - Comparação com histórico
 *
 * IMPORTANTE — ordem das rotas: todas as rotas estáticas precisam ser
 * declaradas ANTES de `@Get(':categoryId')`. O Nest resolve na ordem de
 * declaração, então um parâmetro dinâmico declarado antes captura
 * `/forecasts/details`, `/forecasts/accuracy-comparison` etc. e as torna
 * inalcançáveis.
 */
@Controller('forecasts')
@UseGuards(JwtAuthGuard)
export class ForecastsController {
  constructor(private forecastService: ForecastService) {}

  /**
   * GET /forecasts/next-30-days
   * Previsão de gastos para os próximos 30 dias
   */
  @Get('next-30-days')
  async getForecast30Days(
    @CurrentUser() user: User,
    @CurrentFamily() familyId: string,
  ): Promise<ForecastResponseDto> {
    return this.forecastService.getForecast(user.id, familyId, '30_DAYS');
  }

  /**
   * GET /forecasts/next-90-days
   * Previsão de gastos para os próximos 90 dias
   */
  @Get('next-90-days')
  async getForecast90Days(
    @CurrentUser() user: User,
    @CurrentFamily() familyId: string,
  ): Promise<ForecastResponseDto> {
    return this.forecastService.getForecast(user.id, familyId, '90_DAYS');
  }

  /**
   * GET /forecasts/next-180-days
   * Previsão de gastos para os próximos 180 dias
   */
  @Get('next-180-days')
  async getForecast180Days(
    @CurrentUser() user: User,
    @CurrentFamily() familyId: string,
  ): Promise<ForecastResponseDto> {
    return this.forecastService.getForecast(user.id, familyId, '180_DAYS');
  }

  /**
   * GET /forecasts/next-365-days
   * Previsão de gastos para o próximo ano
   */
  @Get('next-365-days')
  async getForecast365Days(
    @CurrentUser() user: User,
    @CurrentFamily() familyId: string,
  ): Promise<ForecastResponseDto> {
    return this.forecastService.getForecast(user.id, familyId, '365_DAYS');
  }

  /**
   * GET /forecasts/by-category
   * Previsão de gastos desagregada por categoria
   *
   * Query params:
   * - period: 30_DAYS | 90_DAYS | 180_DAYS | 365_DAYS (default: 90_DAYS)
   * - limit: número de categorias (default: 20, max: 50)
   * - minVariation: variação mínima para exibir (default: -50)
   *
   * `DefaultValuePipe` é necessário: com `transform: true` no ValidationPipe
   * global, um query param numérico ausente vira `NaN` e o valor padrão da
   * assinatura nunca é aplicado.
   */
  @Get('by-category')
  async getForecastByCategory(
    @CurrentUser() user: User,
    @CurrentFamily() familyId: string,
    @Query('period') period = '90_DAYS',
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('minVariation', new DefaultValuePipe(-50), ParseIntPipe)
    minVariation: number,
  ): Promise<ListCategoryForecastsDto> {
    return this.forecastService.getForecastByCategory(user.id, familyId, {
      period,
      limit: Math.min(limit, 50),
      minVariation,
    });
  }

  /**
   * GET /forecasts/scenarios
   * Análise de cenários (best case, expected, worst case)
   *
   * Query params:
   * - period: 30_DAYS | 90_DAYS | 180_DAYS | 365_DAYS (default: 90_DAYS)
   */
  @Get('scenarios')
  async getScenarios(
    @CurrentUser() user: User,
    @CurrentFamily() familyId: string,
    @Query('period') period = '90_DAYS',
  ) {
    return this.forecastService.getScenarios(user.id, familyId, period);
  }

  /**
   * GET /forecasts/balance-projection
   * Projeção de saldo ao longo do tempo
   *
   * Query params:
   * - period: 30_DAYS | 90_DAYS | 180_DAYS | 365_DAYS (default: 90_DAYS)
   * - includeRisk: incluir marcações de risco (default: true)
   */
  @Get('balance-projection')
  async getBalanceProjection(
    @CurrentUser() user: User,
    @CurrentFamily() familyId: string,
    @Query('period') period = '90_DAYS',
    @Query('includeRisk', new DefaultValuePipe(true), ParseBoolPipe)
    includeRisk: boolean,
  ): Promise<BalanceProjectionResponseDto> {
    return this.forecastService.getBalanceProjection(user.id, familyId, {
      period,
      includeRisk,
    });
  }

  /**
   * GET /forecasts/details
   * Obter detalhes e metadados da previsão
   *
   * Query params:
   * - period: 30_DAYS | 90_DAYS | 180_DAYS | 365_DAYS (default: 90_DAYS)
   */
  @Get('details')
  async getForecastDetails(
    @CurrentUser() user: User,
    @CurrentFamily() familyId: string,
    @Query('period') period = '90_DAYS',
  ): Promise<ForecastDetailsDto> {
    return this.forecastService.getForecastDetails(user.id, familyId, period);
  }

  /**
   * GET /forecasts/accuracy-comparison
   * Comparar previsões anteriores com valores reais
   *
   * Query params:
   * - limit: número de comparações (default: 12, max: 36)
   */
  @Get('accuracy-comparison')
  async getAccuracyComparison(
    @CurrentUser() user: User,
    @CurrentFamily() familyId: string,
    @Query('limit', new DefaultValuePipe(12), ParseIntPipe) limit: number,
  ): Promise<ListForecastComparisonsDto> {
    return this.forecastService.getAccuracyComparison(
      user.id,
      familyId,
      Math.min(limit, 36),
    );
  }

  /**
   * POST /forecasts/regenerate
   * Forçar regeneração de previsões
   * (normalmente feito automaticamente)
   */
  @Post('regenerate')
  @HttpCode(HttpStatus.ACCEPTED)
  async regenerateForecasts(
    @CurrentUser() user: User,
    @CurrentFamily() familyId: string,
  ) {
    return this.forecastService.regenerateForecasts(user.id, familyId);
  }

  /**
   * GET /forecasts/:categoryId
   * Previsão para categoria específica
   *
   * Precisa ser a ÚLTIMA rota do controller: por ser dinâmica, captura
   * qualquer segmento que não tenha casado com as rotas estáticas acima.
   *
   * Query params:
   * - period: 30_DAYS | 90_DAYS | 180_DAYS | 365_DAYS (default: 90_DAYS)
   */
  @Get(':categoryId')
  async getForecastBySpecificCategory(
    @CurrentUser() user: User,
    @CurrentFamily() familyId: string,
    @Param('categoryId') categoryId: string,
    @Query('period') period = '90_DAYS',
  ): Promise<ListCategoryForecastsDto> {
    return this.forecastService.getForecastByCategory(user.id, familyId, {
      period,
      categoryId,
    });
  }
}
