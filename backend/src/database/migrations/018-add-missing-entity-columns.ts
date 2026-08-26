import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Reconcilia o schema do banco com as entidades TypeORM do núcleo.
 *
 * As entidades `CreditCard`, `PlannedAccount` e `PdfImport` declaram colunas que
 * nunca chegaram a ser criadas pelas migrations 004, 005 e 007. O resultado era
 * que TODAS as rotas desses módulos respondiam 500, porque o TypeORM monta o
 * SELECT/INSERT a partir dos metadados da entidade e o PostgreSQL rejeitava a
 * query com `column ... does not exist`:
 *
 *  - credit_cards    → faltavam `cardholderName`, `accountId` e `notes`
 *  - planned_accounts→ faltavam `accountId` e `creditCardId`
 *  - pdf_imports     → faltava `fileContent` (conteúdo binário do PDF enviado)
 *
 * Também corrige `credit_cards.expiryDate`, criada como `varchar(7)` mas
 * declarada na entidade como `timestamp` (e validada no DTO com `@IsDateString`).
 * Qualquer data ISO gravada ali estourava o limite de 7 caracteres.
 */
export class AddMissingEntityColumns1692864018000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('credit_cards', [
      new TableColumn({
        name: 'cardholderName',
        type: 'varchar',
        length: '100',
        isNullable: true,
      }),
      new TableColumn({ name: 'accountId', type: 'uuid', isNullable: true }),
      new TableColumn({ name: 'notes', type: 'text', isNullable: true }),
    ]);

    // `expiryDate` guarda a data de validade completa; varchar(7) não comporta
    // o valor ISO enviado pelo DTO. USING NULL descarta os dados truncados
    // existentes (a coluna é opcional e nunca chegou a ser gravada com sucesso).
    await queryRunner.query(
      `ALTER TABLE "credit_cards"
         ALTER COLUMN "expiryDate" TYPE TIMESTAMP USING NULL`,
    );

    await queryRunner.addColumns('planned_accounts', [
      new TableColumn({ name: 'accountId', type: 'uuid', isNullable: true }),
      new TableColumn({ name: 'creditCardId', type: 'uuid', isNullable: true }),
    ]);

    await queryRunner.addColumn(
      'pdf_imports',
      new TableColumn({ name: 'fileContent', type: 'bytea', isNullable: true }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('pdf_imports', 'fileContent');
    await queryRunner.dropColumns('planned_accounts', [
      'accountId',
      'creditCardId',
    ]);
    await queryRunner.query(
      `ALTER TABLE "credit_cards"
         ALTER COLUMN "expiryDate" TYPE VARCHAR(7) USING NULL`,
    );
    await queryRunner.dropColumns('credit_cards', [
      'cardholderName',
      'accountId',
      'notes',
    ]);
  }
}
