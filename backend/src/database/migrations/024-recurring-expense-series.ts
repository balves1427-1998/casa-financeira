import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Transforma a despesa recorrente numa SÉRIE perpétua.
 *
 * O que existia antes: marcar "recorrente" gerava exatamente UMA conta no
 * Planejado, a do mês seguinte. Depois disso a recorrência morria — nada
 * aparecia em outubro, novembro, dezembro. Na prática o usuário precisava
 * relançar a mesma despesa todo mês, que era justamente o trabalho manual que a
 * opção deveria eliminar.
 *
 * A regra passa a ser: uma despesa lançada como recorrente **se perpetua até
 * ser cancelada**. Duas colunas sustentam isso:
 *
 * - `planned_accounts.recurringExpenseId` — liga cada ocorrência à despesa que
 *   a originou. É o que permite saber até onde a série já foi gerada, e o que
 *   apagar quando ela for cancelada. Sem esse vínculo, as ocorrências futuras
 *   seriam indistinguíveis de contas cadastradas à mão.
 *
 * - `expenses.recurrenceCancelledAt` — encerra a série. Não é `deletedAt`: a
 *   despesa original continua valendo como gasto realizado; o que acaba é a
 *   projeção para a frente.
 *
 * As ocorrências são mantidas numa janela deslizante de 12 meses, reabastecida
 * conforme o tempo passa. Gerar "para sempre" no banco não existe — o que
 * existe é nunca deixar a janela encurtar.
 */
export class RecurringExpenseSeries1692864024000 implements MigrationInterface {
  name = 'RecurringExpenseSeries1692864024000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "planned_accounts"
        ADD COLUMN IF NOT EXISTS "recurringExpenseId" uuid
    `);

    await queryRunner.query(`
      ALTER TABLE "expenses"
        ADD COLUMN IF NOT EXISTS "recurrenceCancelledAt" timestamp
    `);

    const jaTemFk = await queryRunner.query(`
      SELECT 1
      FROM information_schema.table_constraints
      WHERE constraint_name = 'FK_planned_accounts_recurringExpenseId'
        AND table_name = 'planned_accounts'
    `);

    // `ON DELETE CASCADE`: apagar a despesa que origina a série leva junto as
    // ocorrências futuras que ela projetou — elas não fazem sentido sozinhas.
    if (jaTemFk.length === 0) {
      await queryRunner.query(`
        ALTER TABLE "planned_accounts"
          ADD CONSTRAINT "FK_planned_accounts_recurringExpenseId"
          FOREIGN KEY ("recurringExpenseId") REFERENCES "expenses"("id")
          ON DELETE CASCADE ON UPDATE CASCADE
      `);
    }

    // A pergunta que o reabastecimento faz é sempre "até que data esta série já
    // foi gerada?" — uma varredura por série ordenada por vencimento.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_PLANNED_RECURRING_SERIES"
        ON "planned_accounts" ("recurringExpenseId", "dueDate")
    `);

    // E a listagem de séries ativas filtra por recorrente ainda não cancelada.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_EXPENSES_RECURRING_ACTIVE"
        ON "expenses" ("userId", "isRecurring", "recurrenceCancelledAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_EXPENSES_RECURRING_ACTIVE"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_PLANNED_RECURRING_SERIES"`,
    );
    await queryRunner.query(`
      ALTER TABLE "planned_accounts"
        DROP CONSTRAINT IF EXISTS "FK_planned_accounts_recurringExpenseId"
    `);
    await queryRunner.query(`
      ALTER TABLE "expenses" DROP COLUMN IF EXISTS "recurrenceCancelledAt"
    `);
    await queryRunner.query(`
      ALTER TABLE "planned_accounts" DROP COLUMN IF EXISTS "recurringExpenseId"
    `);
  }
}
