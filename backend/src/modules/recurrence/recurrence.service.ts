import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Expense } from '../expenses/entities/expense.entity';
import { PlannedAccount } from '../planned-accounts/entities/planned-account.entity';

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
    @InjectRepository(PlannedAccount)
    private plannedAccountsRepository: Repository<PlannedAccount>,
  ) {}

  /**
   * Garante que a série desta despesa está projetada até o horizonte.
   *
   * Idempotente: chamar de novo não duplica nada. Devolve quantas ocorrências
   * foram criadas nesta passagem.
   */
  async sincronizarSerie(
    expense: Expense,
    userIdsDaFamilia: string[],
  ): Promise<number> {
    if (!expense.isRecurring || expense.recurrenceCancelledAt) {
      return 0;
    }

    const frequencia = (expense.frequency ?? 'monthly') as Frequencia;
    const limite = this.dataLimite();

    // De onde continuar: da última ocorrência já gerada para esta série, ou da
    // própria data da despesa quando a série ainda não tem nenhuma.
    const ultima = await this.plannedAccountsRepository
      .createQueryBuilder('planned')
      .where('planned.recurringExpenseId = :id', { id: expense.id })
      .orderBy('planned.dueDate', 'DESC')
      .getOne();

    let cursor = new Date(ultima ? ultima.dueDate : expense.date);

    // Descrições e valores podem ter mudado na edição da despesa; as
    // ocorrências novas seguem o estado atual.
    const criadas: PlannedAccount[] = [];
    let candidatas = 0;
    let duplicadas = 0;

    for (let i = 0; i < TETO_OCORRENCIAS; i++) {
      cursor = this.proximaOcorrencia(cursor, frequencia);

      if (cursor > limite) break;

      candidatas++;

      const duplicada = await this.jaExisteEquivalente(
        expense,
        cursor,
        userIdsDaFamilia,
      );

      if (duplicada) {
        duplicadas++;
        continue;
      }

      criadas.push(
        this.plannedAccountsRepository.create({
          userId: expense.userId,
          description: expense.description,
          category: expense.category,
          amount: expense.amount,
          dueDate: new Date(cursor),
          responsible: expense.responsible,
          accountId: expense.accountId,
          creditCardId: expense.creditCardId,
          isRecurring: true,
          frequency: frequencia,
          status: 'pending',
          recurringExpenseId: expense.id,
          observation: 'Projetada a partir de uma despesa recorrente',
        }),
      );
    }

    if (criadas.length === 0) {
      // Série REDUNDANTE: todo o horizonte já está coberto por outra série da
      // casa. Acontece quando as duas pessoas lançam a mesma assinatura — a
      // segunda não deve gerar cobrança nenhuma.
      //
      // Sem encerrá-la aqui, ela ficaria adormecida: nenhuma ocorrência
      // própria, mas ativa. Duas consequências ruins, as duas observadas em
      // teste: o reabastecimento tentaria gerá-la de novo a cada leitura do
      // Planejado (trabalho perdido para sempre), e no dia em que a série
      // original fosse cancelada esta reassumiria sozinha, fazendo a despesa
      // "voltar do nada" depois de o usuário tê-la cancelado.
      if (candidatas > 0 && duplicadas === candidatas) {
        await this.expensesRepository.update(expense.id, {
          recurrenceCancelledAt: new Date(),
        });

        this.logger.log(
          `Série da despesa ${expense.id} encerrada: a casa já projeta este mesmo compromisso`,
        );
      }

      return 0;
    }

    await this.plannedAccountsRepository.save(criadas);

    // A despesa aponta para a primeira ocorrência da série: é o vínculo que faz
    // marcar como paga de um lado refletir no outro.
    if (!expense.plannedAccountId) {
      await this.expensesRepository.update(expense.id, {
        plannedAccountId: criadas[0].id,
      });
    }

    this.logger.log(
      `Série da despesa ${expense.id}: ${criadas.length} ocorrência(s) projetada(s)`,
    );

    return criadas.length;
  }

  /**
   * Reabastece a janela de TODAS as séries ativas da casa.
   *
   * Chamado na leitura do Planejado. O custo normal é de duas consultas: uma
   * para as séries ativas e outra para o vencimento mais distante de cada uma.
   * Só as séries que encurtaram passam pela geração.
   */
  async sincronizarTodas(userIds: string[]): Promise<number> {
    if (userIds.length === 0) return 0;

    const series = await this.expensesRepository.find({
      where: {
        userId: In(userIds),
        isRecurring: true,
        recurrenceCancelledAt: IsNull(),
      },
    });

    if (series.length === 0) return 0;

    // Vencimento mais distante já projetado por série, numa consulta só.
    const limites = await this.plannedAccountsRepository
      .createQueryBuilder('planned')
      .select('planned.recurringExpenseId', 'serie')
      .addSelect('MAX(planned.dueDate)', 'ultima')
      .where('planned.recurringExpenseId IN (:...ids)', {
        ids: series.map((s) => s.id),
      })
      .groupBy('planned.recurringExpenseId')
      .getRawMany();

    const ultimaPorSerie = new Map<string, Date>(
      limites.map((l) => [l.serie, new Date(l.ultima)]),
    );

    // Margem: só regenera quando a janela caiu abaixo de metade do horizonte.
    // Sem isso, toda leitura tentaria criar a ocorrência do mês seguinte.
    const gatilho = this.somarMeses(new Date(), HORIZONTE_MESES / 2);

    let total = 0;

    for (const serie of series) {
      const ultima = ultimaPorSerie.get(serie.id);

      if (ultima && ultima > gatilho) continue;

      total += await this.sincronizarSerie(serie, userIds);
    }

    return total;
  }

  /**
   * Encerra a série: para de projetar e remove o que ainda não venceu.
   *
   * As ocorrências já PAGAS ficam — são histórico do que aconteceu. As pendentes
   * futuras somem, porque deixaram de ser compromisso. A despesa original também
   * fica: ela é um gasto realizado, não uma projeção.
   */
  async cancelarSerie(expense: Expense): Promise<number> {
    await this.expensesRepository.update(expense.id, {
      recurrenceCancelledAt: new Date(),
    });

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const futuras = await this.plannedAccountsRepository
      .createQueryBuilder('planned')
      .where('planned.recurringExpenseId = :id', { id: expense.id })
      .andWhere('planned.status = :status', { status: 'pending' })
      .andWhere('planned.dueDate >= :hoje', { hoje })
      .getMany();

    if (futuras.length > 0) {
      await this.plannedAccountsRepository.softRemove(futuras);
    }

    this.logger.log(
      `Série da despesa ${expense.id} cancelada; ${futuras.length} ocorrência(s) futura(s) removida(s)`,
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
    await this.expensesRepository.update(expense.id, {
      recurrenceCancelledAt: null as unknown as Date,
    });

    return this.sincronizarSerie(
      { ...expense, recurrenceCancelledAt: undefined } as Expense,
      userIdsDaFamilia,
    );
  }

  // ==================== helpers ====================

  /**
   * Já existe conta equivalente para este vencimento?
   *
   * A checagem é no escopo da FAMÍLIA e tolera três dias de diferença: se a
   * Giovanna já cadastrou o aluguel à mão para o dia 5, o Bruno lançando a
   * mesma recorrente não pode criar uma segunda cobrança do mesmo compromisso.
   */
  private async jaExisteEquivalente(
    expense: Expense,
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
      .andWhere('LOWER(planned.description) = LOWER(:description)', {
        description: expense.description,
      })
      .andWhere('planned.amount = :amount', { amount: expense.amount })
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
