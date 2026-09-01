import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  PaymentReminder,
  JanelaLembrete,
  TipoLembrete,
} from '../entities/payment-reminder.entity';
import { PlannedAccount } from '../../planned-accounts/entities/planned-account.entity';
import { User } from '../../users/entities/user.entity';
import { EmailService } from './email.service';
import { AlertService } from './alert.service';
import { EmailType } from '../entities/email-log.entity';
import {
  AlertType,
  AlertSeverity,
} from '../entities/alert.entity';

/**
 * Quantos dias antes do vencimento o primeiro aviso sai.
 *
 * Três dias é o que o escopo do projeto pede, e é o prazo que ainda permite
 * agir: dá tempo de transferir dinheiro ou remanejar antes de vencer.
 */
const DIAS_DE_ANTECEDENCIA = 3;

/**
 * Até quantos dias depois do vencimento o alerta continua saindo.
 *
 * A regra é "avisar até ser pago", mas sem um teto uma conta esquecida em 2026
 * ainda estaria mandando e-mail em 2028, duas vezes por dia. Sessenta dias é
 * tempo mais do que suficiente para o aviso cumprir seu papel; depois disso ele
 * virou ruído, e ruído diário faz o usuário parar de ler TODOS os avisos —
 * inclusive os que importam.
 */
const DIAS_MAXIMOS_EM_ATRASO = 60;

export interface ResultadoDoDisparo {
  janela: JanelaLembrete;
  referencia: string;
  contasAvaliadas: number;
  lembretesEnviados: number;
  jaEnviados: number;
  falhas: number;
  smtpConfigurado: boolean;
}

/**
 * Lembretes e alertas de vencimento.
 *
 * A REGRA, em uma frase: avisar o responsável três dias antes do vencimento e
 * continuar avisando — duas vezes por dia — até a conta ser marcada como paga,
 * sinalizando quando ela entra em atraso.
 *
 * ONDE ISTO ESTAVA ANTES
 * ----------------------
 * O método `detectDueAccountAlerts` existia com um `// TODO: Integrar com
 * módulo de contas planejadas` e só escrevia uma linha no log. Nenhum aviso
 * jamais saiu. O serviço de e-mail, por sua vez, *simulava* o envio: gravava
 * "enviado" no histórico sem mandar nada.
 *
 * COMO O DISPARO ACONTECE DE FATO
 * -------------------------------
 * Duas janelas por dia, 10h e 19h no horário de Brasília. O agendador interno
 * cobre isso quando a aplicação está no ar — mas no plano gratuito do Render o
 * serviço HIBERNA depois de 15 minutos sem tráfego, e um cron dentro de um
 * processo dormindo não dispara. Por isso o mesmo disparo é exposto num
 * endpoint protegido, que um agendador externo (o cron-job.org, por exemplo)
 * pode chamar — a chamada acorda o serviço e executa o envio.
 *
 * Os dois caminhos são seguros de combinar porque cada lembrete é registrado em
 * `payment_reminders` com índice único por (conta, dia, janela): chamar duas
 * vezes não manda duas vezes.
 */
@Injectable()
export class PaymentReminderService {
  private readonly logger = new Logger(PaymentReminderService.name);

  constructor(
    @InjectRepository(PaymentReminder)
    private readonly reminderRepository: Repository<PaymentReminder>,
    @InjectRepository(PlannedAccount)
    private readonly plannedRepository: Repository<PlannedAccount>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly emailService: EmailService,
    private readonly alertService: AlertService,
  ) {}

  // ==================== agendamento interno ====================

  /**
   * 10h no horário de Brasília.
   *
   * O fuso é declarado explicitamente porque o servidor roda em UTC: sem isso,
   * "10h" viraria 7h da manhã no Brasil.
   */
  @Cron('0 10 * * *', { timeZone: 'America/Sao_Paulo' })
  async dispararPelaManha(): Promise<void> {
    await this.executarComTratamento('morning');
  }

  /** 19h no horário de Brasília. */
  @Cron('0 19 * * *', { timeZone: 'America/Sao_Paulo' })
  async dispararANoite(): Promise<void> {
    await this.executarComTratamento('evening');
  }

  private async executarComTratamento(janela: JanelaLembrete): Promise<void> {
    try {
      const resultado = await this.dispatch(janela);
      this.logger.log(
        `Lembretes (${janela}): ${resultado.lembretesEnviados} enviado(s), ` +
          `${resultado.jaEnviados} já enviado(s) hoje, ${resultado.falhas} falha(s).`,
      );
    } catch (erro) {
      this.logger.error(
        `Falha ao disparar os lembretes da janela ${janela}: ${
          erro instanceof Error ? erro.message : erro
        }`,
      );
    }
  }

