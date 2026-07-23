import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_wedding_rsvp (
      id                   BIGINT       NOT NULL AUTO_INCREMENT,
      name                 VARCHAR(255) NOT NULL,
      email                VARCHAR(255) NOT NULL,
      contact_number       VARCHAR(30)  NULL,
      attending            TINYINT(1)   NOT NULL,
      dietary_restrictions VARCHAR(100) NULL,
      meal_preference      VARCHAR(100) NULL,
      record_status        CHAR(1)      NOT NULL DEFAULT 'A',
      created_dt           BIGINT       NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_wedding_rsvp_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_wedding_rsvp_guest (
      id                   BIGINT       NOT NULL AUTO_INCREMENT,
      rsvp_id              BIGINT       NOT NULL,
      name                 VARCHAR(255) NOT NULL,
      email                VARCHAR(255) NULL,
      contact_number       VARCHAR(30)  NULL,
      dietary_restrictions VARCHAR(100) NULL,
      meal_preference      VARCHAR(100) NULL,
      record_status        CHAR(1)      NOT NULL DEFAULT 'A',
      created_dt           BIGINT       NOT NULL,
      PRIMARY KEY (id),
      CONSTRAINT fk_wrsvp_guest_rsvp FOREIGN KEY (rsvp_id) REFERENCES tb_wedding_rsvp(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS tb_wedding_rsvp_guest`);
  await knex.raw(`DROP TABLE IF EXISTS tb_wedding_rsvp`);
}
