import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateMLPatternsTable1692864009000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'ml_patterns',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'user_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'category_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'pattern_type',
            type: 'enum',
            enum: ['keyword', 'regex', 'establishment', 'amount_range', 'time_based', 'multi_criteria'],
            default: "'keyword'",
          },
          {
            name: 'pattern',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'confidence',
            type: 'numeric',
            precision: 3,
            scale: 2,
            isNullable: false,
          },
          {
            name: 'match_count',
            type: 'integer',
            default: 0,
          },
          {
            name: 'last_matched_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['auto', 'approved', 'rejected'],
            default: "'auto'",
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'jsonb',
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
          {
            name: 'deleted_at',
            type: 'timestamp',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // Foreign keys
    await queryRunner.createForeignKey(
      'ml_patterns',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'ml_patterns',
      new TableForeignKey({
        columnNames: ['category_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'categories',
        onDelete: 'CASCADE',
      }),
    );

    // Indices
    await queryRunner.createIndex('ml_patterns', new TableIndex({
      columnNames: ['user_id'],
    }));

    await queryRunner.createIndex('ml_patterns', new TableIndex({
      columnNames: ['user_id', 'category_id'],
    }));

    await queryRunner.createIndex('ml_patterns', new TableIndex({
      columnNames: ['user_id', 'confidence'],
    }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('ml_patterns', true);
  }
}
