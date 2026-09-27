import type { Knex } from "knex";

// Lets a user rename a card by its last 4 digits (e.g. "DBS Debit" instead
// of "•• 5244") — set via the dashboard, applied to every V2 transaction
// sharing that card_last4. One label per (user, card_last4); no separate
// uuid since the compound key is already the natural public identifier.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_applepay_card_label (
      id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
      card_last4    VARCHAR(4)    NOT NULL,
      label         VARCHAR(64)   NOT NULL,
      created_dt    BIGINT        NOT NULL,
      created_by_id BIGINT        NOT NULL,
      updated_dt    BIGINT        DEFAULT NULL,
      updated_by_id BIGINT        DEFAULT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_applepay_card_label_user_card (created_by_id, card_last4),
      KEY FK_tb_applepay_card_label_updated_by (updated_by_id),
      CONSTRAINT FK_tb_applepay_card_label_created_by FOREIGN KEY (created_by_id) REFERENCES tb_aa_user (id),
      CONSTRAINT FK_tb_applepay_card_label_updated_by FOREIGN KEY (updated_by_id) REFERENCES tb_aa_user (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("tb_applepay_card_label");
}
