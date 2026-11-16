-- Immutable read results can be looked up after the task/browser has closed.
CREATE TABLE query_evidence (
 id varchar(50) PRIMARY KEY,
 snapshot_id uuid NOT NULL REFERENCES data_snapshot(id),
 tool_name varchar(50) NOT NULL,
 device_id varchar(80) REFERENCES device(id),
 result jsonb NOT NULL,
 created_at timestamptz NOT NULL
);
