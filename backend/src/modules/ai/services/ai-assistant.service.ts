import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { AiMessage } from '../entities/ai-message.entity';
import { IntentDetectorService, IntentResult } from './intent-detector.service';
import {
  SendChatMessageDto,
  ChatMessageResponseDto,
  ListChatHistoryDto,
  ChatSuggestionsDto,
  IntentType,
} from '../dtos/ai-assistant.dto';
import { FinancialDataService } from '../../financial-data/financial-data.service';
import { PeriodRange } from '../../financial-data/financial-data.types';

const MESES_PT = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

/** Responsáveis reconhecidos nas perguntas (a casa é do Bruno e da Giovanna). */
const RESPONSAVEIS_CONHECIDOS = ['bruno', 'giovanna'];

/**
 * Categorias padrão do projeto. Servem para reconhecer a categoria citada na
 * pergunta MESMO quando ela não tem lançamentos no período — assim a resposta
 * pode dizer "ainda não há lançamentos de Alimentação" em vez de ignorar o
 * termo.
 */
const CATEGORIAS_PADRAO = [
  'Moradia',
  'Alimentação',
  'Supermercado',
  'Transporte',
  'Combustível',
  'Saúde',
  'Educação',
  'Lazer',
  'Compras',
  'Assinaturas',
  'Viagem',
  'Pets',
  'Impostos',
  'Seguros',
  'Investimentos',
  'Dívidas',
  'Outros',
];

/** Tipos de pergunta que o assistente sabe responder com dados reais. */
type TipoDePergunta =
  | 'MAIOR_DESPESA'
  | 'RESPONSAVEL'
  | 'COMPARACAO_MENSAL'
  | 'DISPONIVEL_ATE_FIM_DO_MES'
  | 'SALDO'
  | 'RANKING_CATEGORIAS'
  | 'CATEGORIA'
  | 'RECEITAS'
  | 'REDUZIR_GASTOS'
  | 'CONTAS_A_PAGAR'
  | 'CARTOES'
  | 'INVESTIMENTOS'
  | 'PRECISA_ESCLARECER'
  | 'FORA_DE_ESCOPO'
  | 'RESUMO';

/** Resposta montada a partir dos dados, antes de virar `AiMessage`. */
interface RespostaGerada {
  answer: string;
  /** Fontes REALMENTE consultadas: 'expenses', 'incomes', 'accounts'… */
  sources: string[];
  followUpQuestions: string[];
  /**
   * Quando `true`, a "resposta" é na verdade uma PERGUNTA de volta.
   *
   * Existe para o caso em que os dados não bastam para concluir nada: em vez de
   * devolver um número genérico ou um "não sei", o assistente pede exatamente o
   * que falta. Um palpite apresentado como resposta é pior do que uma pergunta.
   */
  needsClarification?: boolean;
}

/**
 * Service do AI Assistant — chat sobre as finanças da casa.
 *
 * O assistente NÃO conversa com um LLM e não devolve textos genéricos: o
 * `IntentDetectorService` roteia a pergunta e o `FinancialDataService` busca os
 * números. Cada resposta é uma frase em português citando valores reais em
 * formato brasileiro (R$ 0.000,00) e datas DD/MM/YYYY.
 *
 * Regra 27 do projeto: quando não existem lançamentos que respondam à pergunta,
 * a resposta diz isso com todas as letras ("Ainda não há lançamentos de
 * Alimentação em agosto/2026") em vez de devolver um número. Nenhum valor é
 * estimado, arredondado por conveniência ou sorteado.
 */
@Injectable()
export class AiAssistantService {
  private readonly logger = new Logger(AiAssistantService.name);

  constructor(
    @InjectRepository(AiMessage)
    private aiMessageRepository: Repository<AiMessage>,
    private intentDetectorService: IntentDetectorService,
    private readonly financialData: FinancialDataService,
  ) {}

  /**
   * Processa a pergunta do usuário e responde com os dados reais da família.
   */
  async processUserQuestion(
    userId: string,
    familyId: string,
    dto: SendChatMessageDto,
  ): Promise<ChatMessageResponseDto> {
    const inicio = Date.now();

    // O detector classifica a intenção e extrai entidades (período, métrica,
    // responsável); é ele quem orienta o roteamento e fornece a confiança.
    const intentResult = this.intentDetectorService.detectIntent(dto.question);

    const resposta = await this.responder(familyId, dto.question, intentResult);

    // Sugestões do detector servem de reserva quando a rota não produz
    // follow-ups específicos do contexto.
    const followUpQuestions =
      resposta.followUpQuestions.length > 0
        ? resposta.followUpQuestions
        : this.intentDetectorService.generateFollowUpSuggestions(
            dto.question,
            intentResult.intent,
          );

    const message = this.aiMessageRepository.create({
      userId,
      familyId,
      question: dto.question,
      answer: resposta.answer,
      intent: intentResult.intent,
      confidence: intentResult.confidence,
      // As fontes descrevem o que foi realmente consultado para responder;
      // as informadas no DTO entram apenas como complemento do cliente.
      sources: this.unir(resposta.sources, dto.sources ?? []),
      followUpQuestions,
      metadata: {
        entities: intentResult.entities,
        processingTime: Date.now() - inicio,
        // Não há LLM neste fluxo: as respostas saem de regras sobre os
        // lançamentos reais.
        model: 'motor-de-dados-financeiros',
        dataSources: resposta.sources,
      },
    });

    const savedMessage = await this.aiMessageRepository.save(message);

    return {
      answer: savedMessage.answer,
      // Sinaliza ao cliente que a "resposta" é uma pergunta de volta, para que
      // a tela possa destacá-la em vez de tratá-la como conclusão.
      needsClarification: resposta.needsClarification ?? false,
      intent: (savedMessage.intent || 'QUERY') as any,
      confidence: savedMessage.confidence ?? 0.5,
      followUpQuestions: savedMessage.followUpQuestions ?? [],
      sources: savedMessage.sources ?? [],
      timestamp: savedMessage.createdAt,
    };
  }

