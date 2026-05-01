import type { Knex } from "knex";

// Initial schema — creates all tables for a clean database.
// On an existing database, CREATE TABLE IF NOT EXISTS is a safe no-op.
export async function up(knex: Knex): Promise<void> {
  // ── Auth & Users ────────────────────────────────────────────────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_aa_user (
      id                     BIGINT        PRIMARY KEY AUTO_INCREMENT,
      username               VARCHAR(64)   NOT NULL,
      email                  VARCHAR(255)  NULL,
      email_verified         TINYINT(1)    NOT NULL DEFAULT 0,
      verify_code            VARCHAR(64)   NULL,
      verify_code_expires_at BIGINT        NULL,
      verify_attempts        INT           NOT NULL DEFAULT 0,
      password               VARCHAR(512)  NOT NULL,
      \`system\`               VARCHAR(256)  NOT NULL,
      country                VARCHAR(256),
      roles                  VARCHAR(1000) NOT NULL DEFAULT '[]',
      username_system        VARCHAR(512)  UNIQUE NOT NULL,
      state                  VARCHAR(16)   NOT NULL,
      last_logged_in_dt      BIGINT,
      token                  VARCHAR(512),
      pfp_picture_blob       LONGBLOB,
      created_dt             BIGINT        NOT NULL,
      created_by             VARCHAR(64)   NOT NULL,
      record_status          VARCHAR(1)    NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_aa_feature_flag (
      id            BIGINT       NOT NULL AUTO_INCREMENT,
      feature_key   VARCHAR(64)  NOT NULL,
      label         VARCHAR(128) NOT NULL,
      is_enabled    TINYINT(1)   NOT NULL DEFAULT 1,
      remarks       VARCHAR(512) NULL,
      updated_dt    BIGINT       NULL,
      updated_by    VARCHAR(64)  NULL,
      created_dt    BIGINT       NOT NULL,
      created_by    VARCHAR(64)  NOT NULL,
      record_status VARCHAR(1)   NOT NULL DEFAULT 'A',
      PRIMARY KEY (id),
      UNIQUE KEY uq_feature_key (feature_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── FND (Notices & Events) ─────────────────────────────────────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_fnd_notice (
      id             BIGINT       PRIMARY KEY AUTO_INCREMENT,
      type           VARCHAR(16),
      title          VARCHAR(512),
      content        VARCHAR(8192),
      classification VARCHAR(16),
      updated_by     VARCHAR(64),
      updated_dt     BIGINT,
      created_by     VARCHAR(64),
      created_dt     BIGINT,
      record_status  VARCHAR(1)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_fnd_notice_view (
      id         BIGINT      PRIMARY KEY AUTO_INCREMENT,
      notice_id  BIGINT,
      username   VARCHAR(64),
      created_dt BIGINT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_fnd_event (
      id            BIGINT       PRIMARY KEY AUTO_INCREMENT,
      event_dt      BIGINT,
      title         VARCHAR(512),
      content       VARCHAR(8192),
      updated_by    VARCHAR(64),
      updated_dt    BIGINT,
      created_by    VARCHAR(64),
      created_dt    BIGINT,
      record_status VARCHAR(1)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_fnd_event_view (
      id         BIGINT      PRIMARY KEY AUTO_INCREMENT,
      event_id   BIGINT,
      username   VARCHAR(64),
      created_dt BIGINT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── HDB (Housing) ──────────────────────────────────────────────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_hdb_pphs (
      id          BIGINT       PRIMARY KEY AUTO_INCREMENT,
      batch       VARCHAR(6)   UNIQUE NOT NULL,
      json_string LONGTEXT     NOT NULL,
      created_dt  BIGINT       NOT NULL,
      created_by  VARCHAR(64)  NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_hdb_pphs_coordinate (
      id          BIGINT        PRIMARY KEY AUTO_INCREMENT,
      building    VARCHAR(1024),
      formed_url  VARCHAR(1024),
      lat         VARCHAR(16),
      lng         VARCHAR(16),
      created_dt  BIGINT        NOT NULL,
      created_by  VARCHAR(64)   NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── LTA (Transport) ────────────────────────────────────────────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_lta_busstop (
      id           BIGINT       PRIMARY KEY AUTO_INCREMENT,
      busstop_code VARCHAR(8),
      road_name    VARCHAR(128),
      \`desc\`       VARCHAR(512),
      lat          VARCHAR(32),
      lng          VARCHAR(32),
      created_dt   BIGINT       NOT NULL,
      created_by   VARCHAR(64)  NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_lta_bus_info (
      id             BIGINT       PRIMARY KEY AUTO_INCREMENT,
      service_no     VARCHAR(16),
      operator       VARCHAR(128),
      direction      VARCHAR(8),
      stop_sequence  VARCHAR(32),
      busstop_code   VARCHAR(32),
      distance       VARCHAR(8),
      wd_first_bus   VARCHAR(4),
      wd_last_bus    VARCHAR(4),
      sat_first_bus  VARCHAR(4),
      sat_last_bus   VARCHAR(4),
      sun_first_bus  VARCHAR(4),
      sun_last_bus   VARCHAR(4),
      created_dt     BIGINT       NOT NULL,
      created_by     VARCHAR(64)  NOT NULL,
      INDEX idx_busstop_code (busstop_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_lrt_mrt_station (
      id         BIGINT       PRIMARY KEY AUTO_INCREMENT,
      station    VARCHAR(128),
      \`exit\`     VARCHAR(16),
      lat        VARCHAR(32),
      lng        VARCHAR(32),
      \`type\`     VARCHAR(8),
      created_dt BIGINT       NOT NULL,
      created_by VARCHAR(64)  NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── Analytics ──────────────────────────────────────────────────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_analytic_user_activity (
      session_id   VARCHAR(64) PRIMARY KEY,
      user_id      VARCHAR(64) NULL,
      last_seen_at BIGINT      NOT NULL,
      ip_address   VARCHAR(45),
      user_agent   TEXT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── Travel Itinerary ───────────────────────────────────────────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_travel_itinerary (
      id                 BIGINT        PRIMARY KEY AUTO_INCREMENT,
      session_id         VARCHAR(64)   UNIQUE NOT NULL,
      short_code         VARCHAR(16)   UNIQUE NOT NULL,
      idempotency_key    VARCHAR(64)   UNIQUE,
      session_title      VARCHAR(512)  NOT NULL,
      destination        VARCHAR(512),
      destination_raw    LONGTEXT,
      country            VARCHAR(256),
      number_of_pax      INT           DEFAULT 1,
      pax_names          LONGTEXT,
      itinerary_date_raw LONGTEXT,
      start_date         BIGINT,
      end_date           BIGINT,
      unknown_date       TINYINT(1)    DEFAULT 0,
      duration_in_days   INT           DEFAULT 1,
      challenge          VARCHAR(6)    NULL,
      created_dt         BIGINT        NOT NULL,
      created_by         VARCHAR(64)   NOT NULL,
      record_status      VARCHAR(1)    NOT NULL DEFAULT 'A',
      INDEX idx_session_id (session_id),
      INDEX idx_short_code (short_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_travel_agenda_item (
      id                BIGINT        PRIMARY KEY AUTO_INCREMENT,
      itinerary_id      BIGINT        NOT NULL,
      category          VARCHAR(32)   NULL,
      title             VARCHAR(512)  NOT NULL,
      \`desc\`            LONGTEXT,
      city              VARCHAR(512),
      city_raw          LONGTEXT,
      start_time        BIGINT,
      end_time          BIGINT,
      duration_in_hours DECIMAL(6,2),
      unknown_time      TINYINT(1)    DEFAULT 0,
      budget            DECIMAL(12,2),
      day               BIGINT,
      \`date\`            VARCHAR(32),
      coordinates_lat   DECIMAL(11,8) NULL,
      coordinates_lng   DECIMAL(11,8) NULL,
      created_dt        BIGINT        NOT NULL,
      record_status     VARCHAR(1)    NOT NULL DEFAULT 'A',
      INDEX idx_itinerary_id (itinerary_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_travel_agenda_file (
      id             BIGINT       PRIMARY KEY AUTO_INCREMENT,
      uuid           VARCHAR(64)  UNIQUE NOT NULL,
      agenda_item_id BIGINT       NOT NULL,
      name           VARCHAR(512),
      mime_type      VARCHAR(128),
      size_in_bytes  BIGINT,
      \`blob\`         LONGBLOB,
      created_dt     BIGINT       NOT NULL,
      record_status  VARCHAR(1)   NOT NULL DEFAULT 'A',
      INDEX idx_agenda_item_id (agenda_item_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_travel_itinerary_booking (
      id                BIGINT        PRIMARY KEY AUTO_INCREMENT,
      itinerary_id      BIGINT        NOT NULL,
      category          VARCHAR(32),
      item              VARCHAR(512)  NOT NULL,
      location          VARCHAR(128),
      link              VARCHAR(1024),
      payment           VARCHAR(256),
      start_date        VARCHAR(32),
      end_date          VARCHAR(32),
      nights            INT,
      price             DECIMAL(12,2),
      booked            TINYINT(1)    DEFAULT 0,
      free_cancellation VARCHAR(256),
      breakfast         TINYINT(1)    DEFAULT 0,
      deposit           VARCHAR(128),
      pax_breakdown     LONGTEXT,
      sort_order        INT           DEFAULT 0,
      created_dt        BIGINT        NOT NULL,
      record_status     VARCHAR(1)    NOT NULL DEFAULT 'A',
      INDEX idx_booking_itinerary_id (itinerary_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── Geocode Cache ──────────────────────────────────────────────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_geocode_cache (
      id           BIGINT        PRIMARY KEY AUTO_INCREMENT,
      query        VARCHAR(512)  NOT NULL,
      results_json LONGTEXT      NOT NULL,
      created_dt   BIGINT        NOT NULL,
      INDEX idx_geocode_query (query(255))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── Meal Tracker ───────────────────────────────────────────────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_meal_log (
      id            BIGINT       NOT NULL AUTO_INCREMENT,
      log_date      VARCHAR(10)  NOT NULL,
      meal_type     VARCHAR(16)  NOT NULL,
      planned_name  VARCHAR(256) NOT NULL,
      notes         TEXT,
      created_by    VARCHAR(128) NOT NULL,
      created_dt    BIGINT       NOT NULL,
      record_status VARCHAR(1)   NOT NULL DEFAULT 'A',
      PRIMARY KEY (id),
      KEY idx_meal_log_created_by (created_by),
      KEY idx_meal_log_date (log_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_meal_photo (
      id            BIGINT       NOT NULL AUTO_INCREMENT,
      uuid          VARCHAR(64)  NOT NULL,
      meal_log_id   BIGINT       NOT NULL,
      name          VARCHAR(256),
      mime_type     VARCHAR(128),
      size_in_bytes BIGINT,
      \`blob\`        LONGBLOB,
      created_dt    BIGINT       NOT NULL,
      record_status VARCHAR(1)   NOT NULL DEFAULT 'A',
      PRIMARY KEY (id),
      UNIQUE KEY uq_meal_photo_uuid (uuid),
      KEY idx_meal_photo_log_id (meal_log_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── Expense Tracker ────────────────────────────────────────────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_expense_transaction (
      id            BIGINT        NOT NULL AUTO_INCREMENT,
      type          VARCHAR(16)   NOT NULL,
      amount        DECIMAL(12,2) NOT NULL,
      description   VARCHAR(256)  NOT NULL,
      category      VARCHAR(64)   NOT NULL,
      date          VARCHAR(10)   NOT NULL,
      notes         TEXT,
      card_id       BIGINT        DEFAULT NULL,
      created_by    VARCHAR(128)  NOT NULL,
      created_dt    BIGINT        NOT NULL,
      record_status VARCHAR(1)    NOT NULL DEFAULT 'A',
      PRIMARY KEY (id),
      KEY idx_exp_tx_user (created_by),
      KEY idx_exp_tx_date (date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_expense_card (
      id               BIGINT        NOT NULL AUTO_INCREMENT,
      name             VARCHAR(128)  NOT NULL,
      cycle_end_day    INT           NOT NULL,
      due_day          INT           NOT NULL,
      color            VARCHAR(16)   NOT NULL,
      cycle_start_date VARCHAR(10)   DEFAULT NULL,
      due_date         VARCHAR(10)   DEFAULT NULL,
      created_by       VARCHAR(128)  NOT NULL,
      created_dt       BIGINT        NOT NULL,
      record_status    VARCHAR(1)    NOT NULL DEFAULT 'A',
      PRIMARY KEY (id),
      KEY idx_exp_card_user (created_by)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_expense_balance (
      id         BIGINT        NOT NULL AUTO_INCREMENT,
      balance    DECIMAL(12,2) NOT NULL DEFAULT '0.00',
      created_by VARCHAR(128)  NOT NULL,
      updated_dt BIGINT        NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_exp_balance_user (created_by)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── Sleep Tracker ──────────────────────────────────────────────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_sleep_log (
      id                      BIGINT       PRIMARY KEY AUTO_INCREMENT,
      date                    VARCHAR(10)  NOT NULL,
      source                  VARCHAR(16)  NOT NULL DEFAULT 'garmin',
      bedtime                 VARCHAR(5)   NULL,
      wake_time               VARCHAR(5)   NULL,
      total_sleep_min         INT          NULL,
      deep_min                INT          NULL,
      light_min               INT          NULL,
      rem_min                 INT          NULL,
      awake_min               INT          NULL,
      deep_pct                TINYINT      NULL,
      light_pct               TINYINT      NULL,
      rem_pct                 TINYINT      NULL,
      resting_hr_bpm          TINYINT      NULL,
      body_battery_change     TINYINT      NULL,
      avg_spo2_pct            TINYINT      NULL,
      lowest_spo2_pct         TINYINT      NULL,
      avg_respiration_brpm    TINYINT      NULL,
      lowest_respiration_brpm TINYINT      NULL,
      notes                   TEXT         NULL,
      created_by              VARCHAR(128) NOT NULL,
      created_dt              BIGINT       NOT NULL,
      record_status           VARCHAR(1)   NOT NULL DEFAULT 'A',
      UNIQUE KEY uq_sleep_date_user (date, created_by)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── Wedding Date Picker ────────────────────────────────────────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_wedding_session (
      id            BIGINT       PRIMARY KEY AUTO_INCREMENT,
      short_code    VARCHAR(16)  NOT NULL,
      title         VARCHAR(255) NOT NULL,
      created_by    VARCHAR(128) NOT NULL,
      created_dt    BIGINT       NOT NULL,
      record_status VARCHAR(1)   NOT NULL DEFAULT 'A',
      UNIQUE KEY uq_wedding_short_code (short_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_wedding_date (
      id               BIGINT       PRIMARY KEY AUTO_INCREMENT,
      session_id       BIGINT       NOT NULL,
      date             VARCHAR(10)  NOT NULL,
      ceremony_type    VARCHAR(64)  NOT NULL,
      auspicious_notes TEXT         NULL,
      status           VARCHAR(16)  NOT NULL DEFAULT 'pending',
      created_by       VARCHAR(128) NOT NULL,
      created_dt       BIGINT       NOT NULL,
      record_status    VARCHAR(1)   NOT NULL DEFAULT 'A',
      CONSTRAINT fk_wd_session FOREIGN KEY (session_id) REFERENCES tb_wedding_session(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_wedding_date_comment (
      id             BIGINT       PRIMARY KEY AUTO_INCREMENT,
      date_id        BIGINT       NOT NULL,
      commenter_name VARCHAR(128) NOT NULL,
      comment        TEXT         NOT NULL,
      created_by     VARCHAR(128) NOT NULL,
      created_dt     BIGINT       NOT NULL,
      record_status  VARCHAR(1)   NOT NULL DEFAULT 'A',
      CONSTRAINT fk_wdc_date FOREIGN KEY (date_id) REFERENCES tb_wedding_date(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── Wedding Planner — Events, Tables, Guests ───────────────────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_wedding_event (
      id            BIGINT       PRIMARY KEY AUTO_INCREMENT,
      title         VARCHAR(255) NOT NULL,
      date          VARCHAR(10)  NOT NULL,
      category      VARCHAR(32)  NOT NULL DEFAULT 'other',
      status        VARCHAR(16)  NOT NULL DEFAULT 'pending',
      notes         TEXT         NULL,
      created_by    VARCHAR(128) NOT NULL,
      created_dt    BIGINT       NOT NULL,
      record_status VARCHAR(1)   NOT NULL DEFAULT 'A'
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_wedding_table (
      id            BIGINT       PRIMARY KEY AUTO_INCREMENT,
      name          VARCHAR(128) NOT NULL,
      capacity      INT          NOT NULL DEFAULT 8,
      created_by    VARCHAR(128) NOT NULL,
      created_dt    BIGINT       NOT NULL,
      record_status VARCHAR(1)   NOT NULL DEFAULT 'A'
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_wedding_guest (
      id            BIGINT       PRIMARY KEY AUTO_INCREMENT,
      name          VARCHAR(128) NOT NULL,
      guest_group   VARCHAR(16)  NOT NULL DEFAULT 'mutual',
      rsvp          VARCHAR(16)  NOT NULL DEFAULT 'pending',
      plus_one      TINYINT(1)   NOT NULL DEFAULT 0,
      dietary_notes TEXT         NULL,
      table_id      BIGINT       NULL,
      seat_number   INT          NULL,
      created_by    VARCHAR(128) NOT NULL,
      created_dt    BIGINT       NOT NULL,
      record_status VARCHAR(1)   NOT NULL DEFAULT 'A'
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── Telegram Media Storage ─────────────────────────────────────────────────
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_telegram_link (
      telegram_user_id  BIGINT        NOT NULL,
      username          VARCHAR(100)  NOT NULL,
      telegram_username VARCHAR(100)  NULL,
      linked_dt         BIGINT        NOT NULL,
      record_status     VARCHAR(1)    NOT NULL DEFAULT 'A',
      PRIMARY KEY (telegram_user_id),
      KEY idx_tg_link_username (username)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_telegram_media (
      id               VARCHAR(10)   NOT NULL,
      telegram_file_id VARCHAR(255)  NOT NULL,
      file_type        ENUM('photo','video','document','audio','voice','animation') NOT NULL,
      file_name        VARCHAR(255)  NULL,
      file_size        INT           NULL,
      owner_username   VARCHAR(100)  NOT NULL,
      telegram_user_id BIGINT        NOT NULL,
      created_dt       BIGINT        NOT NULL,
      expires_dt       BIGINT        NULL,
      record_status    VARCHAR(1)    NOT NULL DEFAULT 'A',
      PRIMARY KEY (id),
      KEY idx_tg_media_owner (owner_username),
      KEY idx_tg_media_created (created_dt)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tb_telegram_link_token (
      token      VARCHAR(10)   NOT NULL,
      username   VARCHAR(100)  NOT NULL,
      created_dt BIGINT        NOT NULL,
      PRIMARY KEY (token),
      KEY idx_tg_token_username (username)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── Feature flag seed data ─────────────────────────────────────────────────
  await knex.raw(`
    INSERT INTO tb_aa_feature_flag
      (feature_key, label, is_enabled, remarks, created_dt, created_by, record_status)
    VALUES
      ('registration',     'User Registration',            1, 'Controls whether new users can register an account',        UNIX_TIMESTAMP() * 1000, 'system', 'A'),
      ('pphs',             'PPHS Module',                  1, 'Controls visibility of the PPHS module on the workbench',   UNIX_TIMESTAMP() * 1000, 'system', 'A'),
      ('travel',           'Travel Module',                1, 'Controls visibility of the Travel module on the workbench', UNIX_TIMESTAMP() * 1000, 'system', 'A'),
      ('flat_analysis',    'Flat Analysis Module',         1, 'Controls visibility of the Flat Analysis module',           UNIX_TIMESTAMP() * 1000, 'system', 'A')
    ON DUPLICATE KEY UPDATE label = VALUES(label)
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Drop in reverse dependency order (children before parents)
  await knex.schema.dropTableIfExists("tb_telegram_link_token");
  await knex.schema.dropTableIfExists("tb_telegram_media");
  await knex.schema.dropTableIfExists("tb_telegram_link");
  await knex.schema.dropTableIfExists("tb_wedding_date_comment");
  await knex.schema.dropTableIfExists("tb_wedding_date");
  await knex.schema.dropTableIfExists("tb_wedding_session");
  await knex.schema.dropTableIfExists("tb_wedding_guest");
  await knex.schema.dropTableIfExists("tb_wedding_table");
  await knex.schema.dropTableIfExists("tb_wedding_event");
  await knex.schema.dropTableIfExists("tb_sleep_log");
  await knex.schema.dropTableIfExists("tb_expense_balance");
  await knex.schema.dropTableIfExists("tb_expense_card");
  await knex.schema.dropTableIfExists("tb_expense_transaction");
  await knex.schema.dropTableIfExists("tb_meal_photo");
  await knex.schema.dropTableIfExists("tb_meal_log");
  await knex.schema.dropTableIfExists("tb_geocode_cache");
  await knex.schema.dropTableIfExists("tb_travel_itinerary_booking");
  await knex.schema.dropTableIfExists("tb_travel_agenda_file");
  await knex.schema.dropTableIfExists("tb_travel_agenda_item");
  await knex.schema.dropTableIfExists("tb_travel_itinerary");
  await knex.schema.dropTableIfExists("tb_analytic_user_activity");
  await knex.schema.dropTableIfExists("tb_lrt_mrt_station");
  await knex.schema.dropTableIfExists("tb_lta_bus_info");
  await knex.schema.dropTableIfExists("tb_lta_busstop");
  await knex.schema.dropTableIfExists("tb_hdb_pphs_coordinate");
  await knex.schema.dropTableIfExists("tb_hdb_pphs");
  await knex.schema.dropTableIfExists("tb_fnd_event_view");
  await knex.schema.dropTableIfExists("tb_fnd_event");
  await knex.schema.dropTableIfExists("tb_fnd_notice_view");
  await knex.schema.dropTableIfExists("tb_fnd_notice");
  await knex.schema.dropTableIfExists("tb_aa_feature_flag");
  await knex.schema.dropTableIfExists("tb_aa_user");
}
