import { Injectable } from '@nestjs/common';
import { IntentType } from '../dtos/ai-assistant.dto';

export interface IntentResult {
  intent: IntentType;
  confidence: number;
  entities: Record<string, string | string[]>;
  period?: string;
  metric?: string;
  user?: string;
}

/**
 * Service para detecção de intenção do usuário nas perguntas
 * Utiliza pattern matching e ML simples para classificar perguntas
 */
@Injectable()
export class IntentDetectorService {
  private readonly intentPatterns = {
    [IntentType.COMPARISON]: [
      /compar|versus|vs|diferença|qual.*maior|qual.*menor|maior que|menor que/i,
      /bruno.*giovanna|giovanna.*bruno|meu.*dele|dela.*meu/i,
    ],
    [IntentType.QUERY]: [
      /quanto|qual|como|quando|onde|por que|histórico|extrato|saldo/i,
      /gastei|recebi|gastos|receitas|transações|lançamentos/i,
    ],
    [IntentType.RECOMMENDATION]: [
      /recomend|sugest|deveria|deveria fazer|poderia|conselho|dica|como economizar|como poupar/i,
      /reduzir|cortar|economizar|melhorar|otimizar|aumentar/i,
    ],
    [IntentType.PREDICTION]: [
      /previsão|vai|será|próxim|futuro|estimativa|projeção|previsto/i,
      /quando vou|quanto vou|saldo em|daqui|dias|meses|semanas/i,
    ],
    [IntentType.ACTION]: [
      /criar|adicionar|incluir|remover|deletar|apagar|excluir|editar|modificar|alterar/i,
      /registrar|lançar|marcar|confirmar|cancelar|pagar|gerar/i,
    ],
  };

  private readonly entityPatterns = {
    period: [
      /este mês|esse mês|mês atual|mês passado|último mês/i,
      /últimos? (\d+) dias|últimas? (\d+) semanas|últimos? (\d+) meses/i,
      /próximos? (\d+) dias|próximas? (\d+) semanas|próximos? (\d+) meses/i,
      /jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez/i,
      /trimestre|quadrimestre|semestre|ano/i,
    ],
    metric: [
      /gasto|gast|despesa|receita|renda|salário|saldo|balanço/i,
      /categoria|categoria de|por categoria/i,
      /cartão|conta|banco|conta corrente|poupança/i,
    ],
    user: [
      /bruno|giovanna|eu|você|meu|dele|dela|minha|seu|dele/i,
      /responsável|pessoa|quem/i,
    ],
    amount: [
      /r\$? ?([\d.,]+)/i,
      /quanto custa|valor de/i,
    ],
  };

  /**
   * Detecta a intenção do usuário na pergunta
   */
  detectIntent(question: string): IntentResult {
    const normalized = question.toLowerCase().trim();
    let bestIntent = IntentType.QUERY;
    let bestConfidence = 0;

    // Avaliar cada intenção contra os padrões
    for (const [intent, patterns] of Object.entries(this.intentPatterns)) {
      let matchCount = 0;
      for (const pattern of patterns) {
        if (pattern.test(normalized)) {
          matchCount++;
        }
      }

      // Calcular confiança baseada em matches
      const confidence = matchCount > 0 ? (matchCount / patterns.length) * 100 : 0;

      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestIntent = intent as IntentType;
      }
    }

    // Se nenhuma intenção foi detectada com confiança, assumir QUERY
    if (bestConfidence === 0) {
      bestConfidence = 50;
      bestIntent = IntentType.QUERY;
    }

    // Extrair entidades
    const entities = this.extractEntities(normalized);

    return {
      intent: bestIntent,
      confidence: Math.min(bestConfidence, 100),
      entities,
      period: entities.period?.[0],
      metric: entities.metric?.[0],
      user: entities.user?.[0],
    };
  }

  /**
   * Extrai entidades (período, métrica, usuário, etc) da pergunta
   */
  private extractEntities(
    question: string,
  ): Record<string, string | string[]> {
    const entities: Record<string, string | string[]> = {};

    for (const [entityType, patterns] of Object.entries(this.entityPatterns)) {
      const matches: string[] = [];

      for (const pattern of patterns) {
        const match = question.match(pattern);
        if (match) {
          matches.push(match[0]);
        }
      }

      if (matches.length > 0) {
        entities[entityType] = matches.length === 1 ? matches[0] : matches;
      }
    }

    return entities;
  }

  /**
   * Sugere perguntas relacionadas baseado na questão atual
   */
  generateFollowUpSuggestions(
    question: string,
    intent: IntentType,
  ): string[] {
    const suggestions: string[] = [];

    switch (intent) {
      case IntentType.QUERY:
        suggestions.push(
          'Quanto gastei nesta categoria este mês?',
          'Como isso se compara ao mês passado?',
          'Qual foi minha maior despesa?',
        );
        break;

      case IntentType.COMPARISON:
        suggestions.push(
          'Qual a tendência ao longo dos meses?',
          'Como isso impacta nosso orçamento?',
          'Algum padrão interessante?',
        );
        break;

      case IntentType.RECOMMENDATION:
        suggestions.push(
          'Quanto posso economizar?',
          'Qual é o tempo para implementar?',
          'Como isso afeta meu fluxo de caixa?',
        );
        break;

      case IntentType.PREDICTION:
        suggestions.push(
          'Qual o intervalo de confiança?',
          'Quais são os riscos?',
          'Quando será o saldo mínimo?',
        );
        break;

      case IntentType.ACTION:
        suggestions.push(
          'Deseja confirmar esta ação?',
          'Há algum conflito com transações existentes?',
        );
        break;
    }

    return suggestions.slice(0, 3);
  }
}
