CREATE TABLE audit_events (
  id          bigserial PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id   text NOT NULL,
  action      text NOT NULL,
  from_state  text,
  to_state    text,
  actor_id    text NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_entity ON audit_events (entity_type, entity_id, id);

CREATE FUNCTION audit_events_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only (% rejected)', TG_OP;
END
$$;

CREATE TRIGGER audit_events_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_append_only();

CREATE TRIGGER audit_events_no_truncate
  BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION audit_events_append_only();

CREATE TABLE outbox (
  id         bigserial PRIMARY KEY,
  event_id   uuid NOT NULL UNIQUE,
  event_type text NOT NULL,
  group_id   text NOT NULL,
  body       jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at    timestamptz,
  attempts   int NOT NULL DEFAULT 0,
  last_error text
);
CREATE INDEX outbox_unsent ON outbox (id) WHERE sent_at IS NULL;
