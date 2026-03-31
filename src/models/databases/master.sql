-- ══════════════════════════════════════════════════════════════════════════════
-- master.sql  —  wuxi database schema
-- Full reference schema: run on a clean database to recreate all tables.
-- Sections: Auth | FND | HDB | LTA | Analytics | Travel | Geocode | Meal | Expense | Wedding
-- ══════════════════════════════════════════════════════════════════════════════

USE wuxi;

-- ── Auth & Users ──────────────────────────────────────────────────────────────

-- Core user accounts.
-- Roles stored as a JSON array (e.g. '["SYSTEM_R5","KS_R5"]').
-- Email verification flow: verify_code is set on registration, cleared on success.
DROP TABLE IF EXISTS tb_aa_user;
CREATE TABLE IF NOT EXISTS tb_aa_user (
  id                     BIGINT        PRIMARY KEY AUTO_INCREMENT,
  username               VARCHAR(64)   NOT NULL,
  email                  VARCHAR(255)  NULL,
  email_verified         TINYINT(1)    NOT NULL DEFAULT 0,
  verify_code            VARCHAR(64)   NULL,
  verify_code_expires_at BIGINT        NULL,
  verify_attempts        INT           NOT NULL DEFAULT 0,
  password               VARCHAR(512)  NOT NULL,
  `system`               VARCHAR(256)  NOT NULL,
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Feature toggles: control module/feature visibility without a deploy.
DROP TABLE IF EXISTS tb_aa_feature_flag;
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── FND (Notices & Events) ───────────────────────────────────────────────────

DROP TABLE IF EXISTS tb_fnd_notice;
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tracks which users have viewed each notice.
DROP TABLE IF EXISTS tb_fnd_notice_view;
CREATE TABLE IF NOT EXISTS tb_fnd_notice_view (
  id         BIGINT      PRIMARY KEY AUTO_INCREMENT,
  notice_id  BIGINT,
  username   VARCHAR(64),
  created_dt BIGINT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS tb_fnd_event;
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tracks which users have viewed each event.
DROP TABLE IF EXISTS tb_fnd_event_view;
CREATE TABLE IF NOT EXISTS tb_fnd_event_view (
  id         BIGINT      PRIMARY KEY AUTO_INCREMENT,
  event_id   BIGINT,
  username   VARCHAR(64),
  created_dt BIGINT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── HDB (Housing) ────────────────────────────────────────────────────────────

-- PPHS batch data stored as raw JSON blobs; one row per batch upload.
DROP TABLE IF EXISTS tb_hdb_pphs;
CREATE TABLE IF NOT EXISTS tb_hdb_pphs (
  id          BIGINT       PRIMARY KEY AUTO_INCREMENT,
  batch       VARCHAR(6)   UNIQUE NOT NULL,
  json_string LONGTEXT     NOT NULL,
  created_dt  BIGINT       NOT NULL,
  created_by  VARCHAR(64)  NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Geocoded coordinates for PPHS building names.
DROP TABLE IF EXISTS tb_hdb_pphs_coordinate;
CREATE TABLE IF NOT EXISTS tb_hdb_pphs_coordinate (
  id          BIGINT        PRIMARY KEY AUTO_INCREMENT,
  building    VARCHAR(1024),
  formed_url  VARCHAR(1024),
  lat         VARCHAR(16),
  lng         VARCHAR(16),
  created_dt  BIGINT        NOT NULL,
  created_by  VARCHAR(64)   NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── LTA (Transport) ──────────────────────────────────────────────────────────

-- LTA bus stop master list (seeded from LTA DataMall).
DROP TABLE IF EXISTS tb_lta_busstop;
CREATE TABLE IF NOT EXISTS tb_lta_busstop (
  id           BIGINT       PRIMARY KEY AUTO_INCREMENT,
  busstop_code VARCHAR(8),
  road_name    VARCHAR(128),
  `desc`       VARCHAR(512),
  lat          VARCHAR(32),
  lng          VARCHAR(32),
  created_dt   BIGINT       NOT NULL,
  created_by   VARCHAR(64)  NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- LTA bus service schedule per stop (seeded from LTA DataMall).
DROP TABLE IF EXISTS tb_lta_bus_info;
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- MRT/LRT station exit coordinates (seeded from LTA DataMall).
DROP TABLE IF EXISTS tb_lrt_mrt_station;
CREATE TABLE IF NOT EXISTS tb_lrt_mrt_station (
  id         BIGINT       PRIMARY KEY AUTO_INCREMENT,
  station    VARCHAR(128),
  `exit`     VARCHAR(16),
  lat        VARCHAR(32),
  lng        VARCHAR(32),
  `type`     VARCHAR(8),
  created_dt BIGINT       NOT NULL,
  created_by VARCHAR(64)  NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Analytics ────────────────────────────────────────────────────────────────

-- Heartbeat / session activity — keyed by session_id, upserted on each ping.
DROP TABLE IF EXISTS tb_analytic_user_activity;
CREATE TABLE IF NOT EXISTS tb_analytic_user_activity (
  session_id   VARCHAR(64) PRIMARY KEY,
  user_id      VARCHAR(64) NULL,
  last_seen_at BIGINT      NOT NULL,
  ip_address   VARCHAR(45),
  user_agent   TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Travel Itinerary ─────────────────────────────────────────────────────────

-- Top-level trip plan. short_code is used for public share links.
-- challenge is a 6-char PIN for owner verification on shared plans.
-- pax_names stores passenger names as a JSON array.
DROP TABLE IF EXISTS tb_travel_itinerary;
CREATE TABLE IF NOT EXISTS tb_travel_itinerary (
  id                 BIGINT        PRIMARY KEY AUTO_INCREMENT,
  session_id         VARCHAR(64)   UNIQUE NOT NULL,
  short_code         VARCHAR(16)   UNIQUE NOT NULL,
  idempotency_key    VARCHAR(64)   UNIQUE,
  session_title      VARCHAR(512)  NOT NULL,
  destination        VARCHAR(512),
  destination_raw    LONGTEXT,                    -- JSON-encoded string[]
  country            VARCHAR(256),
  number_of_pax      INT           DEFAULT 1,
  pax_names          LONGTEXT,                    -- JSON-encoded string[]
  itinerary_date_raw LONGTEXT,                    -- JSON-encoded string[]
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Individual agenda items within a trip. category groups items (e.g. flight, hotel).
-- coordinates_lat/lng store geocoded pin location for map display.
DROP TABLE IF EXISTS tb_travel_agenda_item;
CREATE TABLE IF NOT EXISTS tb_travel_agenda_item (
  id                BIGINT        PRIMARY KEY AUTO_INCREMENT,
  itinerary_id      BIGINT        NOT NULL,
  category          VARCHAR(32)   NULL,
  title             VARCHAR(512)  NOT NULL,
  `desc`            LONGTEXT,
  city              VARCHAR(512),
  city_raw          LONGTEXT,                     -- JSON-encoded string[]
  start_time        BIGINT,
  end_time          BIGINT,
  duration_in_hours DECIMAL(6,2),
  unknown_time      TINYINT(1)    DEFAULT 0,
  budget            DECIMAL(12,2),
  day               BIGINT,
  `date`            VARCHAR(32),
  coordinates_lat   DECIMAL(11,8) NULL,
  coordinates_lng   DECIMAL(11,8) NULL,
  created_dt        BIGINT        NOT NULL,
  record_status     VARCHAR(1)    NOT NULL DEFAULT 'A',
  INDEX idx_itinerary_id (itinerary_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- File attachments (images, PDFs, etc.) linked to agenda items.
DROP TABLE IF EXISTS tb_travel_agenda_file;
CREATE TABLE IF NOT EXISTS tb_travel_agenda_file (
  id             BIGINT       PRIMARY KEY AUTO_INCREMENT,
  uuid           VARCHAR(64)  UNIQUE NOT NULL,
  agenda_item_id BIGINT       NOT NULL,
  name           VARCHAR(512),
  mime_type      VARCHAR(128),
  size_in_bytes  BIGINT,
  `blob`         LONGBLOB,
  created_dt     BIGINT       NOT NULL,
  record_status  VARCHAR(1)   NOT NULL DEFAULT 'A',
  INDEX idx_agenda_item_id (agenda_item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Bookings (flights, hotels, etc.) associated with a trip.
-- pax_breakdown stores per-passenger pricing as JSON.
DROP TABLE IF EXISTS tb_travel_itinerary_booking;
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Geocode Cache ────────────────────────────────────────────────────────────

-- Caches geocoding API results to avoid repeat lookups for the same query.
DROP TABLE IF EXISTS tb_geocode_cache;
CREATE TABLE IF NOT EXISTS tb_geocode_cache (
  id           BIGINT        PRIMARY KEY AUTO_INCREMENT,
  query        VARCHAR(512)  NOT NULL,
  results_json LONGTEXT      NOT NULL,
  created_dt   BIGINT        NOT NULL,
  INDEX idx_geocode_query (query(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Meal Prep ────────────────────────────────────────────────────────────────

-- Daily meal log entries (breakfast / lunch / dinner).
DROP TABLE IF EXISTS tb_meal_log;
CREATE TABLE IF NOT EXISTS tb_meal_log (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  log_date     VARCHAR(10)  NOT NULL,
  meal_type    VARCHAR(16)  NOT NULL,
  planned_name VARCHAR(256) NOT NULL,
  notes        TEXT,
  created_by   VARCHAR(128) NOT NULL,
  created_dt   BIGINT       NOT NULL,
  record_status VARCHAR(1)  NOT NULL DEFAULT 'A',
  PRIMARY KEY (id),
  KEY idx_meal_log_created_by (created_by),
  KEY idx_meal_log_date (log_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Photo attachments for meal log entries.
DROP TABLE IF EXISTS tb_meal_photo;
CREATE TABLE IF NOT EXISTS tb_meal_photo (
  id            BIGINT       NOT NULL AUTO_INCREMENT,
  uuid          VARCHAR(64)  NOT NULL,
  meal_log_id   BIGINT       NOT NULL,
  name          VARCHAR(256),
  mime_type     VARCHAR(128),
  size_in_bytes BIGINT,
  `blob`        LONGBLOB,
  created_dt    BIGINT       NOT NULL,
  record_status VARCHAR(1)   NOT NULL DEFAULT 'A',
  PRIMARY KEY (id),
  UNIQUE KEY uq_meal_photo_uuid (uuid),
  KEY idx_meal_photo_log_id (meal_log_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Expense Tracker ──────────────────────────────────────────────────────────

-- Individual transactions. type = 'expense' | 'earning'.
-- card_id optionally links to a credit card (NULL = cash/debit).
DROP TABLE IF EXISTS tb_expense_transaction;
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Credit card definitions: billing cycle end day and payment due day (1–28).
DROP TABLE IF EXISTS tb_expense_card;
CREATE TABLE IF NOT EXISTS tb_expense_card (
  id            BIGINT        NOT NULL AUTO_INCREMENT,
  name          VARCHAR(128)  NOT NULL,
  cycle_end_day INT           NOT NULL,
  due_day       INT           NOT NULL,
  color         VARCHAR(16)   NOT NULL,
  created_by    VARCHAR(128)  NOT NULL,
  created_dt    BIGINT        NOT NULL,
  record_status VARCHAR(1)    NOT NULL DEFAULT 'A',
  PRIMARY KEY (id),
  KEY idx_exp_card_user (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- One row per user; upserted on balance update. UNIQUE on created_by enforces this.
DROP TABLE IF EXISTS tb_expense_balance;
CREATE TABLE IF NOT EXISTS tb_expense_balance (
  id         BIGINT        NOT NULL AUTO_INCREMENT,
  balance    DECIMAL(12,2) NOT NULL DEFAULT '0.00',
  created_by VARCHAR(128)  NOT NULL,
  updated_dt BIGINT        NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_exp_balance_user (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Migrations & Seed Data ───────────────────────────────────────────────────
-- Run these once against an existing database (not needed on a clean install
-- where the CREATE TABLE statements above already reflect the final schema).

-- Roles: migrate legacy single-value role column to JSON array format.
-- UPDATE tb_aa_user SET roles = '[]'                          WHERE roles IN ('R1', 'R2', 'R3');
-- UPDATE tb_aa_user SET roles = '["PPHS_R4","KS_R4"]'        WHERE roles = 'R4';
-- UPDATE tb_aa_user SET roles = '["SYSTEM_R5","PPHS_R5","KS_R5"]' WHERE roles = 'R5';

-- Email verification: mark all pre-existing users as verified so they are not locked out.
-- UPDATE tb_aa_user SET email_verified = 1 WHERE email_verified = 0;

-- Feature flags: initial seed rows.
INSERT INTO tb_aa_feature_flag
  (feature_key, label, is_enabled, remarks, created_dt, created_by, record_status)
VALUES
  ('registration',     'User Registration',            1, 'Controls whether new users can register an account',        UNIX_TIMESTAMP() * 1000, 'system', 'A'),
  ('kop_registration', 'KoP Appointment Registration', 0, 'Controls whether the KoP booking form accepts submissions',  UNIX_TIMESTAMP() * 1000, 'system', 'A'),
  ('pphs',             'PPHS Module',                  1, 'Controls visibility of the PPHS module on the workbench',   UNIX_TIMESTAMP() * 1000, 'system', 'A'),
  ('travel',           'Travel Module',                1, 'Controls visibility of the Travel module on the workbench', UNIX_TIMESTAMP() * 1000, 'system', 'A'),
  ('flat_analysis',    'Flat Analysis Module',         1, 'Controls visibility of the Flat Analysis module',           UNIX_TIMESTAMP() * 1000, 'system', 'A')
ON DUPLICATE KEY UPDATE label = VALUES(label);

-- ── Sleep Tracker ─────────────────────────────────────────────────────────────
-- Nightly sleep logs from Garmin watch or phone app.
-- All stage/SpO2/HR fields nullable — availability depends on device & night.

DROP TABLE IF EXISTS tb_sleep_log;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Wedding Date Picker ────────────────────────────────────────────────────────
-- Chinese wedding date planning: sessions shareable via short code, proposed
-- dates with ceremony type + auspicious notes, guest comments on each date.

DROP TABLE IF EXISTS tb_wedding_date_comment;
DROP TABLE IF EXISTS tb_wedding_date;
DROP TABLE IF EXISTS tb_wedding_session;

CREATE TABLE IF NOT EXISTS tb_wedding_session (
  id            BIGINT       PRIMARY KEY AUTO_INCREMENT,
  short_code    VARCHAR(16)  NOT NULL,
  title         VARCHAR(255) NOT NULL,
  created_by    VARCHAR(128) NOT NULL,
  created_dt    BIGINT       NOT NULL,
  record_status VARCHAR(1)   NOT NULL DEFAULT 'A',
  UNIQUE KEY uq_wedding_short_code (short_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tb_wedding_date_comment (
  id             BIGINT       PRIMARY KEY AUTO_INCREMENT,
  date_id        BIGINT       NOT NULL,
  commenter_name VARCHAR(128) NOT NULL,
  comment        TEXT         NOT NULL,
  created_by     VARCHAR(128) NOT NULL,
  created_dt     BIGINT       NOT NULL,
  record_status  VARCHAR(1)   NOT NULL DEFAULT 'A',
  CONSTRAINT fk_wdc_date FOREIGN KEY (date_id) REFERENCES tb_wedding_date(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Wedding Planner — Events, Tables, Guests ──────────────────────────────────

DROP TABLE IF EXISTS tb_wedding_guest;
DROP TABLE IF EXISTS tb_wedding_table;
DROP TABLE IF EXISTS tb_wedding_event;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tb_wedding_table (
  id            BIGINT       PRIMARY KEY AUTO_INCREMENT,
  name          VARCHAR(128) NOT NULL,
  capacity      INT          NOT NULL DEFAULT 8,
  created_by    VARCHAR(128) NOT NULL,
  created_dt    BIGINT       NOT NULL,
  record_status VARCHAR(1)   NOT NULL DEFAULT 'A'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
