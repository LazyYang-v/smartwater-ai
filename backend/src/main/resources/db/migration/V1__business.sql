CREATE TABLE app_user (username varchar(40) PRIMARY KEY, password_hash varchar(100) NOT NULL, role varchar(20) NOT NULL CHECK(role IN ('ADMIN','OPERATOR','VIEWER')), enabled boolean NOT NULL DEFAULT true);
CREATE TABLE device (id varchar(80) PRIMARY KEY, unit_id varchar(80) NOT NULL, name varchar(100) NOT NULL, description text NOT NULL, asset_root_node varchar(100) NOT NULL, mechanical_node varchar(100) NOT NULL);
CREATE TABLE metric_definition (device_id varchar(80) REFERENCES device(id), key varchar(40), label varchar(80) NOT NULL, unit varchar(30) NOT NULL, minimum double precision NOT NULL, maximum double precision NOT NULL, cadence_ms int NOT NULL, stale_seconds int NOT NULL, PRIMARY KEY(device_id,key));
INSERT INTO device VALUES
('SW_BIO_AERATION_001','SW_UNIT_BIO_001','一号曝气池','半埋地曝气池演示资产；业务数据独立采集入库，演示尺寸未经工程校核。','SW_BIO_AERATION_001','SW_BIO_AERATION_001'),
('SW_CLR_TANK_001','SW_UNIT_CLR_001','一号二沉池','已有三维模型，尚未定义运行指标，不能判断运行状态。','SW_CLR_TANK_001','SW_CLR_TANK_001'),
('SW_AIR_BLOWER_001','SW_UNIT_BLOWER_ROOM_001','一号鼓风机 B-01','关联鼓风机功率，不是全厂能耗或电量。','SW_BLOWER_UNIT','SW_AIR_BLOWER_001'),
('SW_PRE_PUMP_001','SW_UNIT_PUMP_ROOM_001','一号提升泵','已有三维模型，尚未定义流量、压力或效率指标。','SW_PUMP_UNIT','SW_PRE_PUMP_001');
INSERT INTO metric_definition VALUES
('SW_BIO_AERATION_001','do','溶解氧','mg/L',0,30,60000,120),
('SW_BIO_AERATION_001','ph','pH','无量纲',0,14,60000,120),
('SW_BIO_AERATION_001','depth','水深','m',4.8,4.8,60000,120),
('SW_AIR_BLOWER_001','blower_power','关联鼓风机功率','kW',0,300,60000,120);
CREATE TABLE alarm_rule (id varchar(50) PRIMARY KEY, device_id varchar(80), metric_key varchar(40), version varchar(40) NOT NULL, threshold double precision NOT NULL, label text NOT NULL, FOREIGN KEY(device_id,metric_key) REFERENCES metric_definition(device_id,key));
INSERT INTO alarm_rule VALUES ('DEMO_DO_LOW','SW_BIO_AERATION_001','do','demo-do-v1',2,'DO < 2.0 mg/L · 演示阈值');
CREATE TABLE dataset_state (id int PRIMARY KEY CHECK(id=1), revision bigint NOT NULL, scenario varchar(30) NOT NULL);
INSERT INTO dataset_state VALUES(1,0,'NORMAL');
CREATE TABLE ingestion (id uuid PRIMARY KEY, actor varchar(80) NOT NULL, idempotency_key varchar(100) NOT NULL, payload_hash varchar(64) NOT NULL, revision bigint NOT NULL, response jsonb NOT NULL, received_at timestamptz NOT NULL, UNIQUE(actor,idempotency_key));
CREATE TABLE telemetry (id uuid PRIMARY KEY, sample_id varchar(120) UNIQUE NOT NULL, device_id varchar(80) NOT NULL, metric_key varchar(40) NOT NULL, value double precision, unit varchar(30) NOT NULL, quality varchar(10) NOT NULL CHECK(quality IN ('GOOD','MISSING','STALE')), source varchar(20) NOT NULL CHECK(source='SIMULATED'), observed_at timestamptz NOT NULL, received_at timestamptz NOT NULL, revision bigint NOT NULL, FOREIGN KEY(device_id,metric_key) REFERENCES metric_definition(device_id,key), UNIQUE(device_id,metric_key,source,observed_at), CHECK((quality='MISSING' AND value IS NULL) OR (quality IN ('GOOD','STALE') AND value IS NOT NULL AND value NOT IN ('NaN'::float8,'Infinity'::float8,'-Infinity'::float8))));
CREATE INDEX telemetry_window ON telemetry(device_id,metric_key,observed_at DESC,revision);
CREATE TABLE metric_state (device_id varchar(80),metric_key varchar(40),observed_at timestamptz NOT NULL,telemetry_id uuid NOT NULL REFERENCES telemetry(id),PRIMARY KEY(device_id,metric_key));
CREATE TABLE alarm (id uuid PRIMARY KEY, device_id varchar(80) NOT NULL, metric_key varchar(40) NOT NULL, rule_id varchar(50) NOT NULL REFERENCES alarm_rule(id), rule_version varchar(40) NOT NULL, rule_label text NOT NULL, threshold double precision NOT NULL, state varchar(12) NOT NULL CHECK(state IN ('ACTIVE','RECOVERED','CLOSED')), occurred_at timestamptz NOT NULL, recovered_at timestamptz, acknowledged_at timestamptz, acknowledged_by varchar(40), closed_at timestamptz, closed_by varchar(40), trigger_value double precision NOT NULL, trigger_reading_id uuid NOT NULL REFERENCES telemetry(id), last_reading_id uuid NOT NULL REFERENCES telemetry(id), quality varchar(10) NOT NULL, occurrence_count int NOT NULL, source varchar(20) NOT NULL CHECK(source='SIMULATED'));
CREATE UNIQUE INDEX one_active_alarm ON alarm(device_id,rule_id) WHERE state='ACTIVE';
CREATE TABLE alarm_event (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, alarm_id uuid NOT NULL REFERENCES alarm(id), revision bigint NOT NULL, event_type varchar(30) NOT NULL, payload jsonb NOT NULL, recorded_at timestamptz NOT NULL);
CREATE INDEX alarm_version ON alarm_event(alarm_id,revision DESC,id DESC);
CREATE TABLE data_snapshot (id uuid PRIMARY KEY, revision bigint NOT NULL, as_of timestamptz NOT NULL, scenario varchar(30) NOT NULL, created_by varchar(80) NOT NULL, created_at timestamptz NOT NULL);
CREATE TABLE command_receipt (actor varchar(80), idempotency_key varchar(100), payload_hash varchar(64) NOT NULL,response jsonb NOT NULL,PRIMARY KEY(actor,idempotency_key));
CREATE TABLE audit_event (id uuid PRIMARY KEY, actor varchar(80) NOT NULL, action varchar(50) NOT NULL, entity_id varchar(120) NOT NULL, detail jsonb NOT NULL, occurred_at timestamptz NOT NULL);
