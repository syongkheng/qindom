import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_suggestion_activity (
      id              BIGINT        NOT NULL AUTO_INCREMENT,
      destination_tag VARCHAR(255)  NOT NULL,
      title           VARCHAR(255)  NOT NULL,
      category        VARCHAR(64)   NULL,
      estimated_hours DECIMAL(4,1)  NULL,
      description     TEXT          NULL,
      record_status   CHAR(1)       NOT NULL DEFAULT 'A',
      created_dt      BIGINT        NOT NULL,
      PRIMARY KEY (id),
      INDEX idx_suggestion_activity_dest (destination_tag)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_suggestion_packing (
      id            BIGINT       NOT NULL AUTO_INCREMENT,
      trip_type     VARCHAR(64)  NOT NULL,
      label         VARCHAR(255) NOT NULL,
      label_key     VARCHAR(128) NULL,
      category      VARCHAR(64)  NULL,
      record_status CHAR(1)      NOT NULL DEFAULT 'A',
      created_dt    BIGINT       NOT NULL,
      PRIMARY KEY (id),
      INDEX idx_suggestion_packing_trip (trip_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── Singapore seed activities ────────────────────────────────────────────────
  const now = Date.now();
  await knex("tb_suggestion_activity").insert([
    { destination_tag: "Singapore", title: "Gardens by the Bay",            category: "attraction",    estimated_hours: 3.0, description: null, record_status: "A", created_dt: now },
    { destination_tag: "Singapore", title: "Marina Bay Sands SkyPark",      category: "attraction",    estimated_hours: 1.5, description: null, record_status: "A", created_dt: now },
    { destination_tag: "Singapore", title: "Sentosa Island Day",            category: "attraction",    estimated_hours: 5.0, description: null, record_status: "A", created_dt: now },
    { destination_tag: "Singapore", title: "Universal Studios Singapore",   category: "entertainment", estimated_hours: 6.0, description: null, record_status: "A", created_dt: now },
    { destination_tag: "Singapore", title: "Night Safari",                  category: "nature",        estimated_hours: 3.0, description: null, record_status: "A", created_dt: now },
    { destination_tag: "Singapore", title: "Singapore Zoo",                 category: "nature",        estimated_hours: 4.0, description: null, record_status: "A", created_dt: now },
    { destination_tag: "Singapore", title: "Chinatown Food Street",         category: "dining",        estimated_hours: 2.0, description: null, record_status: "A", created_dt: now },
    { destination_tag: "Singapore", title: "Maxwell Food Centre",           category: "dining",        estimated_hours: 1.0, description: null, record_status: "A", created_dt: now },
    { destination_tag: "Singapore", title: "Little India Walk",             category: "other",         estimated_hours: 2.0, description: null, record_status: "A", created_dt: now },
    { destination_tag: "Singapore", title: "Singapore River Cruise",        category: "attraction",    estimated_hours: 1.0, description: null, record_status: "A", created_dt: now },
    { destination_tag: "Singapore", title: "Orchard Road Shopping",         category: "shopping",      estimated_hours: 3.0, description: null, record_status: "A", created_dt: now },
    { destination_tag: "Singapore", title: "Jewel Changi Airport",          category: "attraction",    estimated_hours: 2.0, description: null, record_status: "A", created_dt: now },
    { destination_tag: "Singapore", title: "National Museum of Singapore",  category: "attraction",    estimated_hours: 2.0, description: null, record_status: "A", created_dt: now },
    { destination_tag: "Singapore", title: "ArtScience Museum",             category: "attraction",    estimated_hours: 2.0, description: null, record_status: "A", created_dt: now },
    { destination_tag: "Singapore", title: "Clarke Quay Night Out",         category: "entertainment", estimated_hours: 3.0, description: null, record_status: "A", created_dt: now },
    { destination_tag: "Singapore", title: "Bugis Street Market",           category: "shopping",      estimated_hours: 2.0, description: null, record_status: "A", created_dt: now },
    { destination_tag: "Singapore", title: "East Coast Park Cycling",       category: "nature",        estimated_hours: 3.0, description: null, record_status: "A", created_dt: now },
    { destination_tag: "Singapore", title: "Singapore Botanic Gardens",     category: "nature",        estimated_hours: 2.0, description: null, record_status: "A", created_dt: now },
  ]);

  // ── General / city packing seed ───────────────────────────────────────────────
  const P = "travel.suggestion.packing.items";
  await knex("tb_suggestion_packing").insert([
    { trip_type: "city",    label: "Umbrella",                  label_key: `${P}.umbrella`,           category: "misc",        record_status: "A", created_dt: now },
    { trip_type: "city",    label: "Sunscreen SPF 50",          label_key: `${P}.sunscreen`,          category: "health",      record_status: "A", created_dt: now },
    { trip_type: "city",    label: "Comfortable walking shoes", label_key: `${P}.walkingShoes`,       category: "clothing",    record_status: "A", created_dt: now },
    { trip_type: "city",    label: "Light breathable clothing", label_key: `${P}.breathableClothing`, category: "clothing",    record_status: "A", created_dt: now },
    { trip_type: "city",    label: "Sunglasses",                label_key: `${P}.sunglasses`,         category: "clothing",    record_status: "A", created_dt: now },
    { trip_type: "city",    label: "Mosquito repellent",        label_key: `${P}.mosquitoRepellent`,  category: "health",      record_status: "A", created_dt: now },
    { trip_type: "general", label: "Portable charger",          label_key: `${P}.portableCharger`,    category: "electronics", record_status: "A", created_dt: now },
    { trip_type: "general", label: "Travel adaptor",            label_key: `${P}.travelAdaptor`,      category: "electronics", record_status: "A", created_dt: now },
    { trip_type: "general", label: "Camera",                    label_key: `${P}.camera`,             category: "electronics", record_status: "A", created_dt: now },
    { trip_type: "general", label: "Reusable water bottle",     label_key: `${P}.waterBottle`,        category: "misc",        record_status: "A", created_dt: now },
    { trip_type: "general", label: "Collapsible tote bag",      label_key: `${P}.toteBag`,            category: "misc",        record_status: "A", created_dt: now },
    { trip_type: "general", label: "Hand sanitiser",            label_key: `${P}.handSanitiser`,      category: "health",      record_status: "A", created_dt: now },
    { trip_type: "general", label: "Wet wipes",                 label_key: `${P}.wetWipes`,           category: "toiletries",  record_status: "A", created_dt: now },
    { trip_type: "general", label: "Passport / travel docs",    label_key: `${P}.passport`,           category: "documents",   record_status: "A", created_dt: now },
    { trip_type: "general", label: "Emergency cash",            label_key: `${P}.emergencyCash`,      category: "documents",   record_status: "A", created_dt: now },
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS tb_suggestion_packing`);
  await knex.raw(`DROP TABLE IF EXISTS tb_suggestion_activity`);
}
