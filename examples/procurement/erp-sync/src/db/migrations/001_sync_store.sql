CREATE TABLE IF NOT EXISTS sync_ledger (
  idempotency_key text PRIMARY KEY,
  entity_type     text NOT NULL,
  entity_id       text NOT NULL,
  payload_hash    char(64) NOT NULL,
  status          text NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'dead')),
  attempts        int NOT NULL DEFAULT 0,
  external_id     text,
  last_error      text,
  next_attempt_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sync_ledger_dead ON sync_ledger (updated_at) WHERE status = 'dead';

CREATE TABLE IF NOT EXISTS sync_cursors (
  name       text PRIMARY KEY,
  cursor     timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id          bigserial PRIMARY KEY,
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  report      jsonb
);
