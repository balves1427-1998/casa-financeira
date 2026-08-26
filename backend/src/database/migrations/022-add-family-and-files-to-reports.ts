import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Prepara a tabela `reports` para o Relatório Mensal de verdade.
 *
 * O módulo de relatórios era um esqueleto: nenhum arquivo era gravado em disco,
 * o conteúdo do relatório não era persistido e o escopo era por `userId`,
 * enquanto TODO o resto do sistema agrega por família. Esta migration cria as
 * três colunas que faltavam:
 *
 * - `familyId`: escopo real do relatório. Qualquer membro da casa precisa abrir
 *   o relatório que o outro gerou — é o mesmo dinheiro.
 * - `payload`:  a estrutura consolidada do mês, congelada no momento da geração.
 *   Sem isso, reabrir um relatório recalcularia números diferentes dos que foram
 *   exportados para PDF/XLSX/CSV.
 * - `files`:    os arquivos realmente gravados (nome, caminho, tamanho e MIME),
 *   indexados pelo formato.
 *
 * Os relatórios antigos ficam com `familyId` nulo: eram registros que nunca
 * produziram arquivo algum, e inventar uma família para eles seria pior do que
 * deixá-los explicitamente órfãos.
 */
export class AddFamilyAndFilesToReports1692864022000
  implements MigrationInterface
{
  // O nome persistido deve bater com o da classe, senão o TypeORM ordena a
  // migration pelo timestamp antigo.
  name = 'AddFamilyAndFilesToReports1692864022000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "reports"
        ADD COLUMN IF NOT EXISTS "familyId" uuid,
        ADD COLUMN IF NOT EXISTS "payload" jsonb,
        ADD COLUMN IF NOT EXISTS "files" jsonb
    `);

    // `ON DELETE SET NULL`: apagar uma família não pode derrubar o histórico de
    // relatórios junto — o registro passa a ser apenas do usuário que o gerou.
    const jaTemFk = await queryRunner.query(`
      SELECT 1
      FROM information_schema.table_constraints
      WHERE constraint_name = 'FK_reports_familyId'
        AND table_name = 'reports'
    `);

    if (jaTemFk.length === 0) {
      await queryRunner.query(`
        ALTER TABLE "reports"
          ADD CONSTRAINT "FK_reports_familyId"
          FOREIGN KEY ("familyId") REFERENCES "families"("id")
          ON DELETE SET NULL ON UPDATE CASCADE
      `);
    }

    // O histórico é sempre lido pela família, do mais recente para o mais antigo.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_REPORTS_FAMILY_CREATED"
        ON "reports" ("familyId", "createdAt")
    `);

    // A competência é o filtro natural de "já gerei o relatório deste mês?".
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_REPORTS_FAMILY_PERIOD"
        ON "reports" ("familyId", "startYear", "startMonth")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_REPORTS_FAMILY_PERIOD"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_REPORTS_FAMILY_CREATED"`);
    await queryRunner.query(`
      ALTER TABLE "reports" DROP CONSTRAINT IF EXISTS "FK_reports_familyId"
    `);
    await queryRunner.query(`
      ALTER TABLE "reports"
        DROP COLUMN IF EXISTS "files",
        DROP COLUMN IF EXISTS "payload",
        DROP COLUMN IF EXISTS "familyId"
    `);
  }
}
