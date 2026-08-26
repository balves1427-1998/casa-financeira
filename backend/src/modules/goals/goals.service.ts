import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, Repository } from 'typeorm';
import { Goal, GoalStatus } from './entities/goal.entity';
import { User } from '../users/entities/user.entity';
import { FamiliesService } from '../families/families.service';
import {
  CreateGoalDto,
  UpdateGoalDto,
  AddContributionDto,
} from './dtos/goal.dto';
import {
  GoalProgress,
  GoalWithProgress,
  GoalsSummary,
  GoalAtRisk,
} from './goals.types';

/**
 * Service de metas financeiras (item 19 do escopo do projeto).
 *
 * ESCOPO: metas são LIDAS no escopo da família — a reserva de emergência e a
 * viagem são da casa, e Bruno precisa enxergar o que a Giovanna cadastrou para
 * que o planejamento feche. `userId` registra quem criou e é o que autoriza
 * editar ou excluir: ler é coletivo, escrever é individual.
 *
 * Exceção deliberada: o APORTE pode ser feito por qualquer membro da família.
 * Um aporte é aditivo e não destrói informação — exigir que só o criador
 * depositasse na meta da casa tornaria o recurso inútil para o casal.
 *
 * DECIMAIS: o driver do PostgreSQL devolve colunas `decimal` como STRING. Todo
 * valor lido do banco passa por `Number()` antes de qualquer conta — sem isso
 * `currentAmount + amount` vira concatenação de texto.
 */
@Injectable()
export class GoalsService {
  private readonly logger = new Logger(GoalsService.name);

  constructor(
    @InjectRepository(Goal)
    private goalRepository: Repository<Goal>,
    private familiesService: FamiliesService,
  ) {}

  // ==================== CRUD ====================

  async create(user: User, dto: CreateGoalDto): Promise<GoalWithProgress> {
    const goal = this.goalRepository.create({
      ...dto,
      currentAmount: dto.currentAmount ?? 0,
      userId: user.id,
      familyId: user.familyId,
      status: GoalStatus.ACTIVE,
    });

    // Uma meta já nasce concluída quando o valor atual informado cobre o
    // objetivo (caso comum ao cadastrar uma reserva que já existe).
    if (this.paraNumero(goal.currentAmount) >= this.paraNumero(goal.targetAmount)) {
      goal.status = GoalStatus.COMPLETED;
    }

    const salva = await this.goalRepository.save(goal);
    this.logger.log(`Meta ${salva.id} criada por ${user.id}`);

    return this.comProgresso(salva);
  }

  async findAll(user: User, status?: GoalStatus): Promise<GoalWithProgress[]> {
    const goals = await this.goalRepository.find({
      where: await this.condicoesDeEscopo(user, status ? { status } : {}),
      order: { createdAt: 'DESC' },
    });

    return goals.map((goal) => this.comProgresso(goal));
  }

  /** Busca uma meta dentro do escopo da família, já com o progresso calculado. */
  async findOne(id: string, user: User): Promise<GoalWithProgress> {
    return this.comProgresso(await this.buscarNoEscopo(id, user));
  }

  async update(
    id: string,
    user: User,
    dto: UpdateGoalDto,
  ): Promise<GoalWithProgress> {
    const goal = await this.buscarNoEscopo(id, user);
    this.assertPodeAlterar(goal, user);

    Object.assign(goal, dto);

    // Mexer no valor atual ou no objetivo pode concluir — ou reabrir — a meta.
    // Uma meta cancelada permanece cancelada até que o status seja mudado à mão.
    if (goal.status !== GoalStatus.CANCELLED && dto.status === undefined) {
      goal.status = this.atingiuObjetivo(goal)
        ? GoalStatus.COMPLETED
        : GoalStatus.ACTIVE;
    }

    const salva = await this.goalRepository.save(goal);
    this.logger.log(`Meta ${id} atualizada por ${user.id}`);

    return this.comProgresso(salva);
  }

  async remove(id: string, user: User): Promise<void> {
    const goal = await this.buscarNoEscopo(id, user);
    this.assertPodeAlterar(goal, user);

    await this.goalRepository.softRemove(goal);
    this.logger.log(`Meta ${id} removida por ${user.id}`);
  }

