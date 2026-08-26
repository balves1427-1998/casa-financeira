import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateAiIntelligenceTables1692864016000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ==================== AI MESSAGES TABLE ====================

    await queryRunner.createTable(
      new Table({
        name: 'ai_messages',
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
            name: 'family_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'question',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'answer',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'intent',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'confidence',
            type: 'decimal',
            precision: 5,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'sources',
            type: 'jsonb',
            isNullable: true,
            default: "'[]'::jsonb",
          },
          {
            name: 'follow_up_questions',
            type: 'text',
            isArray: true,
            isNullable: true,
            default: "'{}'",
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
            default: "'{}'::jsonb",
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

    await queryRunner.createIndex(
      'ai_messages',
      new TableIndex({
        name: 'idx_ai_messages_family_user',
        columnNames: ['family_id', 'user_id'],
      }),
    );

    await queryRunner.createIndex(
      'ai_messages',
      new TableIndex({
        name: 'idx_ai_messages_created',
        columnNames: ['created_at'],
      }),
    );

    await queryRunner.createIndex(
      'ai_messages',
      new TableIndex({
        name: 'idx_ai_messages_intent',
        columnNames: ['intent'],
      }),
    );

    // ==================== RECOMMENDATIONS TABLE ====================

    await queryRunner.createTable(
      new Table({
        name: 'recommendations',
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
            name: 'family_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'type',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'title',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'description',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'potential_savings',
            type: 'decimal',
            precision: 12,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'period',
            type: 'varchar',
            length: '20',
            default: "'monthly'",
            isNullable: false,
          },
          {
            name: 'relevance',
            type: 'int',
            isNullable: false,
            comment: 'Score 0-100',
          },
          {
            name: 'impact',
            type: 'int',
            isNullable: false,
            comment: 'Score 0-100',
          },
          {
            name: 'ease',
            type: 'int',
            isNullable: false,
            comment: 'Score 0-100',
          },
          {
            name: 'priority',
            type: 'varchar',
            length: '20',
            default: "'MEDIUM'",
            isNullable: false,
          },
          {
            name: 'action_url',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'is_dismissed',
            type: 'boolean',
            default: false,
          },
          {
            name: 'dismissed_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
            default: "'{}'::jsonb",
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

    await queryRunner.createIndex(
      'recommendations',
      new TableIndex({
        name: 'idx_recommendations_family_priority',
        columnNames: ['family_id', 'priority'],
      }),
    );

    await queryRunner.createIndex(
      'recommendations',
      new TableIndex({
        name: 'idx_recommendations_user',
        columnNames: ['user_id'],
      }),
    );

    await queryRunner.createIndex(
      'recommendations',
      new TableIndex({
        name: 'idx_recommendations_dismissed',
        columnNames: ['is_dismissed'],
      }),
    );

    // ==================== BEHAVIOR ANALYSES TABLE ====================

    await queryRunner.createTable(
      new Table({
        name: 'behavior_analyses',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'family_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'period_analysis',
            type: 'jsonb',
            isNullable: true,
            comment: 'Análise de padrões temporais',
          },
          {
            name: 'anomalies',
            type: 'jsonb',
            isNullable: true,
            comment: 'Transações anormais detectadas',
          },
          {
            name: 'patterns',
            type: 'jsonb',
            isNullable: true,
            comment: 'Padrões identificados',
          },
          {
            name: 'correlations',
            type: 'jsonb',
            isNullable: true,
            comment: 'Correlações entre variáveis',
          },
          {
            name: 'clustering',
            type: 'jsonb',
            isNullable: true,
            comment: 'Análise de clusters',
          },
          {
            name: 'seasonality_score',
            type: 'decimal',
            precision: 5,
            scale: 2,
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
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'behavior_analyses',
      new TableIndex({
        name: 'idx_behavior_analyses_family',
        columnNames: ['family_id'],
      }),
    );

    await queryRunner.createIndex(
      'behavior_analyses',
      new TableIndex({
        name: 'idx_behavior_analyses_created',
        columnNames: ['created_at'],
      }),
    );

    // ==================== FORECASTS TABLE ====================

    await queryRunner.createTable(
      new Table({
        name: 'ai_forecasts',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'family_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'forecast_type',
            type: 'varchar',
            length: '50',
            isNullable: false,
            comment: 'TOTAL | BY_CATEGORY | BY_USER | BALANCE',
          },
          {
            name: 'period',
            type: 'varchar',
            length: '50',
            isNullable: false,
            comment: '30_DAYS | 90_DAYS | 180_DAYS | 365_DAYS',
          },
          {
            name: 'category_id',
            type: 'uuid',
            isNullable: true,
            comment: 'Se forecast é por categoria',
          },
          {
            name: 'target_user_id',
            type: 'uuid',
            isNullable: true,
            comment: 'Se forecast é por usuário',
          },
          {
            name: 'predictions',
            type: 'jsonb',
            isNullable: false,
            comment: 'Array de predictions com data, valor, bounds',
          },
          {
            name: 'summary',
            type: 'jsonb',
            isNullable: false,
            comment: 'Resumo: average, min, max, trend, accuracy',
          },
          {
            name: 'scenarios',
            type: 'jsonb',
            isNullable: true,
            comment: 'best_case, expected_case, worst_case',
          },
          {
            name: 'model_used',
            type: 'varchar',
            length: '50',
            isNullable: false,
            comment: 'PROPHET | ARIMA | LINEAR | ENSEMBLE',
          },
          {
            name: 'accuracy',
            type: 'decimal',
            precision: 5,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
            default: "'{}'::jsonb",
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
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'ai_forecasts',
      new TableIndex({
        name: 'idx_ai_forecasts_family_type_period',
        columnNames: ['family_id', 'forecast_type', 'period'],
      }),
    );

    await queryRunner.createIndex(
      'ai_forecasts',
      new TableIndex({
        name: 'idx_ai_forecasts_model',
        columnNames: ['model_used'],
      }),
    );

    await queryRunner.createIndex(
      'ai_forecasts',
      new TableIndex({
        name: 'idx_ai_forecasts_created',
        columnNames: ['created_at'],
      }),
    );

    // ==================== ANOMALIES TABLE ====================

    await queryRunner.createTable(
      new Table({
        name: 'transaction_anomalies',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'family_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'transaction_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'transaction_type',
            type: 'varchar',
            length: '50',
            isNullable: false,
            comment: 'EXPENSE | INCOME',
          },
          {
            name: 'anomaly_type',
            type: 'varchar',
            length: '50',
            isNullable: false,
            comment: 'UNUSUAL_AMOUNT | DUPLICATE | SPIKE | PATTERN_BREAK',
          },
          {
            name: 'severity',
            type: 'varchar',
            length: '20',
            isNullable: false,
            comment: 'LOW | MEDIUM | HIGH',
          },
          {
            name: 'anomaly_score',
            type: 'decimal',
            precision: 5,
            scale: 2,
            isNullable: false,
            comment: '0-1 score',
          },
          {
            name: 'reason',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'suggested_action',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'is_confirmed',
            type: 'boolean',
            default: false,
          },
          {
            name: 'confirmation_status',
            type: 'varchar',
            length: '20',
            isNullable: true,
            comment: 'NORMAL | UNUSUAL_BUT_OK | FRAUDULENT',
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
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'transaction_anomalies',
      new TableIndex({
        name: 'idx_anomalies_family_severity',
        columnNames: ['family_id', 'severity'],
      }),
    );

    await queryRunner.createIndex(
      'transaction_anomalies',
      new TableIndex({
        name: 'idx_anomalies_transaction',
        columnNames: ['transaction_id'],
      }),
    );

    // ==================== FOREIGN KEYS ====================

    await queryRunner.createForeignKey(
      'ai_messages',
      new TableForeignKey({
        name: 'fk_ai_messages_user',
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'ai_messages',
      new TableForeignKey({
        name: 'fk_ai_messages_family',
        columnNames: ['family_id'],
        referencedTableName: 'families',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'recommendations',
      new TableForeignKey({
        name: 'fk_recommendations_user',
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'recommendations',
      new TableForeignKey({
        name: 'fk_recommendations_family',
        columnNames: ['family_id'],
        referencedTableName: 'families',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'behavior_analyses',
      new TableForeignKey({
        name: 'fk_behavior_analyses_family',
        columnNames: ['family_id'],
        referencedTableName: 'families',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'ai_forecasts',
      new TableForeignKey({
        name: 'fk_ai_forecasts_family',
        columnNames: ['family_id'],
        referencedTableName: 'families',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'transaction_anomalies',
      new TableForeignKey({
        name: 'fk_anomalies_family',
        columnNames: ['family_id'],
        referencedTableName: 'families',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign keys first
    const tables = [
      'transaction_anomalies',
      'ai_forecasts',
      'behavior_analyses',
      'recommendations',
      'ai_messages',
    ];

    for (const table of tables) {
      const tableObj = await queryRunner.getTable(table);
      if (tableObj) {
        const foreignKeys = tableObj.foreignKeys;
        for (const fk of foreignKeys) {
          await queryRunner.dropForeignKey(table, fk);
        }
      }
    }

    // Drop tables in reverse order
    await queryRunner.dropTable('transaction_anomalies');
    await queryRunner.dropTable('ai_forecasts');
    await queryRunner.dropTable('behavior_analyses');
    await queryRunner.dropTable('recommendations');
    await queryRunner.dropTable('ai_messages');
  }
}
