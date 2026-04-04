import type { Knex } from "knex";

// Adds cycle_start_date and due_date to tb_expense_card.
// Uses hasColumn guards so this is safe to run on both fresh and existing databases.
export async function up(knex: Knex): Promise<void> {
  const hasCycleStartDate = await knex.schema.hasColumn(
    "tb_expense_card",
    "cycle_start_date"
  );
  const hasDueDate = await knex.schema.hasColumn("tb_expense_card", "due_date");

  if (!hasCycleStartDate || !hasDueDate) {
    await knex.schema.alterTable("tb_expense_card", (t) => {
      if (!hasCycleStartDate)
        t.string("cycle_start_date", 10).defaultTo(null).nullable();
      if (!hasDueDate) t.string("due_date", 10).defaultTo(null).nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("tb_expense_card", (t) => {
    t.dropColumn("cycle_start_date");
    t.dropColumn("due_date");
  });
}
