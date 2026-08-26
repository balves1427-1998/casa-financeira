import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SplitMode, SplitRule } from './entities/split-rule.entity';
import { FinancialDataService } from '../financial-data/financial-data.service';
import { IncomeService } from '../income/income.service';
import { User } from '../users/entities/user.entity';
import { SetSplitRuleDto } from './dtos/split-rule.dto';
import {
  CategorySplit,
  ResponsibleShare,
  Settlement,
  SettlementEntry,
  SettlementTransfer,
  SplitDifference,
  SplitRuleView,
  SplitSummary,
} from './split.types';

/** Tolerância na soma dos percentuais customizados (evita ruído de ponto flutuante). */
const TOLERANCIA_PERCENTUAL = 0.01;

/** Abaixo deste valor um saldo é considerado quitado (um centavo de arredondamento). */
const TOLERANCIA_CENTAVOS = 0.01;

/**
 * Divisão Bruno × Giovanna (item 15 do escopo).
 *
 * Duas leituras diferentes convivem aqui e não devem ser confundidas:
 *
 *  - `getSplitSummary`  → QUEM PAGOU O QUÊ. É descritivo: apenas soma os
 *    desembolsos reais de cada responsável no período e calcula participação e
 *    diferença. Não depende de nenhuma regra de rateio.
 *  - `getSettlement`    → O ACERTO DE CONTAS. É normativo: aplica a regra
 *    vigente da família (50/50, proporcional à renda ou percentuais manuais)
 *    para dizer quanto cada um DEVERIA ter pagado e quem deve quanto a quem.
 *
 * Todos os números saem do `FinancialDataService` (despesas reais) e do
 * `IncomeService` (renda recorrente real). Nada é estimado.
 *
 * REGRA 27 DO PROJETO: quando faltam dados — tipicamente rateio proporcional à
 * renda sem nenhuma receita recorrente cadastrada — o resultado NÃO cai em
 * 50/50 silenciosamente. Ele devolve `appliedMode`, `fallbackApplied`,
 * `criteria` e `warnings` dizendo exatamente qual critério foi usado e o que
 * está faltando.
 */
@Injectable()
export class SplitService {
  private readonly logger = new Logger(SplitService.name);

  constructor(
    @InjectRepository(SplitRule)
    private splitRuleRepository: Repository<SplitRule>,
    private financialData: FinancialDataService,
    private incomeService: IncomeService,
  ) {}

  // ==================== painel: quem pagou o quê ====================

  /**
   * Painel descritivo do período: quanto cada responsável pagou, o total da
   * casa, o percentual de participação de cada um e a diferença entre eles.
   */
  async getSplitSummary(
    familyId: string,
    period = 'THIS_MONTH',
  ): Promise<SplitSummary> {
    const range = this.financialData.getPeriodRange(period);
    const agregados = await this.financialData.getExpensesByResponsible(
      familyId,
      range,
    );

    const totalPaid = this.arredondar(
      agregados.reduce((soma, a) => soma + Number(a.total), 0),
    );
    const totalCount = agregados.reduce((soma, a) => soma + Number(a.count), 0);

    const participants: ResponsibleShare[] = agregados
      .map((a) => {
        const paid = Number(a.total) || 0;
        return {
          responsible: a.responsible,
          paid: this.arredondar(paid),
          count: Number(a.count) || 0,
          sharePercent:
            totalPaid > 0 ? this.arredondar((paid / totalPaid) * 100) : 0,
        };
      })
      .sort((a, b) => b.paid - a.paid);

    const warnings: string[] = [];

    if (participants.length === 0) {
      warnings.push(
        'Não há despesas lançadas no período selecionado — não é possível comparar os desembolsos.',
      );
    } else if (participants.length === 1) {
      warnings.push(
        `Apenas ${participants[0].responsible} tem despesas no período. ` +
          'Sem um segundo responsável não há diferença a calcular.',
      );
    }

    return {
      period,
      start: range.start,
      end: range.end,
      totalPaid,
      totalCount,
      participants,
      difference: this.calcularDiferenca(participants),
      byCategory: await this.getCategorySplit(familyId, period),
      warnings,
    };
  }

