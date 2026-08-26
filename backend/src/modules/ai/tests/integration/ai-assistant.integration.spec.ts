import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  ExecutionContext,
} from '@nestjs/common';
import request from 'supertest';

// Controllers reais do módulo de IA
import { AiAssistantController } from '../../controllers/ai-assistant.controller';
import { RecommendationsController } from '../../controllers/recommendations.controller';
import { AnalysisController } from '../../controllers/analysis.controller';
import { ForecastsController } from '../../controllers/forecasts.controller';

// Services reais (usados apenas como tokens de injeção — serão mockados)
import { AiAssistantService } from '../../services/ai-assistant.service';
import { RecommendationsService } from '../../services/recommendations.service';
import { BehaviorAnalyzerService } from '../../services/behavior-analyzer.service';
import { AnomalyDetectorService } from '../../services/anomaly-detector.service';
import { ForecastService } from '../../services/forecast.service';

// Autenticação
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';

// Enums usados nos payloads
import { IntentType } from '../../dtos/ai-assistant.dto';
import { ConfirmationStatus } from '../../entities/transaction-anomaly.entity';

/**
 * TESTES DE INTEGRAÇÃO DOS CONTROLLERS DO MÓDULO DE IA
 *
 * Estes testes sobem uma aplicação Nest real (rotas + pipes + guards),
 * porém SEM banco de dados: todos os services são substituídos por mocks
 * (jest.fn()). O objetivo é validar:
 *
 *  1. Que as rotas HTTP reais existem, na ordem correta, e respondem com o
 *     status esperado.
 *  2. Que o ValidationPipe global (mesma configuração de src/main.ts)
 *     rejeita payloads inválidos.
 *  3. Que cada controller delega para o service correto, com os
 *     argumentos corretos.
 *
 * CONTRATO DE ESCOPO (usuário + família):
 * - `@CurrentUser()` devolve a entidade `User` produzida por
 *   `JwtStrategy.validate`, então o identificador do usuário é `user.id`.
 * - `@CurrentFamily()` lê `request.user.familyId`; nenhuma rota declara um
 *   parâmetro `:familyId`. Se o usuário não pertencer a nenhuma família, o
 *   decorator responde 403 (Forbidden).
 * Por isso o guard falso injeta um usuário com `id` E `familyId`.
 */
