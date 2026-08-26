import {
  Controller,
  Post,
  Get,
  Delete,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { MLClassifierService } from '../services/ml-classifier.service';
import { CreateMLFeedbackDto } from '../dtos/create-ml-feedback.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@Controller('api/v1/ml-classifier')
@UseGuards(JwtAuthGuard)
export class MLClassifierController {
  constructor(private readonly mlService: MLClassifierService) {}

  /**
   * GET /api/v1/ml-classifier/predict
   * Prever categoria para uma descrição
   */
  @Get('predict')
  async predict(
    @Req() req: any,
    @Query('description') description: string,
    @Query('establishment') establishment?: string,
    @Query('amount') amount?: string,
    @Query('date') date?: string,
  ) {
    const amountNum = amount ? parseFloat(amount) : undefined;
    const dateObj = date ? new Date(date) : undefined;

    return this.mlService.predict(req.user, description, establishment, amountNum, dateObj);
  }

  /**
   * POST /api/v1/ml-classifier/feedback
   * Registrar feedback sobre categorização
   */
  @Post('feedback')
  @HttpCode(HttpStatus.CREATED)
  async recordFeedback(@Req() req: any, @Body() dto: CreateMLFeedbackDto) {
    return this.mlService.recordFeedback(req.user, dto);
  }

  /**
   * GET /api/v1/ml-classifier/feedback/stats
   * Obter estatísticas de feedback
   */
  @Get('feedback/stats')
  async getFeedbackStats(@Req() req: any) {
    return this.mlService.getFeedbackStats(req.user);
  }

  /**
   * GET /api/v1/ml-classifier/patterns
   * Obter padrões aprendidos
   */
  @Get('patterns')
  async getPatterns(@Req() req: any, @Query('limit') limit: string = '50') {
    return this.mlService.getPatterns(req.user, parseInt(limit));
  }

  /**
   * PUT /api/v1/ml-classifier/patterns/:id/approve
   * Aprovar padrão
   */
  @Put('patterns/:id/approve')
  async approvePattern(@Req() req: any, @Param('id') patternId: string) {
    return this.mlService.approvePattern(req.user, patternId);
  }

  /**
   * PUT /api/v1/ml-classifier/patterns/:id/reject
   * Rejeitar padrão
   */
  @Put('patterns/:id/reject')
  async rejectPattern(@Req() req: any, @Param('id') patternId: string) {
    return this.mlService.rejectPattern(req.user, patternId);
  }

  /**
   * DELETE /api/v1/ml-classifier/patterns/:id
   * Deletar padrão
   */
  @Delete('patterns/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePattern(@Req() req: any, @Param('id') patternId: string) {
    await this.mlService.deletePattern(req.user, patternId);
  }

  /**
   * POST /api/v1/ml-classifier/train
   * Treinar modelo com histórico (batch)
   */
  @Post('train')
  async trainModel(@Req() req: any) {
    return this.mlService.trainModel(req.user.id);
  }
}
