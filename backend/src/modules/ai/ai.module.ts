import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Camada de leitura dos lançamentos reais da família
import { FinancialDataModule } from '../financial-data/financial-data.module';

// Entities
import { AiMessage } from './entities/ai-message.entity';
import { Recommendation } from './entities/recommendation.entity';
import { BehaviorAnalysis } from './entities/behavior-analysis.entity';
import { Forecast } from './entities/forecast.entity';
import { TransactionAnomaly } from './entities/transaction-anomaly.entity';

// Controllers
import { AiAssistantController } from './controllers/ai-assistant.controller';
import { RecommendationsController } from './controllers/recommendations.controller';
import { AnalysisController } from './controllers/analysis.controller';
import { ForecastsController } from './controllers/forecasts.controller';

// Services
import { AiAssistantService } from './services/ai-assistant.service';
import { IntentDetectorService } from './services/intent-detector.service';
import { RecommendationsService } from './services/recommendations.service';
import { BehaviorAnalyzerService } from './services/behavior-analyzer.service';
import { ForecastService } from './services/forecast.service';
import { AnomalyDetectorService } from './services/anomaly-detector.service';

/**
 * Módulo de Inteligência Financeira - Seção B Fase 4
 *
 * Responsável por:
 * - B.1: AI Assistant (Chat com IA)
 * - B.2: Recomendações automáticas
 * - B.3: Análise comportamental
 * - B.4: Previsões financeiras
 *
 * Importar em app.module.ts:
 * imports: [
 *   ...
 *   AiModule,
 * ]
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AiMessage,
      Recommendation,
      BehaviorAnalysis,
      Forecast,
      TransactionAnomaly,
    ]),
    // `ScheduleModule.forRoot()` já é chamado no AppModule; repetir aqui era
    // redundante.
    FinancialDataModule,
  ],
  controllers: [
    AiAssistantController,
    RecommendationsController,
    AnalysisController,
    ForecastsController,
  ],
  providers: [
    AiAssistantService,
    IntentDetectorService,
    RecommendationsService,
    BehaviorAnalyzerService,
    ForecastService,
    AnomalyDetectorService,
  ],
  exports: [
    AiAssistantService,
    IntentDetectorService,
    RecommendationsService,
    BehaviorAnalyzerService,
    ForecastService,
    AnomalyDetectorService,
  ],
})
export class AiModule {}
