import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

/**
 * Cria a tabela de metas financeiras (item 19 do escopo do projeto).
 *
 * A meta é escopada por FAMÍLIA: `family_id` diz de quem é a meta (a reserva de
 * emergência é da casa) e `user_id` registra quem a cadastrou — é esse campo
 * que autoriza editar e excluir, seguindo a regra "ler é coletivo, escrever é
 * individual" já adotada em receitas.
 *
 * Convenções seguidas aqui:
 *  - colunas em snake_case (a entidade mapeia com `name:` explícito);
 *  - valores default sempre entre aspas SQL, senão o PostgreSQL interpreta
 *    `ACTIVE` como identificador e a migration falha;
 *  - nada de `simple-array` em DDL — não existe esse tipo no banco.
 */
export class CreateGoalsTable1692864019000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'goals',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          { name: 'family_id', type: 'uuid', isNullable: true },
          { name: 'user_id', type: 'uuid', isNullable: false },
          { name: 'name', type: 'varchar', length: '255', isNullable: false },
          {
            name: 'type',
            type: 'varchar',
            length: '30',
            isNullable: false,
            default: "'OTHER'",
          },
          {
            name: 'target_amount',
            type: 'decimal',
            precision: 15,
            scale: 2,
            isNullable: false,
          },
          {
            name: 'current_amount',
            type: 'decimal',
            precision: 15,
            scale: 2,
            isNullable: false,
            default: 0,
          },
          { name: 'deadline', type: 'timestamp', isNullable: true },
          {
            name: 'monthly_contribution',
            type: 'decimal',
            precision: 15,
            scale: 2,
            isNullable: true,
          },
          { name: 'description', type: 'text', isNullable: true },
          {
            name: 'status',
            type: 'varchar',
            length: '20',
            isNullable: false,
            default: "'ACTIVE'",
          },
          { name: 'last_contribution_at', type: 'timestamp', isNullable: true },
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
          { name: 'deleted_at', type: 'timestamp', isNullable: true },
        ],
      }),
      true,
    );

    await queryRunner.createIndices('goals', [
      new TableIndex({ name: 'idx_goals_family', columnNames: ['family_id'] }),
      new TableIndex({ name: 'idx_goals_user', columnNames: ['user_id'] }),
      new TableIndex({ name: 'idx_goals_status', columnNames: ['status'] }),
      new TableIndex({ name: 'idx_goals_deadline', columnNames: ['deadline'] }),
    ]);

    await queryRunner.createForeignKeys('goals', [
      new TableForeignKey({
        name: 'fk_goals_family',
        columnNames: ['family_id'],
        referencedTableName: 'families',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        name: 'fk_goals_user',
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('goals', true);
  }
}