  // ==================== aportes ====================

  /**
   * Registra um aporte na meta.
   *
   * Soma ao valor acumulado e marca a meta como concluída assim que o objetivo
   * é atingido. Metas canceladas não aceitam aporte — reative-as antes.
   */
  async addContribution(
    id: string,
    user: User,
    dto: AddContributionDto,
  ): Promise<GoalWithProgress> {
    const goal = await this.buscarNoEscopo(id, user);

    if (goal.status === GoalStatus.CANCELLED) {
      throw new ForbiddenException(
        'Esta meta está cancelada. Reative-a antes de registrar aportes.',
      );
    }

    // `Number()` obrigatório: `currentAmount` chega do banco como string.
    const acumulado = this.paraNumero(goal.currentAmount);
    goal.currentAmount = this.arredondar(acumulado + this.paraNumero(dto.amount));
    goal.lastContributionAt = dto.date ?? new Date();

    if (this.atingiuObjetivo(goal)) {
      goal.status = GoalStatus.COMPLETED;
    }

    const salva = await this.goalRepository.save(goal);
    this.logger.log(
      `Aporte de ${dto.amount} registrado na meta ${id} por ${user.id}`,
    );

    return this.comProgresso(salva);
  }

  // ==================== resumo ====================

  /**
   * Visão agregada das metas da família.
   *
   * Os totais financeiros ignoram metas canceladas — dinheiro reservado para
   * algo que foi abandonado não deve inflar o objetivo da casa. Os aportes
   * mensais somam apenas metas ATIVAS, que são as que ainda exigem dinheiro.
   */
  async getSummary(user: User): Promise<GoalsSummary> {
    const goals = await this.goalRepository.find({
      where: await this.condicoesDeEscopo(user),
      order: { createdAt: 'DESC' },
    });

    const resumo: GoalsSummary = {
      totalGoals: goals.length,
      activeGoals: 0,
      completedGoals: 0,
      cancelledGoals: 0,
      totalTargetAmount: 0,
      totalCurrentAmount: 0,
      totalRemainingAmount: 0,
      overallProgressPercentage: null,
      totalPlannedMonthlyContribution: 0,
      totalRequiredMonthlyContribution: 0,
      monthlyContributionGap: 0,
      overdueGoals: 0,
      goalsAtRisk: [],
      nextDeadline: null,
    };

    const emRisco: GoalAtRisk[] = [];
    let proximoPrazo: { id: string; name: string; deadline: Date } | null = null;

    for (const goal of goals) {
      const progresso = this.calcularProgresso(goal);

      if (goal.status === GoalStatus.CANCELLED) {
        resumo.cancelledGoals += 1;
        continue;
      }

      if (goal.status === GoalStatus.COMPLETED) {
        resumo.completedGoals += 1;
      } else {
        resumo.activeGoals += 1;
      }

      resumo.totalTargetAmount += progresso.targetAmount;
      resumo.totalCurrentAmount += progresso.currentAmount;
      resumo.totalRemainingAmount += progresso.remainingAmount;

      if (goal.status !== GoalStatus.ACTIVE) {
        continue;
      }

      resumo.totalPlannedMonthlyContribution +=
        progresso.plannedMonthlyContribution ?? 0;
      resumo.totalRequiredMonthlyContribution +=
        progresso.requiredMonthlyContribution ?? 0;

      if (progresso.isOverdue) {
        resumo.overdueGoals += 1;
        emRisco.push({
          id: goal.id,
          name: goal.name,
          type: goal.type,
          reason: `Prazo vencido com ${this.formatarReal(progresso.remainingAmount)} ainda a guardar.`,
        });
      } else if (progresso.isPlannedContributionSufficient === false) {
        emRisco.push({
          id: goal.id,
          name: goal.name,
          type: goal.type,
          reason: `Aporte planejado insuficiente: faltam ${this.formatarReal(progresso.monthlyContributionGap ?? 0)} por mês.`,
        });
      }

      const prazo = this.paraData(goal.deadline);
      if (prazo && (!proximoPrazo || prazo < proximoPrazo.deadline)) {
        proximoPrazo = { id: goal.id, name: goal.name, deadline: prazo };
      }
    }

    resumo.totalTargetAmount = this.arredondar(resumo.totalTargetAmount);
    resumo.totalCurrentAmount = this.arredondar(resumo.totalCurrentAmount);
    resumo.totalRemainingAmount = this.arredondar(resumo.totalRemainingAmount);
    resumo.totalPlannedMonthlyContribution = this.arredondar(
      resumo.totalPlannedMonthlyContribution,
    );
    resumo.totalRequiredMonthlyContribution = this.arredondar(
      resumo.totalRequiredMonthlyContribution,
    );
    resumo.monthlyContributionGap = this.arredondar(
      Math.max(
        0,
        resumo.totalRequiredMonthlyContribution -
          resumo.totalPlannedMonthlyContribution,
      ),
    );

    resumo.overallProgressPercentage =
      resumo.totalTargetAmount > 0
        ? this.arredondar(
            Math.min(
              100,
              (resumo.totalCurrentAmount / resumo.totalTargetAmount) * 100,
            ),
          )
        : null;

    resumo.goalsAtRisk = emRisco;
    resumo.nextDeadline = proximoPrazo;

    return resumo;
  }

