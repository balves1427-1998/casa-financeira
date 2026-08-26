import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class CreateCreditCardsTable1692864004000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'credit_cards',
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
            name: 'name',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'bank',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'cardNumber',
            type: 'varchar',
            length: '10',
            isNullable: false,
          },
          {
            name: 'limit',
            type: 'decimal',
            precision: 15,
            scale: 2,
            isNullable: false,
          },
          {
            name: 'currentBalance',
            type: 'decimal',
            precision: 15,
            scale: 2,
            default: 0,
          },
          {
            name: 'closingDay',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'dueDay',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['active', 'inactive', 'blocked', 'expired'],
            default: "'active'",
          },
          {
            name: 'cardType',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'expiryDate',
            type: 'varchar',
            length: '7',
            isNullable: true,
          },
          {
            name: 'interestRate',
            type: 'decimal',
            precision: 5,
            scale: 2,
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
            columnNames: ['status'],
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'credit_cards',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('credit_cards');
    if (table) {
      const foreignKey = table.foreignKeys.find((fk) => fk.columnNames.indexOf('userId') !== -1);
      if (foreignKey) {
        await queryRunner.dropForeignKey('credit_cards', foreignKey);
      }
    }
    await queryRunner.dropTable('credit_cards');
  }
}
