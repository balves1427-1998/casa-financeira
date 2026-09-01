import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reconcilia o esquema de produção com o que as migrations 023–029 deveriam
 * ter deixado no banco.
 *
 * POR QUE ISSO PRECISOU EXISTIR
 * -----------------------------
 * O primeiro disparo real de lembretes em produção respondeu HTTP 500 com:
 *
 *     QueryFailedError: column planned.type does not exist
 *
 * Só que a tabela `migrations` do mesmo banco diz que TODAS as 30 migrations
 * foram aplicadas — o start do deploy imprime "No migrations are pending". Ou
 * seja: o registro de migrations e o esquema real DIVERGIRAM. Enquanto essa
 * divergência existir, nenhuma migration nova conserta o passado, porque o
 * TypeORM decide o que rodar comparando NOMES já registrados, não o estado das
 * tabelas.
 *
 * Esta migration tem nome novo, então roda. E ela não confia no registro: vai
 * ao `information_schema` perguntar, coluna por coluna, o que de fato existe.
 *
 * DUAS PROPRIEDADES QUE ESTE ARQUIVO PRECISA TER
 * ----------------------------------------------
 * 1. **Ser inofensiva num banco íntegro.** Todo comando é `IF NOT EXISTS` ou
 *    vem atrás de uma checagem. Num banco correto ela não muda nada — e é por
 *    isso que pode rodar em produção sem ensaio.
 * 2. **Contar o que encontrou.** O log do deploy passa a dizer exatamente
 *    quais colunas faltavam. Sem isso, a causa da divergência continuaria
 *    invisível e o mesmo susto voltaria na próxima feature.
 *
 * Se uma TABELA inteira estiver faltando, esta migration registra e segue em
 * frente em vez de derrubar o deploy: um banco parcialmente reconciliado é
 * melhor do que uma aplicação que não sobe, e o log diz o que sobrou.
 */
export class ReconcileSchema1692864030000 implements MigrationInterface {
  name = 'ReconcileSchema1692864030000';

  /** O que as migrations 023–029 prometeram que existiria. */
  private static readonly COLUNAS_ESPERADAS: Array<[string, string]> = [
    ['expenses', 'isPaid'],
    ['expenses', 'paidAt'],
    ['expenses', 'plannedAccountId'],
    ['expenses', 'recurrenceCancelledAt'],
    ['planned_accounts', 'recurringExpenseId'],
    ['planned_accounts', 'type'],
    ['planned_accounts', 'recurringIncomeId'],
    ['incomes', 'recurrenceCancelledAt'],
    ['incomes', 'plannedAccountId'],
    ['goals', 'institution'],
    ['goals', 'invested_amount'],
    ['goals', 'maturity_date'],
    ['goals', 'liquidity'],
    ['pdf_imports', 'creditCardId'],
    ['email_logs', 'bouncedAt'],
  ];

  private async tabelaExiste(qr: QueryRunner, tabela: string): Promise<boolean> {
    const r = await qr.query(
      `SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = $1`,
      [tabela],
    );
    return r.length > 0;
  }

