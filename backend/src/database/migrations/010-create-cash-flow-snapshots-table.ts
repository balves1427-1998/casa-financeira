import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateCashFlowSnapshotsTable1692864010000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'cash_flow_snapshots',
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
            name: 'snapshotDate',
            type: 'date',
            isNullable: false,
          },
          {
            name: 'openingBalance',
            type: 'numeric',
            precision: 12,
            scale: 2,
            isNullable: false,
          },
          {
            name: 'dailyIncome',
            type: 'numeric',
            precision: 12,
            scale: 2,
            default: 0,
            isNullable: false,
          },
          {
            name: 'dailyExpenses',
            type: 'numeric',
            precision: 12,
            scale: 2,
            default: 0,
            isNullable: false,
          },
          {
            name: 'plannedAccountsAmount',
            type: 'numeric',
            precision: 12,
            scale: 2,
            default: 0,
            isNullable: false,
          },
          {
            name: 'closingBalance',
            type: 'numeric',
            precision: 12,
            scale: 2,
            isNullable: false,
          },
          {
            name: 'projectedBalance',
            type: 'numeric',
            precision: 12,
            scale: 2,
            isNullable: false,
          },
          {
            name: 'transactionCount',
            type: 'int',
            default: 0,
            isNullable: false,
          },
          {
            name: 'isCriticalDay',
            type: 'boolean',
            default: false,
            isNullable: false,
          },
          {
            name: 'criticalDayReason',
            type: 'varchar',
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
      'cash_flow_snapshots',
      new TableIndex({
        name: 'idx_cash_flow_userId_snapshotDate',
        columnNames: ['userId', 'snapshotDate'],
      }),
    );

    await queryRunner.createIndex(
      'cash_flow_snapshots',
      new TableIndex({
        name: 'idx_cash_flow_userId_createdAt',
        columnNames: ['userId', 'createdAt'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex(
      'cash_flow_snapshots',
      'idx_cash_flow_userId_createdAt',
    );
    await queryRunner.dropIndex(
      'cash_flow_snapshots',
      'idx_cash_flow_userId_snapshotDate',
    );
    await queryRunner.dropTable('cash_flow_snapshots');
  }
}
