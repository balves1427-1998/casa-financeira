import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In, Not } from 'typeorm';
import { PlannedAccount } from './entities/planned-account.entity';
import { Expense } from '../expenses/entities/expense.entity';
import { Income } from '../income/entities/income.entity';
import { Account } from '../accounts/entities/account.entity';
import {
  CreatePlannedAccountDto,
  UpdatePlannedAccountDto,
} from './dtos/create-planned-account.dto';
import { User } from '../users/entities/user.entity';
import { FamiliesService } from '../families/families.service';
import { RecurrenceService } from '../recurrence/recurrence.service';

/**
 * Service de contas planejadas.
 *
 * ESCOPO: as contas são LIDAS no escopo da família, como todo o resto do
 * sistema. Antes cada pessoa só enxergava as próprias — o que fazia a tela
 * Planejado discordar do Fluxo de Caixa e do Dashboard, que sempre agregaram
 * por casa. Escrever continua individual: só quem cadastrou altera ou apaga.
 *
 * A leitura também REABASTECE a janela das despesas recorrentes. Isso é
 * deliberado: no plano gratuito do Render o serviço hiberna sem tráfego, então
 * uma tarefa noturna não roda. Amarrar a perpetuação da recorrência a um cron
 * seria amarrá-la a algo que não acontece.
 */
@Injectable()
export class PlannedAccountsService {
  private readonly logger = new Logger(PlannedAccountsService.name);

  constructor(
    @InjectRepository(PlannedAccount)
    private plannedAccountsRepository: Repository<PlannedAccount>,
    @InjectRepository(Expense)
    private expenseRepository: Repository<Expense>,
    @InjectRepository(Income)
    private incomeRepository: Repository<Income>,
    @InjectRepository(Account)
    private accountRepository: Repository<Account>,
    private familiesService: FamiliesService,
    private recurrenceService: RecurrenceService,
  ) {}

  /**
   * Primeira conta de pagamento do usuário — a mais antiga.
   *
   * Serve de destino quando uma entrada prevista foi cadastrada sem conta.
   * Cartão de crédito não entra: receita não cai em fatura.
   */
  private async contaPadrao(userId: string): Promise<string | null> {
    const conta = await this.accountRepository.findOne({
      where: { userId, type: Not('credit_card' as any) },
      order: { createdAt: 'ASC' },
    });

    return conta?.id ?? null;
  }

  /**
   * Ids dos usuários cujas contas este usuário pode ler: todos os membros da
   * família, ou apenas ele mesmo enquanto não pertencer a nenhuma.
   */
  private async scopeUserIds(user: User): Promise<string[]> {
    if (!user.familyId) {
      return [user.id];
    }

    const memberIds = await this.familiesService.getMemberIds(user.familyId);
    return memberIds.length > 0 ? memberIds : [user.id];
  }

  /** Ler é coletivo, escrever é individual. */
  private assertPodeAlterar(conta: PlannedAccount, user: User): void {
    if (conta.userId !== user.id) {
      throw new ForbiddenException(
        'Apenas quem cadastrou esta conta pode alterá-la ou removê-la.',
      );
    }
  }

  /**
   * Reabastece a janela das séries recorrentes da casa.
   *
   * Falhar aqui não pode impedir a listagem: é melhor mostrar o Planejado sem
   * as ocorrências mais distantes do que não mostrar nada.
   */
  private async manterRecorrentes(userIds: string[]): Promise<void> {
    try {
      await this.recurrenceService.sincronizarTodas(userIds);
    } catch (erro) {
      this.logger.error(
        `Falha ao reabastecer as séries recorrentes: ${
          erro instanceof Error ? erro.message : erro
        }`,
      );
    }
  }

  async create(
    user: User,
    createPlannedAccountDto: CreatePlannedAccountDto,
  ): Promise<PlannedAccount> {
    const plannedAccount = this.plannedAccountsRepository.create({
      ...createPlannedAccountDto,
      userId: user.id,
    });

    return this.plannedAccountsRepository.save(plannedAccount);
  }

  async findAll(user: User): Promise<PlannedAccount[]> {
    const userIds = await this.scopeUserIds(user);

    await this.manterRecorrentes(userIds);

    return this.plannedAccountsRepository.find({
      where: { userId: In(userIds) },
      order: { dueDate: 'ASC' },
    });
  }

  async findOne(id: string, user: User): Promise<PlannedAccount> {
    const userIds = await this.scopeUserIds(user);

    const plannedAccount = await this.plannedAccountsRepository.findOne({
      where: { id, userId: In(userIds) },
    });

    if (!plannedAccount) {
      throw new NotFoundException('Planned account not found');
    }

    return plannedAccount;
  }