  /**
   * Obtém histórico de chat do usuário
   */
  async getChatHistory(
    userId: string,
    familyId: string,
    options: { limit: number; offset: number },
  ): Promise<ListChatHistoryDto> {
    const [messages, total] = await this.aiMessageRepository.findAndCount({
      where: {
        userId,
        familyId,
      },
      order: {
        createdAt: 'DESC',
      },
      take: options.limit,
      skip: options.offset,
    });

    return {
      messages: messages.map((m) => ({
        id: m.id,
        question: m.question,
        answer: m.answer,
        intent: (m.intent || 'QUERY') as any,
        createdAt: m.createdAt,
      })),
      total,
      limit: options.limit,
      offset: options.offset,
    };
  }

  /**
   * Gera sugestões de perguntas baseado no contexto atual
   */
  async getSuggestions(userId: string, familyId: string): Promise<ChatSuggestionsDto> {
    // Análise recente para contextualizar sugestões
    const recentMessages = await this.aiMessageRepository.find({
      where: {
        userId,
        familyId,
        deletedAt: IsNull(),
      },
      order: {
        createdAt: 'DESC',
      },
      take: 5,
    });

    // Sugestões padrão baseadas em intenções comuns
    const baseSuggestions = [
      'Quanto gastei com alimentação este mês?',
      'Qual é o meu saldo projetado para o final do mês?',
      'Quais são minhas maiores despesas?',
      'Há alguma anomalia nas minhas transações?',
      'Quanto posso economizar?',
      'Qual o melhor dia para fazer uma compra?',
      'Como está minha progressão nas metas?',
      'Qual é a comparação Bruno vs Giovanna?',
    ];

    // Se há histórico, personalizar sugestões
    if (recentMessages.length > 0) {
      const lastIntents = recentMessages.map((m) => m.intent);
      const uniqueIntents = [...new Set(lastIntents)];

      // Oferecer sugestões complementares
      if (uniqueIntents.includes('QUERY')) {
        baseSuggestions.unshift('Como isso se compara ao mês anterior?');
      }
      if (uniqueIntents.includes('PREDICTION')) {
        baseSuggestions.unshift('Qual é o intervalo de confiança dessa previsão?');
      }
    }

    return {
      suggestions: baseSuggestions.slice(0, 8),
    };
  }

  /**
   * Deleta uma mensagem específica do histórico
   */
  async deleteMessage(userId: string, familyId: string, messageId: string): Promise<void> {
    await this.aiMessageRepository.update(
      {
        id: messageId,
        userId,
        familyId,
      },
      {
        deletedAt: new Date(),
      },
    );
  }

  /**
   * Limpa todo o histórico de chat do usuário
   */
  async clearChatHistory(userId: string, familyId: string): Promise<void> {
    await this.aiMessageRepository.update(
      {
        userId,
        familyId,
        deletedAt: IsNull(),
      },
      {
        deletedAt: new Date(),
      },
    );
  }

  // ==================== roteamento ====================

  /**
   * Escolhe a rota da pergunta e monta a resposta com os dados reais.
   */
  private async responder(
    familyId: string,
    question: string,
    intentResult: IntentResult,
  ): Promise<RespostaGerada> {
    const texto = this.normalizar(question);
    const periodo = this.detectarPeriodo(texto);
    const range = this.financialData.getPeriodRange(periodo);
    const rotulo = this.rotuloDoPeriodo(periodo, range);

    const tipo = this.classificar(texto, intentResult);

    if (tipo === 'RESUMO') {
      // Ajuda a mapear as perguntas que ainda não têm rota própria.
      this.logger.debug(
        `Pergunta sem rota específica (intenção ${intentResult.intent}): "${question}"`,
      );
    }

    switch (tipo) {
      case 'MAIOR_DESPESA':
        return this.responderMaiorDespesa(familyId, range, rotulo);

      case 'RESPONSAVEL':
        return this.responderPorResponsavel(familyId, texto, range, rotulo);

      case 'COMPARACAO_MENSAL':
        return this.responderComparacaoMensal(familyId);

      case 'DISPONIVEL_ATE_FIM_DO_MES':
        return this.responderDisponivelAteFimDoMes(familyId);

      case 'SALDO':
        return this.responderSaldo(familyId);

      case 'RANKING_CATEGORIAS':
        return this.responderRankingCategorias(familyId, range, rotulo);

      case 'CATEGORIA':
        return this.responderCategoria(familyId, texto, range, rotulo);

      case 'RECEITAS':
        return this.responderReceitas(familyId, range, rotulo);

      case 'REDUZIR_GASTOS':
        return this.responderOndeReduzir(familyId, range, rotulo);

      case 'CONTAS_A_PAGAR':
        return this.responderContasAPagar(familyId, texto);

      case 'CARTOES':
        return this.responderCartoes(familyId);

      case 'INVESTIMENTOS':
        return this.responderInvestimentos(familyId);

      case 'PRECISA_ESCLARECER':
        return this.pedirEsclarecimento(texto);

      case 'FORA_DE_ESCOPO':
        return this.responderForaDeEscopo();

      default:
        return this.responderResumo(familyId, range, rotulo);
    }
  }