  // ==================== o disparo ====================

  /**
   * Percorre as contas que merecem aviso e envia o que ainda não foi enviado.
   *
   * Idempotente: rodar duas vezes na mesma janela não duplica nada.
   */
  async dispatch(
    janela: JanelaLembrete,
    referencia: Date = new Date(),
  ): Promise<ResultadoDoDisparo> {
    const hoje = this.soData(referencia);
    const referenceDate = this.paraIso(hoje);

    const contas = await this.buscarContasQueMerecemAviso(hoje);

    const resultado: ResultadoDoDisparo = {
      janela,
      referencia: referenceDate,
      contasAvaliadas: contas.length,
      lembretesEnviados: 0,
      jaEnviados: 0,
      falhas: 0,
      smtpConfigurado: this.emailService.smtpConfigurado,
    };

    if (contas.length === 0) {
      return resultado;
    }

    // Registros desta janela, numa consulta só — evita uma ida ao banco por
    // conta quando a casa tem muitas contas em aberto.
    const registros = await this.reminderRepository.find({
      where: {
        plannedAccountId: In(contas.map((c) => c.id)),
        referenceDate,
        window: janela,
      },
    });

    const registroPorConta = new Map(
      registros.map((r) => [r.plannedAccountId, r]),
    );

    for (const conta of contas) {
      const anterior = registroPorConta.get(conta.id);

      // Só um envio BEM-SUCEDIDO consome a janela. Uma tentativa que falhou —
      // SMTP fora do ar, caixa cheia — não pode custar o aviso do dia: o
      // próximo disparo tenta de novo, reaproveitando o mesmo registro.
      if (anterior?.emailSent) {
        resultado.jaEnviados += 1;
        continue;
      }

      const enviou = await this.avisarSobre(
        conta,
        hoje,
        janela,
        referenceDate,
        anterior,
      );

      if (enviou) {
        resultado.lembretesEnviados += 1;
      } else {
        resultado.falhas += 1;
      }
    }

    return resultado;
  }

  /**
   * Contas que devem gerar aviso hoje.
   *
   * Duas faixas: as que vencem nos próximos três dias e as que já venceram e
   * continuam em aberto (até o teto de atraso). O que já está pago ou cancelado
   * fica de fora — é isso que faz os lembretes PARAREM quando a conta é
   * quitada, sem precisar de nenhuma ação extra.
   */
  private async buscarContasQueMerecemAviso(
    hoje: Date,
  ): Promise<PlannedAccount[]> {
    const limiteFuturo = new Date(hoje);
    limiteFuturo.setDate(limiteFuturo.getDate() + DIAS_DE_ANTECEDENCIA);
    limiteFuturo.setHours(23, 59, 59, 999);

    const limitePassado = new Date(hoje);
    limitePassado.setDate(limitePassado.getDate() - DIAS_MAXIMOS_EM_ATRASO);

    return this.plannedRepository
      .createQueryBuilder('planned')
      // Entradas previstas (salário) não são cobrança: ninguém precisa de
      // lembrete para receber dinheiro.
      .where("planned.type = 'expense'")
      // `paid` e `cancelled` de fora: é o que encerra a série de avisos.
      .andWhere("planned.status IN ('pending', 'confirmed', 'overdue')")
      .andWhere('planned.dueDate BETWEEN :inicio AND :fim', {
        inicio: limitePassado,
        fim: limiteFuturo,
      })
      .orderBy('planned.dueDate', 'ASC')
      .getMany();
  }

