import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Alinha `email_logs` com a entidade que o código declara.
 *
 * COMO ISSO PASSOU DESPERCEBIDO
 * -----------------------------
 * O módulo de e-mail nunca tocou o banco de verdade: o envio era *simulado* —
 * uma espera de 100ms e um sorteio de 5% de falha — e o registro era gravado
 * com os campos que a simulação preenchia. As colunas que só apareceriam num
 * envio real nunca foram exercitadas.
 *
 * Na primeira tentativa de envio de verdade, o TypeORM montou o INSERT com
 * todas as colunas da entidade e o PostgreSQL respondeu:
 *
 *   column "bouncedAt" of relation "email_logs" does not exist
 *
 * Ou seja: com o envio real ligado e sem esta migration, NENHUM e-mail sairia —
 * e o motivo ficaria escondido atrás de um "falha ao enviar" genérico.
 *
 * `subject` também é ampliado: a entidade declara 300 caracteres e a tabela
 * tinha 255. O assunto do lembrete inclui a descrição da conta e o valor, e uma
 * descrição longa estouraria o limite — derrubando o aviso justamente da conta
 * cujo nome o usuário caprichou em escrever.
 */
export class FixEmailLogsColumns1692864029000 implements MigrationInterface {
  name = 'FixEmailLogsColumns1692864029000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "email_logs"
        ADD COLUMN IF NOT EXISTS "bouncedAt" timestamp
    `);

    await queryRunner.query(`
      ALTER TABLE "email_logs"
        ALTER COLUMN "subject" TYPE varchar(300)
    `);

    // O histórico de lembretes é consultado por entidade relacionada ("quais
    // e-mails saíram sobre esta conta?").
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_EMAIL_LOGS_RELATED"
        ON "email_logs" ("relatedEntityType", "relatedEntityId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_EMAIL_LOGS_RELATED"`);

    // Truncar assuntos para caber de volta em 255 antes de reduzir a coluna;
    // sem isso o PostgreSQL recusa a alteração.
    await queryRunner.query(`
      UPDATE "email_logs" SET "subject" = left("subject", 255)
      WHERE length("subject") > 255
    `);
    await queryRunner.query(`
      ALTER TABLE "email_logs" ALTER COLUMN "subject" TYPE varchar(255)
    `);
    await queryRunner.query(`
      ALTER TABLE "email_logs" DROP COLUMN IF EXISTS "bouncedAt"
    `);
  }
}
