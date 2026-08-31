import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * O Planejado passa a comportar ENTRADAS, não só saídas.
 *
 * Até aqui `planned_accounts` guardava exclusivamente contas a pagar, e todo
 * consumidor tratava a coluna `amount` como dinheiro que SAI: o fluxo de caixa
 * calcula `saldo projetado = saldo - planejado`, e a previsão faz o mesmo. Jogar
 * um salário nessa tabela sem mais nada faria o sistema DEBITAR R$ 8.500 do
 * saldo previsto — o oposto do que o usuário quer ver.
 *
 * Por isso a coluna `type` nasce com default `'expense'`: todas as linhas
 * existentes continuam sendo saída, e nenhum número muda por causa desta
 * migration. Só as linhas novas, marcadas como `'income'`, somam.
 *
 * `recurringIncomeId` espelha o que `recurringExpenseId` já faz para despesas:
 * liga cada ocorrência projetada à receita recorrente que a originou, para que
 * a série possa ser reabastecida e cancelada. São duas colunas em vez de uma
 * genérica porque cada uma aponta para uma tabela diferente — e uma FK de
 * verdade em cada lado é o que garante que a projeção não sobreviva à origem.
 */
export class PlannedIncomeEntries1692864025000 implements MigrationInterface {
  name = 'PlannedIncomeEntries1692864025000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "planned_accounts"
        ADD COLUMN IF NOT EXISTS "type" varchar(10) NOT NULL DEFAULT 'expense',
        ADD COLUMN IF NOT EXISTS "recurringIncomeId" uuid
    `);

    await queryRunner.query(`
      ALTER TABLE "incomes"
        ADD COLUMN IF NOT EXISTS "recurrenceCancelledAt" timestamp,
        ADD COLUMN IF NOT EXISTS "plannedAccountId" uuid
    `);

    // Barra qualquer valor fora do par previsto: um `type` digitado errado
    // faria a linha ser ignorada nas duas somas, sumindo do saldo em silêncio.
    const jaTemCheck = await queryRunner.query(`
      SELECT 1
      FROM information_schema.table_constraints
      WHERE constraint_name = 'CHK_planned_accounts_type'
        AND table_name = 'planned_accounts'
    `);

    if (jaTemCheck.length === 0) {
      await queryRunner.query(`
        ALTER TABLE "planned_accounts"
          ADD CONSTRAINT "CHK_planned_accounts_type"
          CHECK ("type" IN ('expense', 'income'))
      `);
    }

    const jaTemFk = await queryRunner.query(`
      SELECT 1
      FROM information_schema.table_constraints
      WHERE constraint_name = 'FK_planned_accounts_recurringIncomeId'
        AND table_name = 'planned_accounts'
    `);

    if (jaTemFk.length === 0) {
      await queryRunner.query(`
        ALTER TABLE "planned_accounts"
          ADD CONSTRAINT "FK_planned_accounts_recurringIncomeId"
          FOREIGN KEY ("recurringIncomeId") REFERENCES "incomes"("id")
          ON DELETE CASCADE ON UPDATE CASCADE
      `);
    }

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_PLANNED_INCOME_SERIES"
        ON "planned_accounts" ("recurringIncomeId", "dueDate")
    `);

    // O fluxo de caixa varre o mês separando entrada de saída.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_PLANNED_TYPE_DUE"
        ON "planned_accounts" ("type", "dueDate")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_INCOMES_RECURRING_ACTIVE"
        ON "incomes" ("userId", "isRecurring", "recurrenceCancelledAt")
    `);

    // Confirmar uma entrada prevista cria a receita real; o vínculo é o que
    // impede a mesma confirmação de gerar duas receitas.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_INCOMES_PLANNED_ACCOUNT"
        ON "incomes" ("plannedAccountId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_INCOMES_RECURRING_ACTIVE"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_PLANNED_TYPE_DUE"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_PLANNED_INCOME_SERIES"`);
    await queryRunner.query(`
      ALTER TABLE "planned_accounts"
        DROP CONSTRAINT IF EXISTS "FK_planned_accounts_recurringIncomeId"
    `);
    await queryRunner.query(`
      ALTER TABLE "planned_accounts"
        DROP CONSTRAINT IF EXISTS "CHK_planned_accounts_type"
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_INCOMES_PLANNED_ACCOUNT"`);
    await queryRunner.query(`
      ALTER TABLE "incomes"
        DROP COLUMN IF EXISTS "plannedAccountId",
        DROP COLUMN IF EXISTS "recurrenceCancelledAt"
    `);
    await queryRunner.query(`
      ALTER TABLE "planned_accounts"
        DROP COLUMN IF EXISTS "recurringIncomeId",
        DROP COLUMN IF EXISTS "type"
    `);
  }
}