  /**
   * Detalhamento por categoria: dentro de cada categoria, quanto cada
   * responsável desembolsou.
   *
   * O `FinancialDataService` agrega por categoria OU por responsável, nunca
   * pelos dois ao mesmo tempo — por isso a lista de lançamentos do período é
   * lida e cruzada aqui.
   */
  async getCategorySplit(
    familyId: string,
    period = 'THIS_MONTH',
  ): Promise<CategorySplit[]> {
    const range = this.financialData.getPeriodRange(period);
    const despesas = await this.financialData.getExpenses(familyId, range);

    // categoria → responsável → total
    const mapa = new Map<string, Map<string, number>>();

    for (const despesa of despesas) {
      const categoria = despesa.category ?? 'Outros';
      const responsavel = despesa.responsible ?? 'não informado';
      // `amount` é decimal: chega como STRING do PostgreSQL.
      const valor = Number(despesa.amount) || 0;

      if (!mapa.has(categoria)) mapa.set(categoria, new Map());
      const porResponsavel = mapa.get(categoria)!;
      porResponsavel.set(
        responsavel,
        (porResponsavel.get(responsavel) ?? 0) + valor,
      );
    }

    const resultado: CategorySplit[] = [];

    for (const [category, porResponsavel] of mapa.entries()) {
      const total = Array.from(porResponsavel.values()).reduce(
        (soma, v) => soma + v,
        0,
      );

      resultado.push({
        category,
        total: this.arredondar(total),
        byResponsible: Array.from(porResponsavel.entries())
          .map(([responsible, paid]) => ({
            responsible,
            paid: this.arredondar(paid),
            sharePercent:
              total > 0 ? this.arredondar((paid / total) * 100) : 0,
          }))
          .sort((a, b) => b.paid - a.paid),
      });
    }

    return resultado.sort((a, b) => b.total - a.total);
  }

  // ==================== acerto de contas ====================

  /**
   * Acerto de contas do período segundo a regra vigente da família.
   *
   * Recebe o usuário autenticado porque a renda recorrente é lida pelo
   * `IncomeService`, que escopa a consulta pelos membros da família do próprio
   * usuário — o que impede que um id de família passado na URL exponha dados de
   * outra casa.
   */
  async getSettlement(
    familyId: string,
    user: User,
    period = 'THIS_MONTH',
  ): Promise<Settlement> {
    const range = this.financialData.getPeriodRange(period);
    const [agregados, regra] = await Promise.all([
      this.financialData.getExpensesByResponsible(familyId, range),
      this.getRule(familyId),
    ]);

    const pagoPor = new Map<string, number>();
    for (const a of agregados) {
      pagoPor.set(a.responsible, Number(a.total) || 0);
    }

    const totalPaid = this.arredondar(
      Array.from(pagoPor.values()).reduce((soma, v) => soma + v, 0),
    );

    const warnings: string[] = [];

    if (pagoPor.size === 0) {
      warnings.push(
        'Não há despesas lançadas no período selecionado — não há acerto de contas a fazer.',
      );
    }

    // A renda recorrente só é consultada quando a regra realmente depende dela.
    let incomeBasis: { responsible: string; monthlyAmount: number }[] = [];
    if (regra.mode === SplitMode.INCOME_PROPORTIONAL) {
      incomeBasis = (
        await this.incomeService.getRecurringMonthlyIncome(user)
      ).filter((i) => Number(i.monthlyAmount) > 0);
    }

    const { appliedMode, percentuais, criteria } = this.resolverPercentuais(
      regra,
      pagoPor,
      incomeBasis,
      warnings,
    );

    const entries: SettlementEntry[] = Array.from(percentuais.entries())
      .map(([responsible, targetPercent]) => {
        const paid = this.arredondar(pagoPor.get(responsible) ?? 0);
        const shouldHavePaid = this.arredondar(
          (totalPaid * targetPercent) / 100,
        );
        const balance = this.arredondar(paid - shouldHavePaid);

        return {
          responsible,
          paid,
          targetPercent: this.arredondar(targetPercent),
          shouldHavePaid,
          balance,
          status: this.statusDoSaldo(balance),
        };
      })
      .sort((a, b) => b.balance - a.balance);

    return {
      period,
      start: range.start,
      end: range.end,
      configuredMode: regra.mode,
      appliedMode,
      criteria,
      fallbackApplied: appliedMode !== regra.mode,
      totalPaid,
      entries,
      transfers: this.calcularTransferencias(entries),
      incomeBasis,
      warnings,
    };
  }

