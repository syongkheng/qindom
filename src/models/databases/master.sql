USE wuxi;

DROP TABLE IF EXISTS wuxi.tb_hdb_pphs;

CREATE TABLE wuxi.tb_hdb_pphs (
	id BIGINT PRIMARY KEY AUTO_INCREMENT,
    batch VARCHAR(6) UNIQUE NOT NULL,
    json_string LONGTEXT NOT NULL,
    created_dt BIGINT NOT NULL,
    created_by VARCHAR(64) NOT NULL
);

SELECT * FROM wuxi.tb_hdb_pphs;

DROP TABLE IF EXISTS wuxi.tb_hdb_pphs_coordinate;

CREATE TABLE wuxi.tb_hdb_pphs_coordinate (
	id BIGINT PRIMARY KEY AUTO_INCREMENT,
	building VARCHAR(1024),
    formed_url VARCHAR(1024),
    lat VARCHAR(16),
    lng VARCHAR(16),
	created_dt BIGINT NOT NULL,
    created_by VARCHAR(64) NOT NULL
);

SELECT * FROM wuxi.tb_hdb_pphs_coordinate;

DROP TABLE IF EXISTS wuxi.tb_aa_user;

CREATE TABLE wuxi.tb_aa_user (
	id BIGINT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(64) NOT NULL,
    password VARCHAR(512) NOT NULL,
	`system` VARCHAR(256) NOT NULL,
    country VARCHAR(256),
    role VARCHAR(16) NOT NULL,
    username_system VARCHAR(512) UNIQUE NOT NULL,
    state VARCHAR(16) NOT NULL,
    last_logged_in_dt BIGINT,
    token VARCHAR(512),
    pfp_picture_blob LONGBLOB,
	created_dt BIGINT NOT NULL,
    created_by VARCHAR(64) NOT NULL,
    record_status VARCHAR(1) NOT NULL
);

select * from wuxi.tb_aa_user;

DROP TABLE IF EXISTS wuxi.tb_fnd_notice;

CREATE TABLE wuxi.tb_fnd_notice (
	id BIGINT PRIMARY KEY AUTO_INCREMENT,
    type VARCHAR(16),
    title VARCHAR(512),
    content VARCHAR(8192),
    classification VARCHAR(16),
    updated_by VARCHAR(64),
    updated_dt BIGINT,
    created_by VARCHAR(64),
    created_dt BIGINT,
    record_status VARCHAR(1)
);

SELECT * FROM wuxi.tb_fnd_notice;


DROP TABLE IF EXISTS wuxi.tb_fnd_notice_view;
CREATE TABLE wuxi.tb_fnd_notice_view (
	id BIGINT PRIMARY KEY AUTO_INCREMENT,
    notice_id BIGINT,
    username VARCHAR(64),
    created_dt BIGINT
);

SELECT * FROM wuxi.tb_fnd_notice_view;


DROP TABLE IF EXISTS wuxi.tb_fnd_event;

CREATE TABLE wuxi.tb_fnd_event (
	id BIGINT PRIMARY KEY AUTO_INCREMENT,
    event_dt BIGINT,
    title VARCHAR(512),
    content VARCHAR(8192),
    updated_by VARCHAR(64),
    updated_dt BIGINT,
    created_by VARCHAR(64),
    created_dt BIGINT,
    record_status VARCHAR(1)
);

SELECT * FROM wuxi.tb_fnd_event;
SELECT * from wuxi.tb_fnd_event where record_status = 'A' and event_dt >= 1761060196104 order by created_dt desc;

DROP TABLE IF EXISTS wuxi.tb_fnd_event_view;

CREATE TABLE wuxi.tb_fnd_event_view (
	id BIGINT PRIMARY KEY AUTO_INCREMENT,
    event_id BIGINT,
    username VARCHAR(64),
    created_dt BIGINT
);

SELECT * FROM wuxi.tb_fnd_event_view;


DROP TABLE IF EXISTS wuxi.tb_lta_busstop;

CREATE TABLE wuxi.tb_lta_busstop (
	id BIGINT PRIMARY KEY AUTO_INCREMENT,
    busstop_code VARCHAR(8),
    road_name VARCHAR (128),
    `desc` VARCHAR(512),
    lat VARCHAR(32),
    lng VARCHAR(32),
	created_dt BIGINT NOT NULL,
    created_by VARCHAR(64) NOT NULL
);

