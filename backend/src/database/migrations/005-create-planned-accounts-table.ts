import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class CreatePlannedAccountsTable1692864005000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'planned_accounts',
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
            name: 'description',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'category',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'amount',
            type: 'decimal',
            precision: 15,
            scale: 2,
            isNullable: false,
          },
          {
            name: 'dueDate',
            type: 'date',
            isNullable: false,
          },
          {
            name: 'paymentDate',
            type: 'date',
            isNullable: true,
          },
          {
            name: 'responsible',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['pending', 'confirmed', 'paid', 'cancelled', 'overdue'],
            default: "'pending'",
          },
          {
            name: 'observation',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'priority',
            type: 'int',
            default: 1,
          },
          {
            name: 'isRecurring',
            type: 'boolean',
            default: false,
          },
          {
            name: 'frequency',
            type: 'varchar',
            length: '50',
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
          },
          {
            name: 'deletedAt',
            type: 'timestamp',
            isNullable: true,
          },
        ],
        indices: [
          {
            columnNames: ['userId'],
          },
          {
            columnNames: ['dueDate'],
          },
          {
            columnNames: ['status'],
          },
          {
            columnNames: ['responsible'],
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'planned_accounts',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('planned_accounts');
    if (table) {
      const foreignKey = table.foreignKeys.find((fk) => fk.columnNames.indexOf('userId') !== -1);
      if (foreignKey) {
        await queryRunner.dropForeignKey('planned_accounts', foreignKey);
      }
    }
    await queryRunner.dropTable('planned_accounts');
  }
}