  // ==================== regra de rateio ====================

  /**
   * Regra vigente da família.
   *
   * Sem regra cadastrada devolve o padrão `EQUAL` marcado com `isDefault`, para
   * que a tela mostre "divisão igualitária (padrão)" em vez de sugerir que
   * alguém configurou isso.
   */
  async getRule(familyId: string): Promise<SplitRuleView> {
    const regra = await this.splitRuleRepository.findOne({
      where: { familyId },
    });

    if (!regra) {
      return {
        mode: SplitMode.EQUAL,
        customPercentages: null,
        notes: null,
        isDefault: true,
        updatedAt: null,
      };
    }

    return {
      mode: regra.mode,
      customPercentages: regra.customPercentages,
      notes: regra.notes,
      isDefault: false,
      updatedAt: regra.updatedAt,
    };
  }

  /**
   * Cria ou substitui a regra de rateio da família.
   *
   * No modo `CUSTOM` os percentuais são obrigatórios e precisam somar 100 —
   * qualquer outra soma produziria um acerto de contas que não fecha.
   */
  async setRule(familyId: string, dto: SetSplitRuleDto): Promise<SplitRuleView> {
    const percentuais = this.validarPercentuaisCustom(dto);

    let regra = await this.splitRuleRepository.findOne({ where: { familyId } });

    if (!regra) {
      regra = this.splitRuleRepository.create({ familyId });
    }

    regra.mode = dto.mode;
    regra.customPercentages = percentuais;
    regra.notes = dto.notes ?? null;

    const salva = await this.splitRuleRepository.save(regra);
    this.logger.log(
      `Regra de rateio da família ${familyId} definida como ${salva.mode}`,
    );

    return {
      mode: salva.mode,
      customPercentages: salva.customPercentages,
      notes: salva.notes,
      isDefault: false,
      updatedAt: salva.updatedAt,
    };
  }

  // ==================== helpers ====================

