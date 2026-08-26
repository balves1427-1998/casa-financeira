import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class CreateClassificationRulesTable1692864006000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'classification_rules',
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
            name: 'keyword',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'category',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'subcategory',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'matchType',
            type: 'enum',
            enum: ['keyword', 'regex', 'exact'],
            default: "'keyword'",
          },
          {
            name: 'priority',
            type: 'int',
            default: 0,
          },
          {
            name: 'isActive',
            type: 'boolean',
            default: true,
          },
          {
            name: 'timesApplied',
            type: 'int',
            default: 0,
          },
          {
            name: 'bank',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'merchant',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'description',
            type: 'varchar',
            length: '500',
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
            columnNames: ['keyword'],
          },
          {
            columnNames: ['isActive'],
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'classification_rules',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('classification_rules');
    if (table) {
      const foreignKey = table.foreignKeys.find((fk) => fk.columnNames.indexOf('userId') !== -1);
      if (foreignKey) {
        await queryRunner.dropForeignKey('classification_rules', foreignKey);
      }
    }
    await queryRunner.dropTable('classification_rules');
  }
}
