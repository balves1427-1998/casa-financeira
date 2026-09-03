import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

/** Em qual das duas janelas diárias o lembrete saiu. */
export type JanelaLembrete = 'morning' | 'evening';

/** Se a conta ainda vai vencer ou já está em atraso. */
export type TipoLembrete = 'upcoming' | 'overdue';

/**
 * Um lembrete de vencimento já disparado.
 *
 * Existe para IDEMPOTÊNCIA: o disparo acontece duas vezes por dia e pode ser
 * acionado tanto pelo agendador interno quanto por uma chamada externa (o plano
 * gratuito do Render hiberna o serviço, e um cron interno não roda com a
 * aplicação dormindo). Sem este registro, uma repetição do acionador mandaria o
 * mesmo aviso de novo.
 *
 * O índice único em (compromisso, dia, janela) é a garantia real — a checagem
 * no código pode perder uma corrida entre dois disparos simultâneos; o banco
 * não.
 */
@Entity('payment_reminders')
export class PaymentReminder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * De onde veio o compromisso avisado: uma conta planejada OU uma despesa
   * ainda não paga. Exatamente um dos dois é preenchido.
   *
   * A despesa entrou aqui porque a primeira ocorrência de uma recorrente não
   * mora no Planejado — a projeção começa na ocorrência seguinte — e sem isto
   * ela vencia sem nenhum aviso.
   *
   * Os índices únicos que impedem o aviso duplicado são PARCIAIS e vivem na
   * migration 032, um por lado. Não dá para declará-los aqui: o decorador
   * `@Index` não escreve a cláusula `WHERE`, e um índice comum sobre as duas
   * colunas não protegeria nada — no Postgres `NULL` nunca é igual a `NULL`.
   */
  @Column('uuid', { nullable: true })
  plannedAccountId?: string | null;

  @Column('uuid', { nullable: true })
  expenseId?: string | null;

  /** Dono da conta — quem deveria receber o aviso. */
  @Column('uuid')
  userId: string;

  @Column({ length: 255 })
  recipient: string;

  /** Dia do disparo, sem hora. */
  @Column({ type: 'date' })
  referenceDate: string;

  @Column({ length: 10 })
  window: JanelaLembrete;

  @Column({ length: 10 })
  kind: TipoLembrete;

  /**
   * Dias até o vencimento no momento do envio; negativo quando em atraso.
   * Congelado aqui porque a resposta muda com o tempo e o registro precisa
   * dizer o que foi comunicado naquele dia.
   */
  @Column({ type: 'int' })
  daysUntilDue: number;

  /**
   * `false` quando a tentativa falhou.
   *
   * O registro é gravado MESMO na falha, de propósito: sem isso, um SMTP fora
   * do ar faria o sistema tentar de novo a cada disparo e, quando voltasse,
   * despejar todos os avisos atrasados de uma vez.
   */
  @Column({ default: false })
  emailSent: boolean;

  @Column({ type: 'text', nullable: true })
  failureReason?: string;

  @CreateDateColumn()
  createdAt: Date;
}
