import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateAutomationsTables1692864014000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Tabela de agendamento de relatórios
    await queryRunner.createTable(
      new Table({
        name: 'report_schedules',
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
            length: '200',
            isNullable: false,
          },
          {
            name: 'reportType',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'frequency',
            type: 'enum',
            enum: ['daily', 'weekly', 'monthly', 'quarterly', 'annual'],
            isNullable: false,
          },
          {
            name: 'config',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'recipientEmails',
            type: 'text', // simple-array na entidade: persistido como text separado por vírgula
            isNullable: true,
          },
          {
            name: 'dayOfMonth',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'daysOfWeek',
            type: 'text', // simple-array na entidade: persistido como text separado por vírgula
            isNullable: true,
          },
          {
            name: 'executionTime',
            type: 'varchar',
            length: '5',
            default: "'08:00'",
          },
          {
            name: 'isActive',
            type: 'boolean',
            default: true,
          },
          {
            name: 'lastExecution',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'nextExecution',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'executionCount',
            type: 'int',
            default: 0,
          },
          {
            name: 'lastStatus',
            type: 'varchar',
            length: '50',
            default: "'pending'",
          },
          {
            name: 'lastErrorMessage',
            type: 'text',
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
            default: 'now()',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'now()',
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

    // Índices para report_schedules
    await queryRunner.createIndex(
      'report_schedules',
      new TableIndex({
        name: 'idx_report_schedules_user_active_next',
        columnNames: ['userId', 'isActive', 'nextExecution'],
      }),
    );

    await queryRunner.createIndex(
      'report_schedules',
      new TableIndex({
        name: 'idx_report_schedules_user_created',
        columnNames: ['userId', 'createdAt'],
      }),
    );

    await queryRunner.createIndex(
      'report_schedules',
      new TableIndex({
        name: 'idx_report_schedules_next_active',
        columnNames: ['nextExecution', 'isActive'],
      }),
    );

    // Foreign key para usuarios
    await queryRunner.createForeignKey(
      'report_schedules',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );

    // Tabela de alertas
    await queryRunner.createTable(
      new Table({
        name: 'alerts',
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
            name: 'type',
            type: 'enum',
            enum: ['account_due', 'credit_card', 'low_balance', 'anomaly', 'goal'],
            isNullable: false,
          },
          {
            name: 'severity',
            type: 'enum',
            enum: ['info', 'warning', 'critical'],
            default: "'info'",
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['unread', 'read', 'dismissed', 'acted'],
            default: "'unread'",
          },
          {
            name: 'title',
            type: 'varchar',
            length: '300',
            isNullable: false,
          },
          {
            name: 'message',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'data',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'isRead',
            type: 'boolean',
            default: false,
          },
          {
            name: 'readAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'notificationSent',
            type: 'boolean',
            default: false,
          },
          {
            name: 'notificationChannel',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'notificationSentAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'relatedEntityId',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'relatedEntityType',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'isActive',
            type: 'boolean',
            default: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'now()',
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

    // Índices para alerts
    await queryRunner.createIndex(
      'alerts',
      new TableIndex({
        name: 'idx_alerts_user_read_created',
        columnNames: ['userId', 'isRead', 'createdAt'],
      }),
    );

    await queryRunner.createIndex(
      'alerts',
      new TableIndex({
        name: 'idx_alerts_user_type_severity',
        columnNames: ['userId', 'type', 'severity'],
      }),
    );

    await queryRunner.createIndex(
      'alerts',
      new TableIndex({
        name: 'idx_alerts_user_created',
        columnNames: ['userId', 'createdAt'],
      }),
    );

    // Foreign key para usuarios
    await queryRunner.createForeignKey(
      'alerts',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );

    // Tabela de logs de emails
    await queryRunner.createTable(
      new Table({
        name: 'email_logs',
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
            name: 'recipient',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'type',
            type: 'enum',
            enum: ['report', 'alert', 'weekly_summary', 'confirmation', 'notification'],
            isNullable: false,
          },
          {
            name: 'subject',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'templateName',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'templateData',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'htmlContent',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['pending', 'sent', 'failed', 'bounced', 'opened'],
            default: "'pending'",
          },
          {
            name: 'retryCount',
            type: 'int',
            default: 0,
          },
          {
            name: 'sentAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'openedAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'messageId',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'errorMessage',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'relatedEntityId',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'relatedEntityType',
            type: 'varchar',
            length: '100',
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
            default: 'now()',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'now()',
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

    // Índices para email_logs
    await queryRunner.createIndex(
      'email_logs',
      new TableIndex({
        name: 'idx_email_logs_user_status_created',
        columnNames: ['userId', 'status', 'createdAt'],
      }),
    );

    await queryRunner.createIndex(
      'email_logs',
      new TableIndex({
        name: 'idx_email_logs_user_type_created',
        columnNames: ['userId', 'type', 'createdAt'],
      }),
    );

    await queryRunner.createIndex(
      'email_logs',
      new TableIndex({
        name: 'idx_email_logs_status_created',
        columnNames: ['status', 'createdAt'],
      }),
    );

    // Foreign key para usuarios
    await queryRunner.createForeignKey(
      'email_logs',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );

    // Tabela de webhooks
    await queryRunner.createTable(
      new Table({
        name: 'webhooks',
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
            length: '255',
            isNullable: false,
          },
          {
            name: 'url',
            type: 'varchar',
            length: '500',
            isNullable: false,
          },
          {
            name: 'eventType',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'events',
            type: 'text', // simple-array na entidade: persistido como text separado por vírgula
            isNullable: true,
          },
          {
            name: 'headers',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'filters',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'isActive',
            type: 'boolean',
            default: true,
          },
          {
            name: 'protocol',
            type: 'varchar',
            length: '50',
            default: "'http'",
          },
          {
            name: 'deliveryCount',
            type: 'int',
            default: 0,
          },
          {
            name: 'successCount',
            type: 'int',
            default: 0,
          },
          {
            name: 'failureCount',
            type: 'int',
            default: 0,
          },
          {
            name: 'lastDeliveredAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'lastFailedAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'lastErrorMessage',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'maxRetries',
            type: 'int',
            default: 3,
          },
          {
            name: 'initialRetryDelay',
            type: 'int',
            default: 5000,
          },
          {
            name: 'retryExponent',
            type: 'float',
            default: 2,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '50',
            default: "'active'",
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'signature',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'now()',
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

    // Índices para webhooks
    await queryRunner.createIndex(
      'webhooks',
      new TableIndex({
        name: 'idx_webhooks_user_active',
        columnNames: ['userId', 'isActive'],
      }),
    );

    await queryRunner.createIndex(
      'webhooks',
      new TableIndex({
        name: 'idx_webhooks_user_created',
        columnNames: ['userId', 'createdAt'],
      }),
    );

    await queryRunner.createIndex(
      'webhooks',
      new TableIndex({
        name: 'idx_webhooks_event_active',
        columnNames: ['eventType', 'isActive'],
      }),
    );

    // Foreign key para usuarios
    await queryRunner.createForeignKey(
      'webhooks',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );

    // Tabela de webhook deliveries
    await queryRunner.createTable(
      new Table({
        name: 'webhook_deliveries',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'webhookId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'userId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'eventType',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'payload',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'url',
            type: 'varchar',
            length: '2083',
            isNullable: false,
          },
          {
            name: 'attemptNumber',
            type: 'int',
            default: 0,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['pending', 'delivered', 'failed', 'timeout', 'invalid_url'],
            default: "'pending'",
          },
          {
            name: 'httpStatus',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'httpResponse',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'responseTime',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'errorMessage',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'deliveredAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'nextRetryAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'maxRetries',
            type: 'int',
            default: 0,
          },
          {
            name: 'requestHeaders',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'userAgent',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'clientIp',
            type: 'varchar',
            length: '45',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
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

    // Índices para webhook_deliveries
    await queryRunner.createIndex(
      'webhook_deliveries',
      new TableIndex({
        name: 'idx_webhook_deliveries_webhook_status',
        columnNames: ['webhookId', 'status'],
      }),
    );

    await queryRunner.createIndex(
      'webhook_deliveries',
      new TableIndex({
        name: 'idx_webhook_deliveries_webhook_created',
        columnNames: ['webhookId', 'createdAt'],
      }),
    );

    await queryRunner.createIndex(
      'webhook_deliveries',
      new TableIndex({
        name: 'idx_webhook_deliveries_event_status',
        columnNames: ['eventType', 'status'],
      }),
    );

    // Foreign key para webhooks
    await queryRunner.createForeignKey(
      'webhook_deliveries',
      new TableForeignKey({
        columnNames: ['webhookId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'webhooks',
        onDelete: 'CASCADE',
      }),
    );

    // Foreign key para usuarios
    await queryRunner.createForeignKey(
      'webhook_deliveries',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remover foreign keys (na ordem correta para evitar conflitos)
    await queryRunner.dropForeignKey('webhook_deliveries', 'FK_webhook_deliveries_webhookId');
    await queryRunner.dropForeignKey('webhook_deliveries', 'FK_webhook_deliveries_userId');
    await queryRunner.dropForeignKey('webhooks', 'FK_webhooks_userId');
    await queryRunner.dropForeignKey('email_logs', 'FK_email_logs_userId');
    await queryRunner.dropForeignKey('alerts', 'FK_alerts_userId');
    await queryRunner.dropForeignKey('report_schedules', 'FK_report_schedules_userId');

    // Remover índices
    await queryRunner.dropIndex('report_schedules', 'idx_report_schedules_user_active_next');
    await queryRunner.dropIndex('report_schedules', 'idx_report_schedules_user_created');
    await queryRunner.dropIndex('report_schedules', 'idx_report_schedules_next_active');
    await queryRunner.dropIndex('alerts', 'idx_alerts_user_read_created');
    await queryRunner.dropIndex('alerts', 'idx_alerts_user_type_severity');
    await queryRunner.dropIndex('alerts', 'idx_alerts_user_created');
    await queryRunner.dropIndex('email_logs', 'idx_email_logs_user_status_created');
    await queryRunner.dropIndex('email_logs', 'idx_email_logs_user_type_created');
    await queryRunner.dropIndex('email_logs', 'idx_email_logs_status_created');
    await queryRunner.dropIndex('webhooks', 'idx_webhooks_user_active');
    await queryRunner.dropIndex('webhooks', 'idx_webhooks_user_created');
    await queryRunner.dropIndex('webhooks', 'idx_webhooks_event_active');
    await queryRunner.dropIndex('webhook_deliveries', 'idx_webhook_deliveries_webhook_status');
    await queryRunner.dropIndex('webhook_deliveries', 'idx_webhook_deliveries_webhook_created');
    await queryRunner.dropIndex('webhook_deliveries', 'idx_webhook_deliveries_event_status');

    // Remover tabelas (na ordem correta para evitar conflitos com FK)
    await queryRunner.dropTable('webhook_deliveries');
    await queryRunner.dropTable('webhooks');
    await queryRunner.dropTable('email_logs');
    await queryRunner.dropTable('alerts');
    await queryRunner.dropTable('report_schedules');
  }
}