  private async colunaExiste(
    qr: QueryRunner,
    tabela: string,
    coluna: string,
  ): Promise<boolean> {
    const r = await qr.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
      [tabela, coluna],
    );
    return r.length > 0;
  }

  /** Só adiciona a constraint se ela ainda não estiver lá. */
  private async garantirConstraint(
    qr: QueryRunner,
    tabela: string,
    nome: string,
    definicao: string,
  ): Promise<void> {
    if (!(await this.tabelaExiste(qr, tabela))) return;

    const existe = await qr.query(
      `SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = $1 AND table_name = $2`,
      [nome, tabela],
    );
    if (existe.length > 0) return;

    await qr.query(
      `ALTER TABLE "${tabela}" ADD CONSTRAINT "${nome}" ${definicao}`,
    );
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── 1. Diagnóstico: o que realmente falta ────────────────────────────
    const faltando: string[] = [];
    const tabelasAusentes: string[] = [];

    for (const [tabela, coluna] of ReconcileSchema1692864030000.COLUNAS_ESPERADAS) {
      if (!(await this.tabelaExiste(queryRunner, tabela))) {
        if (!tabelasAusentes.includes(tabela)) tabelasAusentes.push(tabela);
        continue;
      }
      if (!(await this.colunaExiste(queryRunner, tabela, coluna))) {
        faltando.push(`${tabela}.${coluna}`);
      }
    }

    if (tabelasAusentes.length > 0) {
      console.warn(
        `[030] TABELAS AUSENTES (não reconciliadas): ${tabelasAusentes.join(', ')}`,
      );
    }
    console.log(
      faltando.length > 0
        ? `[030] Colunas ausentes, serão recriadas: ${faltando.join(', ')}`
        : '[030] Esquema já íntegro — nada a recriar.',
    );

    // ─── 2. Colunas (todas IF NOT EXISTS) ─────────────────────────────────
    if (await this.tabelaExiste(queryRunner, 'expenses')) {
      await queryRunner.query(`
        ALTER TABLE "expenses"
          ADD COLUMN IF NOT EXISTS "isPaid" boolean NOT NULL DEFAULT false,
          ADD COLUMN IF NOT EXISTS "paidAt" timestamp,
          ADD COLUMN IF NOT EXISTS "plannedAccountId" uuid,
          ADD COLUMN IF NOT EXISTS "recurrenceCancelledAt" timestamp
      `);
    }

    if (await this.tabelaExiste(queryRunner, 'planned_accounts')) {
      await queryRunner.query(`
        ALTER TABLE "planned_accounts"
          ADD COLUMN IF NOT EXISTS "recurringExpenseId" uuid,
          ADD COLUMN IF NOT EXISTS "type" varchar(10) NOT NULL DEFAULT 'expense',
          ADD COLUMN IF NOT EXISTS "recurringIncomeId" uuid
      `);

      // Linhas antigas não podem ficar com `type` nulo: o filtro do fluxo de
      // caixa e o dos lembretes descartariam a conta em silêncio.
      await queryRunner.query(`
        UPDATE "planned_accounts" SET "type" = 'expense' WHERE "type" IS NULL
      `);
    }

    if (await this.tabelaExiste(queryRunner, 'incomes')) {
      await queryRunner.query(`
        ALTER TABLE "incomes"
          ADD COLUMN IF NOT EXISTS "recurrenceCancelledAt" timestamp,
          ADD COLUMN IF NOT EXISTS "plannedAccountId" uuid
      `);
    }

    if (await this.tabelaExiste(queryRunner, 'goals')) {
      await queryRunner.query(`
        ALTER TABLE "goals"
          ADD COLUMN IF NOT EXISTS "institution" varchar(255),
          ADD COLUMN IF NOT EXISTS "invested_amount" decimal(15,2) NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS "maturity_date" timestamp,
          ADD COLUMN IF NOT EXISTS "liquidity" varchar(30)
      `);

      // Investimento sem objetivo é legítimo (uma caixinha sem meta de valor).
      await queryRunner.query(`
        ALTER TABLE "goals" ALTER COLUMN "target_amount" DROP NOT NULL
      `);
    }

    if (await this.tabelaExiste(queryRunner, 'pdf_imports')) {
      await queryRunner.query(`
        ALTER TABLE "pdf_imports"
          ADD COLUMN IF NOT EXISTS "creditCardId" uuid
      `);
    }

    if (await this.tabelaExiste(queryRunner, 'email_logs')) {
      await queryRunner.query(`
        ALTER TABLE "email_logs"
          ADD COLUMN IF NOT EXISTS "bouncedAt" timestamp
      `);
      // O assunto carrega descrição + valor da conta; 255 estoura.
      await queryRunner.query(`
        ALTER TABLE "email_logs" ALTER COLUMN "subject" TYPE varchar(300)
      `);
    }

    // ─── 3. A tabela dos lembretes ────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payment_reminders" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "plannedAccountId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "recipient" varchar(255) NOT NULL,
        "referenceDate" date NOT NULL,
        "window" varchar(10) NOT NULL,
        "kind" varchar(10) NOT NULL,
        "daysUntilDue" integer NOT NULL,
        "emailSent" boolean NOT NULL DEFAULT false,
        "failureReason" text,
        "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ─── 4. Constraints (cada uma checada antes) ──────────────────────────
    await this.garantirConstraint(
      queryRunner,
      'planned_accounts',
      'CHK_planned_accounts_type',
      `CHECK ("type" IN ('expense', 'income'))`,
    );
    await this.garantirConstraint(
      queryRunner,
      'planned_accounts',
      'FK_planned_accounts_recurringExpenseId',
      `FOREIGN KEY ("recurringExpenseId") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await this.garantirConstraint(
      queryRunner,
      'planned_accounts',
      'FK_planned_accounts_recurringIncomeId',
      `FOREIGN KEY ("recurringIncomeId") REFERENCES "incomes"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await this.garantirConstraint(
      queryRunner,
      'expenses',
      'FK_expenses_plannedAccountId',
      `FOREIGN KEY ("plannedAccountId") REFERENCES "planned_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await this.garantirConstraint(
      queryRunner,
      'pdf_imports',
      'FK_pdf_imports_creditCardId',
      `FOREIGN KEY ("creditCardId") REFERENCES "credit_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await this.garantirConstraint(
      queryRunner,
      'payment_reminders',
      'CHK_payment_reminders_window',
      `CHECK ("window" IN ('morning', 'evening'))`,
    );
    await this.garantirConstraint(
      queryRunner,
      'payment_reminders',
      'CHK_payment_reminders_kind',
      `CHECK ("kind" IN ('upcoming', 'overdue'))`,
    );
    await this.garantirConstraint(
      queryRunner,
      'payment_reminders',
      'FK_payment_reminders_plannedAccountId',
      `FOREIGN KEY ("plannedAccountId") REFERENCES "planned_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );

    // ─── 5. Índices ───────────────────────────────────────────────────────
    const indices: Array<[string, string]> = [
      ['IDX_EXPENSES_USER_PAID', `ON "expenses" ("userId", "isPaid", "paidAt")`],
      ['IDX_EXPENSES_PLANNED_ACCOUNT', `ON "expenses" ("plannedAccountId")`],
      [
        'IDX_EXPENSES_RECURRING_ACTIVE',
        `ON "expenses" ("userId", "isRecurring", "recurrenceCancelledAt")`,
      ],
      ['IDX_EXPENSES_CARD_DATE', `ON "expenses" ("creditCardId", "date")`],
      [
        'IDX_PLANNED_RECURRING_SERIES',
        `ON "planned_accounts" ("recurringExpenseId", "dueDate")`,
      ],
      [
        'IDX_PLANNED_INCOME_SERIES',
        `ON "planned_accounts" ("recurringIncomeId", "dueDate")`,
      ],
      ['IDX_PLANNED_TYPE_DUE', `ON "planned_accounts" ("type", "dueDate")`],
      [
        'IDX_INCOMES_RECURRING_ACTIVE',
        `ON "incomes" ("userId", "isRecurring", "recurrenceCancelledAt")`,
      ],
      ['IDX_INCOMES_PLANNED_ACCOUNT', `ON "incomes" ("plannedAccountId")`],
      ['IDX_GOALS_INSTITUTION', `ON "goals" ("family_id", "institution")`],
      ['IDX_GOALS_MATURITY', `ON "goals" ("family_id", "maturity_date")`],
      ['IDX_PDF_IMPORTS_CARD', `ON "pdf_imports" ("creditCardId")`],
      [
        'IDX_EMAIL_LOGS_RELATED',
        `ON "email_logs" ("relatedEntityType", "relatedEntityId")`,
      ],
      [
        'IDX_PAYMENT_REMINDERS_USER',
        `ON "payment_reminders" ("userId", "createdAt")`,
      ],
    ];

    for (const [nome, corpo] of indices) {
      const tabela = corpo.match(/ON "([^"]+)"/)?.[1];
      if (tabela && !(await this.tabelaExiste(queryRunner, tabela))) continue;
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "${nome}" ${corpo}`,
      );
    }

    // O índice que impede o lembrete de sair duas vezes na mesma janela.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_PAYMENT_REMINDER_JANELA"
        ON "payment_reminders" ("plannedAccountId", "referenceDate", "window")
    `);
  }

  /**
   * Sem `down`: esta migration só GARANTE o que as anteriores já prometeram.
   * Desfazê-la significaria derrubar colunas que pertencem a 023–029 — e que
   * o `down` daquelas migrations já remove. Reverter aqui apagaria dados de
   * ninguém em benefício de nada.
   */
  public async down(): Promise<void> {
    // Intencionalmente vazio.
  }
}