  /**
   * Envia o aviso de uma conta e registra a tentativa.
   *
   * O registro é gravado ANTES do envio, de propósito: se a gravação falhar por
   * violação do índice único, é porque outro disparo simultâneo já pegou esta
   * conta — e desistir é o comportamento certo. Gravar depois abriria a janela
   * para os dois enviarem.
   */
  private async avisarSobre(
    conta: PlannedAccount,
    hoje: Date,
    janela: JanelaLembrete,
    referenceDate: string,
    registroAnterior?: PaymentReminder,
  ): Promise<boolean> {
    const diasAteVencer = this.diasEntre(hoje, this.soData(conta.dueDate));
    const emAtraso = diasAteVencer < 0;
    const kind: TipoLembrete = emAtraso ? 'overdue' : 'upcoming';

    const destinatario = await this.resolverDestinatario(conta);

    let registro: PaymentReminder;

    if (registroAnterior) {
      // Retentativa: atualiza o registro que já existe, senão o índice único
      // (conta, dia, janela) rejeitaria a inserção.
      registroAnterior.recipient = destinatario?.email ?? '';
      registroAnterior.kind = kind;
      registroAnterior.daysUntilDue = diasAteVencer;
      registroAnterior.failureReason = undefined;
      registro = await this.reminderRepository.save(registroAnterior);
    } else {
      try {
        registro = await this.reminderRepository.save(
          this.reminderRepository.create({
            plannedAccountId: conta.id,
            userId: destinatario?.id ?? conta.userId,
            recipient: destinatario?.email ?? '',
            referenceDate,
            window: janela,
            kind,
            daysUntilDue: diasAteVencer,
            emailSent: false,
          }),
        );
      } catch (erro) {
        // Índice único violado: outro disparo simultâneo pegou esta conta
        // primeiro. Desistir é o comportamento certo — ele vai enviar.
        this.logger.debug(
          `Lembrete da conta ${conta.id} já registrado para ${referenceDate}/${janela}.`,
        );
        return false;
      }
    }

    // O alerta dentro da aplicação sai SEMPRE, mesmo sem SMTP: é a garantia de
    // que o aviso existe em algum lugar visível.
    await this.registrarAlerta(conta, destinatario, diasAteVencer, emAtraso);

    if (!destinatario?.email) {
      registro.failureReason =
        `Nenhum e-mail encontrado para o responsável "${conta.responsible}".`;
      await this.reminderRepository.save(registro);

      this.logger.warn(
        `Conta ${conta.id}: sem destinatário para o responsável "${conta.responsible}".`,
      );
      return false;
    }

    try {
      await this.emailService.sendEmail(destinatario.id, {
        recipient: destinatario.email,
        type: EmailType.ALERT,
        subject: this.montarAssunto(conta, diasAteVencer, emAtraso),
        templateName: 'payment-reminder',
        templateData: this.montarDados(
          conta,
          destinatario,
          diasAteVencer,
          emAtraso,
        ),
        relatedEntityId: conta.id,
        relatedEntityType: 'planned_account',
      });

      registro.emailSent = true;
      await this.reminderRepository.save(registro);

      return true;
    } catch (erro) {
      registro.failureReason =
        erro instanceof Error ? erro.message : String(erro);
      await this.reminderRepository.save(registro);

      return false;
    }
  }

  /**
   * Encontra a pessoa que deve receber o aviso.
   *
   * `responsible` guarda um nome ("bruno", "giovanna"), não um id. A busca é
   * pelo primeiro nome dentro da família da conta; sem correspondência, o aviso
   * vai para quem cadastrou — melhor chegar a alguém da casa do que a ninguém.
   */
  private async resolverDestinatario(
    conta: PlannedAccount,
  ): Promise<User | null> {
    const criador = await this.userRepository.findOne({
      where: { id: conta.userId },
    });

    if (!criador) {
      return null;
    }

    const responsavel = (conta.responsible ?? '').trim().toLowerCase();

    if (!responsavel || !criador.familyId) {
      return criador;
    }

    const membros = await this.userRepository.find({
      where: { familyId: criador.familyId },
    });

    const correspondente = membros.find((membro) => {
      const primeiroNome = (membro.name ?? '')
        .trim()
        .split(/\s+/)[0]
        .toLowerCase();
      return primeiroNome === responsavel;
    });

    return correspondente ?? criador;
  }

  /** Alerta dentro da aplicação, que não depende de e-mail nenhum. */
  private async registrarAlerta(
    conta: PlannedAccount,
    destinatario: User | null,
    diasAteVencer: number,
    emAtraso: boolean,
  ): Promise<void> {
    try {
      await this.alertService.createAlert({
        userId: destinatario?.id ?? conta.userId,
        type: AlertType.ACCOUNT_DUE,
        severity: emAtraso ? AlertSeverity.CRITICAL : AlertSeverity.WARNING,
        title: emAtraso
          ? `Conta em atraso: ${conta.description}`
          : `Vence ${this.emQuantoTempo(diasAteVencer)}: ${conta.description}`,
        message: this.montarMensagem(conta, diasAteVencer, emAtraso),
        relatedEntityId: conta.id,
        relatedEntityType: 'planned_account',
      } as any);
    } catch (erro) {
      // Falhar aqui não pode impedir o e-mail: são dois canais independentes.
      this.logger.error(
        `Não foi possível registrar o alerta da conta ${conta.id}: ${
          erro instanceof Error ? erro.message : erro
        }`,
      );
    }
  }

