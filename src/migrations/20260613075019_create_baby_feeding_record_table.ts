import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("tb_baby_feeding_record", (table) => {
    table.increments("id").primary();
    table.string("timing").nullable();
    table.string("qty").nullable();
    table.string("record_status").notNullable().defaultTo("A");
    table.timestamp("created_dt").notNullable().defaultTo(knex.fn.now());
    table.string("created_by").notNullable();
    table.timestamp("updated_dt").nullable();
    table.string("updated_by").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("tb_baby_feeding_record");
}
