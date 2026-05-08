import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw("DROP TABLE IF EXISTS `tb_travel_agenda_file`");
  await knex.raw(`
    CREATE TABLE \`tb_travel_agenda_file\` (
      \`id\`             INT          NOT NULL AUTO_INCREMENT,
      \`uuid\`           VARCHAR(36)  NOT NULL,
      \`agenda_item_id\` INT          NOT NULL,
      \`tg_short_code\`  VARCHAR(16)  NOT NULL,
      \`name\`           VARCHAR(255) NULL,
      \`mime_type\`      VARCHAR(100) NULL,
      \`size_in_bytes\`  INT          NULL,
      \`created_dt\`     BIGINT       NOT NULL,
      \`record_status\`  VARCHAR(1)   NOT NULL DEFAULT 'A',
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_uuid\` (\`uuid\`)
    )
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP TABLE IF EXISTS `tb_travel_agenda_file`");
}
