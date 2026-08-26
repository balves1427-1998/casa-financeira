import {
  Controller,
  Get,
  Patch,
  Post,
  Query,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Body,
  DefaultValuePipe,
  ParseIntPipe,
  ParseFloatPipe,
  ParseBoolPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { CurrentFamily } from '../../../common/decorators/current-family.decorator';
import { User } from '../../users/entities/user.entity';
import { BehaviorAnalyzerService } from '../services/behavior-analyzer.service';
import { AnomalyDetectorService } from '../services/anomaly-detector.service';
import {
  BehaviorAnalysisResponseDto,
  ListAnomaliesDto,
  ListPatternsDto,
  ListCorrelationsDto,
  SpendingProfileDto,
  ConfirmAnomalyDto,
  AnomalyDto,
} from '../dtos/analysis.dto';

/**
 * Controller para Análise Comportamental (B.3)
 * Endpoints para análise de padrões, anomalias e comportamento financeiro
 *
 * Funcionalidades:
 * - Análise de padrões de gasto
 * - Detecção de anomalias
 * - Identificação de tendências
 * - Análise de correlações
 * - Perfil de gasto do usuário
 */
@Controller('analysis')
@UseGuards(JwtAuthGuard)
export class AnalysisController {
  constructor(
    private behaviorAnalyzerService: BehaviorAnalyzerService,
    private anomalyDetectorService: AnomalyDetectorService,
  ) {}

  /**
   * GET /analysis/behavior
   * Obter análise comportamental completa
   *
   * Query params:
   * - period: THIS_MONTH | LAST_3_MONTHS | LAST_6_MONTHS | LAST_12_MONTHS
   *   (default: LAST_6_MONTHS)
   */
  @Get('behavior')
  async getBehaviorAnalysis(
    @CurrentUser() user: User,
    @CurrentFamily() familyId: string,
    @Query('period') period = 'LAST_6_MONTHS',
  ): Promise<BehaviorAnalysisResponseDto> {
    return this.behaviorAnalyzerService.analyzeBehavior(
      user.id,
      familyId,
      period,
    );
  }

  /**
   * POST /analysis/anomalies/detect
   * Varre os lançamentos do período e grava as anomalias encontradas.
   *
   * `GET /analysis/anomalies` apenas LISTA o que já foi detectado; sem este
   * gatilho a varredura nunca rodava e a lista ficava eternamente vazia.
   *
   * Declarado antes de `@Get('anomalies/:anomalyId')` para não ser capturado
   * pela rota dinâmica.
   *
   * Query params:
   * - period: THIS_MONTH | LAST_3_MONTHS | LAST_6_MONTHS | LAST_12_MONTHS
   *   (default: LAST_6_MONTHS)
   */
  @Post('anomalies/detect')
  @HttpCode(HttpStatus.OK)
  async detectAnomalies(
    @CurrentUser() user: User,
    @CurrentFamily() familyId: string,
    @Query('period') period = 'LAST_6_MONTHS',
  ): Promise<{ detected: number; period: string }> {
    const anomalies = await this.anomalyDetectorService.detectAnomalies(
      user.id,
      familyId,
      period,
    );

    return { detected: anomalies.length, period };
  }

  /**
   * GET /analysis/anomalies
   * Listar transações anormais detectadas
   *
   * Query params:
   * - severity: HIGH | MEDIUM | LOW (opcional)
   * - limit: número de anomalias (default: 50, max: 100)
   * - offset: paginação (default: 0)
   * - confirmed: filtrar por status de confirmação (true/false/null)
   */
  @Get('anomalies')
  async getAnomalies(
    @CurrentUser() user: User,
    @CurrentFamily() familyId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    @Query('severity') severity?: string,
    @Query('confirmed', new ParseBoolPipe({ optional: true }))
    confirmed?: boolean,
  ): Promise<ListAnomaliesDto> {
    return this.anomalyDetectorService.listAnomalies(
      user.id,
      familyId,
      {
        severity,
        limit: Math.min(limit, 100),
        offset,
        confirmed,
      },
    );
  }

  /**
   * GET /analysis/anomalies/:anomalyId
   * Obter detalhes de uma anomalia
   */
  @Get('anomalies/:anomalyId')
  async getAnomaly(
    @CurrentUser() user: User,
    @CurrentFamily() familyId: string,
    @Param('anomalyId') anomalyId: string,
  ): Promise<AnomalyDto | null> {
    return this.anomalyDetectorService.getAnomaly(
      user.id,
      familyId,
      anomalyId,
    );
  }

  /**
   * PATCH /analysis/anomalies/:anomalyId/confirm
   * Confirmar ou rejeitar uma anomalia detectada
   *
   * Body:
   * {
   *   "status": "NORMAL" | "UNUSUAL_BUT_OK" | "FRAUDULENT",
   *   "notes": "Comentário opcional"
   * }
   */
  @Patch('anomalies/:anomalyId/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmAnomaly(
    @CurrentUser() user: User,
    @CurrentFamily() familyId: string,
    @Param('anomalyId') anomalyId: string,
    @Body() dto: ConfirmAnomalyDto,
  ): Promise<AnomalyDto | null> {
    return this.anomalyDetectorService.confirmAnomaly(
      user.id,
      familyId,
      anomalyId,
      dto,
    );
  }

  /**
   * GET /analysis/patterns
   * Identificar padrões de gasto
   *
   * Query params:
   * - frequency: daily | weekly | monthly | seasonal
   * - limit: número de padrões (default: 20, max: 50)
   */
  @Get('patterns')
  async getPatterns(
    @CurrentUser() user: User,
    @CurrentFamily() familyId: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('frequency') frequency?: string,
  ): Promise<ListPatternsDto> {
    return this.behaviorAnalyzerService.detectPatterns(
      user.id,
      familyId,
      {
        frequency,
        limit: Math.min(limit, 50),
      },
    );
  }

  /**
   * GET /analysis/correlations
   * Analisar correlações entre variáveis financeiras
   *
   * Query params:
   * - minCorrelation: correlação mínima (default: 0.5, range: 0-1)
   * - limit: número de correlações (default: 20, max: 50)
   */
  @Get('correlations')
  async getCorrelations(
    @CurrentUser() user: User,
    @CurrentFamily() familyId: string,
    @Query('minCorrelation', new DefaultValuePipe(0.5), ParseFloatPipe)
    minCorrelation: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ): Promise<ListCorrelationsDto> {
    return this.behaviorAnalyzerService.analyzeCorrelations(
      user.id,
      familyId,
      {
        minCorrelation,
        limit: Math.min(limit, 50),
      },
    );
  }

  /**
   * GET /analysis/spending-profile
   * Obter perfil de gasto do usuário/família
   *
   * Query params:
   * - period: THIS_MONTH | LAST_3_MONTHS | LAST_6_MONTHS | LAST_12_MONTHS
   *   (default: LAST_12_MONTHS)
   */
  @Get('spending-profile')
  async getSpendingProfile(
    @CurrentUser() user: User,
    @CurrentFamily() familyId: string,
    @Query('period') period = 'LAST_12_MONTHS',
  ): Promise<SpendingProfileDto> {
    return this.behaviorAnalyzerService.getSpendingProfile(
      user.id,
      familyId,
      period,
    );
  }

  /**
   * GET /analysis/insights
   * Obter insights automáticos baseados em análise
   *
   * Retorna um array de strings com insights descobertos
   */
  @Get('insights')
  async getInsights(
    @CurrentUser() user: User,
    @CurrentFamily() familyId: string,
  ): Promise<{ insights: string[]; generatedAt: Date }> {
    return this.behaviorAnalyzerService.generateInsights(
      user.id,
      familyId,
    );
  }
}
