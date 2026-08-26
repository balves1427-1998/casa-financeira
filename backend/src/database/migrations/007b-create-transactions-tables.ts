import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

/**
 * Cria as tabelas de movimentação financeira: `expenses`, `incomes` e `receipts`.
 *
 * Estas tabelas existiam apenas como entidades (`Expense`, `Income`, `Receipt`),
 * sem migration correspondente. A ausência de `expenses` quebrava a migration
 * 008 (`ml_feedback`), que cria uma foreign key para essa tabela.
 *
 * O timestamp intermediário (…007500) garante que a criação aconteça depois de
 * `pdf_imports` (007) e antes de `ml_feedback` (008).
 *
 * Os nomes das colunas seguem o camelCase usado pelas entidades, já que o
 * projeto não configura uma naming strategy customizada.
 */
export class CreateTransactionsTables1692864007500 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ----------------------------------------------------------------- DESPESAS
    await queryRunner.createTable(
      new Table({
        name: 'expenses',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          { name: 'userId', type: 'uuid', isNullable: false },
          { name: 'accountId', type: 'uuid', isNullable: true },
          { name: 'creditCardId', type: 'uuid', isNullable: true },
          { name: 'description', type: 'varchar', length: '255', isNullable: false },
          { name: 'establishment', type: 'varchar', length: '255', isNullable: true },
          { name: 'amount', type: 'decimal', precision: 15, scale: 2, isNullable: false },
          { name: 'date', type: 'timestamp', isNullable: false },
          { name: 'category', type: 'varchar', length: '100', isNullable: false },
          { name: 'subcategory', type: 'varchar', length: '100', isNullable: true },
          // Responsável pelo lançamento (ex.: bruno ou giovanna)
          { name: 'responsible', type: 'varchar', length: '100', isNullable: false },
          {
            name: 'paymentMethod',
            type: 'enum',
            enum: ['cash', 'debit', 'credit', 'transfer', 'pix'],
            enumName: 'expenses_paymentmethod_enum',
            isNullable: false,
          },
          { name: 'isRecurring', type: 'boolean', default: false },
          { name: 'frequency', type: 'varchar', length: '20', isNullable: true },
          { name: 'installments', type: 'int', isNullable: true },
          { name: 'currentInstallment', type: 'int', isNullable: true },
          { name: 'observation', type: 'text', isNullable: true },
          {
            name: 'origin',
            type: 'enum',
            enum: ['manual', 'bank_statement', 'credit_card', 'import', 'recurring'],
            enumName: 'expenses_origin_enum',
            default: "'manual'",
          },
          { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'deletedAt', type: 'timestamp', isNullable: true },
        ],
        indices: [
          { columnNames: ['userId'] },
          { columnNames: ['accountId'] },
          { columnNames: ['date'] },
          { columnNames: ['category'] },
          { columnNames: ['createdAt'] },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'expenses',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'expenses',
      new TableForeignKey({
        columnNames: ['accountId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'accounts',
        onDelete: 'SET NULL',
      }),
    );

    await queryRunner.createForeignKey(
      'expenses',
      new TableForeignKey({
        columnNames: ['creditCardId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'credit_cards',
        onDelete: 'SET NULL',
      }),
    );

    // ----------------------------------------------------------------- RECEITAS
    // `incomes` e `receipts` compartilham a mesma estrutura: ambas registram
    // entradas de dinheiro e são mapeadas por entidades distintas do projeto.
    for (const tableName of ['incomes', 'receipts']) {
      await queryRunner.createTable(
        new Table({
          name: tableName,
          columns: [
            {
              name: 'id',
              type: 'uuid',
              isPrimary: true,
              default: 'uuid_generate_v4()',
            },
            { name: 'userId', type: 'uuid', isNullable: false },
            { name: 'accountId', type: 'uuid', isNullable: false },
            { name: 'description', type: 'varchar', length: '255', isNullable: false },
            // Tipo da receita: salary, freelance, bonus, etc.
            { name: 'type', type: 'varchar', length: '100', isNullable: false },
            { name: 'amount', type: 'decimal', precision: 15, scale: 2, isNullable: false },
            { name: 'date', type: 'timestamp', isNullable: false },
            { name: 'responsible', type: 'varchar', length: '100', isNullable: false },
            { name: 'isRecurring', type: 'boolean', default: false },
            { name: 'frequency', type: 'varchar', length: '20', isNullable: true },
            { name: 'observation', type: 'text', isNullable: true },
            { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
            { name: 'updatedAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
            { name: 'deletedAt', type: 'timestamp', isNullable: true },
          ],
          indices: [
            { columnNames: ['userId'] },
            { columnNames: ['accountId'] },
            { columnNames: ['date'] },
            { columnNames: ['createdAt'] },
          ],
        }),
        true,
      );

      await queryRunner.createForeignKey(
        tableName,
        new TableForeignKey({
          columnNames: ['userId'],
          referencedColumnNames: ['id'],
          referencedTableName: 'users',
          onDelete: 'CASCADE',
        }),
      );

      await queryRunner.createForeignKey(
        tableName,
        new TableForeignKey({
          columnNames: ['accountId'],
          referencedColumnNames: ['id'],
          referencedTableName: 'accounts',
          onDelete: 'CASCADE',
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('receipts', true);
    await queryRunner.dropTable('incomes', true);
    await queryRunner.dropTable('expenses', true);
  }
}