  // ==================== cálculo de progresso ====================

  /**
   * Calcula o progresso REAL de uma meta.
   *
   * `hoje` é injetável para que os testes não dependam do relógio da máquina.
   *
   * Casos de borda tratados explicitamente, sem inventar número:
   *  - objetivo zero (ou negativo): percentual e aporte necessário viram `null`;
   *  - meta já concluída: restante e aporte necessário são 0;
   *  - prazo vencido: `monthsRemaining` = 0 e o aporte necessário é o restante
   *    inteiro, porque o dinheiro já deveria estar lá;
   *  - sem prazo: não há aporte necessário a exigir — só a projeção no ritmo atual;
   *  - sem aporte planejado: não há projeção de conclusão.
   */
  calcularProgresso(goal: Goal, hoje: Date = new Date()): GoalProgress {
    const objetivo = this.paraNumero(goal.targetAmount);
    const acumulado = this.paraNumero(goal.currentAmount);
    const prazo = this.paraData(goal.deadline);
    const aportePlanejado =
      goal.monthlyContribution === null || goal.monthlyContribution === undefined
        ? null
        : this.paraNumero(goal.monthlyContribution);

    const objetivoValido = objetivo > 0;
    const restante = objetivoValido
      ? this.arredondar(Math.max(0, objetivo - acumulado))
      : 0;
    const concluida = goal.status === GoalStatus.COMPLETED || restante <= 0;

    const percentual = objetivoValido
      ? this.arredondar(Math.min(100, (acumulado / objetivo) * 100))
      : null;

    const mesesRestantes = prazo ? this.mesesAte(hoje, prazo) : null;
    const vencida = !concluida && prazo !== null && prazo.getTime() < hoje.getTime();

    // Aporte mensal necessário para bater a meta no prazo.
    let aporteNecessario: number | null = null;
    if (!objetivoValido) {
      aporteNecessario = null;
    } else if (concluida) {
      aporteNecessario = 0;
    } else if (prazo === null) {
      // Sem prazo não existe "necessário por mês": qualquer ritmo chega lá.
      aporteNecessario = null;
    } else if (mesesRestantes === null || mesesRestantes <= 0) {
      // Prazo vencido ou vencendo hoje: o restante é necessário de uma vez.
      aporteNecessario = restante;
    } else {
      aporteNecessario = this.arredondar(restante / mesesRestantes);
    }

    // Projeção mantendo o aporte planejado.
    let mesesProjetados: number | null = null;
    let dataProjetada: Date | null = null;
    if (concluida) {
      mesesProjetados = 0;
      dataProjetada = null;
    } else if (aportePlanejado !== null && aportePlanejado > 0) {
      mesesProjetados = Math.ceil(restante / aportePlanejado);
      dataProjetada = this.somarMeses(hoje, mesesProjetados);
    }

    const aporteSuficiente =
      aporteNecessario === null || aportePlanejado === null
        ? null
        : aportePlanejado + 0.005 >= aporteNecessario;

    const diferencaAporte =
      aporteNecessario === null || aportePlanejado === null
        ? null
        : this.arredondar(Math.max(0, aporteNecessario - aportePlanejado));

    // Comparação feita em MESES, a mesma unidade do aporte necessário — comparar
    // a data projetada com o prazo daria respostas contraditórias (um aporte
    // suficiente pareceria estourar o prazo por alguns dias de arredondamento).
    let cumprePrazo: boolean | null = null;
    if (concluida) {
      cumprePrazo = true;
    } else if (
      prazo !== null &&
      mesesRestantes !== null &&
      mesesProjetados !== null
    ) {
      cumprePrazo = mesesProjetados <= mesesRestantes;
    }

    return {
      progressPercentage: percentual,
      targetAmount: this.arredondar(objetivo),
      currentAmount: this.arredondar(acumulado),
      remainingAmount: restante,
      isCompleted: concluida,
      deadline: prazo,
      monthsRemaining: mesesRestantes,
      isOverdue: vencida,
      requiredMonthlyContribution: aporteNecessario,
      plannedMonthlyContribution: aportePlanejado,
      isPlannedContributionSufficient: aporteSuficiente,
      monthlyContributionGap: diferencaAporte,
      projectedMonthsToComplete: mesesProjetados,
      projectedCompletionDate: dataProjetada,
      willMeetDeadline: cumprePrazo,
      message: this.montarMensagem({
        objetivoValido,
        concluida,
        vencida,
        restante,
        percentual,
        mesesRestantes,
        aporteNecessario,
        aportePlanejado,
        aporteSuficiente,
        mesesProjetados,
      }),
    };
  }