  /**
   * Classificação da pergunta: parte da intenção detectada e afina com as
   * palavras da própria pergunta (a intenção sozinha não distingue
   * "maior despesa" de "quanto gastei com mercado").
   */
  private classificar(
    texto: string,
    intentResult: IntentResult,
  ): TipoDePergunta {
    // Vencimentos, cartões e investimentos passaram a ser lidos: eram
    // classificados como fora de escopo mesmo com os dados existindo no
    // sistema, e o assistente respondia "não sei" sobre a própria base.
    if (
      /vence|vencimento|conta a pagar|contas a pagar|contas do mes|a pagar|boleto/.test(
        texto,
      )
    ) {
      return 'CONTAS_A_PAGAR';
    }

    if (/cartao|cartoes|fatura|limite/.test(texto)) {
      return 'CARTOES';
    }

    if (
      /investi|aplicac|aplicad|poupanca|caixinha|meta |metas|rendiment|rendeu|cdb|tesouro|acoes|patrimonio/.test(
        texto,
      )
    ) {
      return 'INVESTIMENTOS';
    }

    if (
      /maior (despesa|gasto|compra)|despesa mais cara|gasto mais alto/.test(
        texto,
      ) &&
      !/categoria/.test(texto)
    ) {
      return 'MAIOR_DESPESA';
    }

    // Perguntas que citam Bruno ou Giovanna são sempre por responsável — mesmo
    // quando comparam os dois entre si.
    if (RESPONSAVEIS_CONHECIDOS.some((nome) => texto.includes(nome))) {
      return 'RESPONSAVEL';
    }

    // Citar "mês passado" não basta: "quanto gastei com alimentação no mês
    // passado" é uma consulta de categoria, não uma comparação. É preciso um
    // marcador comparativo explícito ou a intenção COMPARISON.
    if (
      /compar|versus|\bvs\b|mais que|menos que|do que no mes|a mais que|a menos que/.test(
        texto,
      ) ||
      (intentResult.intent === IntentType.COMPARISON &&
        /gast|despesa|receita/.test(texto))
    ) {
      return 'COMPARACAO_MENSAL';
    }

    if (
      /quanto posso gastar|posso gastar|sobra|ate o fim do mes|ate o final do mes|no fim do mes|no final do mes|resto do mes/.test(
        texto,
      )
    ) {
      return 'DISPONIVEL_ATE_FIM_DO_MES';
    }

    if (/saldo|quanto tenho|quanto sobrou na conta/.test(texto)) {
      return 'SALDO';
    }

    if (
      /maiores categorias|principais categorias|por categoria|ranking|onde mais gast|maiores despesas|maiores gastos/.test(
        texto,
      )
    ) {
      return 'RANKING_CATEGORIAS';
    }

    if (/reduzir|cortar|economizar|poupar/.test(texto)) {
      return 'REDUZIR_GASTOS';
    }

    if (/recebi|receita|salario|entrou|ganhei/.test(texto)) {
      return 'RECEITAS';
    }

    // Pedir recomendação de compra SEM dizer o valor não tem resposta honesta:
    // o mesmo dia é seguro para R$ 200 e arriscado para R$ 3.000. Em vez de
    // escolher um valor por conta própria, o assistente pergunta.
    if (
      /melhor dia|posso comprar|vale a pena comprar/.test(texto) &&
      !/r\$|\d{3,}/.test(texto)
    ) {
      return 'PRECISA_ESCLARECER';
    }

    if (/gast|despesa|compr/.test(texto)) {
      return 'CATEGORIA';
    }

    // Pergunta curta demais para ser roteada: perguntar de volta é melhor do
    // que despejar um resumo que ninguém pediu.
    if (texto.trim().split(/\s+/).length <= 2) {
      return 'PRECISA_ESCLARECER';
    }

    return 'RESUMO';
  }

  // ==================== respostas com dados reais ====================

  /**
   * "Quanto gastei com <categoria>?" — total real da categoria no período.
   * Sem a categoria na pergunta, responde o total de despesas do período.
   */
  private async responderCategoria(
    familyId: string,
    texto: string,
    range: PeriodRange,
    rotulo: string,
  ): Promise<RespostaGerada> {
    const categorias = await this.financialData.getExpensesByCategory(
      familyId,
      range,
    );

    const alvo = this.detectarCategoria(
      texto,
      categorias.map((c) => c.category),
    );

    // Nenhuma categoria citada: responde o total do período.
    if (!alvo) {
      const total = categorias.reduce((soma, c) => soma + c.total, 0);
      const lancamentos = categorias.reduce((soma, c) => soma + c.count, 0);

      if (lancamentos === 0) {
        return {
          answer: `Ainda não há despesas lançadas em ${rotulo}.`,
          sources: ['expenses'],
          followUpQuestions: [
            'Quanto recebi este mês?',
            'Qual é o meu saldo atual?',
          ],
        };
      }

      return {
        answer:
          `Em ${rotulo} a casa gastou ${this.formatarMoeda(total)} em ${lancamentos} lançamento(s), ` +
          `distribuídos em ${categorias.length} categoria(s).`,
        sources: ['expenses'],
        followUpQuestions: [
          'Quais são minhas maiores categorias?',
          'Qual foi minha maior despesa?',
          'Estou gastando mais que no mês passado?',
        ],
      };
    }

    const encontrada = categorias.find(
      (c) => this.normalizar(c.category) === this.normalizar(alvo),
    );

    // Regra 27: categoria reconhecida mas sem lançamentos — diz isso, não
    // devolve zero disfarçado de resposta.
    if (!encontrada) {
      return {
        answer: `Ainda não há lançamentos de ${alvo} em ${rotulo}.`,
        sources: ['expenses'],
        followUpQuestions: [
          'Quais são minhas maiores categorias?',
          `Quanto gastei com ${alvo} no mês passado?`,
        ],
      };
    }

    return {
      answer:
        `Em ${rotulo} você gastou ${this.formatarMoeda(encontrada.total)} com ${encontrada.category}, ` +
        `em ${encontrada.count} lançamento(s) — média de ${this.formatarMoeda(encontrada.average)} por lançamento ` +
        `e ${this.formatarNumero(encontrada.share * 100)}% de todas as despesas do período.`,
      sources: ['expenses'],
      followUpQuestions: [
        `Qual foi a maior despesa de ${encontrada.category}?`,
        'Estou gastando mais que no mês passado?',
        'Quais são minhas maiores categorias?',
      ],
    };
  }

