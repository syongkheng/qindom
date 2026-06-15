import type { Knex } from "knex";

// Consolidated schema — authoritative source of truth for a fresh database.
// Column definitions, constraint names, and index names match the live DB exactly
// (verified via SHOW CREATE TABLE on 2026-06-15).
// All tables use utf8mb4 for full Unicode support.
export async function up(knex: Knex): Promise<void> {

  // ── Auth & Users ────────────────────────────────────────────────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_aa_user (
      id                     BIGINT        NOT NULL AUTO_INCREMENT,
      username               VARCHAR(64)   NOT NULL,
      email                  VARCHAR(255)  DEFAULT NULL,
      email_verified         TINYINT(1)    NOT NULL DEFAULT '0',
      verify_code            VARCHAR(64)   DEFAULT NULL,
      verify_code_expires_at BIGINT        DEFAULT NULL,
      verify_attempts        INT           NOT NULL DEFAULT '0',
      password               VARCHAR(512)  NOT NULL,
      \`system\`               VARCHAR(256)  NOT NULL,
      country                VARCHAR(256)  DEFAULT NULL,
      roles                  VARCHAR(1000) NOT NULL DEFAULT '[]',
      username_system        VARCHAR(512)  NOT NULL,
      state                  VARCHAR(16)   NOT NULL,
      last_logged_in_dt      BIGINT        DEFAULT NULL,
      token                  VARCHAR(512)  DEFAULT NULL,
      pfp_picture_blob       LONGBLOB,
      created_dt             BIGINT        NOT NULL,
      created_by             VARCHAR(64)   NOT NULL,
      record_status          VARCHAR(1)    NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY username_system (username_system)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── Siri Shortcut API Key ───────────────────────────────────────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_ss_api_key (
      id                 BIGINT       NOT NULL AUTO_INCREMENT,
      user_id            BIGINT       NOT NULL,
      api_key_prefix     VARCHAR(20)  NOT NULL,
      api_key_hash       VARCHAR(255) NOT NULL,
      name               VARCHAR(100) DEFAULT NULL,
      rate_limit_per_min INT          NOT NULL DEFAULT '60',
      revoked_at         BIGINT       DEFAULT NULL,
      created_dt         BIGINT       NOT NULL,
      created_by_id      BIGINT       NOT NULL,
      updated_dt         BIGINT       DEFAULT NULL,
      updated_by_id      BIGINT       DEFAULT NULL,
      record_status      VARCHAR(1)   NOT NULL DEFAULT 'A',
      PRIMARY KEY (id),
      KEY FK_tb_ss_api_key_user       (user_id),
      KEY FK_tb_ss_api_key_created_by (created_by_id),
      KEY FK_tb_ss_api_key_updated_by (updated_by_id),
      CONSTRAINT FK_tb_ss_api_key_user       FOREIGN KEY (user_id)       REFERENCES tb_aa_user (id),
      CONSTRAINT FK_tb_ss_api_key_created_by FOREIGN KEY (created_by_id) REFERENCES tb_aa_user (id),
      CONSTRAINT FK_tb_ss_api_key_updated_by FOREIGN KEY (updated_by_id) REFERENCES tb_aa_user (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── LLM ────────────────────────────────────────────────────────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_llm_model (
      id            BIGINT       NOT NULL AUTO_INCREMENT,
      model_name    VARCHAR(256) NOT NULL,
      model_key     VARCHAR(256) NOT NULL,
      record_status VARCHAR(1)   NOT NULL DEFAULT 'A',
      created_dt    BIGINT       NOT NULL,
      created_by_id BIGINT       NOT NULL,
      updated_dt    BIGINT       DEFAULT NULL,
      updated_by_id BIGINT       DEFAULT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_model_key (model_key),
      KEY FK_tb_llm_model_created_by (created_by_id),
      KEY FK_tb_llm_model_updated_by (updated_by_id),
      CONSTRAINT FK_tb_llm_model_created_by FOREIGN KEY (created_by_id) REFERENCES tb_aa_user (id),
      CONSTRAINT FK_tb_llm_model_updated_by FOREIGN KEY (updated_by_id) REFERENCES tb_aa_user (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_llm_api_key (
      id                 BIGINT       NOT NULL AUTO_INCREMENT,
      user_id            BIGINT       NOT NULL,
      api_key_prefix     VARCHAR(20)  NOT NULL,
      api_key_hash       VARCHAR(255) NOT NULL,
      name               VARCHAR(100) DEFAULT NULL,
      rate_limit_per_min INT          NOT NULL DEFAULT '60',
      revoked_at         BIGINT       DEFAULT NULL,
      created_dt         BIGINT       NOT NULL,
      created_by_id      BIGINT       NOT NULL,
      updated_dt         BIGINT       DEFAULT NULL,
      updated_by_id      BIGINT       DEFAULT NULL,
      record_status      VARCHAR(1)   NOT NULL DEFAULT 'A',
      PRIMARY KEY (id),
      KEY FK_tb_llm_api_key_user       (user_id),
      KEY FK_tb_llm_api_key_created_by (created_by_id),
      KEY FK_tb_llm_api_key_updated_by (updated_by_id),
      CONSTRAINT FK_tb_llm_api_key_user       FOREIGN KEY (user_id)       REFERENCES tb_aa_user (id),
      CONSTRAINT FK_tb_llm_api_key_created_by FOREIGN KEY (created_by_id) REFERENCES tb_aa_user (id),
      CONSTRAINT FK_tb_llm_api_key_updated_by FOREIGN KEY (updated_by_id) REFERENCES tb_aa_user (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── HDB (Housing) ──────────────────────────────────────────────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_hdb_pphs (
      id          BIGINT    NOT NULL AUTO_INCREMENT,
      batch       VARCHAR(6)  NOT NULL,
      json_string LONGTEXT    NOT NULL,
      created_dt  BIGINT      NOT NULL,
      created_by  VARCHAR(64) NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY batch (batch)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_hdb_pphs_coordinate (
      id          BIGINT        NOT NULL AUTO_INCREMENT,
      building    VARCHAR(1024) DEFAULT NULL,
      formed_url  VARCHAR(1024) DEFAULT NULL,
      lat         VARCHAR(16)   DEFAULT NULL,
      lng         VARCHAR(16)   DEFAULT NULL,
      created_dt  BIGINT        NOT NULL,
      created_by  VARCHAR(64)   NOT NULL,
      modified_dt BIGINT        DEFAULT NULL,
      modified_by VARCHAR(64)   DEFAULT NULL,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── LTA (Transport) ────────────────────────────────────────────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_lta_busstop (
      id           BIGINT      NOT NULL AUTO_INCREMENT,
      busstop_code VARCHAR(8)  DEFAULT NULL,
      road_name    VARCHAR(128) DEFAULT NULL,
      \`desc\`       VARCHAR(512) DEFAULT NULL,
      lat          VARCHAR(32)  DEFAULT NULL,
      lng          VARCHAR(32)  DEFAULT NULL,
      created_dt   BIGINT       NOT NULL,
      created_by   VARCHAR(64)  NOT NULL,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_lta_bus_info (
      id             BIGINT      NOT NULL AUTO_INCREMENT,
      service_no     VARCHAR(16)  DEFAULT NULL,
      operator       VARCHAR(128) DEFAULT NULL,
      direction      VARCHAR(8)   DEFAULT NULL,
      stop_sequence  VARCHAR(32)  DEFAULT NULL,
      busstop_code   VARCHAR(32)  DEFAULT NULL,
      distance       VARCHAR(8)   DEFAULT NULL,
      wd_first_bus   VARCHAR(4)   DEFAULT NULL,
      wd_last_bus    VARCHAR(4)   DEFAULT NULL,
      sat_first_bus  VARCHAR(4)   DEFAULT NULL,
      sat_last_bus   VARCHAR(4)   DEFAULT NULL,
      sun_first_bus  VARCHAR(4)   DEFAULT NULL,
      sun_last_bus   VARCHAR(4)   DEFAULT NULL,
      created_dt     BIGINT       NOT NULL,
      created_by     VARCHAR(64)  NOT NULL,
      PRIMARY KEY (id),
      KEY idx_busstop_code (busstop_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_lrt_mrt_station (
      id         BIGINT      NOT NULL AUTO_INCREMENT,
      station    VARCHAR(128) DEFAULT NULL,
      \`exit\`     VARCHAR(16)  DEFAULT NULL,
      lat        VARCHAR(32)  DEFAULT NULL,
      lng        VARCHAR(32)  DEFAULT NULL,
      \`type\`     VARCHAR(8)   DEFAULT NULL,
      created_dt BIGINT       NOT NULL,
      created_by VARCHAR(64)  NOT NULL,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── Analytics ──────────────────────────────────────────────────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_analytic_user_activity (
      session_id   VARCHAR(64) NOT NULL,
      user_id      VARCHAR(64) DEFAULT NULL,
      last_seen_at BIGINT      NOT NULL,
      ip_address   VARCHAR(45) DEFAULT NULL,
      user_agent   TEXT,
      PRIMARY KEY (session_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── Geocode Cache ──────────────────────────────────────────────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_geocode_cache (
      id           BIGINT       NOT NULL AUTO_INCREMENT,
      query        VARCHAR(512) NOT NULL,
      results_json LONGTEXT     NOT NULL,
      created_dt   BIGINT       NOT NULL,
      PRIMARY KEY (id),
      KEY idx_geocode_query (query(255))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── Travel Itinerary ───────────────────────────────────────────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_travel_itinerary (
      id                 BIGINT       NOT NULL AUTO_INCREMENT,
      session_id         VARCHAR(64)  NOT NULL,
      short_code         VARCHAR(16)  NOT NULL,
      idempotency_key    VARCHAR(64)  DEFAULT NULL,
      session_title      VARCHAR(512) NOT NULL,
      destination        VARCHAR(512) DEFAULT NULL,
      destination_raw    LONGTEXT,
      country            VARCHAR(256) DEFAULT NULL,
      number_of_pax      INT          DEFAULT '1',
      itinerary_date_raw LONGTEXT,
      start_date         BIGINT       DEFAULT NULL,
      end_date           BIGINT       DEFAULT NULL,
      unknown_date       TINYINT(1)   DEFAULT '0',
      duration_in_days   INT          DEFAULT '1',
      created_dt         BIGINT       NOT NULL,
      created_by_id      BIGINT       NOT NULL,
      record_status      VARCHAR(1)   NOT NULL DEFAULT 'A',
      challenge          VARCHAR(6)   DEFAULT NULL,
      pax_names          LONGTEXT,
      PRIMARY KEY (id),
      UNIQUE KEY session_id      (session_id),
      UNIQUE KEY short_code      (short_code),
      UNIQUE KEY idempotency_key (idempotency_key),
      KEY FK_tb_travel_itinerary_created_by (created_by_id),
      CONSTRAINT FK_tb_travel_itinerary_created_by FOREIGN KEY (created_by_id) REFERENCES tb_aa_user (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_travel_agenda_item (
      id                BIGINT        NOT NULL AUTO_INCREMENT,
      itinerary_id      BIGINT        NOT NULL,
      category          VARCHAR(32)   DEFAULT NULL,
      title             VARCHAR(512)  NOT NULL,
      \`desc\`            LONGTEXT,
      city              VARCHAR(512)  DEFAULT NULL,
      city_raw          LONGTEXT,
      start_time        BIGINT        DEFAULT NULL,
      end_time          BIGINT        DEFAULT NULL,
      duration_in_hours DECIMAL(6,2)  DEFAULT NULL,
      unknown_time      TINYINT(1)    DEFAULT '0',
      budget            DECIMAL(12,2) DEFAULT NULL,
      day               BIGINT        DEFAULT NULL,
      \`date\`            VARCHAR(32)   DEFAULT NULL,
      created_dt        BIGINT        NOT NULL,
      record_status     VARCHAR(1)    NOT NULL DEFAULT 'A',
      coordinates_lat   DECIMAL(11,8) DEFAULT NULL,
      coordinates_lng   DECIMAL(11,8) DEFAULT NULL,
      PRIMARY KEY (id),
      KEY idx_itinerary_id (itinerary_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_travel_agenda_file (
      id             INT          NOT NULL AUTO_INCREMENT,
      uuid           VARCHAR(36)  NOT NULL,
      agenda_item_id INT          NOT NULL,
      tg_short_code  VARCHAR(16)  NOT NULL,
      name           VARCHAR(255) DEFAULT NULL,
      mime_type      VARCHAR(100) DEFAULT NULL,
      size_in_bytes  INT          DEFAULT NULL,
      created_dt     BIGINT       NOT NULL,
      record_status  VARCHAR(1)   NOT NULL DEFAULT 'A',
      PRIMARY KEY (id),
      UNIQUE KEY uq_uuid (uuid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_travel_itinerary_booking (
      id                BIGINT        NOT NULL AUTO_INCREMENT,
      itinerary_id      BIGINT        NOT NULL,
      category          VARCHAR(32)   DEFAULT NULL,
      item              VARCHAR(512)  NOT NULL,
      location          VARCHAR(128)  DEFAULT NULL,
      link              VARCHAR(1024) DEFAULT NULL,
      payment           VARCHAR(256)  DEFAULT NULL,
      start_date        VARCHAR(32)   DEFAULT NULL,
      end_date          VARCHAR(32)   DEFAULT NULL,
      nights            INT           DEFAULT NULL,
      price             DECIMAL(12,2) DEFAULT NULL,
      booked            TINYINT(1)    DEFAULT '0',
      free_cancellation VARCHAR(256)  DEFAULT NULL,
      breakfast         TINYINT(1)    DEFAULT '0',
      deposit           VARCHAR(128)  DEFAULT NULL,
      pax_breakdown     LONGTEXT,
      sort_order        INT           DEFAULT '0',
      created_dt        BIGINT        NOT NULL,
      record_status     VARCHAR(1)    NOT NULL DEFAULT 'A',
      PRIMARY KEY (id),
      KEY idx_booking_itinerary_id (itinerary_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_travel_itinerary_view (
      id          BIGINT      NOT NULL AUTO_INCREMENT,
      short_code  VARCHAR(16) NOT NULL,
      ip_address  VARCHAR(64) DEFAULT NULL,
      user_agent  TEXT,
      viewed_at   BIGINT      NOT NULL,
      PRIMARY KEY (id),
      KEY idx_itinerary_view_short_code (short_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── Trail ──────────────────────────────────────────────────────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_trail_session (
      id                     INT UNSIGNED NOT NULL AUTO_INCREMENT,
      session_id             VARCHAR(36)  NOT NULL,
      created_by_id          BIGINT       NOT NULL,
      trail_id               VARCHAR(100) NOT NULL,
      trail_name             VARCHAR(255) NOT NULL,
      trail_type             ENUM('preset','custom')            NOT NULL DEFAULT 'preset',
      status                 ENUM('active','paused','completed') NOT NULL DEFAULT 'active',
      started_at             BIGINT       NOT NULL,
      completed_at           BIGINT       DEFAULT NULL,
      total_km               DECIMAL(8,3) NOT NULL DEFAULT '0.000',
      total_steps            INT UNSIGNED NOT NULL DEFAULT '0',
      total_duration_seconds INT UNSIGNED NOT NULL DEFAULT '0',
      checkpoints_reached    JSON         DEFAULT NULL,
      track_points           JSON         DEFAULT NULL,
      notes                  TEXT,
      record_status          CHAR(1)      NOT NULL DEFAULT 'A',
      created_dt             BIGINT       NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_trail_session_id (session_id),
      KEY idx_trail_session_by_id (created_by_id),
      CONSTRAINT FK_tb_trail_session_created_by FOREIGN KEY (created_by_id) REFERENCES tb_aa_user (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_trail_split (
      id               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
      trail_session_id INT UNSIGNED  NOT NULL,
      km_mark          DECIMAL(6,2)  NOT NULL,
      duration_seconds INT UNSIGNED  NOT NULL,
      steps            INT UNSIGNED  DEFAULT NULL,
      lat              DECIMAL(10,7) DEFAULT NULL,
      lng              DECIMAL(10,7) DEFAULT NULL,
      logged_at        BIGINT        NOT NULL,
      record_status    CHAR(1)       NOT NULL DEFAULT 'A',
      PRIMARY KEY (id),
      KEY idx_split_session (trail_session_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_trail_custom (
      id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
      trail_id       VARCHAR(36)  NOT NULL,
      created_by_id  BIGINT       NOT NULL,
      name           VARCHAR(255) NOT NULL,
      country        VARCHAR(100) NOT NULL DEFAULT 'Custom',
      total_km       DECIMAL(8,3) NOT NULL,
      difficulty     ENUM('easy','moderate','hard','extreme') NOT NULL DEFAULT 'moderate',
      estimated_days INT UNSIGNED NOT NULL DEFAULT '1',
      description    TEXT         DEFAULT NULL,
      record_status  CHAR(1)      NOT NULL DEFAULT 'A',
      created_dt     BIGINT       NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_trail_custom_id (trail_id),
      KEY idx_custom_by_id (created_by_id),
      CONSTRAINT FK_tb_trail_custom_created_by FOREIGN KEY (created_by_id) REFERENCES tb_aa_user (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── Telegram Image & Stats ─────────────────────────────────────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_tg_image (
      id               BIGINT       NOT NULL AUTO_INCREMENT,
      short_code       VARCHAR(16)  NOT NULL,
      uuid             VARCHAR(36)  DEFAULT NULL,
      telegram_file_id VARCHAR(256) NOT NULL,
      mime_type        VARCHAR(128) DEFAULT NULL,
      file_name        VARCHAR(512) DEFAULT NULL,
      size_in_bytes    BIGINT       DEFAULT NULL,
      created_dt       BIGINT       NOT NULL,
      record_status    CHAR(1)      NOT NULL DEFAULT 'A',
      PRIMARY KEY (id),
      UNIQUE KEY uq_tg_image_short_code (short_code),
      UNIQUE KEY uq_tg_image_uuid       (uuid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_tg_stats_whitelist (
      id               BIGINT  NOT NULL AUTO_INCREMENT,
      telegram_user_id BIGINT  NOT NULL,
      added_dt         BIGINT  NOT NULL,
      record_status    CHAR(1) NOT NULL DEFAULT 'A',
      telegram_chat_id BIGINT  DEFAULT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_tg_stats_wl_user (telegram_user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── Baby Feeding ───────────────────────────────────────────────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_baby_feeding_record (
      id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
      timing        VARCHAR(255) DEFAULT NULL,
      qty           VARCHAR(255) DEFAULT NULL,
      record_status VARCHAR(255) NOT NULL DEFAULT 'A',
      created_dt    BIGINT       NOT NULL,
      created_by_id BIGINT       NOT NULL,
      updated_dt    BIGINT       DEFAULT NULL,
      updated_by_id BIGINT       DEFAULT NULL,
      PRIMARY KEY (id),
      KEY FK_tb_baby_feeding_created_by (created_by_id),
      KEY FK_tb_baby_feeding_updated_by (updated_by_id),
      CONSTRAINT FK_tb_baby_feeding_created_by FOREIGN KEY (created_by_id) REFERENCES tb_aa_user (id),
      CONSTRAINT FK_tb_baby_feeding_updated_by FOREIGN KEY (updated_by_id) REFERENCES tb_aa_user (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Drop in reverse FK-dependency order (children / dependents first)
  await knex.schema.dropTableIfExists("tb_baby_feeding_record");
  await knex.schema.dropTableIfExists("tb_tg_stats_whitelist");
  await knex.schema.dropTableIfExists("tb_tg_image");
  await knex.schema.dropTableIfExists("tb_trail_custom");
  await knex.schema.dropTableIfExists("tb_trail_split");
  await knex.schema.dropTableIfExists("tb_trail_session");
  await knex.schema.dropTableIfExists("tb_travel_itinerary_view");
  await knex.schema.dropTableIfExists("tb_travel_itinerary_booking");
  await knex.schema.dropTableIfExists("tb_travel_agenda_file");
  await knex.schema.dropTableIfExists("tb_travel_agenda_item");
  await knex.schema.dropTableIfExists("tb_travel_itinerary");
  await knex.schema.dropTableIfExists("tb_geocode_cache");
  await knex.schema.dropTableIfExists("tb_analytic_user_activity");
  await knex.schema.dropTableIfExists("tb_lrt_mrt_station");
  await knex.schema.dropTableIfExists("tb_lta_bus_info");
  await knex.schema.dropTableIfExists("tb_lta_busstop");
  await knex.schema.dropTableIfExists("tb_hdb_pphs_coordinate");
  await knex.schema.dropTableIfExists("tb_hdb_pphs");
  await knex.schema.dropTableIfExists("tb_llm_api_key");
  await knex.schema.dropTableIfExists("tb_llm_model");
  await knex.schema.dropTableIfExists("tb_ss_api_key");
  await knex.schema.dropTableIfExists("tb_aa_user");
}