SELECT * FROM wuxi.tb_lta_busstop WHERE busstop_code = '76241';

SELECT *
FROM wuxi.tb_lta_busstop b
WHERE ST_Distance_Sphere(
    point(b.lng, b.lat),
    point(103.8802579, 1.3849414)
) <= 200;

SELECT VERSION();

SELECT
    COUNT(*)
FROM tb_lta_busstop b
WHERE ST_Distance_Sphere(POINT(b.lng, b.lat), POINT(103.8499767, 1.4284349)) <= 2000;


DROP TABLE IF EXISTS wuxi.tb_lta_bus_info;

CREATE TABLE wuxi.tb_lta_bus_info (
	id BIGINT PRIMARY KEY AUTO_INCREMENT,
    service_no VARCHAR(16),
    operator VARCHAR (128),
    direction VARCHAR(8),
    stop_sequence VARCHAR(32),
    busstop_code VARCHAR(32),
    distance VARCHAR(8),
    wd_first_bus VARCHAR(4),
    wd_last_bus VARCHAR(4),
    sat_first_bus VARCHAR(4),
    sat_last_bus VARCHAR(4),
    sun_first_bus VARCHAR(4),
    sun_last_bus VARCHAR(4),
	created_dt BIGINT NOT NULL,
    created_by VARCHAR(64) NOT NULL,
    INDEX idx_busstop_code (busstop_code)
);

SELECT * FROM wuxi.tb_lta_bus_info;

SELECT DISTINCT service_no
FROM tb_lta_bus_info
WHERE busstop_code = '58521'
ORDER BY
  CAST(service_no AS UNSIGNED),   
  service_no;  
  
  
DROP TABLE IF EXISTS wuxi.tb_lrt_mrt_station;
CREATE TABLE wuxi.tb_lrt_mrt_station(
	id BIGINT PRIMARY KEY AUTO_INCREMENT,
	station VARCHAR(128),
	`exit` VARCHAR (16),
	lat VARCHAR(32),
	lng VARCHAR(32),
    `type` VARCHAR(8),
	created_dt BIGINT NOT NULL,
	created_by VARCHAR(64) NOT NULL
);
SELECT * FROM wuxi.tb_lrt_mrt_station;

SELECT 
    e.station,
    e.type,
    MIN(ST_Distance_Sphere(POINT(e.lat, e.lng), POINT(103.833021, 1.2861643))) AS distance_m
FROM tb_lrt_mrt_station e
GROUP BY e.station, e.type
ORDER BY distance_m ASC
LIMIT 3;

CREATE TABLE tb_analytic_user_activity (
  session_id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NULL,
  last_seen_at BIGINT NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT
);

SELECT * FROM tb_analytic_user_activity;

-- ── Travel Itinerary ──────────────────────────────────────────────────────────

DROP TABLE IF EXISTS wuxi.tb_travel_itinerary;

CREATE TABLE IF NOT EXISTS wuxi.tb_travel_itinerary (
  id               BIGINT PRIMARY KEY AUTO_INCREMENT,
  session_id       VARCHAR(64)  UNIQUE NOT NULL,
  short_code       VARCHAR(16)  UNIQUE NOT NULL,
  idempotency_key  VARCHAR(64)  UNIQUE,
  session_title    VARCHAR(512) NOT NULL,
  destination      VARCHAR(512),
  destination_raw  LONGTEXT,                      -- JSON-encoded string[]
  country          VARCHAR(256),
  number_of_pax    INT          DEFAULT 1,
  itinerary_date_raw LONGTEXT,                    -- JSON-encoded string[]
  start_date       BIGINT,
  end_date         BIGINT,
  unknown_date     TINYINT(1)   DEFAULT 0,
  duration_in_days INT          DEFAULT 1,
  created_dt       BIGINT       NOT NULL,
  created_by       VARCHAR(64)  NOT NULL,
  record_status    VARCHAR(1)   NOT NULL DEFAULT 'A',
  INDEX idx_session_id (session_id),
  INDEX idx_short_code (short_code)
);