  async update(
    id: string,
    user: User,
    updatePlannedAccountDto: UpdatePlannedAccountDto,
  ): Promise<PlannedAccount> {
    const plannedAccount = await this.findOne(id, user);

    this.assertPodeAlterar(plannedAccount, user);

    // Prevent updating certain fields
    const safeUpdateData = { ...updatePlannedAccountDto };
    const updateAny = safeUpdateData as any;
    delete updateAny.userId;
    delete updateAny.createdAt;

    Object.assign(plannedAccount, safeUpdateData);
    return this.plannedAccountsRepository.save(plannedAccount);
  }

  async delete(id: string, user: User): Promise<void> {
    const plannedAccount = await this.findOne(id, user);

    this.assertPodeAlterar(plannedAccount, user);

    await this.plannedAccountsRepository.softRemove(plannedAccount);
  }

  async findUpcoming(user: User, days: number = 30): Promise<PlannedAccount[]> {
    const userIds = await this.scopeUserIds(user);
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    return this.plannedAccountsRepository.find({
      where: {
        userId: In(userIds),
        // Alerta de vencimento é sobre conta a PAGAR. "Seu salário vence em 3
        // dias" não é um aviso útil, é ruído no meio dos que importam.
        type: 'expense',
        dueDate: Between(today, futureDate),
        status: 'pending',
      },
      order: { dueDate: 'ASC' },
    });
  }

  async findOverdue(user: User): Promise<PlannedAccount[]> {
    const userIds = await this.scopeUserIds(user);
    const today = new Date();

    return this.plannedAccountsRepository.find({
      where: {
        userId: In(userIds),
        type: 'expense',
        dueDate: Between(new Date('1970-01-01'), today),
        status: 'pending',
      },
      order: { dueDate: 'ASC' },
    });
  }

  async getMonthlyPlan(
    user: User,
    month: number,
    year: number,
  ): Promise<PlannedAccount[]> {
    const userIds = await this.scopeUserIds(user);

    await this.manterRecorrentes(userIds);

    return this.plannedAccountsRepository
      .createQueryBuilder('account')
      .where('account.userId IN (:...userIds)', { userIds })
      .andWhere('EXTRACT(MONTH FROM account.dueDate) = :month', { month })
      .andWhere('EXTRACT(YEAR FROM account.dueDate) = :year', { year })
      .orderBy('account.dueDate', 'ASC')
      .getMany();
  }

  async getTotalByResponsible(
    user: User,
    responsible: string,
    status?: string,
  ): Promise<number> {
    const userIds = await this.scopeUserIds(user);

    let query = this.plannedAccountsRepository
      .createQueryBuilder('account')
      .where('account.userId IN (:...userIds)', { userIds })
      // "Quanto o Bruno tem a pagar" é sobre saída. Somar as entradas aqui
      // faria o total parecer maior justamente para quem recebe mais.
      .andWhere("account.type = 'expense'")
      .andWhere('account.responsible = :responsible', { responsible });

    if (status) {
      query = query.andWhere('account.status = :status', { status });
    }

    const result = await query
      .select('SUM(account.amount)', 'total')
      .getRawOne();

    return Number(result?.total) || 0;
  }

  /**
   * Marca a conta como paga (ou recebida) e MATERIALIZA o lançamento real.
   *
   * O buraco que isto fecha: antes o método só trocava o status. A conta saía
   * da projeção do fluxo de caixa — porque deixava de estar pendente — mas
   * nenhuma despesa era criada no lugar. O dinheiro simplesmente evaporava do
   * caixa: some da previsão e nunca aparece no realizado.
   *
   * Agora, ao confirmar:
   *  - conta a PAGAR vira uma despesa já paga;
   *  - entrada prevista vira uma receita recebida;
   *  - a origem fica marcada como `recurring`, para diferenciar do que foi
   *    digitado à mão.
   *
   * Se o lançamento já tiver sido criado antes (o usuário marcou a despesa como
   * paga pelo outro lado, que propaga para cá), nada é duplicado.
   */
  async markAsPaid(
    id: string,
    user: User,
    dataDoMovimento?: Date,
  ): Promise<PlannedAccount> {
    const plannedAccount = await this.findOne(id, user);

    if (plannedAccount.status === 'paid') {
      return plannedAccount;
    }

    // A data em que o dinheiro se moveu, não a data em que você registrou.
    // É ela que decide em qual mês o valor conta, no extrato e no realizado.
    plannedAccount.status = 'paid';
    plannedAccount.paymentDate = dataDoMovimento ?? new Date();

    const salva = await this.plannedAccountsRepository.save(plannedAccount);

    await this.materializarLancamento(salva);

    return salva;
  }

