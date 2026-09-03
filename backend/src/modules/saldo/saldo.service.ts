import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { Account } from '../accounts/entities/account.entity';
import { Expense } from '../expenses/entities/expense.entity';
import { Income } from '../income/entities/income.entity';
import { PlannedAccount } from '../planned-accounts/entities/planned-account.entity';
import { User } from '../users/entities/user.entity';
import { FamiliesService } from '../families/families.service';

export interface SaldoDaConta {
  accountId: string;
  nome: string;
  saldoInicial: number;
  movimento: number;
  saldo: number;
}

export interface SaldoDaCasa {
  /** Soma dos saldos iniciais das contas de pagamento (cartão fica de fora). */
  saldoInicial: number;
  /** Entradas menos saídas até a data de corte. */
  movimento: number;
  /** `saldoInicial + movimento` — o dinheiro que existe. */
  saldo: number;
  /** Lançamentos que não apontam para nenhuma conta. */
  semConta: number;
  porConta: SaldoDaConta[];
}

/**
 * O saldo, derivado dos lançamentos.
 *
 * ANTES: `accounts.balance` era o número digitado no cadastro da conta e nunca
 * mais mudava — nada no sistema inteiro escrevia nessa coluna. Lançar uma
 * despesa ou receber um salário não movia o saldo em lugar nenhum, e o "saldo
 * inicial" do fluxo de caixa era esse mesmo número congelado, idêntico para
 * qualquer mês consultado. A tabela `cash_flow_snapshots`, que existiria para
 * guardar o fechamento de cada mês, era lida e JAMAIS escrita.
 *
 * AGORA: o saldo é calculado a cada consulta, a partir do que aconteceu:
 *
 *     saldo(t) = saldo inicial cadastrado + entradas(≤t) − saídas(≤t)
 *
 * Derivar em vez de guardar tem uma consequência que vale o custo da consulta:
 * corrigir o valor de uma despesa, apagar um lançamento duplicado ou desfazer
 * um pagamento acerta o saldo sozinho. Um saldo gravado precisaria de um
 * recálculo manual a cada correção, e divergiria em silêncio até alguém notar.
 *
 * QUAIS LANÇAMENTOS MOVEM O CAIXA — a mesma regra do extrato, de propósito:
 * o "saldo até hoje" mostrado lá tem que ser o mesmo número que as outras
 * telas chamam de "saldo em caixa".
 *
 *  - receita registrada com data até hoje: entrou;
 *  - despesa PAGA fora do cartão: saiu — a não paga é compromisso, não saída;
 *  - COMPRA NO CARTÃO: não move nada. O dinheiro continua na conta até a
 *    fatura ser paga;
 *  - fatura de cartão paga: sai na data do pagamento.
 */
@Injectable()
export class SaldoService {
  constructor(
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
    @InjectRepository(Expense)
    private readonly expenseRepository: Repository<Expense>,
    @InjectRepository(Income)
    private readonly incomeRepository: Repository<Income>,
    @InjectRepository(PlannedAccount)
    private readonly plannedAccountRepository: Repository<PlannedAccount>,
    private readonly familiesService: FamiliesService,
  ) {}

  /**
   * Ids cujos lançamentos entram neste saldo.
   *
   * O caixa é da CASA. `getTotalBalance` filtrava por `userId` do usuário
   * logado enquanto todo o resto do sistema soma a família: as contas da
   * Giovanna ficavam fora do saldo, mas as despesas dela entravam.
   */
  private async scopeUserIds(user: User): Promise<string[]> {
    if (!user.familyId) {
      return [user.id];
    }

    const memberIds = await this.familiesService.getMemberIds(user.familyId);
    return memberIds.length > 0 ? memberIds : [user.id];
  }

