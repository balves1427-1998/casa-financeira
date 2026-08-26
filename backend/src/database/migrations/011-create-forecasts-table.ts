import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateForecastsTable1692864011000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'forecasts',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'userId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'period',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'forecastDate',
            type: 'date',
            isNullable: false,
          },
          {
            name: 'initialBalance',
            type: 'numeric',
            precision: 12,
            scale: 2,
            isNullable: false,
          },
          {
            name: 'projectedEndBalance',
            type: 'numeric',
            precision: 12,
            scale: 2,
            isNullable: false,
          },
          {
            name: 'minProjectedBalance',
            type: 'numeric',
            precision: 12,
            scale: 2,
            isNullable: false,
          },
          {
            name: 'minBalanceDate',
            type: 'date',
            isNullable: true,
          },
          {
            name: 'projectedIncome',
            type: 'numeric',
            precision: 12,
            scale: 2,
            default: 0,
            isNullable: false,
          },
          {
            name: 'projectedExpenses',
            type: 'numeric',
            precision: 12,
            scale: 2,
            default: 0,
            isNullable: false,
          },
          {
            name: 'fixedExpenses',
            type: 'numeric',
            precision: 12,
            scale: 2,
            default: 0,
            isNullable: false,
          },
          {
            name: 'variableExpenses',
            type: 'numeric',
            precision: 12,
            scale: 2,
            default: 0,
            isNullable: false,
          },
          {
            name: 'installmentPayments',
            type: 'numeric',
            precision: 12,
            scale: 2,
            default: 0,
            isNullable: false,
          },
          {
            name: 'daysWithLowBalance',
            type: 'int',
            default: 0,
            isNullable: false,
          },
          {
            name: 'hasNegativeRisk',
            type: 'boolean',
            default: false,
            isNullable: false,
          },
          {
            name: 'negativeRiskDate',
            type: 'date',
            isNullable: true,
          },
          {
            name: 'confidence',
            type: 'numeric',
            precision: 3,
            scale: 2,
            default: 0.5,
            isNullable: false,
          },
          {
            name: 'detailedProjections',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'seasonalityAnalysis',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'recommendations',
            type: 'text',
            isArray: true,
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'deletedAt',
            type: 'timestamp',
            isNullable: true,
          },
        ],
        foreignKeys: [
          {
            columnNames: ['userId'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
    );

    // Create indices for performance
    await queryRunner.createIndex(
      'forecasts',
      new TableIndex({
        name: 'idx_forecasts_userId_forecastDate',
        columnNames: ['userId', 'forecastDate'],
      }),
    );

    await queryRunner.createIndex(
      'forecasts',
      new TableIndex({
        name: 'idx_forecasts_userId_period_createdAt',
        columnNames: ['userId', 'period', 'createdAt'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex(
      'forecasts',
      'idx_forecasts_userId_period_createdAt',
    );
    await queryRunner.dropIndex('forecasts', 'idx_forecasts_userId_forecastDate');
    await queryRunner.dropTable('forecasts');
  }
}