  /**
   * Cria o lançamento real correspondente a uma conta planejada confirmada.
   *
   * Falhar aqui não pode desfazer a confirmação: o usuário disse que pagou, e
   * isso é o fato. O erro fica no log para conferência.
   */
  private async materializarLancamento(conta: PlannedAccount): Promise<void> {
    // FATURA DE CARTÃO NÃO VIRA DESPESA.
    //
    // As compras dela já estão, uma a uma, na aba Despesas — foi a importação
    // que as gravou. Criar mais um lançamento com o total somaria a fatura
    // inteira em cima das próprias compras que a compõem, e o mês apareceria
    // com o dobro do gasto no cartão.
    if (conta.invoiceCompetencia && conta.creditCardId) {
      return;
    }

    try {
      if (conta.type === 'income') {
        const jaExiste = await this.incomeRepository.findOne({
          where: { plannedAccountId: conta.id },
        });

        if (jaExiste) return;

        // `accountId` é obrigatório em receitas. Quando a entrada prevista foi
        // cadastrada sem conta de destino, a versão anterior desistia em
        // silêncio: o usuário clicava em confirmar, o card virava "recebido" e
        // NADA era somado às receitas — sem nenhum aviso na tela. Agora cai na
        // primeira conta de pagamento da pessoa, que é o palpite óbvio para
        // quem tem uma conta só, e o log registra a escolha.
        const contaDeDestino =
          conta.accountId ?? (await this.contaPadrao(conta.userId));

        if (!contaDeDestino) {
          this.logger.warn(
            `Conta planejada ${conta.id} confirmada, mas o usuário não tem ` +
              'nenhuma conta de pagamento cadastrada; a receita não pôde ser ' +
              'registrada.',
          );
          return;
        }

        if (!conta.accountId) {
          this.logger.log(
            `Entrada ${conta.id} não tinha conta de destino; registrada em ${contaDeDestino}.`,
          );
        }

        await this.incomeRepository.save(
          this.incomeRepository.create({
            userId: conta.userId,
            accountId: contaDeDestino,
            description: conta.description,
            type: conta.category || 'other',
            amount: conta.amount,
            date: conta.paymentDate ?? new Date(),
            responsible: conta.responsible,
            isRecurring: false,
            plannedAccountId: conta.id,
            observation: 'Registrada ao confirmar uma entrada prevista',
          }),
        );

        this.logger.log(`Receita criada a partir da conta planejada ${conta.id}`);
        return;
      }

      const jaExiste = await this.expenseRepository.findOne({
        where: { plannedAccountId: conta.id },
      });

      if (jaExiste) return;

      await this.expenseRepository.save(
        this.expenseRepository.create({
          userId: conta.userId,
          accountId: conta.accountId,
          creditCardId: conta.creditCardId,
          description: conta.description,
          amount: conta.amount,
          date: conta.paymentDate ?? new Date(),
          category: conta.category || 'Outros',
          responsible: conta.responsible,
          paymentMethod: conta.creditCardId ? 'credit' : 'debit',
          isRecurring: false,
          origin: 'recurring',
          isPaid: true,
          paidAt: conta.paymentDate ?? new Date(),
          plannedAccountId: conta.id,
          observation: 'Registrada ao confirmar uma conta planejada',
        }),
      );

      this.logger.log(`Despesa criada a partir da conta planejada ${conta.id}`);
    } catch (erro) {
      this.logger.error(
        `Não foi possível registrar o lançamento da conta ${conta.id}: ${
          erro instanceof Error ? erro.message : erro
        }`,
      );
    }
  }

  async getUpcomingAlerts(user: User): Promise<any[]> {
    const upcoming = await this.findUpcoming(user, 7);
    const overdue = await this.findOverdue(user);

    return [
      ...overdue.map((account) => ({
        ...account,
        type: 'overdue',
        priority: 2,
      })),
      ...upcoming
        .filter((account) => {
          const daysUntil =
            (account.dueDate.getTime() - new Date().getTime()) /
            (1000 * 60 * 60 * 24);
          return daysUntil <= 3;
        })
        .map((account) => ({
          ...account,
          type: 'due-soon',
          priority: 1,
        })),
    ];
  }

