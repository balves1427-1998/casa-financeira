import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateReportsTable1692864013000 implements MigrationInterface {
  // O nome persistido deve bater com o da classe, senao o TypeORM ordena a migration pelo timestamp antigo.
  name = 'CreateReportsTable1692864013000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create reports table
    await queryRunner.createTable(
      new Table({
        name: 'reports',
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
            name: 'reportType',
            type: 'varchar',
            isNullable: false,
            enum: ['monthly', 'quarterly', 'annual', 'custom', 'comparison'],
          },
          {
            name: 'status',
            type: 'varchar',
            isNullable: false,
            enum: ['pending', 'generating', 'ready', 'failed'],
            default: `'pending'`,
          },
          {
            name: 'startMonth',
            type: 'integer',
            isNullable: false,
          },
          {
            name: 'startYear',
            type: 'integer',
            isNullable: false,
          },
          {
            name: 'endMonth',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'endYear',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'config',
            type: 'jsonb',
            isNullable: false,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'fileUrl',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'fileName',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'fileFormat',
            type: 'varchar',
            isNullable: true,
            enum: ['pdf', 'csv', 'xlsx'],
          },
          {
            name: 'fileSize',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'sentToEmail',
            type: 'boolean',
            default: false,
            isNullable: false,
          },
          {
            name: 'sentAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'recipientEmails',
            type: 'text',
            isNullable: true,
            isArray: true,
          },
          {
            name: 'errorMessage',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'isTemplate',
            type: 'boolean',
            default: false,
            isNullable: false,
          },
          {
            name: 'templateName',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'viewCount',
            type: 'integer',
            default: 0,
            isNullable: false,
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

    // Add foreign key
    await queryRunner.createForeignKey(
      'reports',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      }),
    );

    // Add indices
    await queryRunner.createIndex(
      'reports',
      new TableIndex({
        name: 'IDX_REPORTS_USER_TYPE_CREATED',
        columnNames: ['userId', 'reportType', 'createdAt'],
      }),
    );

    await queryRunner.createIndex(
      'reports',
      new TableIndex({
        name: 'IDX_REPORTS_USER_STATUS',
        columnNames: ['userId', 'status', 'createdAt'],
      }),
    );

    await queryRunner.createIndex(
      'reports',
      new TableIndex({
        name: 'IDX_REPORTS_USER_TEMPLATE',
        columnNames: ['userId', 'isTemplate'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indices
    await queryRunner.dropIndex('reports', 'IDX_REPORTS_USER_TYPE_CREATED');
    await queryRunner.dropIndex('reports', 'IDX_REPORTS_USER_STATUS');
    await queryRunner.dropIndex('reports', 'IDX_REPORTS_USER_TEMPLATE');

    // Drop foreign key
    await queryRunner.dropForeignKey('reports', 'FK_reports_userId');

    // Drop table
    await queryRunner.dropTable('reports');
  }
}
