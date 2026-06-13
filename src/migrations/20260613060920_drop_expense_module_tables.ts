import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("tb_expense_balance");
  await knex.schema.dropTableIfExists("tb_expense_transaction");
  await knex.schema.dropTableIfExists("tb_expense_card");
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_expense_transaction (
      id            BIGINT        NOT NULL AUTO_INCREMENT,
      type          VARCHAR(16)   NOT NULL,
      amount        DECIMAL(12,2) NOT NULL,
      description   VARCHAR(256)  NOT NULL,
      category      VARCHAR(64)   NOT NULL,
      date          VARCHAR(10)   NOT NULL,
      notes         TEXT,
      card_id       BIGINT        DEFAULT NULL,
      created_by    VARCHAR(128)  NOT NULL,
      created_dt    BIGINT        NOT NULL,
      record_status VARCHAR(1)    NOT NULL DEFAULT 'A',
      PRIMARY KEY (id),
      KEY idx_exp_tx_user (created_by),
      KEY idx_exp_tx_date (date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_expense_card (
      id               BIGINT        NOT NULL AUTO_INCREMENT,
      name             VARCHAR(128)  NOT NULL,
      cycle_end_day    INT           NOT NULL,
      due_day          INT           NOT NULL,
      color            VARCHAR(16)   NOT NULL,
      cycle_start_date VARCHAR(10)   DEFAULT NULL,
      due_date         VARCHAR(10)   DEFAULT NULL,
      created_by       VARCHAR(128)  NOT NULL,
      created_dt       BIGINT        NOT NULL,
      record_status    VARCHAR(1)    NOT NULL DEFAULT 'A',
      PRIMARY KEY (id),
      KEY idx_exp_card_user (created_by)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_expense_balance (
      id         BIGINT        NOT NULL AUTO_INCREMENT,
      balance    DECIMAL(12,2) NOT NULL DEFAULT '0.00',
      created_by VARCHAR(128)  NOT NULL,
      updated_dt BIGINT        NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_exp_balance_user (created_by)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}