  // ==================== helpers ====================

  /**
   * Anexa o progresso calculado à meta, no formato devolvido pela API.
   *
   * Também normaliza os campos `decimal` para número: dependendo de o registro
   * vir do banco ou de ter acabado de ser salvo, o TypeORM devolve `"8000.00"`
   * ou `8000`. A API não pode oscilar entre string e número no mesmo campo —
   * o front faria conta com texto.
   */
  private comProgresso(goal: Goal): GoalWithProgress {
    const progress = this.calcularProgresso(goal);

    return {
      ...goal,
      targetAmount: progress.targetAmount,
      currentAmount: progress.currentAmount,
      monthlyContribution: progress.plannedMonthlyContribution ?? undefined,
      deadline: progress.deadline ?? undefined,
      progress,
    };
  }

  /** Formata um valor em Real, no padrão brasileiro. */
  private formatarReal(valor: number): string {
    return valor.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  }

  /**
   * Condições de leitura: metas da família do usuário OU metas criadas por
   * qualquer membro dela (cobre registros criados antes de a família existir).
   *
   * O array vira um `OR` no TypeORM.
   */
  private async condicoesDeEscopo(
    user: User,
    extra: FindOptionsWhere<Goal> = {},
  ): Promise<FindOptionsWhere<Goal>[]> {
    const memberIds = await this.escopoUserIds(user);
    const condicoes: FindOptionsWhere<Goal>[] = [
      { ...extra, userId: In(memberIds) },
    ];

    if (user.familyId) {
      condicoes.push({ ...extra, familyId: user.familyId });
    }

    return condicoes;
  }

  /**
   * Ids dos usuários cujas metas este usuário pode ler.
   *
   * Com família: todos os membros. Sem família (estado transitório): apenas ele
   * mesmo — melhor mostrar só as próprias metas do que barrar o acesso a algo
   * que ele criou.
   */
  private async escopoUserIds(user: User): Promise<string[]> {
    if (!user.familyId) {
      return [user.id];
    }

    const memberIds = await this.familiesService.getMemberIds(user.familyId);
    return memberIds.length > 0 ? memberIds : [user.id];
  }

  private async buscarNoEscopo(id: string, user: User): Promise<Goal> {
    const goal = await this.goalRepository.findOne({
      where: await this.condicoesDeEscopo(user, { id }),
    });

    if (!goal) {
      throw new NotFoundException('Meta não encontrada');
    }

    return goal;
  }

  /**
   * Ler é coletivo, escrever é individual: qualquer membro consulta as metas da
   * casa, mas só quem cadastrou pode alterá-la ou removê-la.
   */
  private assertPodeAlterar(goal: Goal, user: User): void {
    if (goal.userId !== user.id) {
      throw new ForbiddenException(
        'Apenas quem cadastrou esta meta pode alterá-la ou removê-la.',
      );
    }
  }