  /**
   * Saldo da casa numa data.
   *
   * @param ate corte inclusivo. Omitido, vale HOJE — saldo em caixa é o
   *   dinheiro que está na conta agora, não o que vai estar.
   *
   * A versão anterior, sem corte, somava também os lançamentos com data
   * futura. Enquanto a despesa não paga também era descontada, os dois erros
   * mais ou menos se cancelavam; depois que a despesa passou a esperar o
   * pagamento, sobrou a assimetria: o salário do dia 20 contava como se já
   * tivesse caído, e no dia 3 o saldo mostrava R$ 21.929,51 onde havia
   * R$ 12.804,05. A mesma régua vale para os dois lados — o que ainda não
   * aconteceu não está no caixa.
   */
  async getSaldo(user: User, ate?: Date): Promise<SaldoDaCasa> {
    const corte = ate ?? fimDeHoje();
    const userIds = await this.scopeUserIds(user);

    const contas = await this.accountRepository.find({
      where: { userId: In(userIds), type: Not('credit_card' as any) },
      order: { createdAt: 'ASC' },
    });

    const [despesas, receitas, planejadas] = await Promise.all([
      this.expenseRepository.find({ where: { userId: In(userIds) } }),
      this.incomeRepository.find({ where: { userId: In(userIds) } }),
      this.plannedAccountRepository.find({
        where: {
          userId: In(userIds),
          status: 'paid',
          invoiceCompetencia: Not(IsNull()),
        },
      }),
    ]);

    const dentroDoCorte = (data?: Date | null): boolean => {
      if (!data) return false;
      return new Date(data).getTime() <= corte.getTime();
    };

    /** Movimento por conta; a chave vazia guarda o que não aponta para nenhuma. */
    const porConta = new Map<string, number>();
    const somar = (accountId: string | null | undefined, valor: number) => {
      const chave = accountId ?? '';
      porConta.set(chave, (porConta.get(chave) ?? 0) + valor);
    };

    for (const r of receitas) {
      if (!dentroDoCorte(r.date)) continue;
      somar(r.accountId, Number(r.amount));
    }

    for (const d of despesas) {
      // Compra no cartão não moveu a conta. Quem move é a fatura.
      if (d.paymentMethod === 'credit' && d.creditCardId) continue;

      // DESPESA NÃO PAGA NÃO SAIU DO CAIXA.
      //
      // O sistema já sabia disso ao criar o lançamento: uma despesa à vista
      // com data passada nasce paga, uma com data futura nasce pendente. Só o
      // saldo é que ignorava a distinção e descontava as duas — e como um
      // compromisso futuro é justamente o que se cadastra com antecedência,
      // o saldo aparecia menor do que o dinheiro que existe na conta. Numa
      // base real: R$ 21.090,54 em contas ainda não pagas descontados de um
      // saldo de R$ 838,97.
      if (!d.isPaid) continue;

      // Sai no dia em que foi paga, não no dia do lançamento: pagar adiantado
      // ou em atraso muda o dia em que o dinheiro deixou a conta.
      if (!dentroDoCorte(d.paidAt ?? d.date)) continue;
      somar(d.accountId, -Number(d.amount));
    }

    for (const p of planejadas) {
      // A consulta já filtra, mas a regra é crítica demais para depender só
      // dela: uma fatura não paga descontaria dinheiro que continua na conta.
      if (p.status !== 'paid') continue;
      if (!p.invoiceCompetencia || !p.creditCardId) continue;

      const quando = p.paymentDate ?? p.dueDate;
      if (!dentroDoCorte(quando)) continue;
      somar(p.accountId, -Number(p.amount));
    }

    const detalhe: SaldoDaConta[] = contas.map((conta) => {
      const saldoInicial = Number(conta.initialBalance ?? 0);
      const movimento = porConta.get(conta.id) ?? 0;

      return {
        accountId: conta.id,
        nome: conta.name,
        saldoInicial: arredondar(saldoInicial),
        movimento: arredondar(movimento),
        saldo: arredondar(saldoInicial + movimento),
      };
    });

    const idsDeContas = new Set(contas.map((c) => c.id));
    let semConta = 0;
    for (const [chave, valor] of porConta) {
      if (chave === '' || !idsDeContas.has(chave)) semConta += valor;
    }

    const saldoInicial = detalhe.reduce((soma, c) => soma + c.saldoInicial, 0);
    const movimento = detalhe.reduce((soma, c) => soma + c.movimento, 0) + semConta;

    return {
      saldoInicial: arredondar(saldoInicial),
      movimento: arredondar(movimento),
      saldo: arredondar(saldoInicial + movimento),
      semConta: arredondar(semConta),
      porConta: detalhe,
    };
  }

  /** Atalho: só o número. */
  async getSaldoTotal(user: User, ate?: Date): Promise<number> {
    return (await this.getSaldo(user, ate)).saldo;
  }

  /**
   * Saldo na véspera de uma data — o "saldo inicial" de um mês.
   *
   * É aqui que a correção aparece para o usuário: agosto e setembro passam a
   * abrir com números diferentes, cada um sendo o fechamento do mês anterior.
   */
  async getSaldoDeAbertura(user: User, inicioDoMes: Date): Promise<number> {
    const vespera = new Date(inicioDoMes.getTime() - 1);
    return this.getSaldoTotal(user, vespera);
  }
}

function arredondar(valor: number): number {
  return Number(valor.toFixed(2));
}

/** Fim do dia de hoje: o que acontece hoje já conta no saldo de hoje. */
function fimDeHoje(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}
