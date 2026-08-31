import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Liga a fatura importada ao CARTÃO a que ela pertence.
 *
 * A importação de PDF já existia e criava as despesas — mas sem
 * `creditCardId`. A consequência: o limite utilizado do cartão, que é derivado
 * das compras com esse vínculo, ignorava tudo o que vinha de fatura. Importar
 * uma fatura de R$ 3.000 deixava o cartão marcando limite cheio disponível.
 *
 * A coluna é anulável porque extrato bancário não tem cartão — só fatura tem.
 */
export class LinkInvoiceImportToCard1692864027000
  implements MigrationInterface
{
  name = 'LinkInvoiceImportToCard1692864027000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pdf_imports"
        ADD COLUMN IF NOT EXISTS "creditCardId" uuid
    `);

    const jaTemFk = await queryRunner.query(`
      SELECT 1
      FROM information_schema.table_constraints
      WHERE constraint_name = 'FK_pdf_imports_creditCardId'
        AND table_name = 'pdf_imports'
    `);

    // `ON DELETE SET NULL`: apagar o cartão não pode apagar o histórico de
    // importações, que registra o que foi lido de cada arquivo.
    if (jaTemFk.length === 0) {
      await queryRunner.query(`
        ALTER TABLE "pdf_imports"
          ADD CONSTRAINT "FK_pdf_imports_creditCardId"
          FOREIGN KEY ("creditCardId") REFERENCES "credit_cards"("id")
          ON DELETE SET NULL ON UPDATE CASCADE
      `);
    }

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_PDF_IMPORTS_CARD"
        ON "pdf_imports" ("creditCardId")
    `);

    // A fatura e o histórico do cartão varrem as despesas por cartão e data.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_EXPENSES_CARD_DATE"
        ON "expenses" ("creditCardId", "date")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_EXPENSES_CARD_DATE"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_PDF_IMPORTS_CARD"`);
    await queryRunner.query(`
      ALTER TABLE "pdf_imports"
        DROP CONSTRAINT IF EXISTS "FK_pdf_imports_creditCardId"
    `);
    await queryRunner.query(`
      ALTER TABLE "pdf_imports" DROP COLUMN IF EXISTS "creditCardId"
    `);
  }
}