  /** "Qual foi minha maior despesa?" — o lançamento real de maior valor. */
  private async responderMaiorDespesa(
    familyId: string,
    range: PeriodRange,
    rotulo: string,
  ): Promise<RespostaGerada> {
    const despesas = await this.financialData.getExpenses(familyId, range);

    if (despesas.length === 0) {
      return {
        answer: `Ainda não há despesas lançadas em ${rotulo}.`,
        sources: ['expenses'],
        followUpQuestions: ['Qual é o meu saldo atual?'],
      };
    }

    const maior = despesas.reduce((atual, despesa) =>
      Number(despesa.amount) > Number(atual.amount) ? despesa : atual,
    );

    const estabelecimento = maior.establishment
      ? ` em ${maior.establishment}`
      : '';

    return {
      answer:
        `Sua maior despesa de ${rotulo} foi ${this.formatarMoeda(Number(maior.amount))} ` +
        `em ${this.formatarData(maior.date)}: ${maior.description}${estabelecimento}, ` +
        `categoria ${maior.category}, responsável ${this.capitalizar(maior.responsible)}.`,
      sources: ['expenses'],
      followUpQuestions: [
        `Quanto gastei com ${maior.category} este mês?`,
        'Quais são minhas maiores categorias?',
      ],
    };
  }

  /**
   * "Quanto o Bruno gastou?" — total real por responsável. Com os dois nomes
   * na pergunta, devolve a comparação entre eles.
   */
  private async responderPorResponsavel(
    familyId: string,
    texto: string,
    range: PeriodRange,
    rotulo: string,
  ): Promise<RespostaGerada> {
    const responsaveis = await this.financialData.getExpensesByResponsible(
      familyId,
      range,
    );

    const citados = RESPONSAVEIS_CONHECIDOS.filter((nome) =>
      texto.includes(nome),
    );

    const followUp = [
      'Quais são minhas maiores categorias?',
      'Estou gastando mais que no mês passado?',
    ];

    if (responsaveis.length === 0) {
      return {
        answer: `Ainda não há despesas lançadas em ${rotulo} para comparar por responsável.`,
        sources: ['expenses'],
        followUpQuestions: followUp,
      };
    }

    const buscar = (nome: string) =>
      responsaveis.find((r) => this.normalizar(r.responsible) === nome);

    // Comparação entre os dois responsáveis citados.
    if (citados.length >= 2) {
      const primeiro = buscar(citados[0]);
      const segundo = buscar(citados[1]);

      if (!primeiro || !segundo) {
        const ausente = !primeiro ? citados[0] : citados[1];
        return {
          answer:
            `Ainda não há despesas lançadas para ${this.capitalizar(ausente)} em ${rotulo}, ` +
            `então não é possível comparar os dois responsáveis no período.`,
          sources: ['expenses'],
          followUpQuestions: followUp,
        };
      }

      const diferenca = Math.abs(primeiro.total - segundo.total);
      const maior = primeiro.total >= segundo.total ? primeiro : segundo;
      const menor = primeiro.total >= segundo.total ? segundo : primeiro;

      return {
        answer:
          `Em ${rotulo}, ${this.capitalizar(maior.responsible)} gastou ${this.formatarMoeda(maior.total)} ` +
          `(${this.formatarNumero(maior.share * 100)}% do total, ${maior.count} lançamento(s)) e ` +
          `${this.capitalizar(menor.responsible)} gastou ${this.formatarMoeda(menor.total)} ` +
          `(${this.formatarNumero(menor.share * 100)}%, ${menor.count} lançamento(s)) — ` +
          `diferença de ${this.formatarMoeda(diferenca)}.`,
        sources: ['expenses'],
        followUpQuestions: followUp,
      };
    }

    const alvo = citados[0];
    const encontrado = buscar(alvo);

    if (!encontrado) {
      return {
        answer: `Ainda não há despesas lançadas para ${this.capitalizar(alvo)} em ${rotulo}.`,
        sources: ['expenses'],
        followUpQuestions: followUp,
      };
    }

    return {
      answer:
        `Em ${rotulo}, ${this.capitalizar(encontrado.responsible)} gastou ` +
        `${this.formatarMoeda(encontrado.total)} em ${encontrado.count} lançamento(s) — ` +
        `${this.formatarNumero(encontrado.share * 100)}% das despesas da casa no período.`,
      sources: ['expenses'],
      followUpQuestions: followUp,
    };
  }

  /** "Qual meu saldo?" — saldo consolidado das contas + resultado do mês. */
  private async responderSaldo(familyId: string): Promise<RespostaGerada> {
    const range = this.financialData.getPeriodRange('THIS_MONTH');
    const rotulo = this.rotuloMes(range.start);

    const [saldo, resumo] = await Promise.all([
      this.financialData.getCurrentBalance(familyId),
      this.financialData.getSummary(familyId, range),
    ]);

    const followUp = [
      'Quanto posso gastar até o fim do mês?',
      'Quais são minhas maiores categorias?',
    ];

    if (resumo.expenseCount === 0 && resumo.incomeCount === 0) {
      return {
        answer:
          `O saldo consolidado das contas da família é ${this.formatarMoeda(saldo)}. ` +
          `Ainda não há lançamentos em ${rotulo}, então não há movimento do mês a considerar.`,
        sources: ['accounts'],
        followUpQuestions: followUp,
      };
    }

    const resultado =
      resumo.balance >= 0
        ? `sobra de ${this.formatarMoeda(resumo.balance)}`
        : `déficit de ${this.formatarMoeda(Math.abs(resumo.balance))}`;

    return {
      answer:
        `O saldo consolidado das contas da família é ${this.formatarMoeda(saldo)}. ` +
        `Em ${rotulo} entraram ${this.formatarMoeda(resumo.totalIncomes)} ` +
        `(${resumo.incomeCount} receita(s)) e saíram ${this.formatarMoeda(resumo.totalExpenses)} ` +
        `(${resumo.expenseCount} despesa(s)), resultando em ${resultado} no mês.`,
      sources: ['accounts', 'expenses', 'incomes'],
      followUpQuestions: followUp,
    };
  }

