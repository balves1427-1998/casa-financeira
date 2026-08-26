import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

/**
 * Cria a tabela `split_rules` — a regra de rateio das despesas compartilhadas
 * da casa (item 15 do escopo: divisão Bruno × Giovanna).
 *
 * Uma linha por família (índice ÚNICO em `family_id`): a casa tem um único
 * acordo vigente. Quando não existe linha, o serviço assume divisão igualitária.
 *
 * `mode` é `varchar` com CHECK constraint em vez de um tipo ENUM do PostgreSQL:
 * acrescentar um modo novo vira uma troca de constraint, sem `ALTER TYPE` nem
 * bloqueio de tabela.
 */
export class CreateSplitRulesTable1692864020000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'split_rules',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'family_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'mode',
            type: 'varchar',
            length: '30',
            isNullable: false,
            default: "'EQUAL'",
          },
          {
            // Percentuais manuais do modo CUSTOM: { "bruno": 70, "giovanna": 30 }
            name: 'custom_percentages',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'notes',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'split_rules',
      new TableIndex({
        name: 'idx_split_rules_family',
        columnNames: ['family_id'],
        isUnique: true,
      }),
    );

    await queryRunner.createForeignKey(
      'split_rules',
      new TableForeignKey({
        name: 'fk_split_rules_family',
        columnNames: ['family_id'],
        referencedTableName: 'families',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.query(
      `ALTER TABLE "split_rules"
         ADD CONSTRAINT "chk_split_rules_mode"
         CHECK ("mode" IN ('EQUAL', 'INCOME_PROPORTIONAL', 'CUSTOM'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "split_rules" DROP CONSTRAINT IF EXISTS "chk_split_rules_mode"`,
    );
    await queryRunner.dropTable('split_rules', true);
  }
}
