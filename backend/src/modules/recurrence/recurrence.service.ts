import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Expense } from '../expenses/entities/expense.entity';
import { Income } from '../income/entities/income.entity';
import { PlannedAccount } from '../planned-accounts/entities/planned-account.entity';

/**
 * O que a série precisa saber da origem, seja ela despesa ou receita.
 *
 * Despesa e receita são tabelas diferentes com campos quase iguais para efeito
 * de projeção. Este formato comum evita duplicar toda a lógica de janela,
 * duplicidade e cancelamento só porque o dinheiro anda para o outro lado.
 */
interface OrigemRecorrente {
  id: string;
  userId: string;
  description: string;
  amount: number;
  date: Date;
  responsible: string;
  isRecurring: boolean;
  recurrenceCancelledAt?: Date;
  frequency?: Frequencia;
  category?: string;
  accountId?: string;
  creditCardId?: string;
  /** Para que lado o dinheiro anda. */
  tipo: 'expense' | 'income';
}

/** Frequências aceitas na recorrência. */
export type Frequencia = 'daily' | 'weekly' | 'monthly' | 'yearly';

/**
 * Quantos meses à frente a série é projetada.
 *
 * "Perpétua" não significa gerar linhas infinitas no banco — significa que a
 * janela nunca encurta. Doze meses é o horizonte que o Fluxo de Caixa e a
 * Previsão já consultam; passar disso encheria a tabela sem ninguém olhar.
 */
const HORIZONTE_MESES = 12;

/**
 * Teto de ocorrências por série.
 *
 * Protege o caso semanal e diário: doze meses de uma despesa diária seriam 365
 * linhas para UMA despesa. Com o teto, a janela do diário fica mais curta em
 * tempo, mas o reabastecimento continua acontecendo a cada consulta.
 */
const TETO_OCORRENCIAS = 24;

/**
 * Mantém viva a série de uma despesa recorrente.
 *
 * REGRA DE NEGÓCIO: uma despesa lançada como recorrente se perpetua até ser
 * cancelada. Ela não some depois do mês seguinte, e o usuário não precisa
 * relançá-la — que era exatamente o trabalho manual que a opção deveria evitar.
 *
 * COMO A PERPETUAÇÃO FUNCIONA NA PRÁTICA
 * --------------------------------------
 * As ocorrências vivem em `planned_accounts`, ligadas à despesa de origem por
 * `recurringExpenseId`. A cada leitura do Planejado a janela é reabastecida:
 * se a série já foi gerada só até dezembro e estamos em março, as ocorrências
 * que faltam até doze meses à frente são criadas na hora.
 *
 * O reabastecimento é feito na LEITURA, e não só por tarefa agendada, de
 * propósito: no plano gratuito do Render o serviço hiberna sem tráfego, e uma
 * rotina noturna simplesmente não roda. Amarrar a perpetuação a um cron seria
 * amarrá-la a algo que não acontece.
 *
 * Este service mora num módulo próprio porque é usado pelos dois lados —
 * Despesas cria a série, Planejado a mantém — e importar um módulo no outro
 * fecharia um ciclo.
 */
@Injectable()
export class RecurrenceService {
  private readonly logger = new Logger(RecurrenceService.name);

  constructor(
    @InjectRepository(Expense)
    private expensesRepository: Repository<Expense>,
    @InjectRepository(Income)
    private incomesRepository: Repository<Income>,
    @InjectRepository(PlannedAccount)
    private plannedAccountsRepository: Repository<PlannedAccount>,
  ) {}

  /** Converte uma despesa no formato comum da série. */
  private daDespesa(expense: Expense): OrigemRecorrente {
    return {
      id: expense.id,
      userId: expense.userId,
      description: expense.description,
      amount: expense.amount,
      date: expense.date,
      responsible: expense.responsible,
      isRecurring: expense.isRecurring,
      recurrenceCancelledAt: expense.recurrenceCancelledAt,
      frequency: expense.frequency as Frequencia | undefined,
      category: expense.category,
      accountId: expense.accountId,
      creditCardId: expense.creditCardId,
      tipo: 'expense',
    };
  }

  /**
   * Converte uma receita no formato comum da série.
   *
   * A categoria vem do `type` da receita (salary, freelance…): é o que a tela
   * do Planejado mostra ao lado da entrada, e sem isso a linha apareceria sem
   * nenhuma indicação de origem.
   */
  private daReceita(income: Income): OrigemRecorrente {
    return {
      id: income.id,
      userId: income.userId,
      description: income.description,
      amount: income.amount,
      date: income.date,
      responsible: income.responsible,
      isRecurring: income.isRecurring,
      recurrenceCancelledAt: income.recurrenceCancelledAt,
      frequency: income.frequency as Frequencia | undefined,
      category: income.type,
      accountId: income.accountId,
      tipo: 'income',
    };
  }