  private atingiuObjetivo(goal: Goal): boolean {
    const objetivo = this.paraNumero(goal.targetAmount);
    return objetivo > 0 && this.paraNumero(goal.currentAmount) >= objetivo;
  }

  /**
   * Meses cheios entre duas datas.
   *
   * Conta a diferença de calendário e só soma o mês corrente quando o dia do
   * prazo ainda está à frente. Nunca devolve negativo: prazo vencido é 0.
   */
  private mesesAte(hoje: Date, prazo: Date): number {
    const meses =
      (prazo.getFullYear() - hoje.getFullYear()) * 12 +
      (prazo.getMonth() - hoje.getMonth());
    const ajuste = prazo.getDate() > hoje.getDate() ? 1 : 0;

    return Math.max(0, meses + ajuste);
  }

  private somarMeses(data: Date, meses: number): Date {
    const resultado = new Date(data.getTime());
    resultado.setMonth(resultado.getMonth() + meses);
    return resultado;
  }

  /**
   * Converte o que vem do banco em número.
   * Colunas `decimal` chegam como string no driver do PostgreSQL.
   */
  private paraNumero(valor: unknown): number {
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero : 0;
  }

  /** Aceita `Date` ou string ISO (defensivo contra variações do driver). */
  private paraData(valor: unknown): Date | null {
    if (!valor) {
      return null;
    }

    const data = valor instanceof Date ? valor : new Date(valor as string);
    return Number.isNaN(data.getTime()) ? null : data;
  }

  private arredondar(valor: number): number {
    return Math.round(valor * 100) / 100;
  }

  /** Resumo textual honesto do progresso, em português. */
  private montarMensagem(dados: {
    objetivoValido: boolean;
    concluida: boolean;
    vencida: boolean;
    restante: number;
    percentual: number | null;
    mesesRestantes: number | null;
    aporteNecessario: number | null;
    aportePlanejado: number | null;
    aporteSuficiente: boolean | null;
    mesesProjetados: number | null;
  }): string {
    const dinheiro = (valor: number) => this.formatarReal(valor);

    if (!dados.objetivoValido) {
      return 'Meta sem valor objetivo definido — não é possível calcular progresso.';
    }

    if (dados.concluida) {
      return 'Meta concluída. Objetivo atingido.';
    }

    if (dados.vencida) {
      return `Prazo vencido: ainda faltam ${dinheiro(dados.restante)}. Defina um novo prazo ou reveja o objetivo.`;
    }

    const base = `${dados.percentual}% concluído; faltam ${dinheiro(dados.restante)}`;

    if (dados.aporteNecessario === null) {
      // Sem prazo definido.
      if (dados.mesesProjetados !== null) {
        return `${base}. Sem prazo definido: no ritmo planejado, a meta é atingida em ${dados.mesesProjetados} ${dados.mesesProjetados === 1 ? 'mês' : 'meses'}.`;
      }
      return `${base}. Sem prazo e sem aporte mensal planejado, não há previsão de conclusão.`;
    }

    const prazoTexto =
      dados.mesesRestantes === 0
        ? 'que vence neste mês'
        : `em ${dados.mesesRestantes} ${dados.mesesRestantes === 1 ? 'mês' : 'meses'}`;

    if (dados.aportePlanejado === null || dados.aportePlanejado <= 0) {
      return `${base}. Para cumprir o prazo ${prazoTexto} é preciso guardar ${dinheiro(dados.aporteNecessario)} por mês, mas nenhum aporte mensal foi planejado.`;
    }

    if (dados.aporteSuficiente) {
      return `${base}. O aporte planejado de ${dinheiro(dados.aportePlanejado)} por mês cobre os ${dinheiro(dados.aporteNecessario)} mensais necessários para o prazo ${prazoTexto}.`;
    }

    return `${base}. O aporte planejado de ${dinheiro(dados.aportePlanejado)} por mês não basta: são necessários ${dinheiro(dados.aporteNecessario)} por mês para cumprir o prazo ${prazoTexto}.`;
  }
}
