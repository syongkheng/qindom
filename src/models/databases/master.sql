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
    role VARCHAR(16) NOT NULL,
    username_system VARCHAR(512) UNIQUE NOT NULL,
    state VARCHAR(16) NOT NULL,
    last_logged_in_dt BIGINT,
    token VARCHAR(512),
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
