import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateAnomaliesTable1692864012000 implements MigrationInterface {
  // O nome persistido deve bater com o da classe, senao o TypeORM ordena a migration pelo timestamp antigo.
  name = 'CreateAnomaliesTable1692864012000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create anomalies table
    await queryRunner.createTable(
      new Table({
        name: 'anomalies',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'userId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'categoryId',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'anomalyType',
            type: 'varchar',
            isNullable: false,
            enum: ['spike', 'pattern_change', 'duplicate', 'suspicious', 'unusual_merchant', 'frequency_increase'],
          },
          {
            name: 'description',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'month',
            type: 'integer',
            isNullable: false,
          },
          {
            name: 'year',
            type: 'integer',
            isNullable: false,
          },
          {
            name: 'detectedValue',
            type: 'numeric',
            precision: 12,
            scale: 2,
            isNullable: false,
          },
          {
            name: 'expectedValue',
            type: 'numeric',
            precision: 12,
            scale: 2,
            isNullable: false,
          },
          {
            name: 'deviationPercentage',
            type: 'numeric',
            precision: 5,
            scale: 2,
            isNullable: false,
          },
          {
            name: 'zscore',
            type: 'numeric',
            precision: 5,
            scale: 2,
            isNullable: false,
          },
          {
            name: 'severity',
            type: 'varchar',
            isNullable: false,
            enum: ['low', 'medium', 'high', 'critical'],
          },
          {
            name: 'merchantName',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'frequencyChange',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'occurrenceCount',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'anomalyDate',
            type: 'date',
            isNullable: true,
          },
          {
            name: 'daysIntoMonth',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'historicalComparison',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'recommendation',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'isReviewed',
            type: 'boolean',
            default: false,
            isNullable: false,
          },
          {
            name: 'userAction',
            type: 'varchar',
            isNullable: true,
            enum: ['confirmed', 'dismissed', 'needs_investigation'],
          },
          {
            name: 'userNote',
            type: 'text',
            isNullable: true,
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
            onUpdate: 'CURRENT_TIMESTAMP',
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

    // Add foreign keys
    await queryRunner.createForeignKey(
      'anomalies',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'anomalies',
      new TableForeignKey({
        columnNames: ['categoryId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'categories',
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      }),
    );

    // Add indices
    await queryRunner.createIndex(
      'anomalies',
      new TableIndex({
        name: 'IDX_ANOMALIES_USER_TYPE_MONTH',
        columnNames: ['userId', 'anomalyType', 'month'],
      }),
    );

    await queryRunner.createIndex(
      'anomalies',
      new TableIndex({
        name: 'IDX_ANOMALIES_USER_SEVERITY',
        columnNames: ['userId', 'severity', 'createdAt'],
      }),
    );

    await queryRunner.createIndex(
      'anomalies',
      new TableIndex({
        name: 'IDX_ANOMALIES_USER_CREATED',
        columnNames: ['userId', 'createdAt'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indices
    await queryRunner.dropIndex('anomalies', 'IDX_ANOMALIES_USER_TYPE_MONTH');
    await queryRunner.dropIndex('anomalies', 'IDX_ANOMALIES_USER_SEVERITY');
    await queryRunner.dropIndex('anomalies', 'IDX_ANOMALIES_USER_CREATED');

    // Drop foreign keys
    await queryRunner.dropForeignKey('anomalies', 'FK_anomalies_userId');
    await queryRunner.dropForeignKey('anomalies', 'FK_anomalies_categoryId');

    // Drop table
    await queryRunner.dropTable('anomalies');
  }
}
