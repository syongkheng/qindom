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
WHERE busstop_code = '76241'
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
SELECT * FROM wuxi.tb_mrt_station;

SELECT 
    e.station,
    MIN(ST_Distance_Sphere(POINT(e.lat, e.lng), POINT(103.833021, 1.2861643))) AS distance_m
FROM tb_mrt_station e
GROUP BY e.station
ORDER BY distance_m ASC
LIMIT 3;