  /**
   * "Quanto posso gastar até o fim do mês?" — saldo real menos a projeção dos
   * dias restantes pela média diária REAL do mês. A resposta mostra a base do
   * cálculo, como manda a regra 27.
   */
  private async responderDisponivelAteFimDoMes(
    familyId: string,
  ): Promise<RespostaGerada> {
    const range = this.financialData.getPeriodRange('THIS_MONTH');
    const rotulo = this.rotuloMes(range.start);

    const [saldo, resumo] = await Promise.all([
      this.financialData.getCurrentBalance(familyId),
      this.financialData.getSummary(familyId, range),
    ]);

    const hoje = new Date();
    const ultimoDia = new Date(
      hoje.getFullYear(),
      hoje.getMonth() + 1,
      0,
    ).getDate();
    const diasRestantes = Math.max(0, ultimoDia - hoje.getDate());

    if (resumo.expenseCount === 0) {
      return {
        answer:
          `Ainda não há despesas lançadas em ${rotulo}, então não existe média diária para projetar ` +
          `o restante do mês. O saldo consolidado das contas hoje é ${this.formatarMoeda(saldo)}.`,
        sources: ['accounts', 'expenses'],
        followUpQuestions: ['Qual é o meu saldo atual?'],
      };
    }

    const gastoProjetado = resumo.averageDailyExpense * diasRestantes;
    const disponivel = saldo - gastoProjetado;

    const conclusao =
      disponivel >= 0
        ? `Mantido esse ritmo, devem sobrar ${this.formatarMoeda(disponivel)} no fim do mês.`
        : `Mantido esse ritmo, o saldo ficaria negativo em ${this.formatarMoeda(Math.abs(disponivel))} no fim do mês.`;

    return {
      answer:
        `Faltam ${diasRestantes} dia(s) para o fim de ${rotulo}. Com saldo atual de ` +
        `${this.formatarMoeda(saldo)} e média diária de ${this.formatarMoeda(resumo.averageDailyExpense)} ` +
        `(base: ${resumo.expenseCount} lançamento(s) do mês, somando ${this.formatarMoeda(resumo.totalExpenses)}), ` +
        `a projeção é gastar mais ${this.formatarMoeda(gastoProjetado)} até o dia ${ultimoDia}. ${conclusao}`,
      sources: ['accounts', 'expenses'],
      followUpQuestions: [
        'Quais são minhas maiores categorias?',
        'Estou gastando mais que no mês passado?',
      ],
    };
  }

  /** "Estou gastando mais que no mês passado?" — comparação real mês a mês. */
  private async responderComparacaoMensal(
    familyId: string,
  ): Promise<RespostaGerada> {
    const rangeAtual = this.financialData.getPeriodRange('THIS_MONTH');
    const rangeAnterior = this.financialData.getPeriodRange('LAST_MONTH');

    const [atual, anterior] = await Promise.all([
      this.financialData.getSummary(familyId, rangeAtual),
      this.financialData.getSummary(familyId, rangeAnterior),
    ]);

    const rotuloAtual = this.rotuloMes(rangeAtual.start);
    const rotuloAnterior = this.rotuloMes(rangeAnterior.start);

    const followUp = [
      'Quais são minhas maiores categorias?',
      'Qual foi minha maior despesa?',
    ];

    if (anterior.totalExpenses <= 0) {
      return {
        answer:
          `Ainda não há despesas lançadas em ${rotuloAnterior} para servir de comparação. ` +
          `Em ${rotuloAtual} a casa gastou ${this.formatarMoeda(atual.totalExpenses)} ` +
          `em ${atual.expenseCount} lançamento(s).`,
        sources: ['expenses'],
        followUpQuestions: followUp,
      };
    }

    const diferenca = atual.totalExpenses - anterior.totalExpenses;
    const variacao = (diferenca / anterior.totalExpenses) * 100;

    const direcao =
      diferenca > 0
        ? `${this.formatarNumero(variacao)}% a mais`
        : diferenca < 0
          ? `${this.formatarNumero(Math.abs(variacao))}% a menos`
          : 'exatamente o mesmo valor';

    return {
      answer:
        `Em ${rotuloAtual} a casa gastou ${this.formatarMoeda(atual.totalExpenses)}, ${direcao} ` +
        `que em ${rotuloAnterior} (${this.formatarMoeda(anterior.totalExpenses)}) — ` +
        `diferença de ${this.formatarMoeda(Math.abs(diferenca))}. ` +
        `A média diária passou de ${this.formatarMoeda(anterior.averageDailyExpense)} ` +
        `para ${this.formatarMoeda(atual.averageDailyExpense)}.`,
      sources: ['expenses'],
      followUpQuestions: followUp,
    };
  }

  /** "Quais minhas maiores categorias?" — ranking real do período. */
  private async responderRankingCategorias(
    familyId: string,
    range: PeriodRange,
    rotulo: string,
  ): Promise<RespostaGerada> {
    const categorias = await this.financialData.getExpensesByCategory(
      familyId,
      range,
    );

    if (categorias.length === 0) {
      return {
        answer: `Ainda não há despesas lançadas em ${rotulo} para montar um ranking de categorias.`,
        sources: ['expenses'],
        followUpQuestions: ['Qual é o meu saldo atual?'],
      };
    }

    const top = categorias.slice(0, 5);
    const lista = top
      .map(
        (c, indice) =>
          `${indice + 1}. ${c.category}: ${this.formatarMoeda(c.total)} ` +
          `(${this.formatarNumero(c.share * 100)}%, ${c.count} lançamento(s))`,
      )
      .join('; ');

    return {
      answer:
        `Maiores categorias de ${rotulo} — ${lista}. ` +
        `${top[0].category} lidera com ${this.formatarNumero(top[0].share * 100)}% das despesas do período.`,
      sources: ['expenses'],
      followUpQuestions: [
        `Quanto gastei com ${top[0].category} este mês?`,
        'Qual foi minha maior despesa?',
        'Estou gastando mais que no mês passado?',
      ],
    };
  }