  /**
   * Percentual alvo de cada responsável segundo a regra — e o critério que foi
   * REALMENTE aplicado.
   *
   * Quando os dados não sustentam o modo configurado, o método rebaixa o
   * critério para `EQUAL` e registra o motivo em `warnings`, nunca em silêncio.
   */
  private resolverPercentuais(
    regra: SplitRuleView,
    pagoPor: Map<string, number>,
    incomeBasis: { responsible: string; monthlyAmount: number }[],
    warnings: string[],
  ): {
    appliedMode: SplitMode;
    percentuais: Map<string, number>;
    criteria: string;
  } {
    if (regra.mode === SplitMode.CUSTOM) {
      const custom = regra.customPercentages ?? {};

      if (Object.keys(custom).length === 0) {
        warnings.push(
          'A regra da família está no modo CUSTOM, mas nenhum percentual foi salvo. ' +
            'Foi aplicada a divisão igualitária — informe os percentuais em PUT /split/rule.',
        );
        return this.rateioIgualitario(pagoPor, SplitMode.EQUAL);
      }

      const participantes = new Set([
        ...Object.keys(custom),
        ...pagoPor.keys(),
      ]);

      const semPercentual = Array.from(participantes).filter(
        (r) => custom[r] === undefined,
      );

      if (semPercentual.length > 0) {
        warnings.push(
          `Sem percentual definido para ${semPercentual.join(', ')}: ` +
            'esses responsáveis foram considerados com 0% na regra CUSTOM. ' +
            'Atualize a regra para incluí-los.',
        );
      }

      const percentuais = new Map<string, number>();
      for (const responsavel of participantes) {
        percentuais.set(responsavel, Number(custom[responsavel]) || 0);
      }

      return {
        appliedMode: SplitMode.CUSTOM,
        percentuais,
        criteria:
          'Percentuais definidos manualmente pela família: ' +
          Array.from(percentuais.entries())
            .map(([r, p]) => `${r} ${this.arredondar(p)}%`)
            .join(', ') +
          '.',
      };
    }

    if (regra.mode === SplitMode.INCOME_PROPORTIONAL) {
      const rendaTotal = incomeBasis.reduce(
        (soma, i) => soma + Number(i.monthlyAmount),
        0,
      );

      // Regra 27: sem renda recorrente cadastrada NÃO se chuta 50/50 em
      // silêncio — o resultado diz o que faltou e qual critério foi usado.
      if (incomeBasis.length === 0 || rendaTotal <= 0) {
        warnings.push(
          'Rateio proporcional à renda solicitado, mas não há nenhuma receita recorrente ' +
            'mensal cadastrada para os responsáveis. Sem essa informação a proporção real não ' +
            'pode ser calculada: o acerto abaixo usou divisão igualitária. ' +
            'Cadastre os salários como receitas recorrentes mensais para usar a renda real.',
        );

        const igualitario = this.rateioIgualitario(pagoPor, SplitMode.EQUAL);
        return {
          ...igualitario,
          criteria:
            'Divisão igualitária aplicada por FALTA DE DADOS de renda recorrente ' +
            '(o modo configurado é proporcional à renda).',
        };
      }

      const participantes = new Set([
        ...incomeBasis.map((i) => i.responsible),
        ...pagoPor.keys(),
      ]);

      const semRenda = Array.from(participantes).filter(
        (r) => !incomeBasis.some((i) => i.responsible === r),
      );

      if (semRenda.length > 0) {
        warnings.push(
          `Sem receita recorrente mensal cadastrada para ${semRenda.join(', ')}: ` +
            'a participação desses responsáveis foi calculada como 0% da renda da casa. ' +
            'Cadastre a renda deles para que o rateio proporcional fique correto.',
        );
      }

      const percentuais = new Map<string, number>();
      for (const responsavel of participantes) {
        const renda =
          incomeBasis.find((i) => i.responsible === responsavel)
            ?.monthlyAmount ?? 0;
        percentuais.set(responsavel, (Number(renda) / rendaTotal) * 100);
      }

      return {
        appliedMode: SplitMode.INCOME_PROPORTIONAL,
        percentuais,
        criteria:
          'Proporcional à renda recorrente mensal (total da casa: ' +
          `${this.arredondar(rendaTotal)}) — ` +
          Array.from(percentuais.entries())
            .map(([r, p]) => `${r} ${this.arredondar(p)}%`)
            .join(', ') +
          '.',
      };
    }

    return this.rateioIgualitario(pagoPor, SplitMode.EQUAL);
  }

  /** Divisão 1/N entre os responsáveis com despesas no período. */
  private rateioIgualitario(
    pagoPor: Map<string, number>,
    appliedMode: SplitMode,
  ): {
    appliedMode: SplitMode;
    percentuais: Map<string, number>;
    criteria: string;
  } {
    const responsaveis = Array.from(pagoPor.keys());
    const percentuais = new Map<string, number>();

    for (const responsavel of responsaveis) {
      percentuais.set(responsavel, 100 / responsaveis.length);
    }

    return {
      appliedMode,
      percentuais,
      criteria:
        responsaveis.length > 0
          ? `Divisão igualitária entre ${responsaveis.length} responsável(is): ` +
            `${this.arredondar(100 / responsaveis.length)}% para cada um.`
          : 'Divisão igualitária — não há responsáveis com despesas no período.',
    };
  }

