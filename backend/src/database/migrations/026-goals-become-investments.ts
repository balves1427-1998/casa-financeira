import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A aba Metas vira **Investimentos**, absorvendo o que ela já fazia.
 *
 * Metas e investimentos eram a mesma coisa vista de dois ângulos: a "caixinha
 * da viagem" é um objetivo E é dinheiro aplicado em algum lugar. Manter as duas
 * telas obrigaria a cadastrar a mesma poupança duas vezes, com os números
 * divergindo com o tempo.
 *
 * A tabela `goals` é reaproveitada em vez de substituída: os registros que já
 * existem continuam válidos e viram investimentos do tipo objetivo, sem
 * migração de dados nem risco de perder o histórico de aportes.
 *
 * As colunas novas cobrem o que faltava para acompanhar aplicação de verdade:
 *
 * - `institution`      — onde o dinheiro está (Nubank, XP, Caixa…)
 * - `invested_amount`  — quanto foi APORTADO, separado do valor atual
 * - `maturity_date`    — vencimento de CDB, Tesouro e afins
 * - `liquidity`        — em quanto tempo o dinheiro fica disponível
 *
 * A separação entre `invested_amount` e `current_amount` é o centro da
 * mudança. Antes só existia `current_amount`, que crescia com os aportes — o
 * que impede distinguir "guardei R$ 10.000" de "tenho R$ 10.000 porque rendeu".
 * Sem os dois números não há como calcular rendimento nenhum.
 *
 * O backfill copia `current_amount` para `invested_amount`: para os registros
 * antigos, tudo o que está lá foi aportado, e o rendimento começa em zero. É a
 * leitura honesta do que se sabe — inventar rentabilidade retroativa seria pior.
 *
 * `target_amount` passa a aceitar nulo: um CDB não tem "objetivo", tem valor.
 */
export class GoalsBecomeInvestments1692864026000 implements MigrationInterface {
  name = 'GoalsBecomeInvestments1692864026000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "goals"
        ADD COLUMN IF NOT EXISTS "institution" varchar(255),
        ADD COLUMN IF NOT EXISTS "invested_amount" decimal(15,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "maturity_date" timestamp,
        ADD COLUMN IF NOT EXISTS "liquidity" varchar(30)
    `);

    // Nos registros que já existem, o acumulado É o aportado.
    await queryRunner.query(`
      UPDATE "goals"
      SET "invested_amount" = "current_amount"
      WHERE "invested_amount" = 0
        AND "current_amount" > 0
    `);

    // Um investimento sem objetivo definido não tem valor-alvo.
    await queryRunner.query(`
      ALTER TABLE "goals" ALTER COLUMN "target_amount" DROP NOT NULL
    `);

    // A tela lista por instituição e por vencimento próximo.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_GOALS_INSTITUTION"
        ON "goals" ("family_id", "institution")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_GOALS_MATURITY"
        ON "goals" ("family_id", "maturity_date")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_GOALS_MATURITY"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_GOALS_INSTITUTION"`);

    // Voltar `target_amount` a NOT NULL exigiria inventar um valor para os
    // investimentos sem objetivo. Zero é o único preenchimento que não mente
    // sobre uma meta que nunca existiu.
    await queryRunner.query(`
      UPDATE "goals" SET "target_amount" = 0 WHERE "target_amount" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "goals" ALTER COLUMN "target_amount" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "goals"
        DROP COLUMN IF EXISTS "liquidity",
        DROP COLUMN IF EXISTS "maturity_date",
        DROP COLUMN IF EXISTS "invested_amount",
        DROP COLUMN IF EXISTS "institution"
    `);
  }
}
