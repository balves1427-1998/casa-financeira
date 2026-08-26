import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

/**
 * Vincula usuários a famílias.
 *
 * Todo o módulo de inteligência financeira (chat, recomendações, análises e
 * previsões) é escopado por `familyId`, mas não existia nenhuma ligação entre
 * `users` e `families` — os controllers liam `familyId` de um parâmetro de rota
 * inexistente e sempre recebiam `undefined`.
 *
 * Esta migration:
 *  1. adiciona `users.family_id` (FK para `families`);
 *  2. cria uma família padrão "Casa" e associa a ela todos os usuários já
 *     existentes, de modo que bases em uso continuem funcionando.
 */
export class AddFamilyToUsers1692864017000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'family_id',
        type: 'uuid',
        isNullable: true,
      }),
    );

    await queryRunner.createIndex(
      'users',
      new TableIndex({
        name: 'idx_users_family',
        columnNames: ['family_id'],
      }),
    );

    await queryRunner.createForeignKey(
      'users',
      new TableForeignKey({
        name: 'fk_users_family',
        columnNames: ['family_id'],
        referencedTableName: 'families',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );

    // Backfill: usuários pré-existentes passam a pertencer a uma família padrão.
    const existingUsers = await queryRunner.query(
      `SELECT COUNT(*)::int AS total FROM "users" WHERE "family_id" IS NULL`,
    );

    if (existingUsers?.[0]?.total > 0) {
      const [family] = await queryRunner.query(
        `INSERT INTO "families" ("name", "description")
         VALUES ('Casa', 'Família padrão criada automaticamente na migração')
         RETURNING "id"`,
      );

      await queryRunner.query(
        `UPDATE "users" SET "family_id" = $1 WHERE "family_id" IS NULL`,
        [family.id],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropForeignKey('users', 'fk_users_family');
    await queryRunner.dropIndex('users', 'idx_users_family');
    await queryRunner.dropColumn('users', 'family_id');
  }
}