  /** Diferença entre os dois maiores pagadores do período. */
  private calcularDiferenca(
    participants: ResponsibleShare[],
  ): SplitDifference | null {
    if (participants.length < 2) return null;

    const [maior, segundo] = participants;

    return {
      paidMore: maior.responsible,
      paidLess: segundo.responsible,
      amount: this.arredondar(maior.paid - segundo.paid),
      percentPoints: this.arredondar(
        maior.sharePercent - segundo.sharePercent,
      ),
    };
  }

  /**
   * Transferências que zeram o acerto.
   *
   * Casa quem pagou a menos (devedor) com quem pagou a mais (credor) de forma
   * gulosa: com dois responsáveis isso produz exatamente um repasse, que é o
   * caso da casa do Bruno e da Giovanna.
   */
  private calcularTransferencias(
    entries: SettlementEntry[],
  ): SettlementTransfer[] {
    const credores = entries
      .filter((e) => e.balance > TOLERANCIA_CENTAVOS)
      .map((e) => ({ responsible: e.responsible, restante: e.balance }));

    const devedores = entries
      .filter((e) => e.balance < -TOLERANCIA_CENTAVOS)
      .map((e) => ({ responsible: e.responsible, restante: -e.balance }));

    const transferencias: SettlementTransfer[] = [];

    let i = 0;
    let j = 0;

    while (i < devedores.length && j < credores.length) {
      const valor = Math.min(devedores[i].restante, credores[j].restante);

      if (valor > TOLERANCIA_CENTAVOS) {
        transferencias.push({
          from: devedores[i].responsible,
          to: credores[j].responsible,
          amount: this.arredondar(valor),
        });
      }

      devedores[i].restante -= valor;
      credores[j].restante -= valor;

      if (devedores[i].restante <= TOLERANCIA_CENTAVOS) i += 1;
      if (credores[j].restante <= TOLERANCIA_CENTAVOS) j += 1;
    }

    return transferencias;
  }

  private statusDoSaldo(balance: number): 'RECEBE' | 'PAGA' | 'QUITADO' {
    if (balance > TOLERANCIA_CENTAVOS) return 'RECEBE';
    if (balance < -TOLERANCIA_CENTAVOS) return 'PAGA';
    return 'QUITADO';
  }

  /**
   * Valida os percentuais do modo `CUSTOM`.
   *
   * Devolve `null` para os demais modos: guardar percentuais manuais junto de
   * uma regra `EQUAL` só criaria ambiguidade sobre qual critério vale.
   */
  private validarPercentuaisCustom(
    dto: SetSplitRuleDto,
  ): Record<string, number> | null {
    if (dto.mode !== SplitMode.CUSTOM) {
      return null;
    }

    const percentuais = dto.customPercentages ?? {};
    const chaves = Object.keys(percentuais);

    if (chaves.length === 0) {
      throw new BadRequestException(
        'Informe os percentuais por responsável para usar o modo CUSTOM. ' +
          'Exemplo: { "mode": "CUSTOM", "customPercentages": { "bruno": 70, "giovanna": 30 } }',
      );
    }

    const normalizados: Record<string, number> = {};

    for (const chave of chaves) {
      const valor = Number(percentuais[chave]);

      if (!Number.isFinite(valor) || valor < 0 || valor > 100) {
        throw new BadRequestException(
          `Percentual inválido para "${chave}": informe um número entre 0 e 100.`,
        );
      }

      normalizados[chave] = valor;
    }

    const soma = Object.values(normalizados).reduce((s, v) => s + v, 0);

    if (Math.abs(soma - 100) > TOLERANCIA_PERCENTUAL) {
      throw new BadRequestException(
        `Os percentuais precisam somar 100. Soma informada: ${this.arredondar(soma)}.`,
      );
    }

    return normalizados;
  }

  /** Arredonda para centavos, evitando dízimas do ponto flutuante na resposta. */
  private arredondar(valor: number): number {
    return Math.round((Number(valor) || 0) * 100) / 100;
  }
}
