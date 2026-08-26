import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateMLFeedbackTable1692864008000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'ml_feedback',
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
            name: 'expense_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'description',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'suggested_category_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'correct_category_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'original_confidence',
            type: 'numeric',
            precision: 3,
            scale: 2,
            default: 0,
          },
          {
            name: 'feedback_type',
            type: 'enum',
            enum: ['correct', 'incorrect', 'partial'],
            default: "'incorrect'",
          },
          {
            name: 'is_positive',
            type: 'boolean',
            default: false,
          },
          {
            name: 'notes',
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
      'ml_feedback',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'ml_feedback',
      new TableForeignKey({
        columnNames: ['expense_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'expenses',
        onDelete: 'SET NULL',
      }),
    );

    await queryRunner.createForeignKey(
      'ml_feedback',
      new TableForeignKey({
        columnNames: ['suggested_category_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'categories',
        onDelete: 'SET NULL',
      }),
    );

    await queryRunner.createForeignKey(
      'ml_feedback',
      new TableForeignKey({
        columnNames: ['correct_category_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'categories',
        onDelete: 'CASCADE',
      }),
    );

    // Indices
    await queryRunner.createIndex('ml_feedback', new TableIndex({
      columnNames: ['user_id'],
    }));

    await queryRunner.createIndex('ml_feedback', new TableIndex({
      columnNames: ['user_id', 'created_at'],
    }));

    await queryRunner.createIndex('ml_feedback', new TableIndex({
      columnNames: ['user_id', 'is_positive'],
    }));

    await queryRunner.createIndex('ml_feedback', new TableIndex({
      columnNames: ['correct_category_id'],
    }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('ml_feedback', true);
  }
}
