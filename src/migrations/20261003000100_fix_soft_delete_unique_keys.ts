import type { Knex } from "knex";

// Rows are soft-deleted (record_status 'D'), so a plain UNIQUE key on a
// user-chosen value lets a deleted row block a new active one.
//
// tb_wedding_rsvp.email — nothing relies on it being unique, and guests can
// legitimately share an address (a couple RSVPing separately), which failed
// at insert with a generic error. Dropped outright.
//
// tb_aa_user.username_system — still needs DB-level uniqueness (it's what stops
// two sign-ups racing for the same name), but only among active users. The
// VIRTUAL generated column is NULL for non-active rows and a UNIQUE key allows
// any number of NULLs, so a soft-deleted user's name becomes reusable. A plain
// index replaces the old unique one: every authenticated request looks the user
// up by username_system (MandatoryTokenFilter).
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE tb_wedding_rsvp
    DROP KEY uq_wedding_rsvp_email
  `);

  await knex.raw(`
    ALTER TABLE tb_aa_user
    ADD COLUMN username_system_active VARCHAR(512)
      GENERATED ALWAYS AS (IF(record_status = 'A', username_system, NULL)) VIRTUAL,
    ADD UNIQUE KEY uq_aa_user_username_system_active (username_system_active),
    ADD KEY idx_aa_user_username_system (username_system),
    DROP KEY username_system
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Fails if a soft-deleted user's username has since been reused — those rows
  // have to be resolved by hand before the old key can come back.
  await knex.raw(`
    ALTER TABLE tb_aa_user
    ADD UNIQUE KEY username_system (username_system),
    DROP KEY idx_aa_user_username_system,
    DROP KEY uq_aa_user_username_system_active,
    DROP COLUMN username_system_active
  `);

  // Best effort: once two RSVPs share an email the unique key can't be
  // restored, and keeping email non-unique is harmless, so it's skipped.
  const [duplicates] = await knex.raw(`
    SELECT email FROM tb_wedding_rsvp
    WHERE email IS NOT NULL
    GROUP BY email
    HAVING COUNT(*) > 1
    LIMIT 1
  `);
  if (duplicates.length > 0) {
    console.warn("tb_wedding_rsvp has duplicate emails — uq_wedding_rsvp_email not restored");
    return;
  }

  await knex.raw(`
    ALTER TABLE tb_wedding_rsvp
    ADD UNIQUE KEY uq_wedding_rsvp_email (email)
  `);
}