  /** "Quanto recebi?" — receitas reais do período. */
  private async responderReceitas(
    familyId: string,
    range: PeriodRange,
    rotulo: string,
  ): Promise<RespostaGerada> {
    const receitas = await this.financialData.getIncomes(familyId, range);

    if (receitas.length === 0) {
      return {
        answer: `Ainda não há receitas lançadas em ${rotulo}.`,
        sources: ['incomes'],
        followUpQuestions: ['Qual é o meu saldo atual?'],
      };
    }

    const total = receitas.reduce(
      (soma, receita) => soma + (Number(receita.amount) || 0),
      0,
    );
    const maior = receitas.reduce((atual, receita) =>
      Number(receita.amount) > Number(atual.amount) ? receita : atual,
    );

    return {
      answer:
        `Em ${rotulo} a casa recebeu ${this.formatarMoeda(total)} em ${receitas.length} lançamento(s). ` +
        `A maior entrada foi ${this.formatarMoeda(Number(maior.amount))} em ${this.formatarData(maior.date)}: ` +
        `${maior.description} (${this.capitalizar(maior.responsible)}).`,
      sources: ['incomes'],
      followUpQuestions: [
        'Qual é o meu saldo atual?',
        'Quanto posso gastar até o fim do mês?',
      ],
    };
  }

  /**
   * "Quais gastos posso reduzir?" — aponta a maior categoria real e as
   * cobranças recorrentes efetivamente encontradas, sempre com a base.
   */
  private async responderOndeReduzir(
    familyId: string,
    range: PeriodRange,
    rotulo: string,
  ): Promise<RespostaGerada> {
    const [categorias, recorrentes] = await Promise.all([
      this.financialData.getExpensesByCategory(familyId, range),
      this.financialData.getRecurringExpenses(familyId, 6),
    ]);

    if (categorias.length === 0) {
      return {
        answer:
          `Ainda não há despesas lançadas em ${rotulo}, então não há como apontar onde reduzir.`,
        sources: ['expenses'],
        followUpQuestions: ['Qual é o meu saldo atual?'],
      };
    }

    const maior = categorias[0];
    let resposta =
      `A maior categoria de ${rotulo} é ${maior.category}, com ${this.formatarMoeda(maior.total)} ` +
      `em ${maior.count} lançamento(s) — ${this.formatarNumero(maior.share * 100)}% das despesas do período. ` +
      `É onde cada corte tem maior efeito.`;

    if (recorrentes.length > 0) {
      const assinatura = recorrentes[0];
      resposta +=
        ` Entre as cobranças recorrentes, ${assinatura.description} se repete há ` +
        `${assinatura.occurrences} vez(es) com valor médio de ` +
        `${this.formatarMoeda(assinatura.averageAmount)} — ` +
        `${this.formatarMoeda(assinatura.averageAmount * 12)} por ano se mantida.`;
    } else {
      resposta += ' Não foram encontradas cobranças recorrentes nos últimos 6 meses.';
    }

    return {
      answer: resposta,
      sources: ['expenses'],
      followUpQuestions: [
        `Quanto gastei com ${maior.category} este mês?`,
        'Estou gastando mais que no mês passado?',
      ],
    };
  }

  /**
   * Perguntas cuja resposta dependeria de dados que este serviço não lê
   * (contas planejadas, metas). Regra 27: dizer claramente que o dado não está
   * disponível é melhor do que responder por aproximação.
   */
  private responderForaDeEscopo(): RespostaGerada {
    return {
      answer:
        'O assistente responde a partir das receitas, despesas e contas já lançadas. ' +
        'Contas planejadas, vencimentos e metas não entram nesta consulta — acompanhe ' +
        'essas informações nas páginas Planejado e Metas.',
      sources: [],
      // Sem contexto de dados para sugerir: as sugestões vêm do detector.
      followUpQuestions: [],
    };
  }

  /** Resumo real do período, usado quando a pergunta não é reconhecida. */
  private async responderResumo(
    familyId: string,
    range: PeriodRange,
    rotulo: string,
  ): Promise<RespostaGerada> {
    const resumo = await this.financialData.getSummary(familyId, range);

    if (resumo.expenseCount === 0 && resumo.incomeCount === 0) {
      return {
        answer:
          `Ainda não há lançamentos em ${rotulo}. Cadastre ou importe receitas e despesas ` +
          `para que eu possa responder com os números da casa.`,
        sources: ['expenses', 'incomes'],
        followUpQuestions: [
          'Qual é o meu saldo atual?',
          'Quanto gastei com alimentação este mês?',
        ],
      };
    }

    return {
      answer:
        `Em ${rotulo} a casa registrou ${this.formatarMoeda(resumo.totalIncomes)} em receitas ` +
        `(${resumo.incomeCount}) e ${this.formatarMoeda(resumo.totalExpenses)} em despesas ` +
        `(${resumo.expenseCount}), com média diária de ${this.formatarMoeda(resumo.averageDailyExpense)}. ` +
        `Se quiser algo mais específico, cite uma categoria, um responsável ou um período na pergunta.`,
      sources: ['expenses', 'incomes'],
      followUpQuestions: [
        'Quais são minhas maiores categorias?',
        'Qual foi minha maior despesa?',
        'Quanto posso gastar até o fim do mês?',
      ],
    };
  }