DROP TABLE IF EXISTS wuxi.tb_travel_agenda_item;

CREATE TABLE IF NOT EXISTS wuxi.tb_travel_agenda_item (
  id               BIGINT PRIMARY KEY AUTO_INCREMENT,
  itinerary_id     BIGINT       NOT NULL,
  title            VARCHAR(512) NOT NULL,
  `desc`           LONGTEXT,
  city             VARCHAR(512),
  city_raw         LONGTEXT,                      -- JSON-encoded string[]
  start_time       BIGINT,
  end_time         BIGINT,
  duration_in_hours DECIMAL(6,2),
  unknown_time     TINYINT(1)   DEFAULT 0,
  budget           DECIMAL(12,2),
  day              BIGINT,
  `date`           VARCHAR(32),
  created_dt       BIGINT       NOT NULL,
  record_status    VARCHAR(1)   NOT NULL DEFAULT 'A',
  INDEX idx_itinerary_id (itinerary_id)
);
-- 0 row(s) affected, 1 warning(s): 1681 Integer display width is deprecated and will be removed in a future release.

-- 0 row(s) affected, 2 warning(s): 1681 Integer display width is deprecated and will be removed in a future release. 1050 Table 'tb_travel_agenda_item' already exists


DROP TABLE IF EXISTS wuxi.tb_travel_agenda_file;

CREATE TABLE IF NOT EXISTS wuxi.tb_travel_agenda_file (
  id               BIGINT PRIMARY KEY AUTO_INCREMENT,
  uuid             VARCHAR(64)  UNIQUE NOT NULL,
  agenda_item_id   BIGINT       NOT NULL,
  name             VARCHAR(512),
  mime_type        VARCHAR(128),
  size_in_bytes    BIGINT,
  `blob`             LONGBLOB,
  created_dt       BIGINT       NOT NULL,
  record_status    VARCHAR(1)   NOT NULL DEFAULT 'A',
  INDEX idx_agenda_item_id (agenda_item_id)
);



  ALTER TABLE tb_travel_agenda_item
    ADD COLUMN category VARCHAR(32) NULL AFTER itinerary_id;
    
    ALTER TABLE tb_travel_itinerary ADD COLUMN challenge VARCHAR(6) NULL;

CREATE TABLE IF NOT EXISTS tb_travel_itinerary_view (
  id         BIGINT       AUTO_INCREMENT PRIMARY KEY,
  short_code VARCHAR(16)  NOT NULL,
  ip_address VARCHAR(64),
  user_agent TEXT,
  viewed_at  BIGINT       NOT NULL,
  INDEX idx_itinerary_view_short_code (short_code)
);
    
ALTER TABLE tb_aa_user CHANGE COLUMN role roles VARCHAR(1000) NOT NULL DEFAULT '[]';

UPDATE tb_aa_user SET roles = '[]' WHERE roles IN ('R1', 'R2', 'R3');
UPDATE tb_aa_user SET roles = '["PPHS_R4","KS_R4"]' WHERE roles = 'R4';
UPDATE tb_aa_user SET roles = '["SYSTEM_R5","PPHS_R5","KS_R5"]' WHERE roles = 'R5';

-- Email verification columns (run once on existing DB)
ALTER TABLE tb_aa_user
    ADD COLUMN email VARCHAR(255) NULL AFTER username,
    ADD COLUMN email_verified TINYINT(1) NOT NULL DEFAULT 0 AFTER email,
    ADD COLUMN verify_code VARCHAR(64) NULL AFTER email_verified,
    ADD COLUMN verify_code_expires_at BIGINT NULL AFTER verify_code,
    ADD COLUMN verify_attempts INT NOT NULL DEFAULT 0 AFTER verify_code_expires_at;

-- Mark existing users as verified so they are not locked out
UPDATE tb_aa_user SET email_verified = 1 WHERE email_verified = 0;

-- ── Trip Bookings ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wuxi.tb_travel_itinerary_booking (
  id                BIGINT PRIMARY KEY AUTO_INCREMENT,
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
);

ALTER TABLE wuxi.tb_travel_itinerary ADD COLUMN pax_names LONGTEXT NULL;