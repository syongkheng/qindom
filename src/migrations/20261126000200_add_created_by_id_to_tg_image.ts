import type { Knex } from "knex";

// Image ownership for itinerary attachments: POST /img/upload stores the uploader's user id, and an
// itinerary save rejects a `tgShortCode` uploaded by someone else (403). Nullable: rows uploaded before
// this migration have no known uploader and stay attachable by anyone (see src/tgimage/README.md).
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE tb_tg_image
    ADD COLUMN created_by_id BIGINT NULL AFTER size_in_bytes,
    ADD KEY idx_tg_image_created_by_id (created_by_id)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE tb_tg_image
    DROP KEY idx_tg_image_created_by_id,
    DROP COLUMN created_by_id
  `);
}
