-- Freeze ledger/metric/rule metadata together with each new query revision.
ALTER TABLE data_snapshot ADD COLUMN context jsonb NOT NULL DEFAULT '{}';
