import { Test, TestingModule } from '@nestjs/testing';
import {
  IntentDetectorService,
  IntentResult,
} from '../../services/intent-detector.service';
import { IntentType } from '../../dtos/ai-assistant.dto';

/**
 * Testes unitários do IntentDetectorService.
 *
 * O serviço não possui dependências injetadas: classifica a pergunta
 * por pattern matching e extrai entidades (período, métrica, usuário, valor).
 */
describe('IntentDetectorService', () => {
  let service: IntentDetectorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [IntentDetectorService],
    }).compile();

    service = module.get<IntentDetectorService>(IntentDetectorService);
  });

  it('deve estar definido', () => {
    expect(service).toBeDefined();
  });

  // ==================== detectIntent ====================

  describe('detectIntent', () => {
    it('deve classificar como QUERY uma pergunta sobre gastos do mês', () => {
      const resultado: IntentResult = service.detectIntent(
        'Quanto gastei com alimentação este mês?',
      );

      expect(resultado.intent).toBe(IntentType.QUERY);
      expect(resultado.confidence).toBe(100);
    });

    it('deve classificar como COMPARISON uma pergunta comparando Bruno e Giovanna', () => {
      const resultado = service.detectIntent(
        'Compare os gastos do Bruno vs Giovanna',
      );

      expect(resultado.intent).toBe(IntentType.COMPARISON);
      expect(resultado.confidence).toBe(100);
    });

    it('deve classificar como RECOMMENDATION um pedido de sugestão de economia', () => {
      const resultado = service.detectIntent(
        'Recomende como economizar e reduzir minhas contas',
      );

      expect(resultado.intent).toBe(IntentType.RECOMMENDATION);
      expect(resultado.confidence).toBe(100);
    });

    it('deve classificar como PREDICTION uma pergunta sobre o futuro', () => {
      const resultado = service.detectIntent(
        'Qual será meu saldo daqui a 30 dias?',
      );

      expect(resultado.intent).toBe(IntentType.PREDICTION);
      expect(resultado.confidence).toBe(100);
    });

    it('deve classificar como ACTION um pedido de criação de lançamento', () => {
      const resultado = service.detectIntent(
        'Criar um novo pagamento e registrar no cartão',
      );

      expect(resultado.intent).toBe(IntentType.ACTION);
      expect(resultado.confidence).toBe(100);
    });

    it('deve usar QUERY com confiança 50 quando nenhum padrão for reconhecido', () => {
      const resultado = service.detectIntent('zzz');

      expect(resultado.intent).toBe(IntentType.QUERY);
      expect(resultado.confidence).toBe(50);
      expect(resultado.entities).toEqual({});
      expect(resultado.period).toBeUndefined();
      expect(resultado.metric).toBeUndefined();
      expect(resultado.user).toBeUndefined();
    });

    it('deve retornar confiança parcial quando apenas um padrão da intenção casar', () => {
      // "gastos" casa somente com o segundo padrão de QUERY (1 de 2 => 50)
      const resultado = service.detectIntent('gastos');

      expect(resultado.intent).toBe(IntentType.QUERY);
      expect(resultado.confidence).toBe(50);
    });

    it('deve normalizar a pergunta, ignorando maiúsculas e espaços em excesso', () => {
      const resultado = service.detectIntent('   QUANTO GASTEI ESTE MÊS?   ');

      expect(resultado.intent).toBe(IntentType.QUERY);
      expect(resultado.entities.period).toBe('este mês');
    });

    it('deve limitar a confiança a no máximo 100', () => {
      const perguntas = [
        'Quanto gastei com alimentação este mês?',
        'Compare os gastos do Bruno vs Giovanna',
        'Recomende como economizar e reduzir minhas contas',
      ];

      perguntas.forEach((pergunta) => {
        const resultado = service.detectIntent(pergunta);
        expect(resultado.confidence).toBeLessThanOrEqual(100);
        expect(resultado.confidence).toBeGreaterThan(0);
      });
    });

    it('deve lidar com string vazia sem lançar erro', () => {
      const resultado = service.detectIntent('');

      expect(resultado.intent).toBe(IntentType.QUERY);
      expect(resultado.confidence).toBe(50);
      expect(resultado.entities).toEqual({});
    });

    describe('extração de entidades', () => {
      it('deve extrair período e métrica como string quando houver uma única correspondência', () => {
        const resultado = service.detectIntent(
          'Quanto gastei com alimentação este mês?',
        );

        expect(resultado.entities.period).toBe('este mês');
        expect(resultado.entities.metric).toBe('gast');
      });

      it('deve extrair a métrica como array quando houver múltiplas correspondências', () => {
        const resultado = service.detectIntent(
          'Quanto foi o gasto por categoria no cartão?',
        );

        // O padrão "por categoria" casa antes de "categoria" na varredura
        expect(resultado.entities.metric).toEqual([
          'gasto',
          'por categoria',
          'cartão',
        ]);
        // Com array, o campo agregado expõe a primeira correspondência
        expect(resultado.metric).toBe('gasto');
      });

      it('deve extrair o responsável citado na pergunta', () => {
        const resultado = service.detectIntent('Quanto o Bruno gastou?');

        expect(resultado.entities.user).toBe('bruno');
      });

      it('deve extrair valores monetários informados na pergunta', () => {
        const resultado = service.detectIntent(
          'Qual o melhor dia para uma compra de R$ 1.000?',
        );

        expect(resultado.entities.amount).toBeDefined();
        expect(String(resultado.entities.amount)).toContain('1.000');
      });

      it('deve extrair período relativo de dias', () => {
        const resultado = service.detectIntent(
          'Quais contas vencem nos próximos 7 dias?',
        );

        expect(resultado.entities.period).toBeDefined();
        expect(String(resultado.entities.period)).toContain('7 dias');
      });

      it('não deve retornar entidades quando a pergunta não contiver nenhuma', () => {
        const resultado = service.detectIntent('zzz');

        expect(Object.keys(resultado.entities)).toHaveLength(0);
      });
    });
  });

  // ============== generateFollowUpSuggestions ==============

  describe('generateFollowUpSuggestions', () => {
    it('deve sugerir perguntas de acompanhamento para QUERY', () => {
      const sugestoes = service.generateFollowUpSuggestions(
        'Quanto gastei este mês?',
        IntentType.QUERY,
      );

      expect(sugestoes).toHaveLength(3);
      expect(sugestoes).toContain('Qual foi minha maior despesa?');
    });

    it('deve sugerir perguntas de acompanhamento para COMPARISON', () => {
      const sugestoes = service.generateFollowUpSuggestions(
        'Bruno vs Giovanna',
        IntentType.COMPARISON,
      );

      expect(sugestoes).toHaveLength(3);
      expect(sugestoes[0]).toBe('Qual a tendência ao longo dos meses?');
    });

    it('deve sugerir perguntas de acompanhamento para RECOMMENDATION', () => {
      const sugestoes = service.generateFollowUpSuggestions(
        'Como economizar?',
        IntentType.RECOMMENDATION,
      );

      expect(sugestoes).toHaveLength(3);
      expect(sugestoes).toContain('Quanto posso economizar?');
    });

    it('deve sugerir perguntas de acompanhamento para PREDICTION', () => {
      const sugestoes = service.generateFollowUpSuggestions(
        'Qual meu saldo em 30 dias?',
        IntentType.PREDICTION,
      );

      expect(sugestoes).toHaveLength(3);
      expect(sugestoes).toContain('Quais são os riscos?');
    });

    it('deve retornar apenas duas sugestões para ACTION', () => {
      const sugestoes = service.generateFollowUpSuggestions(
        'Criar lançamento',
        IntentType.ACTION,
      );

      expect(sugestoes).toEqual([
        'Deseja confirmar esta ação?',
        'Há algum conflito com transações existentes?',
      ]);
    });

    it('deve retornar lista vazia para uma intenção não mapeada', () => {
      const sugestoes = service.generateFollowUpSuggestions(
        'Pergunta qualquer',
        'DESCONHECIDA' as unknown as IntentType,
      );

      expect(sugestoes).toEqual([]);
    });

    it('nunca deve retornar mais de três sugestões', () => {
      Object.values(IntentType).forEach((intent) => {
        const sugestoes = service.generateFollowUpSuggestions('teste', intent);
        expect(sugestoes.length).toBeLessThanOrEqual(3);
      });
    });
  });
});
