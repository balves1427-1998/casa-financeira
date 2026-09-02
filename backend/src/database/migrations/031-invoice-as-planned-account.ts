import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A fatura do cartão vira UM compromisso no Planejado.
 *
 * O PROBLEMA QUE ISTO RESOLVE
 * ---------------------------
 * Uma compra no crédito não tira dinheiro da conta no dia em que é feita: ela
 * entra numa fatura que vence semanas depois. O sistema tratava as duas coisas
 * como iguais — a despesa importada saía do caixa no dia da compra — e quem
 * também cadastrasse "Fatura Nubank" como conta a pagar via o mesmo dinheiro
 * sair DUAS VEZES da projeção.
 *
 * A partir daqui:
 *  - cada compra continua em Despesas, com a data da compra (para saber onde o
 *    dinheiro foi gasto) e agora também com a data de VENCIMENTO da fatura
 *    (para saber quando ele sai);
 *  - a fatura inteira vira uma única linha no Planejado, ligada ao cartão e à
 *    competência;
 *  - o Fluxo de Caixa passa a debitar a fatura, e não as compras.
 *
 * `invoiceCompetencia` ("2026-09") é o que permite SUBSTITUIR uma projeção pelo
 * valor real: importar a fatura de setembro acha a linha de setembro daquele
 * cartão e atualiza o valor, em vez de criar uma segunda.
 *
 * O índice é único e PARCIAL: vale só para as linhas que são fatura de cartão.
 * Sem o `WHERE`, todas as contas comuns — que têm os dois campos nulos —
 * colidiriam entre si.
 */
export class InvoiceAsPlannedAccount1692864031000 implements MigrationInterface {
  name = 'InvoiceAsPlannedAccount1692864031000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "planned_accounts"
        ADD COLUMN IF NOT EXISTS "invoiceCompetencia" varchar(7),
        ADD COLUMN IF NOT EXISTS "pdfImportId" uuid
    `);

    // Data em que o dinheiro realmente sai: para compra no crédito é o
    // vencimento da fatura; para as demais, a própria data da despesa.
    await queryRunner.query(`
      ALTER TABLE "expenses"
        ADD COLUMN IF NOT EXISTS "dueDate" timestamp,
        ADD COLUMN IF NOT EXISTS "invoiceCompetencia" varchar(7)
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_PLANNED_FATURA_COMPETENCIA"
        ON "planned_accounts" ("creditCardId", "invoiceCompetencia")
        WHERE "creditCardId" IS NOT NULL AND "invoiceCompetencia" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_EXPENSES_DUE_DATE"
        ON "expenses" ("userId", "dueDate")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_EXPENSES_INVOICE"
        ON "expenses" ("creditCardId", "invoiceCompetencia")
    `);

    // Despesas que já existem: sem fatura conhecida, o dinheiro sai no dia da
    // compra — que é como o sistema se comportava até aqui. Assim nenhum saldo
    // histórico muda por causa desta migration.
    await queryRunner.query(`
      UPDATE "expenses"
      SET "dueDate" = "date"
      WHERE "dueDate" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_PLANNED_FATURA_COMPETENCIA"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_EXPENSES_DUE_DATE"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_EXPENSES_INVOICE"`);
    await queryRunner.query(`
      ALTER TABLE "expenses"
        DROP COLUMN IF EXISTS "dueDate",
        DROP COLUMN IF EXISTS "invoiceCompetencia"
    `);
    await queryRunner.query(`
      ALTER TABLE "planned_accounts"
        DROP COLUMN IF EXISTS "invoiceCompetencia",
        DROP COLUMN IF EXISTS "pdfImportId"
    `);
  }
}
