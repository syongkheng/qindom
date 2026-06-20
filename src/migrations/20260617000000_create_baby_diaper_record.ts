import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_baby_diaper_record (
      id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
      changed_dt    BIGINT       NOT NULL,
      has_stool     TINYINT(1)   NOT NULL DEFAULT '0',
      has_urine     TINYINT(1)   NOT NULL DEFAULT '0',
      stool_load    ENUM('light','medium','heavy') DEFAULT NULL,
      urine_load    ENUM('light','medium','heavy') DEFAULT NULL,
      record_status VARCHAR(255) NOT NULL DEFAULT 'A',
      created_dt    BIGINT       NOT NULL,
      created_by_id BIGINT       NOT NULL,
      updated_dt    BIGINT       DEFAULT NULL,
      updated_by_id BIGINT       DEFAULT NULL,
      PRIMARY KEY (id),
      KEY FK_tb_baby_diaper_created_by (created_by_id),
      KEY FK_tb_baby_diaper_updated_by (updated_by_id),
      CONSTRAINT FK_tb_baby_diaper_created_by FOREIGN KEY (created_by_id) REFERENCES tb_aa_user (id),
      CONSTRAINT FK_tb_baby_diaper_updated_by FOREIGN KEY (updated_by_id) REFERENCES tb_aa_user (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("tb_baby_diaper_record");
}
