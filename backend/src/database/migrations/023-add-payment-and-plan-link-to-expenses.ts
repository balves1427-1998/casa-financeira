import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fecha duas lacunas da despesa: **quando ela foi paga** e **de qual conta
 * planejada ela veio**.
 *
 * `isPaid` / `paidAt`
 * -------------------
 * Até aqui a tabela `expenses` registrava apenas que o gasto existiu, nunca se
 * o dinheiro já saiu. Para o cartão de crédito e para o boleto essa distinção é
 * o centro do controle: a compra de hoje só afeta o caixa no vencimento. Sem a
 * coluna, o dashboard não tinha como contar "contas pagas no mês" — só sabia
 * somar.
 *
 * O backfill marca como pago tudo o que já está no passado E saiu de dinheiro
 * imediato (dinheiro, débito, pix, transferência). Isso não é um chute: nessas
 * formas de pagamento o lançamento *é* a saída. Compras no crédito ficam como
 * não pagas, que é a verdade — a fatura ainda vence.
 *
 * `plannedAccountId`
 * ------------------
 * Liga a despesa à conta do Planejado que a originou (ou que ela originou, no
 * caso de despesa recorrente). É o que impede a duplicidade que o usuário
 * relatou: sem o vínculo, cadastrar uma despesa recorrente e a mesma conta no
 * Planejado gerava dois registros do mesmo compromisso, e o fluxo de caixa
 * contava a saída duas vezes.
 */
export class AddPaymentAndPlanLinkToExpenses1692864023000
  implements MigrationInterface
{
  // O nome persistido precisa bater com o da classe, senão o TypeORM reordena
  // a migration pelo timestamp e ela roda fora de sequência.
  name = 'AddPaymentAndPlanLinkToExpenses1692864023000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "expenses"
        ADD COLUMN IF NOT EXISTS "isPaid" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "paidAt" timestamp,
        ADD COLUMN IF NOT EXISTS "plannedAccountId" uuid
    `);

    // Backfill: só o que comprovadamente já saiu do caixa.
    await queryRunner.query(`
      UPDATE "expenses"
      SET "isPaid" = true,
          "paidAt" = "date"
      WHERE "date" <= NOW()
        AND "paymentMethod" IN ('cash', 'debit', 'pix', 'transfer')
        AND "deletedAt" IS NULL
    `);

    const jaTemFk = await queryRunner.query(`
      SELECT 1
      FROM information_schema.table_constraints
      WHERE constraint_name = 'FK_expenses_plannedAccountId'
        AND table_name = 'expenses'
    `);

    // `ON DELETE SET NULL`: apagar a conta planejada não pode apagar a despesa
    // real junto — o dinheiro saiu de qualquer forma.
    if (jaTemFk.length === 0) {
      await queryRunner.query(`
        ALTER TABLE "expenses"
          ADD CONSTRAINT "FK_expenses_plannedAccountId"
          FOREIGN KEY ("plannedAccountId") REFERENCES "planned_accounts"("id")
          ON DELETE SET NULL ON UPDATE CASCADE
      `);
    }

    // O dashboard pergunta "quantas contas foram pagas neste mês?" — é uma
    // varredura por usuário e data de pagamento.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_EXPENSES_USER_PAID"
        ON "expenses" ("userId", "isPaid", "paidAt")
    `);

    // E a checagem de duplicidade da despesa recorrente parte do vínculo.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_EXPENSES_PLANNED_ACCOUNT"
        ON "expenses" ("plannedAccountId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_EXPENSES_PLANNED_ACCOUNT"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_EXPENSES_USER_PAID"`);
    await queryRunner.query(`
      ALTER TABLE "expenses"
        DROP CONSTRAINT IF EXISTS "FK_expenses_plannedAccountId"
    `);
    await queryRunner.query(`
      ALTER TABLE "expenses"
        DROP COLUMN IF EXISTS "plannedAccountId",
        DROP COLUMN IF EXISTS "paidAt",
        DROP COLUMN IF EXISTS "isPaid"
    `);
  }
}
