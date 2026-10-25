CREATE TABLE approval_rules (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  category_code    text,
  min_amount_cents bigint NOT NULL DEFAULT 0,
  max_amount_cents bigint,
  approver_role    text NOT NULL CHECK (approver_role IN
                   ('manager', 'cost_center_owner', 'department_head', 'finance_controller', 'it_security', 'legal', 'cfo')),
  step_order       int NOT NULL,
  active           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (max_amount_cents IS NULL OR max_amount_cents > min_amount_cents)
);

CREATE TABLE approver_assignments (
  approver_role  text NOT NULL,
  cost_center_id uuid REFERENCES cost_centers(id),
  user_id        uuid NOT NULL REFERENCES users(id),
  UNIQUE (approver_role, cost_center_id)
);

CREATE TABLE approval_steps (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id uuid NOT NULL REFERENCES requisitions(id),
  step_order     int NOT NULL,
  approver_role  text NOT NULL,
  approver_id    uuid NOT NULL REFERENCES users(id),
  rule_id        uuid REFERENCES approval_rules(id),
  status         text NOT NULL CHECK (status IN ('waiting', 'pending', 'approved', 'rejected', 'cancelled')),
  due_at         timestamptz,
  decided_at     timestamptz,
  decided_by     uuid REFERENCES users(id),
  comment        text,
  escalated_at   timestamptz,
  UNIQUE (requisition_id, step_order)
);
CREATE INDEX approval_steps_inbox ON approval_steps (approver_id) WHERE status = 'pending';
CREATE INDEX approval_steps_due ON approval_steps (due_at) WHERE status = 'pending' AND escalated_at IS NULL;

CREATE TABLE approval_delegations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delegator_id uuid NOT NULL REFERENCES users(id),
  delegate_id  uuid NOT NULL REFERENCES users(id),
  starts_at    timestamptz NOT NULL,
  ends_at      timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  CHECK (delegator_id <> delegate_id)
);
CREATE INDEX approval_delegations_delegate ON approval_delegations (delegate_id, starts_at, ends_at);

-- Initial policy, approved by finance. Change rules with a migration, never in code (see ADR 0002).
INSERT INTO approval_rules (name, category_code, min_amount_cents, approver_role, step_order) VALUES
  ('Line manager signs off every request',          NULL,                    0,        'manager',            10),
  ('Cost center owner above $5,000',                NULL,                    500000,   'cost_center_owner',  20),
  ('IT security reviews software',                  'software',              0,        'it_security',        25),
  ('IT security reviews cloud services',            'cloud-services',        0,        'it_security',        25),
  ('Department head above $25,000',                 NULL,                    2500000,  'department_head',    30),
  ('Legal reviews professional services over $10k', 'professional-services', 1000000,  'legal',              35),
  ('Finance controller above $100,000',             NULL,                    10000000, 'finance_controller', 40),
  ('CFO above $500,000',                            NULL,                    50000000, 'cfo',                50);
