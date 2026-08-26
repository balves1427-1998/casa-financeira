import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class CreatePdfImportsTable1692864007000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'pdf_imports',
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
            name: 'fileName',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'importType',
            type: 'enum',
            enum: ['bank_statement', 'credit_card_invoice', 'unknown'],
            default: "'unknown'",
          },
          {
            name: 'bankName',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'cardName',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'extractedData',
            type: 'json',
            isNullable: false,
          },
          {
            name: 'transactionCount',
            type: 'int',
            default: 0,
          },
          {
            name: 'duplicateCount',
            type: 'int',
            default: 0,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['pending_review', 'reviewing', 'confirmed', 'imported', 'rejected', 'error'],
            default: "'pending_review'",
          },
          {
            name: 'errorMessage',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'duplicateMatches',
            type: 'json',
            isNullable: true,
          },
          {
            name: 'userReview',
            type: 'json',
            isNullable: true,
          },
          {
            name: 'isProcessed',
            type: 'boolean',
            default: false,
          },
          {
            name: 'processedAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'isAutoClassified',
            type: 'boolean',
            default: false,
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
          {
            columnNames: ['importType'],
          },
          {
            columnNames: ['createdAt'],
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'pdf_imports',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('pdf_imports');
    if (table) {
      const foreignKey = table.foreignKeys.find((fk) => fk.columnNames.indexOf('userId') !== -1);
      if (foreignKey) {
        await queryRunner.dropForeignKey('pdf_imports', foreignKey);
      }
    }
    await queryRunner.dropTable('pdf_imports');
  }
}
