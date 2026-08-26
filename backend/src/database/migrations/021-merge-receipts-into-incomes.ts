import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Consolida `receipts` em `incomes`.
 *
 * As duas tabelas guardavam EXATAMENTE o mesmo conceito — receita — com as
 * mesmas colunas e até o mesmo comentário de código (`// salary, freelance,
 * bonus, etc`). Havia dois endpoints concorrentes gravando cada um na sua, e
 * toda a inteligência financeira (`FinancialDataService`, dashboard, previsões,
 * rateio) lê apenas `incomes`.
 *
 * Na prática isso significava perda silenciosa de dados: uma receita cadastrada
 * pela tela de "recibos" nunca aparecia no saldo nem na análise da casa.
 *
 * Esta migration copia o que existe em `receipts` para `incomes` e remove a
 * tabela duplicada. Nenhum lançamento é descartado.
 */
export class MergeReceiptsIntoIncomes1692864021000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const tabela = await queryRunner.getTable('receipts');

    if (!tabela) {
      return;
    }

    // Copia preservando o id original: se a mesma linha já tiver sido migrada
    // numa execução anterior, o ON CONFLICT a ignora.
    await queryRunner.query(`
      INSERT INTO "incomes" (
        "id", "userId", "accountId", "description", "type", "amount", "date",
        "responsible", "isRecurring", "frequency", "observation",
        "createdAt", "updatedAt", "deletedAt"
      )
      SELECT
        r."id", r."userId", r."accountId", r."description", r."type", r."amount",
        r."date", r."responsible", r."isRecurring", r."frequency", r."observation",
        r."createdAt", r."updatedAt", r."deletedAt"
      FROM "receipts" r
      ON CONFLICT ("id") DO NOTHING
    `);

    await queryRunner.dropTable('receipts', true);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Recria a tabela vazia com a estrutura original. Os lançamentos migrados
    // permanecem em `incomes`: separá-los de volta exigiria uma marcação de
    // origem que nunca existiu.
    await queryRunner.query(`
      CREATE TABLE "receipts" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "accountId" uuid NOT NULL,
        "description" character varying NOT NULL,
        "type" character varying NOT NULL,
        "amount" numeric(15,2) NOT NULL,
        "date" TIMESTAMP NOT NULL,
        "responsible" character varying NOT NULL,
        "isRecurring" boolean NOT NULL DEFAULT false,
        "frequency" character varying,
        "observation" character varying,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP
      )
    `);
  }
}