  /**
   * Projeta a série de uma DESPESA recorrente.
   */
  async sincronizarSerie(
    expense: Expense,
    userIdsDaFamilia: string[],
  ): Promise<number> {
    return this.sincronizar(this.daDespesa(expense), userIdsDaFamilia);
  }

  /**
   * Projeta a série de uma RECEITA recorrente.
   *
   * Mesma mecânica da despesa: a diferença é que a ocorrência nasce com
   * `type: 'income'`, e é essa marca que faz o fluxo de caixa SOMAR o salário
   * ao saldo previsto em vez de debitá-lo.
   */
  async sincronizarSerieReceita(
    income: Income,
    userIdsDaFamilia: string[],
  ): Promise<number> {
    return this.sincronizar(this.daReceita(income), userIdsDaFamilia);
  }

  /**
   * Garante que a série está projetada até o horizonte.
   *
   * Idempotente: chamar de novo não duplica nada. Devolve quantas ocorrências
   * foram criadas nesta passagem.
   */
  private async sincronizar(
    origem: OrigemRecorrente,
    userIdsDaFamilia: string[],
  ): Promise<number> {
    if (!origem.isRecurring || origem.recurrenceCancelledAt) {
      return 0;
    }

    const frequencia = origem.frequency ?? 'monthly';
    const limite = this.dataLimite();
    const campoVinculo =
      origem.tipo === 'income' ? 'recurringIncomeId' : 'recurringExpenseId';

    // De onde continuar: da última ocorrência já gerada para esta série, ou da
    // própria data do lançamento quando a série ainda não tem nenhuma.
    const ultima = await this.plannedAccountsRepository
      .createQueryBuilder('planned')
      .where(`planned.${campoVinculo} = :id`, { id: origem.id })
      .orderBy('planned.dueDate', 'DESC')
      .getOne();

    let cursor = new Date(ultima ? ultima.dueDate : origem.date);

    // Descrições e valores podem ter mudado na edição; as ocorrências novas
    // seguem o estado atual.
    const criadas: PlannedAccount[] = [];
    let candidatas = 0;
    let duplicadas = 0;

    for (let i = 0; i < TETO_OCORRENCIAS; i++) {
      cursor = this.proximaOcorrencia(cursor, frequencia);

      if (cursor > limite) break;

      candidatas++;

      const duplicada = await this.jaExisteEquivalente(
        origem,
        cursor,
        userIdsDaFamilia,
      );

      if (duplicada) {
        duplicadas++;
        continue;
      }

      criadas.push(
        this.plannedAccountsRepository.create({
          userId: origem.userId,
          description: origem.description,
          category: origem.category,
          amount: origem.amount,
          dueDate: new Date(cursor),
          responsible: origem.responsible,
          accountId: origem.accountId,
          creditCardId: origem.creditCardId,
          isRecurring: true,
          frequency: frequencia,
          status: 'pending',
          type: origem.tipo,
          [campoVinculo]: origem.id,
          observation:
            origem.tipo === 'income'
              ? 'Projetada a partir de uma receita recorrente'
              : 'Projetada a partir de uma despesa recorrente',
        }),
      );
    }

    if (criadas.length === 0) {
      // Série REDUNDANTE: todo o horizonte já está coberto por outra série da
      // casa. Acontece quando as duas pessoas lançam a mesma assinatura — ou o
      // mesmo salário — e a segunda não deve gerar nada.
      //
      // Sem encerrá-la aqui, ela ficaria adormecida: nenhuma ocorrência
      // própria, mas ativa. Duas consequências ruins, as duas observadas em
      // teste: o reabastecimento tentaria gerá-la de novo a cada leitura do
      // Planejado (trabalho perdido para sempre), e no dia em que a série
      // original fosse cancelada esta reassumiria sozinha, fazendo o lançamento
      // "voltar do nada" depois de o usuário tê-lo cancelado.
      if (candidatas > 0 && duplicadas === candidatas) {
        await this.marcarCancelada(origem);

        this.logger.log(
          `Série ${origem.tipo} ${origem.id} encerrada: a casa já projeta este mesmo compromisso`,
        );
      }

      return 0;
    }

    await this.plannedAccountsRepository.save(criadas);

    // NÃO se liga o lançamento de origem à primeira ocorrência da série.
    //
    // Esse vínculo existia de quando a recorrente gerava UMA conta só, e virou
    // um erro quando ela passou a gerar doze: a despesa de agosto ficava
    // apontando para a ocorrência de SETEMBRO. Marcar a de agosto como paga
    // dava a de setembro por paga junto, e confirmar setembro no Planejado não
    // criava lançamento nenhum, porque o vínculo já parecia satisfeito — o
    // dinheiro sumia do caixa.
    //
    // `plannedAccountId` passa a significar uma coisa só: "esta despesa NASCEU
    // da confirmação daquela conta planejada". Quem o preenche é a
    // materialização, no momento da confirmação.

    this.logger.log(
      `Série ${origem.tipo} ${origem.id}: ${criadas.length} ocorrência(s) projetada(s)`,
    );

    return criadas.length;
  }