  // ==================== interpretação da pergunta ====================

  /** Período citado na pergunta; sem citação, o mês corrente. */
  private detectarPeriodo(texto: string): string {
    if (/mes passado|mes anterior/.test(texto)) return 'LAST_MONTH';
    if (/ultimos 3 meses|ultimo trimestre|trimestre/.test(texto)) {
      return 'LAST_3_MONTHS';
    }
    if (/ultimos 6 meses|ultimo semestre|semestre/.test(texto)) {
      return 'LAST_6_MONTHS';
    }
    if (/ultimos 12 meses|ultimo ano/.test(texto)) return 'LAST_12_MONTHS';
    if (/este ano|neste ano|ano atual/.test(texto)) return 'THIS_YEAR';
    return 'THIS_MONTH';
  }

  /**
   * Categoria citada na pergunta.
   *
   * Procura primeiro entre as categorias que a família realmente usa e depois
   * entre as categorias padrão do sistema — assim uma categoria conhecida sem
   * lançamentos no período ainda é reconhecida e recebe a resposta honesta
   * "ainda não há lançamentos".
   */
  private detectarCategoria(
    texto: string,
    categoriasDaFamilia: string[],
  ): string | null {
    const candidatas = [...categoriasDaFamilia, ...CATEGORIAS_PADRAO];

    for (const categoria of candidatas) {
      const normalizada = this.normalizar(categoria);
      if (normalizada.length >= 4 && texto.includes(normalizada)) {
        return categoria;
      }
    }

    return null;
  }

  /** Rótulo do período: mês por extenso ou intervalo DD/MM/YYYY. */
  private rotuloDoPeriodo(periodo: string, range: PeriodRange): string {
    if (periodo === 'THIS_MONTH' || periodo === 'LAST_MONTH') {
      return this.rotuloMes(range.start);
    }
    return `${this.formatarData(range.start)} a ${this.formatarData(range.end)}`;
  }

  // ==================== utilitários ====================

