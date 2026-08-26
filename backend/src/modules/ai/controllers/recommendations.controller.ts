import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
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
import { RecommendationsService } from '../services/recommendations.service';
import {
  ListRecommendationsDto,
  UpdateRecommendationDto,
  RecommendationImpactEstimateDto,
  ApplyRecommendationDto,
  RecommendationActionResultDto,
} from '../dtos/recommendations.dto';

/**
 * Controller para Recomendações Automáticas (B.2)
 * Endpoints para sugestões de economia e otimização
 *
 * Funcionalidades:
 * - Listar recomendações ativas
 * - Filtrar por prioridade
 * - Descartar recomendações
 * - Estimar impacto de seguir recomendações
 * - Aplicar ações de recomendação
 *
 * IMPORTANTE — ordem das rotas: rotas estáticas como `/high-priority`,
 * `/impact-estimate` e `/regenerate` precisam vir ANTES de
 * `@Get(':recommendationId')`, senão o parâmetro dinâmico as captura primeiro
 * e elas se tornam inalcançáveis.
 */
@Controller('recommendations')
@UseGuards(JwtAuthGuard)
export class RecommendationsController {
  constructor(private recommendationsService: RecommendationsService) {}

  /**
   * GET /recommendations
   * Listar todas as recomendações da família
   *
   * Query params:
   * - priority: HIGH | MEDIUM | LOW (opcional)
   * - type: tipo de recomendação (opcional)
   * - limit: número de recomendações (default: 50, max: 100)
   * - offset: paginação (default: 0)
   * - includeDismissed: incluir descartadas (default: false)
   *
   * `DefaultValuePipe` é necessário: com `transform: true` no ValidationPipe
   * global, um query param numérico ausente vira `NaN` e o valor padrão da
   * assinatura nunca é aplicado.
   */
  @Get()
  async getRecommendations(
    @CurrentUser() user: User,
    @CurrentFamily() familyId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    @Query('includeDismissed', new DefaultValuePipe(false), ParseBoolPipe)
    includeDismissed: boolean,
    @Query('priority') priority?: string,
    @Query('type') type?: string,
  ): Promise<ListRecommendationsDto> {
    return this.recommendationsService.listRecommendations(user.id, familyId, {
      priority,
      type,
      limit: Math.min(limit, 100),
      offset,
      includeDismissed,
    });
  }

  /**
   * GET /recommendations/high-priority
   * Listar apenas recomendações com alta prioridade
   */
  @Get('high-priority')
  async getHighPriorityRecommendations(
    @CurrentUser() user: User,
    @CurrentFamily() familyId: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ): Promise<ListRecommendationsDto> {
    return this.recommendationsService.getHighPriorityRecommendations(
      user.id,
      familyId,
      limit,
    );
  }

  /**
   * GET /recommendations/impact-estimate
   * Estimar impacto potencial de seguir as recomendações
   */
  @Get('impact-estimate')
  async getImpactEstimate(
    @CurrentUser() user: User,
    @CurrentFamily() familyId: string,
  ): Promise<RecommendationImpactEstimateDto> {
    return this.recommendationsService.estimateImpact(user.id, familyId);
  }

  /**
   * POST /recommendations/regenerate
   * Forçar regeneração de recomendações
   * (normalmente feito automaticamente)
   */
  @Post('regenerate')
  @HttpCode(HttpStatus.ACCEPTED)
  async regenerateRecommendations(
    @CurrentUser() user: User,
    @CurrentFamily() familyId: string,
  ) {
    return this.recommendationsService.regenerateRecommendations(
      user.id,
      familyId,
    );
  }

  /**
   * GET /recommendations/:recommendationId
   * Obter detalhes de uma recomendação específica
   */
  @Get(':recommendationId')
  async getRecommendation(
    @CurrentUser() user: User,
    @CurrentFamily() familyId: string,
    @Param('recommendationId') recommendationId: string,
  ) {
    return this.recommendationsService.getRecommendation(
      user.id,
      familyId,
      recommendationId,
    );
  }

  /**
   * PATCH /recommendations/:recommendationId
   * Atualizar recomendação (ex: descartar)
   *
   * Body:
   * {
   *   "isDismissed": true
   * }
   */
  @Patch(':recommendationId')
  @HttpCode(HttpStatus.OK)
  async updateRecommendation(
    @CurrentUser() user: User,
    @CurrentFamily() familyId: string,
    @Param('recommendationId') recommendationId: string,
    @Body() dto: UpdateRecommendationDto,
  ) {
    return this.recommendationsService.updateRecommendation(
      user.id,
      familyId,
      recommendationId,
      dto,
    );
  }

  /**
   * POST /recommendations/:recommendationId/apply
   * Aplicar uma recomendação (gerar ação)
   *
   * Exemplo:
   * - Recomendação: "Cancelar streaming não utilizado"
   * - Ação: Criar lembrete para cancelar, gerar relatório, etc
   */
  @Post(':recommendationId/apply')
  @HttpCode(HttpStatus.OK)
  async applyRecommendation(
    @CurrentUser() user: User,
    @CurrentFamily() familyId: string,
    @Param('recommendationId') recommendationId: string,
    @Body() dto: ApplyRecommendationDto,
  ): Promise<RecommendationActionResultDto> {
    return this.recommendationsService.applyRecommendation(
      user.id,
      familyId,
      recommendationId,
      dto,
    );
  }
}