  /**
   * Diagnóstico: por que um aviso pode não ter chegado.
   *
   * Existe para o usuário conseguir responder isso sozinho, sem abrir o log do
   * servidor — que ele não tem como abrir.
   */
  async getStatus(): Promise<{
    smtpConfigurado: boolean;
    disparoExternoConfigurado: boolean;
    janelas: string[];
    ultimosEnvios: Array<{
      conta: string;
      destinatario: string;
      quando: Date;
      janela: string;
      tipo: string;
      enviado: boolean;
      motivoDaFalha?: string;
    }>;
  }> {
    const ultimos = await this.reminderRepository.find({
      order: { createdAt: 'DESC' },
      take: 10,
    });

    return {
      smtpConfigurado: this.emailService.smtpConfigurado,
      disparoExternoConfigurado: Boolean(process.env.REMINDER_DISPATCH_TOKEN),
      janelas: ['10:00 (America/Sao_Paulo)', '19:00 (America/Sao_Paulo)'],
      ultimosEnvios: ultimos.map((r) => ({
        conta: r.plannedAccountId,
        destinatario: r.recipient,
        quando: r.createdAt,
        janela: r.window,
        tipo: r.kind,
        enviado: r.emailSent,
        motivoDaFalha: r.failureReason,
      })),
    };
  }

  // ==================== textos ====================

  private montarAssunto(
    conta: PlannedAccount,
    diasAteVencer: number,
    emAtraso: boolean,
  ): string {
    const valor = this.formatarMoeda(Number(conta.amount));

    if (emAtraso) {
      const dias = Math.abs(diasAteVencer);
      return `⚠️ Em atraso há ${dias} ${dias === 1 ? 'dia' : 'dias'}: ${conta.description} (${valor})`;
    }

    if (diasAteVencer === 0) {
      return `🔔 Vence hoje: ${conta.description} (${valor})`;
    }

    return `🔔 Vence em ${diasAteVencer} ${diasAteVencer === 1 ? 'dia' : 'dias'}: ${conta.description} (${valor})`;
  }

  private montarMensagem(
    conta: PlannedAccount,
    diasAteVencer: number,
    emAtraso: boolean,
  ): string {
    const valor = this.formatarMoeda(Number(conta.amount));
    const vencimento = this.formatarData(conta.dueDate);

    if (emAtraso) {
      const dias = Math.abs(diasAteVencer);
      return `${conta.description} — ${valor} — venceu em ${vencimento}, há ${dias} ${dias === 1 ? 'dia' : 'dias'}. Marque como paga para encerrar os avisos.`;
    }

    return `${conta.description} — ${valor} — vence em ${vencimento} (${this.emQuantoTempo(diasAteVencer)}).`;
  }

  private emQuantoTempo(dias: number): string {
    if (dias === 0) return 'hoje';
    if (dias === 1) return 'amanhã';
    return `em ${dias} dias`;
  }

  private montarDados(
    conta: PlannedAccount,
    destinatario: User,
    diasAteVencer: number,
    emAtraso: boolean,
  ): Record<string, unknown> {
    const diasEmAtraso = Math.abs(diasAteVencer);
    const base = (process.env.FRONTEND_URL ?? '').split(',')[0].trim();

    return {
      assunto: this.montarAssunto(conta, diasAteVencer, emAtraso),
      nomeResponsavel: (destinatario.name ?? '').split(/\s+/)[0],
      descricao: conta.description,
      valor: this.formatarMoeda(Number(conta.amount)),
      vencimento: this.formatarData(conta.dueDate),
      categoria: conta.category ?? null,
      responsavel: this.capitalizar(conta.responsible ?? ''),

      emAtraso,
      venceHoje: diasAteVencer === 0,
      diasAteVencer,
      umDiaAteVencer: diasAteVencer === 1,
      diasEmAtraso,
      umDiaEmAtraso: diasEmAtraso === 1,

      frequencia: 'duas vezes por dia (10h e 19h)',
      urlPainel: base ? `${base}/planned` : null,
    };
  }

  // ==================== helpers ====================

  private soData(data: Date | string): Date {
    const resultado = new Date(data);
    resultado.setHours(0, 0, 0, 0);
    return resultado;
  }

  private paraIso(data: Date): string {
    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
  }

  private diasEntre(de: Date, ate: Date): number {
    return Math.round((ate.getTime() - de.getTime()) / 86400000);
  }

  private formatarMoeda(valor: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(valor);
  }

  private formatarData(data: Date | string): string {
    return new Date(data).toLocaleDateString('pt-BR', {
      timeZone: 'UTC',
    });
  }

  private capitalizar(texto: string): string {
    if (!texto) return '';
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }
}