  /** Remove acentos e caixa alta para comparar textos. */
  private normalizar(texto: string): string {
    return (texto || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  private unir(...listas: string[][]): string[] {
    return [...new Set(listas.flat())];
  }

  /** `agosto/2026` */
  private rotuloMes(data: Date): string {
    return `${MESES_PT[data.getMonth()]}/${data.getFullYear()}`;
  }

  /** DD/MM/YYYY */
  private formatarData(data: Date): string {
    const d = new Date(data);
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    return `${dia}/${mes}/${d.getFullYear()}`;
  }

  /** Formata no padrão brasileiro: R$ 1.250,00 */
  private formatarMoeda(valor: number): string {
    const numero = Number(valor) || 0;
    const negativo = numero < 0;
    const [inteiro, decimal] = Math.abs(numero).toFixed(2).split('.');
    const comSeparador = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${negativo ? '-' : ''}R$ ${comSeparador},${decimal}`;
  }

  /** Formata número com vírgula decimal (padrão brasileiro). */
  private formatarNumero(valor: number, casas = 1): string {
    return (Number(valor) || 0).toFixed(casas).replace('.', ',');
  }

  private capitalizar(texto: string): string {
    if (!texto) return texto;
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }

  /**
   * Contas a pagar: vencidas primeiro, depois as que estão por vencer.
   *
   * O período padrão é 7 dias porque é a pergunta que o usuário costuma fazer
   * ("o que vence esta semana?"); "próximos 30 dias" e afins são reconhecidos
   * no texto.
   */
  private async responderContasAPagar(
    familyId: string,
    texto: string,
  ): Promise<RespostaGerada> {
    const diasPedidos = texto.match(/(\d+)\s*dias/);
    const dias = diasPedidos ? Number(diasPedidos[1]) : /mes/.test(texto) ? 30 : 7;

    const [vencidas, aVencer] = await Promise.all([
      this.financialData.getOverdueBills(familyId),
      this.financialData.getUpcomingBills(familyId, dias),
    ]);

    if (vencidas.length === 0 && aVencer.length === 0) {
      return {
        answer: `Não há contas a pagar registradas para os próximos ${dias} dias, e nenhuma está vencida. Se você espera alguma, ela ainda não foi cadastrada em Planejado.`,
        sources: ['planned_accounts'],
        followUpQuestions: [
          'Quanto tenho de saldo?',
          'Quais são meus investimentos?',
        ],
      };
    }

    const partes: string[] = [];

    if (vencidas.length > 0) {
      const total = vencidas.reduce((soma, c) => soma + Number(c.amount), 0);
      const lista = vencidas
        .slice(0, 3)
        .map(
          (c) =>
            `${c.description} (${this.formatarMoeda(Number(c.amount))}, venceu em ${this.formatarData(c.dueDate)})`,
        )
        .join('; ');

      partes.push(
        `⚠️ ${vencidas.length} conta(s) VENCIDA(S), somando ${this.formatarMoeda(total)}: ${lista}${vencidas.length > 3 ? '…' : ''}.`,
      );
    }

    if (aVencer.length > 0) {
      const total = aVencer.reduce((soma, c) => soma + Number(c.amount), 0);
      const lista = aVencer
        .slice(0, 5)
        .map(
          (c) =>
            `${c.description} — ${this.formatarMoeda(Number(c.amount))} em ${this.formatarData(c.dueDate)}`,
        )
        .join('; ');

      partes.push(
        `Nos próximos ${dias} dias vencem ${aVencer.length} conta(s), somando ${this.formatarMoeda(total)}: ${lista}${aVencer.length > 5 ? '…' : ''}.`,
      );
    }

    // Confronta o compromisso com o saldo: é a informação que transforma a
    // lista numa resposta útil.
    const saldo = await this.financialData.getCurrentBalance(familyId);
    const totalGeral = [...vencidas, ...aVencer].reduce(
      (soma, c) => soma + Number(c.amount),
      0,
    );

    partes.push(
      totalGeral > saldo
        ? `Seu saldo atual é ${this.formatarMoeda(saldo)} — ${this.formatarMoeda(totalGeral - saldo)} a menos do que o total dessas contas.`
        : `Seu saldo atual é ${this.formatarMoeda(saldo)}, suficiente para essas contas.`,
    );

    return {
      answer: partes.join(' '),
      sources: ['planned_accounts', 'accounts'],
      followUpQuestions: [
        'Qual meu saldo projetado para o fim do mês?',
        'Quanto posso gastar até o fim do mês?',
      ],
    };
  }

  /** Limite, fatura e ciclo de cada cartão da casa. */
  private async responderCartoes(familyId: string): Promise<RespostaGerada> {
    const cartoes = await this.financialData.getCreditCards(familyId);

    if (cartoes.length === 0) {
      return {
        answer:
          'Nenhum cartão de crédito está cadastrado. Cadastre um em Cartões para acompanhar limite, fatura e vencimento.',
        sources: ['credit_cards'],
        followUpQuestions: ['Quanto tenho de saldo?'],
      };
    }

    const linhas = cartoes.map(
      (c) =>
        `${c.name}: ${this.formatarMoeda(c.used)} usados de ${this.formatarMoeda(c.limit)} (${this.formatarMoeda(c.available)} disponíveis), fecha dia ${c.closingDay} e vence dia ${c.dueDay}`,
    );

    const totalUsado = cartoes.reduce((soma, c) => soma + c.used, 0);
    const totalLimite = cartoes.reduce((soma, c) => soma + c.limit, 0);

    // O alerta só aparece quando há motivo: um aviso constante vira ruído.
    const apertado = cartoes.filter(
      (c) => c.limit > 0 && c.used / c.limit >= 0.8,
    );

    const alerta =
      apertado.length > 0
        ? ` ⚠️ ${apertado.map((c) => c.name).join(', ')} ${apertado.length === 1 ? 'está' : 'estão'} acima de 80% do limite.`
        : '';

    return {
      answer: `${linhas.join('. ')}. No total, ${this.formatarMoeda(totalUsado)} de ${this.formatarMoeda(totalLimite)} em limite.${alerta}`,
      sources: ['credit_cards', 'expenses'],
      followUpQuestions: [
        'Onde mais gastei este mês?',
        'Quais contas vencem nos próximos 7 dias?',
      ],
    };
  }

  /** Patrimônio investido, aportado e rendimento. */
  private async responderInvestimentos(
    familyId: string,
  ): Promise<RespostaGerada> {
    const investimentos = await this.financialData.getInvestments(familyId);

    if (investimentos.length === 0) {
      return {
        answer:
          'Nenhum investimento está cadastrado. Cadastre suas aplicações e caixinhas em Investimentos para acompanhar rendimento e objetivos.',
        sources: ['goals'],
        followUpQuestions: ['Quanto tenho de saldo?'],
      };
    }

    const atual = investimentos.reduce(
      (soma, i) => soma + Number(i.currentAmount),
      0,
    );
    const aportado = investimentos.reduce(
      (soma, i) => soma + Number(i.investedAmount ?? 0),
      0,
    );
    const rendimento = atual - aportado;

    const maiores = investimentos
      .slice(0, 3)
      .map(
        (i) =>
          `${i.name} (${this.formatarMoeda(Number(i.currentAmount))}${i.institution ? `, ${i.institution}` : ''})`,
      )
      .join('; ');

    const linhaRendimento =
      aportado > 0
        ? ` O rendimento acumulado é ${this.formatarMoeda(rendimento)} (${((rendimento / aportado) * 100).toFixed(2)}% sobre o aportado).`
        : ' Ainda não há aporte registrado para calcular rendimento.';

    return {
      answer:
        `Você tem ${this.formatarMoeda(atual)} investidos em ${investimentos.length} aplicação(ões): ${maiores}${investimentos.length > 3 ? '…' : ''}.` +
        linhaRendimento +
        ' Esse dinheiro está aplicado e não entra como saldo disponível nem como receita.',
      sources: ['goals'],
      followUpQuestions: [
        'Quanto tenho de saldo em conta?',
        'Quanto posso gastar até o fim do mês?',
      ],
    };
  }

  /**
   * Pede a informação que falta, em vez de arriscar uma resposta.
   *
   * A regra 27 do projeto proíbe inventar dado. Mas dizer só "não tenho
   * informação suficiente" deixa o usuário sem saída — a saída é dizer O QUE
   * falta e como conseguir.
   */
  private pedirEsclarecimento(texto: string): RespostaGerada {
    // Compra sem valor: sem saber quanto, não dá para dizer se cabe no caixa.
    if (/melhor dia|posso comprar|vale a pena comprar|comprar/.test(texto)) {
      return {
        answer:
          'Para recomendar o melhor dia preciso saber de quanto é a compra — o mesmo dia pode ser seguro para R$ 200 e arriscado para R$ 3.000. Qual é o valor? Se for no cartão, me diga qual cartão também, porque o ciclo da fatura muda a resposta.',
        sources: [],
        followUpQuestions: [
          'Qual o melhor dia para uma compra de R$ 1.000?',
          'Qual o limite disponível dos meus cartões?',
        ],
        needsClarification: true,
      };
    }

    return {
      answer:
        'Não consegui identificar o que você quer saber a partir dos dados que tenho. Você quer saber sobre gastos de um período, contas a vencer, saldo, cartões ou investimentos? Se puder, diga também o período — "este mês", "últimos 30 dias".',
      sources: [],
      followUpQuestions: [
        'Quanto gastei este mês?',
        'Quais contas vencem nos próximos 7 dias?',
        'Qual meu saldo atual?',
      ],
      needsClarification: true,
    };
  }

}