  /**
   * Reabastece a janela de TODAS as séries ativas da casa — despesas e receitas.
   *
   * Chamado na leitura do Planejado. O custo normal é de quatro consultas: as
   * séries ativas de cada lado e o vencimento mais distante de cada uma. Só as
   * séries que encurtaram passam pela geração.
   */
  async sincronizarTodas(userIds: string[]): Promise<number> {
    if (userIds.length === 0) return 0;

    const [despesas, receitas] = await Promise.all([
      this.expensesRepository.find({
        where: {
          userId: In(userIds),
          isRecurring: true,
          recurrenceCancelledAt: IsNull(),
        },
      }),
      this.incomesRepository.find({
        where: {
          userId: In(userIds),
          isRecurring: true,
          recurrenceCancelledAt: IsNull(),
        },
      }),
    ]);

    const series: OrigemRecorrente[] = [
      ...despesas.map((d) => this.daDespesa(d)),
      ...receitas.map((r) => this.daReceita(r)),
    ];

    if (series.length === 0) return 0;

    const ultimaPorSerie = new Map<string, Date>();

    // Vencimento mais distante já projetado, por série, num par de consultas.
    for (const [campo, ids] of [
      ['recurringExpenseId', despesas.map((d) => d.id)],
      ['recurringIncomeId', receitas.map((r) => r.id)],
    ] as [string, string[]][]) {
      if (ids.length === 0) continue;

      const limites = await this.plannedAccountsRepository
        .createQueryBuilder('planned')
        .select(`planned.${campo}`, 'serie')
        .addSelect('MAX(planned.dueDate)', 'ultima')
        .where(`planned.${campo} IN (:...ids)`, { ids })
        .groupBy(`planned.${campo}`)
        .getRawMany();

      limites.forEach((l) => ultimaPorSerie.set(l.serie, new Date(l.ultima)));
    }

    // Margem: só regenera quando a janela caiu abaixo de metade do horizonte.
    // Sem isso, toda leitura tentaria criar a ocorrência do mês seguinte.
    const gatilho = this.somarMeses(new Date(), HORIZONTE_MESES / 2);

    let total = 0;

    for (const serie of series) {
      const ultima = ultimaPorSerie.get(serie.id);

      if (ultima && ultima > gatilho) continue;

      total += await this.sincronizar(serie, userIds);
    }

    return total;
  }

  /**
   * Encerra a série: para de projetar e remove o que ainda não venceu.
   *
   * As ocorrências já PAGAS ficam — são histórico do que aconteceu. As pendentes
   * futuras somem, porque deixaram de ser compromisso. O lançamento original
   * também fica: ele é dinheiro que já andou, não uma projeção.
   */
  async cancelarSerie(expense: Expense): Promise<number> {
    return this.cancelar(this.daDespesa(expense));
  }

  /** Encerra a série de uma receita recorrente. */
  async cancelarSerieReceita(income: Income): Promise<number> {
    return this.cancelar(this.daReceita(income));
  }

  private async cancelar(origem: OrigemRecorrente): Promise<number> {
    await this.marcarCancelada(origem);

    const campoVinculo =
      origem.tipo === 'income' ? 'recurringIncomeId' : 'recurringExpenseId';

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const futuras = await this.plannedAccountsRepository
      .createQueryBuilder('planned')
      .where(`planned.${campoVinculo} = :id`, { id: origem.id })
      .andWhere('planned.status = :status', { status: 'pending' })
      .andWhere('planned.dueDate >= :hoje', { hoje })
      .getMany();

    if (futuras.length > 0) {
      await this.plannedAccountsRepository.softRemove(futuras);
    }

    this.logger.log(
      `Série ${origem.tipo} ${origem.id} cancelada; ${futuras.length} ocorrência(s) futura(s) removida(s)`,
    );

    return futuras.length;
  }

