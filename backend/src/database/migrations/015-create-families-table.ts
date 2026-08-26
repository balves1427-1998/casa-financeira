import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * Cria a tabela `families`.
 *
 * As tabelas de inteligência financeira (migration 016) declaram foreign keys
 * apontando para `families`, mas nenhuma migration anterior criava essa tabela —
 * o que fazia toda a cadeia de migrations falhar. Esta migration corrige a
 * lacuna e precisa rodar antes da 016.
 */
export class CreateFamiliesTable1692864015000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'families',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'name',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'description',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'isActive',
            type: 'boolean',
            default: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'deletedAt',
            type: 'timestamp',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'families',
      new TableIndex({
        name: 'idx_families_created',
        columnNames: ['createdAt'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('families', true);
  }
}