describe('Módulo de IA - Testes de integração dos controllers (sem banco)', () => {
  let app: INestApplication;

  const USER_ID = 'usuario-teste-123';
  const FAMILY_ID = 'familia-teste-456';

  // Usuário injetado na request pelo guard falso (formato da entidade User)
  const usuarioDeTeste = {
    id: USER_ID,
    familyId: FAMILY_ID,
    email: 'bruno@casa.local',
    name: 'Bruno',
  };

  // Usuário efetivamente injetado na request; alguns testes o substituem
  // (ex.: usuário sem família, para validar o 403 do @CurrentFamily()).
  let usuarioDaRequest: Record<string, any> = usuarioDeTeste;

  // ==================== MOCKS DOS SERVICES ====================

  const aiAssistantServiceMock = {
    processUserQuestion: jest.fn(),
    getChatHistory: jest.fn(),
    getSuggestions: jest.fn(),
    deleteMessage: jest.fn(),
    clearChatHistory: jest.fn(),
  };

  const recommendationsServiceMock = {
    listRecommendations: jest.fn(),
    getHighPriorityRecommendations: jest.fn(),
    getRecommendation: jest.fn(),
    updateRecommendation: jest.fn(),
    estimateImpact: jest.fn(),
    applyRecommendation: jest.fn(),
    regenerateRecommendations: jest.fn(),
  };

  const behaviorAnalyzerServiceMock = {
    analyzeBehavior: jest.fn(),
    detectPatterns: jest.fn(),
    analyzeCorrelations: jest.fn(),
    getSpendingProfile: jest.fn(),
    generateInsights: jest.fn(),
  };

  const anomalyDetectorServiceMock = {
    listAnomalies: jest.fn(),
    getAnomaly: jest.fn(),
    confirmAnomaly: jest.fn(),
  };

  const forecastServiceMock = {
    getForecast: jest.fn(),
    getForecastByCategory: jest.fn(),
    getScenarios: jest.fn(),
    getBalanceProjection: jest.fn(),
    getForecastDetails: jest.fn(),
    getAccuracyComparison: jest.fn(),
    regenerateForecasts: jest.fn(),
  };

  /**
   * Guard falso: substitui o JwtAuthGuard e injeta o usuário de teste
   * na request, para que @CurrentUser() e @CurrentFamily() funcionem
   * exatamente como em produção.
   */
  const jwtAuthGuardFalso = {
    canActivate: (context: ExecutionContext): boolean => {
      const req = context.switchToHttp().getRequest();
      req.user = usuarioDaRequest;
      return true;
    },
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [
        AiAssistantController,
        RecommendationsController,
        AnalysisController,
        ForecastsController,
      ],
      providers: [
        { provide: AiAssistantService, useValue: aiAssistantServiceMock },
        {
          provide: RecommendationsService,
          useValue: recommendationsServiceMock,
        },
        {
          provide: BehaviorAnalyzerService,
          useValue: behaviorAnalyzerServiceMock,
        },
        {
          provide: AnomalyDetectorService,
          useValue: anomalyDetectorServiceMock,
        },
        { provide: ForecastService, useValue: forecastServiceMock },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(jwtAuthGuardFalso)
      .compile();

    app = moduleFixture.createNestApplication();

    // Mesma configuração de ValidationPipe usada em src/main.ts
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    usuarioDaRequest = usuarioDeTeste;
  });

  // ============================================================
  // B.1 — CHAT COM O ASSISTENTE FINANCEIRO (/ai/chat)
  // ============================================================
  describe('AiAssistantController - /ai/chat', () => {
    describe('POST /ai/chat', () => {
      it('deve responder 200 e devolver a resposta da IA no caminho feliz', async () => {
        const respostaDaIa = {
          answer: 'Você gastou R$ 1.250,00 com alimentação neste mês.',
          intent: IntentType.QUERY,
          sources: ['despesas', 'categorias'],
          confidence: 0.92,
          followUpQuestions: ['Quer ver o detalhamento por estabelecimento?'],
          timestamp: '2026-08-26T10:00:00.000Z',
        };
        aiAssistantServiceMock.processUserQuestion.mockResolvedValue(
          respostaDaIa,
        );

        const resposta = await request(app.getHttpServer())
          .post('/ai/chat')
          .send({ question: 'Quanto gastei com alimentação este mês?' })
          .expect(200);

        expect(resposta.body).toEqual(respostaDaIa);
      });

      it('deve chamar o service com o id do usuário, a família e o DTO recebido', async () => {
        aiAssistantServiceMock.processUserQuestion.mockResolvedValue({
          answer: 'ok',
          intent: IntentType.QUERY,
          sources: [],
          confidence: 1,
          followUpQuestions: [],
          timestamp: '2026-08-26T10:00:00.000Z',
        });

        await request(app.getHttpServer())
          .post('/ai/chat')
          .send({
            question: 'Quanto a Giovanna gastou?',
            context: { period: 'THIS_MONTH', focusUser: 'giovanna' },
          })
          .expect(200);

        expect(
          aiAssistantServiceMock.processUserQuestion,
        ).toHaveBeenCalledTimes(1);
        expect(aiAssistantServiceMock.processUserQuestion).toHaveBeenCalledWith(
          USER_ID,
          FAMILY_ID,
          expect.objectContaining({
            question: 'Quanto a Giovanna gastou?',
            context: expect.objectContaining({
              period: 'THIS_MONTH',
              focusUser: 'giovanna',
            }),
          }),
        );
      });

      it('deve responder 400 quando o campo obrigatório "question" não é enviado', async () => {
        await request(app.getHttpServer())
          .post('/ai/chat')
          .send({})
          .expect(400);

        expect(
          aiAssistantServiceMock.processUserQuestion,
        ).not.toHaveBeenCalled();
      });

      it('deve responder 400 quando "question" é nula', async () => {
        await request(app.getHttpServer())
          .post('/ai/chat')
          .send({ question: null })
          .expect(400);

        expect(
          aiAssistantServiceMock.processUserQuestion,
        ).not.toHaveBeenCalled();
      });

      // O ValidationPipe está configurado com `enableImplicitConversion: true`,
      // então um número enviado em "question" é convertido para string em vez
      // de ser rejeitado. O teste documenta esse comportamento real.
      it('deve converter implicitamente "question" numérica para string', async () => {
        aiAssistantServiceMock.processUserQuestion.mockResolvedValue({
          answer: 'ok',
          intent: IntentType.QUERY,
          sources: [],
          confidence: 1,
          followUpQuestions: [],
          timestamp: '2026-08-26T10:00:00.000Z',
        });

        await request(app.getHttpServer())
          .post('/ai/chat')
          .send({ question: 12345 })
          .expect(200);

        expect(aiAssistantServiceMock.processUserQuestion).toHaveBeenCalledWith(
          USER_ID,
          FAMILY_ID,
          expect.objectContaining({ question: '12345' }),
        );
      });

      it('deve responder 400 quando o payload traz propriedades não permitidas (forbidNonWhitelisted)', async () => {
        await request(app.getHttpServer())
          .post('/ai/chat')
          .send({ question: 'Qual meu saldo?', propriedadeInvalida: 'xpto' })
          .expect(400);

        expect(
          aiAssistantServiceMock.processUserQuestion,
        ).not.toHaveBeenCalled();
      });
    });

    describe('GET /ai/chat/history', () => {
      /**
       * Com `DefaultValuePipe` + `ParseIntPipe`, um query param numérico
       * ausente assume o valor padrão declarado no pipe (50/0) em vez de
       * virar `NaN`, como acontecia quando a conversão dependia apenas do
       * `transform: true` do ValidationPipe global.
       */
      it('deve retornar o histórico aplicando a paginação padrão (50/0)', async () => {
        const historico = {
          messages: [],
          total: 0,
          limit: 50,
          offset: 0,
        };
        aiAssistantServiceMock.getChatHistory.mockResolvedValue(historico);

        const resposta = await request(app.getHttpServer())
          .get('/ai/chat/history')
          .expect(200);

        expect(resposta.body).toEqual(historico);
        expect(aiAssistantServiceMock.getChatHistory).toHaveBeenCalledWith(
          USER_ID,
          FAMILY_ID,
          { limit: 50, offset: 0 },
        );
      });

      it('deve limitar o "limit" em 100 mesmo quando o cliente pede mais', async () => {
        aiAssistantServiceMock.getChatHistory.mockResolvedValue({
          messages: [],
          total: 0,
          limit: 100,
          offset: 20,
        });

        await request(app.getHttpServer())
          .get('/ai/chat/history?limit=500&offset=20')
          .expect(200);

        expect(aiAssistantServiceMock.getChatHistory).toHaveBeenCalledWith(
          USER_ID,
          FAMILY_ID,
          { limit: 100, offset: 20 },
        );
      });

      /**
       * O ValidationPipe global converte a string "abc" em `NaN` e o
       * `DefaultValuePipe` trata `NaN` como valor ausente, aplicando o padrão.
       * O importante é que nenhum `NaN` chega ao service, como acontecia antes.
       */
      it('deve cair no valor padrão quando o "limit" não é numérico', async () => {
        aiAssistantServiceMock.getChatHistory.mockResolvedValue({
          messages: [],
          total: 0,
          limit: 50,
          offset: 0,
        });

        await request(app.getHttpServer())
          .get('/ai/chat/history?limit=abc')
          .expect(200);

        expect(aiAssistantServiceMock.getChatHistory).toHaveBeenCalledWith(
          USER_ID,
          FAMILY_ID,
          { limit: 50, offset: 0 },
        );
      });
    });

    describe('GET /ai/chat/suggestions', () => {
      it('deve retornar as sugestões de perguntas', async () => {
        const sugestoes = {
          suggestions: [
            'Quanto gastei com alimentação este mês?',
            'Quais contas vencem nos próximos 7 dias?',
          ],
        };
        aiAssistantServiceMock.getSuggestions.mockResolvedValue(sugestoes);

        const resposta = await request(app.getHttpServer())
          .get('/ai/chat/suggestions')
          .expect(200);

        expect(resposta.body).toEqual(sugestoes);
        expect(aiAssistantServiceMock.getSuggestions).toHaveBeenCalledWith(
          USER_ID,
          FAMILY_ID,
        );
      });
    });

    describe('DELETE /ai/chat/history/:messageId', () => {
      it('deve responder 204 e repassar o id da mensagem para o service', async () => {
        aiAssistantServiceMock.deleteMessage.mockResolvedValue(undefined);

        await request(app.getHttpServer())
          .delete('/ai/chat/history/mensagem-abc')
          .expect(204);

        expect(aiAssistantServiceMock.deleteMessage).toHaveBeenCalledWith(
          USER_ID,
          FAMILY_ID,
          'mensagem-abc',
        );
      });
    });

    describe('POST /ai/chat/clear-history', () => {
      it('deve responder 204 ao limpar todo o histórico', async () => {
        aiAssistantServiceMock.clearChatHistory.mockResolvedValue(undefined);

        await request(app.getHttpServer())
          .post('/ai/chat/clear-history')
          .expect(204);

        expect(aiAssistantServiceMock.clearChatHistory).toHaveBeenCalledWith(
          USER_ID,
          FAMILY_ID,
        );
      });
    });
  });

  // ============================================================
  // B.2 — RECOMENDAÇÕES (/recommendations)
  // ============================================================
  describe('RecommendationsController - /recommendations', () => {
    const listaDeRecomendacoes = {
      recommendations: [],
      total: 0,
      highPriorityCount: 0,
      mediumPriorityCount: 0,
      lowPriorityCount: 0,
    };

    describe('GET /recommendations', () => {
      it('deve listar recomendações aplicando os valores padrão da query string', async () => {
        recommendationsServiceMock.listRecommendations.mockResolvedValue(
          listaDeRecomendacoes,
        );

        const resposta = await request(app.getHttpServer())
          .get('/recommendations')
          .expect(200);

        expect(resposta.body).toEqual(listaDeRecomendacoes);
        // Filtros de texto ficam indefinidos; os numéricos/booleanos assumem
        // os padrões declarados nos pipes (50 / 0 / false).
        expect(
          recommendationsServiceMock.listRecommendations,
        ).toHaveBeenCalledWith(USER_ID, FAMILY_ID, {
          priority: undefined,
          type: undefined,
          limit: 50,
          offset: 0,
          includeDismissed: false,
        });
      });

      it('deve repassar filtros da query string e limitar o "limit" em 100', async () => {
        recommendationsServiceMock.listRecommendations.mockResolvedValue(
          listaDeRecomendacoes,
        );

        await request(app.getHttpServer())
          .get(
            '/recommendations?priority=HIGH&type=UNUSED_SUB&limit=999&offset=10&includeDismissed=true',
          )
          .expect(200);

        expect(
          recommendationsServiceMock.listRecommendations,
        ).toHaveBeenCalledWith(USER_ID, FAMILY_ID, {
          priority: 'HIGH',
          type: 'UNUSED_SUB',
          limit: 100,
          offset: 10,
          includeDismissed: true,
        });
      });
    });

    describe('GET /recommendations/high-priority', () => {
      it('deve retornar apenas as recomendações de alta prioridade', async () => {
        recommendationsServiceMock.getHighPriorityRecommendations.mockResolvedValue(
          listaDeRecomendacoes,
        );

        await request(app.getHttpServer())
          .get('/recommendations/high-priority?limit=5')
          .expect(200);

        expect(
          recommendationsServiceMock.getHighPriorityRecommendations,
        ).toHaveBeenCalledWith(USER_ID, FAMILY_ID, 5);
      });

      /**
       * Rota estática declarada ANTES de `@Get(':recommendationId')`:
       * se a ordem fosse invertida, o parâmetro dinâmico capturaria
       * "high-priority" e esta rota seria inalcançável.
       */
      it('não deve ser capturada pela rota dinâmica :recommendationId', async () => {
        recommendationsServiceMock.getHighPriorityRecommendations.mockResolvedValue(
          listaDeRecomendacoes,
        );

        await request(app.getHttpServer())
          .get('/recommendations/high-priority')
          .expect(200);

        expect(
          recommendationsServiceMock.getHighPriorityRecommendations,
        ).toHaveBeenCalledWith(USER_ID, FAMILY_ID, 20);
        expect(
          recommendationsServiceMock.getRecommendation,
        ).not.toHaveBeenCalled();
      });
    });

    describe('GET /recommendations/impact-estimate', () => {
      it('deve estimar o impacto das recomendações ativas', async () => {
        const estimativa = {
          type: 'CATEGORY_HIGH',
          totalPotentialSavings: 300,
          averageDifficulty: 40,
          percentageOfEasyActions: 50,
          recommendations: [],
        };
        recommendationsServiceMock.estimateImpact.mockResolvedValue(estimativa);

        const resposta = await request(app.getHttpServer())
          .get('/recommendations/impact-estimate')
          .expect(200);

        expect(resposta.body).toEqual(estimativa);
        expect(recommendationsServiceMock.estimateImpact).toHaveBeenCalledWith(
          USER_ID,
          FAMILY_ID,
        );
        // Rota estática não pode ser capturada pela rota dinâmica
        expect(
          recommendationsServiceMock.getRecommendation,
        ).not.toHaveBeenCalled();
      });
    });

    describe('POST /recommendations/regenerate', () => {
      it('deve responder 202 ao solicitar a regeneração das recomendações', async () => {
        recommendationsServiceMock.regenerateRecommendations.mockResolvedValue({
          generated: 7,
        });

        const resposta = await request(app.getHttpServer())
          .post('/recommendations/regenerate')
          .send({})
          .expect(202);

        expect(resposta.body).toEqual({ generated: 7 });
        expect(
          recommendationsServiceMock.regenerateRecommendations,
        ).toHaveBeenCalledWith(USER_ID, FAMILY_ID);
      });
    });

    describe('GET /recommendations/:recommendationId', () => {
      it('deve retornar os detalhes de uma recomendação', async () => {
        const recomendacao = {
          id: 'rec-1',
          title: 'Cancelar assinatura não utilizada',
          priority: 'HIGH',
        };
        recommendationsServiceMock.getRecommendation.mockResolvedValue(
          recomendacao,
        );

        const resposta = await request(app.getHttpServer())
          .get('/recommendations/rec-1')
          .expect(200);

        expect(resposta.body).toEqual(recomendacao);
        expect(
          recommendationsServiceMock.getRecommendation,
        ).toHaveBeenCalledWith(USER_ID, FAMILY_ID, 'rec-1');
      });
    });

    describe('PATCH /recommendations/:recommendationId', () => {
      it('deve descartar uma recomendação e responder 200', async () => {
        recommendationsServiceMock.updateRecommendation.mockResolvedValue({
          id: 'rec-1',
          isDismissed: true,
        });

        const resposta = await request(app.getHttpServer())
          .patch('/recommendations/rec-1')
          .send({ isDismissed: true })
          .expect(200);

        expect(resposta.body).toEqual({ id: 'rec-1', isDismissed: true });
        expect(
          recommendationsServiceMock.updateRecommendation,
        ).toHaveBeenCalledWith(USER_ID, FAMILY_ID, 'rec-1', {
          isDismissed: true,
        });
      });

      it('deve responder 400 quando o payload contém campo desconhecido', async () => {
        await request(app.getHttpServer())
          .patch('/recommendations/rec-1')
          .send({ isDismissed: true, campoInexistente: 1 })
          .expect(400);

        expect(
          recommendationsServiceMock.updateRecommendation,
        ).not.toHaveBeenCalled();
      });
    });

    describe('POST /recommendations/:recommendationId/apply', () => {
      it('deve aplicar a recomendação e responder 200', async () => {
        const resultado = {
          success: true,
          message: 'Ação criada com sucesso',
          redirectUrl: '/planejado',
        };
        recommendationsServiceMock.applyRecommendation.mockResolvedValue(
          resultado,
        );

        const resposta = await request(app.getHttpServer())
          .post('/recommendations/rec-1/apply')
          .send({ notes: 'Vou cancelar amanhã' })
          .expect(200);

        expect(resposta.body).toEqual(resultado);
        expect(
          recommendationsServiceMock.applyRecommendation,
        ).toHaveBeenCalledWith(USER_ID, FAMILY_ID, 'rec-1', {
          notes: 'Vou cancelar amanhã',
        });
      });

      it('deve responder 400 quando o payload contém campo desconhecido', async () => {
        await request(app.getHttpServer())
          .post('/recommendations/rec-1/apply')
          .send({ notes: 'ok', campoInexistente: true })
          .expect(400);

        expect(
          recommendationsServiceMock.applyRecommendation,
        ).not.toHaveBeenCalled();
      });
    });
  });

  // ============================================================
  // B.3 — ANÁLISE COMPORTAMENTAL (/analysis)
  // ============================================================
  describe('AnalysisController - /analysis', () => {
    describe('GET /analysis/behavior', () => {
      it('deve usar o período padrão LAST_6_MONTHS quando nenhum é informado', async () => {
        behaviorAnalyzerServiceMock.analyzeBehavior.mockResolvedValue({
          period: 'LAST_6_MONTHS',
        });

        const resposta = await request(app.getHttpServer())
          .get('/analysis/behavior')
          .expect(200);

        expect(resposta.body).toEqual({ period: 'LAST_6_MONTHS' });
        expect(behaviorAnalyzerServiceMock.analyzeBehavior).toHaveBeenCalledWith(
          USER_ID,
          FAMILY_ID,
          'LAST_6_MONTHS',
        );
      });

      it('deve repassar o período informado na query string', async () => {
        behaviorAnalyzerServiceMock.analyzeBehavior.mockResolvedValue({
          period: 'THIS_MONTH',
        });

        await request(app.getHttpServer())
          .get('/analysis/behavior?period=THIS_MONTH')
          .expect(200);

        expect(behaviorAnalyzerServiceMock.analyzeBehavior).toHaveBeenCalledWith(
          USER_ID,
          FAMILY_ID,
          'THIS_MONTH',
        );
      });
    });

    describe('GET /analysis/anomalies', () => {
      const listaDeAnomalias = {
        anomalies: [],
        total: 0,
        highSeverityCount: 0,
        mediumSeverityCount: 0,
        lowSeverityCount: 0,
      };

      it('deve listar anomalias com os valores padrão de paginação', async () => {
        anomalyDetectorServiceMock.listAnomalies.mockResolvedValue(
          listaDeAnomalias,
        );

        const resposta = await request(app.getHttpServer())
          .get('/analysis/anomalies')
          .expect(200);

        expect(resposta.body).toEqual(listaDeAnomalias);
        expect(anomalyDetectorServiceMock.listAnomalies).toHaveBeenCalledWith(
          USER_ID,
          FAMILY_ID,
          {
            severity: undefined,
            limit: 50,
            offset: 0,
            confirmed: undefined,
          },
        );
      });

      it('deve repassar severity/confirmed e limitar o "limit" em 100', async () => {
        anomalyDetectorServiceMock.listAnomalies.mockResolvedValue(
          listaDeAnomalias,
        );

        await request(app.getHttpServer())
          .get(
            '/analysis/anomalies?severity=HIGH&limit=300&offset=5&confirmed=true',
          )
          .expect(200);

        expect(anomalyDetectorServiceMock.listAnomalies).toHaveBeenCalledWith(
          USER_ID,
          FAMILY_ID,
          {
            severity: 'HIGH',
            limit: 100,
            offset: 5,
            confirmed: true,
          },
        );
      });
    });

    describe('GET /analysis/anomalies/:anomalyId', () => {
      it('deve retornar os detalhes de uma anomalia', async () => {
        const anomalia = {
          id: 'anomalia-1',
          transactionId: 'tx-1',
          anomalyType: 'UNUSUAL_AMOUNT',
          severity: 'HIGH',
          anomalyScore: 0.95,
          reason: 'Valor 75% acima da média de supermercado',
          createdAt: '2026-08-20T12:00:00.000Z',
        };
        anomalyDetectorServiceMock.getAnomaly.mockResolvedValue(anomalia);

        const resposta = await request(app.getHttpServer())
          .get('/analysis/anomalies/anomalia-1')
          .expect(200);

        expect(resposta.body).toEqual(anomalia);
        expect(anomalyDetectorServiceMock.getAnomaly).toHaveBeenCalledWith(
          USER_ID,
          FAMILY_ID,
          'anomalia-1',
        );
      });
    });

    describe('PATCH /analysis/anomalies/:anomalyId/confirm', () => {
      it('deve confirmar a anomalia e responder 200', async () => {
        anomalyDetectorServiceMock.confirmAnomaly.mockResolvedValue({
          id: 'anomalia-1',
          confirmationStatus: ConfirmationStatus.UNUSUAL_BUT_OK,
        });

        const resposta = await request(app.getHttpServer())
          .patch('/analysis/anomalies/anomalia-1/confirm')
          .send({
            status: ConfirmationStatus.UNUSUAL_BUT_OK,
            notes: 'Compra grande do mês, mas legítima',
          })
          .expect(200);

        expect(resposta.body).toEqual({
          id: 'anomalia-1',
          confirmationStatus: 'UNUSUAL_BUT_OK',
        });
        expect(anomalyDetectorServiceMock.confirmAnomaly).toHaveBeenCalledWith(
          USER_ID,
          FAMILY_ID,
          'anomalia-1',
          {
            status: ConfirmationStatus.UNUSUAL_BUT_OK,
            notes: 'Compra grande do mês, mas legítima',
          },
        );
      });

      it('deve responder 400 quando o status não pertence ao enum', async () => {
        await request(app.getHttpServer())
          .patch('/analysis/anomalies/anomalia-1/confirm')
          .send({ status: 'STATUS_INEXISTENTE' })
          .expect(400);

        expect(
          anomalyDetectorServiceMock.confirmAnomaly,
        ).not.toHaveBeenCalled();
      });

      it('deve responder 400 quando o status obrigatório não é enviado', async () => {
        await request(app.getHttpServer())
          .patch('/analysis/anomalies/anomalia-1/confirm')
          .send({ notes: 'sem status' })
          .expect(400);

        expect(
          anomalyDetectorServiceMock.confirmAnomaly,
        ).not.toHaveBeenCalled();
      });
    });

    describe('GET /analysis/patterns', () => {
      const listaDePadroes = {
        patterns: [],
        total: 0,
        increasingCount: 0,
        decreasingCount: 0,
        stableCount: 0,
      };

      it('deve detectar padrões com o limite padrão de 20', async () => {
        behaviorAnalyzerServiceMock.detectPatterns.mockResolvedValue(
          listaDePadroes,
        );

        await request(app.getHttpServer())
          .get('/analysis/patterns')
          .expect(200);

        expect(behaviorAnalyzerServiceMock.detectPatterns).toHaveBeenCalledWith(
          USER_ID,
          FAMILY_ID,
          { frequency: undefined, limit: 20 },
        );
      });

      it('deve repassar a frequência e limitar o "limit" em 50', async () => {
        behaviorAnalyzerServiceMock.detectPatterns.mockResolvedValue(
          listaDePadroes,
        );

        await request(app.getHttpServer())
          .get('/analysis/patterns?frequency=monthly&limit=90')
          .expect(200);

        expect(behaviorAnalyzerServiceMock.detectPatterns).toHaveBeenCalledWith(
          USER_ID,
          FAMILY_ID,
          { frequency: 'monthly', limit: 50 },
        );
      });
    });

    describe('GET /analysis/correlations', () => {
      const listaDeCorrelacoes = {
        correlations: [],
        total: 0,
        strongCorrelations: 0,
      };

      it('deve analisar correlações com os padrões 0.5 e 20', async () => {
        behaviorAnalyzerServiceMock.analyzeCorrelations.mockResolvedValue(
          listaDeCorrelacoes,
        );

        await request(app.getHttpServer())
          .get('/analysis/correlations')
          .expect(200);

        expect(
          behaviorAnalyzerServiceMock.analyzeCorrelations,
        ).toHaveBeenCalledWith(USER_ID, FAMILY_ID, {
          minCorrelation: 0.5,
          limit: 20,
        });
      });

      it('deve converter minCorrelation da query string para número', async () => {
        behaviorAnalyzerServiceMock.analyzeCorrelations.mockResolvedValue(
          listaDeCorrelacoes,
        );

        await request(app.getHttpServer())
          .get('/analysis/correlations?minCorrelation=0.8&limit=10')
          .expect(200);

        expect(
          behaviorAnalyzerServiceMock.analyzeCorrelations,
        ).toHaveBeenCalledWith(USER_ID, FAMILY_ID, {
          minCorrelation: 0.8,
          limit: 10,
        });
      });
    });

    describe('GET /analysis/spending-profile', () => {
      it('deve retornar o perfil de gasto com período padrão LAST_12_MONTHS', async () => {
        const perfil = {
          averageDailySpend: 120.5,
          averageMonthlySpend: 3615,
          maxSpendDay: 890,
          minSpendDay: 0,
          topCategory: 'Supermercado',
          topCategoryPercentage: 28.4,
          spendingLevel: 'MEDIUM',
          trend: 'STABLE',
          predictability: 0.71,
        };
        behaviorAnalyzerServiceMock.getSpendingProfile.mockResolvedValue(perfil);

        const resposta = await request(app.getHttpServer())
          .get('/analysis/spending-profile')
          .expect(200);

        expect(resposta.body).toEqual(perfil);
        expect(
          behaviorAnalyzerServiceMock.getSpendingProfile,
        ).toHaveBeenCalledWith(USER_ID, FAMILY_ID, 'LAST_12_MONTHS');
      });
    });

    describe('GET /analysis/insights', () => {
      it('deve retornar os insights gerados automaticamente', async () => {
        const insights = {
          insights: ['Seu gasto com supermercado está 75% acima da média.'],
          generatedAt: '2026-08-26T09:00:00.000Z',
        };
        behaviorAnalyzerServiceMock.generateInsights.mockResolvedValue(insights);

        const resposta = await request(app.getHttpServer())
          .get('/analysis/insights')
          .expect(200);

        expect(resposta.body).toEqual(insights);
        expect(
          behaviorAnalyzerServiceMock.generateInsights,
        ).toHaveBeenCalledWith(USER_ID, FAMILY_ID);
      });
    });
  });

  // ============================================================
  // B.4 — PREVISÕES FINANCEIRAS (/forecasts)
  //
  // Todas as rotas estáticas (`/details`, `/accuracy-comparison`,
  // `/regenerate`) são declaradas ANTES de `@Get(':categoryId')`, portanto
  // são alcançáveis e testadas abaixo.
  // ============================================================
  describe('ForecastsController - /forecasts', () => {
    const previsaoFake = {
      id: 'forecast-1',
      forecastType: 'TOTAL',
      period: '30_DAYS',
      predictions: [],
      summary: {
        averagePredicted: 3200,
        minPredicted: 2800,
        maxPredicted: 3600,
        trend: 'STABLE',
        modelUsed: 'LINEAR',
        accuracy: 87,
        confidence: 0.8,
      },
      generatedAt: '2026-08-26T09:00:00.000Z',
    };

    // Cada rota de horizonte fixo chama getForecast com o período correspondente
    const rotasDeHorizonte: Array<[string, string]> = [
      ['/forecasts/next-30-days', '30_DAYS'],
      ['/forecasts/next-90-days', '90_DAYS'],
      ['/forecasts/next-180-days', '180_DAYS'],
      ['/forecasts/next-365-days', '365_DAYS'],
    ];

    it.each(rotasDeHorizonte)(
      'GET %s deve chamar getForecast com o período %s',
      async (rota, periodoEsperado) => {
        forecastServiceMock.getForecast.mockResolvedValue({
          ...previsaoFake,
          period: periodoEsperado,
        });

        const resposta = await request(app.getHttpServer())
          .get(rota)
          .expect(200);

        expect(resposta.body.period).toBe(periodoEsperado);
        expect(forecastServiceMock.getForecast).toHaveBeenCalledWith(
          USER_ID,
          FAMILY_ID,
          periodoEsperado,
        );
      },
    );

    describe('GET /forecasts/by-category', () => {
      const previsaoPorCategoria = {
        forecasts: [],
        totalCurrentSpending: 0,
        totalPredictedSpending: 0,
        totalPercentageChange: 0,
      };

      it('deve aplicar os valores padrão quando a query está vazia', async () => {
        forecastServiceMock.getForecastByCategory.mockResolvedValue(
          previsaoPorCategoria,
        );

        const resposta = await request(app.getHttpServer())
          .get('/forecasts/by-category')
          .expect(200);

        expect(resposta.body).toEqual(previsaoPorCategoria);
        // period vem do valor padrão da assinatura; limit e minVariation
        // vêm dos respectivos DefaultValuePipe (20 e -50).
        expect(forecastServiceMock.getForecastByCategory).toHaveBeenCalledWith(
          USER_ID,
          FAMILY_ID,
          { period: '90_DAYS', limit: 20, minVariation: -50 },
        );
      });

      it('deve repassar a query string e limitar o "limit" em 50', async () => {
        forecastServiceMock.getForecastByCategory.mockResolvedValue(
          previsaoPorCategoria,
        );

        await request(app.getHttpServer())
          .get('/forecasts/by-category?period=180_DAYS&limit=200&minVariation=10')
          .expect(200);

        expect(forecastServiceMock.getForecastByCategory).toHaveBeenCalledWith(
          USER_ID,
          FAMILY_ID,
          { period: '180_DAYS', limit: 50, minVariation: 10 },
        );
      });
    });

    describe('GET /forecasts/scenarios', () => {
      it('deve retornar os cenários (melhor, esperado e pior caso)', async () => {
        const cenarios = { bestCase: 2500, expectedCase: 3200, worstCase: 4100 };
        forecastServiceMock.getScenarios.mockResolvedValue(cenarios);

        const resposta = await request(app.getHttpServer())
          .get('/forecasts/scenarios?period=30_DAYS')
          .expect(200);

        expect(resposta.body).toEqual(cenarios);
        expect(forecastServiceMock.getScenarios).toHaveBeenCalledWith(
          USER_ID,
          FAMILY_ID,
          '30_DAYS',
        );
      });
    });

    describe('GET /forecasts/balance-projection', () => {
      it('deve projetar o saldo com includeRisk habilitado por padrão', async () => {
        const projecao = {
          projections: [],
          currentBalance: 5000,
          minimumProjectedBalance: 2100,
          maximumProjectedBalance: 8300,
          hasNegativeBalanceRisk: false,
          period: '90_DAYS',
        };
        forecastServiceMock.getBalanceProjection.mockResolvedValue(projecao);

        const resposta = await request(app.getHttpServer())
          .get('/forecasts/balance-projection')
          .expect(200);

        expect(resposta.body).toEqual(projecao);
        expect(forecastServiceMock.getBalanceProjection).toHaveBeenCalledWith(
          USER_ID,
          FAMILY_ID,
          { period: '90_DAYS', includeRisk: true },
        );
      });

      it('deve converter includeRisk=false da query string para booleano', async () => {
        forecastServiceMock.getBalanceProjection.mockResolvedValue({
          projections: [],
          currentBalance: 0,
          minimumProjectedBalance: 0,
          maximumProjectedBalance: 0,
          hasNegativeBalanceRisk: false,
          period: '30_DAYS',
        });

        await request(app.getHttpServer())
          .get('/forecasts/balance-projection?period=30_DAYS&includeRisk=false')
          .expect(200);

        expect(forecastServiceMock.getBalanceProjection).toHaveBeenCalledWith(
          USER_ID,
          FAMILY_ID,
          { period: '30_DAYS', includeRisk: false },
        );
      });
    });

    describe('GET /forecasts/details', () => {
      it('deve retornar os detalhes da previsão sem ser capturada por :categoryId', async () => {
        const detalhes = {
          period: '90_DAYS',
          modelUsed: 'LINEAR',
          accuracy: 87,
          dataPointsUsed: 180,
          generatedAt: '2026-08-26T09:00:00.000Z',
        };
        forecastServiceMock.getForecastDetails.mockResolvedValue(detalhes);

        const resposta = await request(app.getHttpServer())
          .get('/forecasts/details')
          .expect(200);

        expect(resposta.body).toEqual(detalhes);
        expect(forecastServiceMock.getForecastDetails).toHaveBeenCalledWith(
          USER_ID,
          FAMILY_ID,
          '90_DAYS',
        );
        // A rota dinâmica não pode ter capturado "details"
        expect(
          forecastServiceMock.getForecastByCategory,
        ).not.toHaveBeenCalled();
      });

      it('deve repassar o período informado na query string', async () => {
        forecastServiceMock.getForecastDetails.mockResolvedValue({});

        await request(app.getHttpServer())
          .get('/forecasts/details?period=365_DAYS')
          .expect(200);

        expect(forecastServiceMock.getForecastDetails).toHaveBeenCalledWith(
          USER_ID,
          FAMILY_ID,
          '365_DAYS',
        );
      });
    });

    describe('GET /forecasts/accuracy-comparison', () => {
      it('deve comparar previsões com o limite padrão de 12', async () => {
        const comparacoes = { comparisons: [], averageAccuracy: 84 };
        forecastServiceMock.getAccuracyComparison.mockResolvedValue(
          comparacoes,
        );

        const resposta = await request(app.getHttpServer())
          .get('/forecasts/accuracy-comparison')
          .expect(200);

        expect(resposta.body).toEqual(comparacoes);
        expect(forecastServiceMock.getAccuracyComparison).toHaveBeenCalledWith(
          USER_ID,
          FAMILY_ID,
          12,
        );
        expect(
          forecastServiceMock.getForecastByCategory,
        ).not.toHaveBeenCalled();
      });

      it('deve limitar o "limit" em 36', async () => {
        forecastServiceMock.getAccuracyComparison.mockResolvedValue({
          comparisons: [],
          averageAccuracy: 0,
        });

        await request(app.getHttpServer())
          .get('/forecasts/accuracy-comparison?limit=120')
          .expect(200);

        expect(forecastServiceMock.getAccuracyComparison).toHaveBeenCalledWith(
          USER_ID,
          FAMILY_ID,
          36,
        );
      });
    });

    describe('POST /forecasts/regenerate', () => {
      it('deve responder 202 ao solicitar a regeneração das previsões', async () => {
        forecastServiceMock.regenerateForecasts.mockResolvedValue({
          success: true,
        });

        const resposta = await request(app.getHttpServer())
          .post('/forecasts/regenerate')
          .send({})
          .expect(202);

        expect(resposta.body).toEqual({ success: true });
        expect(forecastServiceMock.regenerateForecasts).toHaveBeenCalledWith(
          USER_ID,
          FAMILY_ID,
        );
      });

      it('não deve aceitar GET em /forecasts/regenerate (a rota é POST)', async () => {
        forecastServiceMock.getForecastByCategory.mockResolvedValue({});

        // Como GET não existe para essa rota, ela cai na rota dinâmica
        // `:categoryId` — mas nunca em `regenerateForecasts`.
        await request(app.getHttpServer()).get('/forecasts/regenerate');

        expect(forecastServiceMock.regenerateForecasts).not.toHaveBeenCalled();
      });
    });

    describe('GET /forecasts/:categoryId', () => {
      it('deve prever os gastos de uma categoria específica', async () => {
        forecastServiceMock.getForecastByCategory.mockResolvedValue(
          previsaoFake,
        );

        const resposta = await request(app.getHttpServer())
          .get('/forecasts/categoria-alimentacao?period=180_DAYS')
          .expect(200);

        expect(resposta.body).toEqual(previsaoFake);
        expect(forecastServiceMock.getForecastByCategory).toHaveBeenCalledWith(
          USER_ID,
          FAMILY_ID,
          { period: '180_DAYS', categoryId: 'categoria-alimentacao' },
        );
      });
    });
  });

  // ============================================================
  // AUTENTICAÇÃO E ESCOPO DE FAMÍLIA
  // ============================================================
  describe('Autenticação e escopo de família', () => {
    it('deve propagar o id do usuário autenticado (@CurrentUser) para os services', async () => {
      behaviorAnalyzerServiceMock.generateInsights.mockResolvedValue({
        insights: [],
        generatedAt: '2026-08-26T09:00:00.000Z',
      });

      await request(app.getHttpServer())
        .get('/analysis/insights')
        .expect(200);

      const [userIdRecebido, familyIdRecebido] =
        behaviorAnalyzerServiceMock.generateInsights.mock.calls[0];
      expect(userIdRecebido).toBe(USER_ID);
      expect(familyIdRecebido).toBe(FAMILY_ID);
    });

    it('deve responder 403 quando o usuário autenticado não possui família', async () => {
      usuarioDaRequest = {
        id: 'usuario-sem-familia',
        email: 'sem-familia@casa.local',
        name: 'Sem Família',
      };

      const resposta = await request(app.getHttpServer())
        .get('/analysis/insights')
        .expect(403);

      expect(resposta.body.message).toContain('família');
      expect(
        behaviorAnalyzerServiceMock.generateInsights,
      ).not.toHaveBeenCalled();
    });

    it('deve responder 403 no chat quando o usuário não possui família', async () => {
      usuarioDaRequest = { id: 'usuario-sem-familia' };

      await request(app.getHttpServer())
        .post('/ai/chat')
        .send({ question: 'Qual meu saldo?' })
        .expect(403);

      expect(
        aiAssistantServiceMock.processUserQuestion,
      ).not.toHaveBeenCalled();
    });
  });
});