  /**
   * Planejado x Realizado de uma competência.
   *
   * O QUE CADA NÚMERO SIGNIFICA — e por que não são intercambiáveis:
   *
   *  - **planejado**: o que estava previsto para o mês (contas a pagar e a
   *    receber, incluindo a fatura consolidada do cartão);
   *  - **realizado**: o dinheiro que de fato ENTROU e SAIU da conta no mês.
   *
   * A sutileza está nas compras no cartão. Elas foram gastas no mês, mas o
   * dinheiro só sai no vencimento da fatura — por isso não entram em "despesas
   * realizadas" do mês da compra; quem entra é a fatura, quando marcada como
   * paga. Somar as duas coisas contaria o mesmo dinheiro duas vezes.
   *
   * Para o número não sumir da vista, `comprasNoCartao` é devolvido à parte:
   * é o gasto do mês no crédito, que vira compromisso do mês do vencimento.
   */
  async getPlanejadoRealizado(
    user: User,
    mes: number,
    ano: number,
  ): Promise<{
    competencia: string;
    receitasPlanejadas: number;
    despesasPlanejadas: number;
    receitasRealizadas: number;
    despesasRealizadas: number;
    variacaoReceitas: number;
    variacaoDespesas: number;
    saldoPlanejado: number;
    saldoRealizado: number;
    detalhe: {
      faturasPlanejadas: number;
      comprasNoCartao: number;
      contasPagas: number;
      contasPendentes: number;
      contasVencidas: number;
    };
  }> {
    if (mes < 1 || mes > 12 || ano < 2000 || ano > 2100) {
      throw new NotFoundException('Competência inválida');
    }

    const userIds = await this.scopeUserIds(user);
    const inicio = new Date(ano, mes - 1, 1);
    const fim = new Date(ano, mes, 0, 23, 59, 59);

    const [planejadas, despesas, receitas] = await Promise.all([
      this.plannedAccountsRepository.find({
        where: { userId: In(userIds), dueDate: Between(inicio, fim) },
      }),
      this.expenseRepository.find({
        where: { userId: In(userIds), date: Between(inicio, fim) },
      }),
      this.incomeRepository.find({
        where: { userId: In(userIds), date: Between(inicio, fim) },
      }),
    ]);

    const somar = (itens: Array<{ amount: number | string }>) =>
      // `amount` vem como STRING das colunas decimal: sem Number(), a soma
      // vira concatenação de texto.
      Number(
        itens.reduce((total, i) => total + Number(i.amount || 0), 0).toFixed(2),
      );

    const emAberto = planejadas.filter(
      (p) => p.status !== 'cancelled',
    );

    const receitasPlanejadas = somar(emAberto.filter((p) => p.type === 'income'));
    const despesasPlanejadas = somar(emAberto.filter((p) => p.type !== 'income'));

    const noCartao = despesas.filter(
      (e) => e.paymentMethod === 'credit' && e.creditCardId,
    );
    const foraDoCartao = despesas.filter(
      (e) => !(e.paymentMethod === 'credit' && e.creditCardId),
    );

    const faturasPagas = planejadas.filter(
      (p) => p.invoiceCompetencia && p.creditCardId && p.status === 'paid',
    );

    const receitasRealizadas = somar(receitas);
    const despesasRealizadas = Number(
      (somar(foraDoCartao) + somar(faturasPagas)).toFixed(2),
    );

    return {
      competencia: `${ano}-${String(mes).padStart(2, '0')}`,
      receitasPlanejadas,
      despesasPlanejadas,
      receitasRealizadas,
      despesasRealizadas,
      // Positivo em receitas = recebeu mais do que esperava.
      // Positivo em despesas = gastou MAIS do que planejou.
      variacaoReceitas: Number(
        (receitasRealizadas - receitasPlanejadas).toFixed(2),
      ),
      variacaoDespesas: Number(
        (despesasRealizadas - despesasPlanejadas).toFixed(2),
      ),
      saldoPlanejado: Number(
        (receitasPlanejadas - despesasPlanejadas).toFixed(2),
      ),
      saldoRealizado: Number(
        (receitasRealizadas - despesasRealizadas).toFixed(2),
      ),
      detalhe: {
        faturasPlanejadas: somar(
          emAberto.filter((p) => p.invoiceCompetencia && p.creditCardId),
        ),
        comprasNoCartao: somar(noCartao),
        contasPagas: emAberto.filter((p) => p.status === 'paid').length,
        contasPendentes: emAberto.filter((p) =>
          ['pending', 'confirmed'].includes(p.status),
        ).length,
        contasVencidas: emAberto.filter((p) => p.status === 'overdue').length,
      },
    };
  }
}
