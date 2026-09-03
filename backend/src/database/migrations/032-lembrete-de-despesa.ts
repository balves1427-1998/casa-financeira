import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * O lembrete passa a cobrir também uma DESPESA não paga.
 *
 * O QUE ISTO RESOLVE
 * ------------------
 * O aviso de vencimento só olhava `planned_accounts`. Só que a primeira
 * ocorrência de toda despesa recorrente não mora lá: quando alguém cadastra
 * "Luz, todo dia 28, mensal", a projeção começa na ocorrência SEGUINTE, e a do
 * próprio mês fica em `expenses`, não paga. Resultado observado numa base real:
 * catorze contas vencendo no mês, R$ 1.000 e tanto, e nenhum lembrete — porque
 * para o disparo elas não existiam.
 *
 * Duplicá-las no Planejado resolveria o aviso e criaria um problema pior: o
 * mesmo compromisso contado duas vezes em "a pagar no mês". A saída é avisar
 * sobre a despesa onde ela já está.
 *
 * O QUE MUDA NA TABELA
 * --------------------
 * `payment_reminders` guardava só `plannedAccountId`, obrigatório e com chave
 * estrangeira. Agora ela guarda um OU outro:
 *
 *   plannedAccountId  uuid NULL  → o aviso é de uma conta planejada
 *   expenseId         uuid NULL  → o aviso é de uma despesa não paga
 *
 * A regra "um aviso por compromisso, por dia, por janela" continua valendo, e
 * continua sendo o banco que a garante — mas agora com DOIS índices únicos
 * parciais, um para cada lado. Um índice comum sobre as duas colunas não
 * serviria: no Postgres, `NULL` nunca é igual a `NULL`, então linhas com o
 * mesmo `expenseId` e `plannedAccountId` nulo não colidiriam entre si, e a
 * proteção contra disparo duplicado deixaria de existir justamente no caso
 * novo.
 */
export class LembreteDeDespesa1692864032000 implements MigrationInterface {
  name = 'LembreteDeDespesa1692864032000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // A tabela pode não existir numa base muito antiga: a 028 a cria, e esta
    // migration precisa ser inofensiva se rodar fora de ordem num ambiente
    // remendado à mão.
    const tabela = await queryRunner.query(`
      SELECT to_regclass('public.payment_reminders') AS existe
    `);

    if (!tabela?.[0]?.existe) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "payment_reminders"
      ALTER COLUMN "plannedAccountId" DROP NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "payment_reminders"
      ADD COLUMN IF NOT EXISTS "expenseId" uuid NULL
    `);

    // `ON DELETE CASCADE` como no vínculo com o planejado: apagar a despesa
    // apaga o histórico de avisos dela, que sozinho não significa nada.
    const jaTemFk = await queryRunner.query(`
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'FK_payment_reminders_expenseId'
    `);

    if (jaTemFk.length === 0) {
      await queryRunner.query(`
        ALTER TABLE "payment_reminders"
        ADD CONSTRAINT "FK_payment_reminders_expenseId"
        FOREIGN KEY ("expenseId") REFERENCES "expenses"("id")
        ON DELETE CASCADE
      `);
    }

    // O índice antigo cobria as três colunas com `plannedAccountId` obrigatório.
    // Agora ele vale só quando o aviso é de uma conta planejada.
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_PAYMENT_REMINDER_JANELA"
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_LEMBRETE_PLANEJADA"
      ON "payment_reminders" ("plannedAccountId", "referenceDate", "window")
      WHERE "plannedAccountId" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_LEMBRETE_DESPESA"
      ON "payment_reminders" ("expenseId", "referenceDate", "window")
      WHERE "expenseId" IS NOT NULL
    `);

    // Uma linha sem nenhum dos dois lados não avisa sobre nada e não teria como
    // ser encontrada de novo. O banco recusa.
    const jaTemCheck = await queryRunner.query(`
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'CK_lembrete_tem_origem'
    `);

    if (jaTemCheck.length === 0) {
      await queryRunner.query(`
        ALTER TABLE "payment_reminders"
        ADD CONSTRAINT "CK_lembrete_tem_origem"
        CHECK ("plannedAccountId" IS NOT NULL OR "expenseId" IS NOT NULL)
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tabela = await queryRunner.query(`
      SELECT to_regclass('public.payment_reminders') AS existe
    `);

    if (!tabela?.[0]?.existe) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "payment_reminders"
      DROP CONSTRAINT IF EXISTS "CK_lembrete_tem_origem"
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_LEMBRETE_DESPESA"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_LEMBRETE_PLANEJADA"`);

    // Avisos de despesa não têm equivalente no modelo antigo: sem apagá-los, a
    // volta da coluna para NOT NULL falharia.
    await queryRunner.query(`
      DELETE FROM "payment_reminders" WHERE "plannedAccountId" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "payment_reminders"
      DROP CONSTRAINT IF EXISTS "FK_payment_reminders_expenseId"
    `);

    await queryRunner.query(`
      ALTER TABLE "payment_reminders" DROP COLUMN IF EXISTS "expenseId"
    `);

    await queryRunner.query(`
      ALTER TABLE "payment_reminders"
      ALTER COLUMN "plannedAccountId" SET NOT NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_PAYMENT_REMINDER_JANELA"
      ON "payment_reminders" ("plannedAccountId", "referenceDate", "window")
    `);
  }
}