  /**
   * Reativa uma série cancelada e reprojeta a janela.
   */
  async reativarSerie(
    expense: Expense,
    userIdsDaFamilia: string[],
  ): Promise<number> {
    return this.reativar(this.daDespesa(expense), userIdsDaFamilia);
  }

  /** Reativa a série de uma receita recorrente. */
  async reativarSerieReceita(
    income: Income,
    userIdsDaFamilia: string[],
  ): Promise<number> {
    return this.reativar(this.daReceita(income), userIdsDaFamilia);
  }

  private async reativar(
    origem: OrigemRecorrente,
    userIdsDaFamilia: string[],
  ): Promise<number> {
    const repositorio =
      origem.tipo === 'income' ? this.incomesRepository : this.expensesRepository;

    await (repositorio as Repository<any>).update(origem.id, {
      recurrenceCancelledAt: null,
    });

    return this.sincronizar(
      { ...origem, recurrenceCancelledAt: undefined },
      userIdsDaFamilia,
    );
  }

  /** Marca a origem — despesa ou receita — como recorrência encerrada. */
  private async marcarCancelada(origem: OrigemRecorrente): Promise<void> {
    const repositorio =
      origem.tipo === 'income' ? this.incomesRepository : this.expensesRepository;

    await (repositorio as Repository<any>).update(origem.id, {
      recurrenceCancelledAt: new Date(),
    });
  }

  // ==================== helpers ====================

  /**
   * Já existe conta equivalente para este vencimento?
   *
   * A checagem é no escopo da FAMÍLIA e tolera três dias de diferença: se a
   * Giovanna já cadastrou o aluguel à mão para o dia 5, o Bruno lançando a
   * mesma recorrente não pode criar uma segunda cobrança do mesmo compromisso.
   *
   * O `type` entra na comparação porque entrada e saída são compromissos
   * diferentes mesmo com descrição e valor iguais — uma transferência de R$ 500
   * que sai numa conta e entra na outra não pode se anular por engano.
   */
  private async jaExisteEquivalente(
    origem: OrigemRecorrente,
    vencimento: Date,
    userIds: string[],
  ): Promise<boolean> {
    const inicio = new Date(vencimento);
    inicio.setDate(inicio.getDate() - 3);
    const fim = new Date(vencimento);
    fim.setDate(fim.getDate() + 3);

    const existente = await this.plannedAccountsRepository
      .createQueryBuilder('planned')
      .where('planned.userId IN (:...userIds)', { userIds })
      .andWhere('planned.type = :tipo', { tipo: origem.tipo })
      .andWhere('LOWER(planned.description) = LOWER(:description)', {
        description: origem.description,
      })
      .andWhere('planned.amount = :amount', { amount: origem.amount })
      .andWhere('planned.dueDate BETWEEN :inicio AND :fim', { inicio, fim })
      .andWhere("planned.status <> 'cancelled'")
      .getOne();

    return Boolean(existente);
  }

  /** Último dia projetado: hoje mais o horizonte. */
  private dataLimite(): Date {
    return this.somarMeses(new Date(), HORIZONTE_MESES);
  }

  private somarMeses(base: Date, meses: number): Date {
    const resultado = new Date(base);
    resultado.setMonth(resultado.getMonth() + Math.round(meses));
    return resultado;
  }

  /** Avança uma data conforme a frequência da recorrência. */
  proximaOcorrencia(base: Date, frequency: Frequencia): Date {
    const proxima = new Date(base);

    switch (frequency) {
      case 'daily':
        proxima.setDate(proxima.getDate() + 1);
        break;
      case 'weekly':
        proxima.setDate(proxima.getDate() + 7);
        break;
      case 'yearly':
        proxima.setFullYear(proxima.getFullYear() + 1);
        break;
      case 'monthly':
      default: {
        // `setMonth` estoura para o mês seguinte quando o dia não existe no
        // destino (31/01 + 1 mês vira 03/03). Fixar no dia 1 antes de avançar e
        // depois limitar ao último dia do mês evita esse deslocamento.
        const dia = proxima.getDate();
        proxima.setDate(1);
        proxima.setMonth(proxima.getMonth() + 1);
        const ultimoDia = new Date(
          proxima.getFullYear(),
          proxima.getMonth() + 1,
          0,
        ).getDate();
        proxima.setDate(Math.min(dia, ultimoDia));
        break;
      }
    }

    return proxima;
  }
}
