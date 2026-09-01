import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Registro dos lembretes de vencimento já enviados.
 *
 * POR QUE UMA TABELA, E NÃO SÓ O LOG DE E-MAIL
 * --------------------------------------------
 * Os lembretes são disparados duas vezes por dia, e o disparo pode ser acionado
 * por mais de um caminho: o agendador interno da aplicação e uma chamada externa
 * (necessária porque o plano gratuito do Render hiberna o serviço). Sem um
 * registro de idempotência, uma repetição do acionador — ou um retry do
 * agendador externo — mandaria o mesmo aviso duas, três vezes.
 *
 * A chave única (conta, dia, janela) é o que garante que cada conta receba no
 * máximo UM lembrete pela manhã e UM à noite, não importa quantas vezes o
 * disparo seja chamado.
 *
 * A tabela também serve de auditoria: dá para responder "por que não recebi o
 * aviso do aluguel?" olhando se houve tentativa e qual foi o resultado.
 */
export class PaymentReminders1692864028000 implements MigrationInterface {
  name = 'PaymentReminders1692864028000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payment_reminders" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "plannedAccountId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "recipient" varchar(255) NOT NULL,

        -- Dia do disparo (sem hora) e janela: é o par que impede a repetição.
        "referenceDate" date NOT NULL,
        "window" varchar(10) NOT NULL,

        -- 'upcoming' = ainda vai vencer; 'overdue' = já passou do vencimento.
        "kind" varchar(10) NOT NULL,

        -- Quantos dias faltam (negativo quando em atraso), congelado no envio.
        "daysUntilDue" integer NOT NULL,

        "emailSent" boolean NOT NULL DEFAULT false,
        "failureReason" text,

        "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "payment_reminders"
        ADD CONSTRAINT "CHK_payment_reminders_window"
        CHECK ("window" IN ('morning', 'evening'))
    `);

    await queryRunner.query(`
      ALTER TABLE "payment_reminders"
        ADD CONSTRAINT "CHK_payment_reminders_kind"
        CHECK ("kind" IN ('upcoming', 'overdue'))
    `);

    // Apagar a conta planejada leva junto o histórico de lembretes dela: sem a
    // conta, o registro não responde mais a pergunta nenhuma.
    await queryRunner.query(`
      ALTER TABLE "payment_reminders"
        ADD CONSTRAINT "FK_payment_reminders_plannedAccountId"
        FOREIGN KEY ("plannedAccountId") REFERENCES "planned_accounts"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
    `);

    // A GARANTIA CENTRAL: um lembrete por conta, por dia, por janela.
    // É um índice ÚNICO de propósito — a checagem no código pode perder uma
    // corrida entre dois disparos simultâneos; o banco não perde.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_PAYMENT_REMINDER_JANELA"
        ON "payment_reminders" ("plannedAccountId", "referenceDate", "window")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_PAYMENT_REMINDERS_USER"
        ON "payment_reminders" ("userId", "createdAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "payment_reminders"`);
  }
}
