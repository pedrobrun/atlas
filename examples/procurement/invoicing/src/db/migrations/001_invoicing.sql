CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Local mirror of procure-api purchase orders, fed by the procurement-events queue.
CREATE TABLE po_mirror (
  id          uuid PRIMARY KEY,
  number      text NOT NULL UNIQUE,
  vendor_id   uuid NOT NULL,
  vendor_name text NOT NULL,
  currency    char(3) NOT NULL,
  total_cents bigint NOT NULL,
  status      text NOT NULL,
  version     int NOT NULL,
  lines       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE goods_receipts (
  id                uuid PRIMARY KEY,
  purchase_order_id uuid NOT NULL,
  lines             jsonb NOT NULL,
  received_at       timestamptz NOT NULL
);
CREATE INDEX goods_receipts_po ON goods_receipts (purchase_order_id);

CREATE TABLE invoices (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source                text NOT NULL CHECK (source IN ('email', 'upload')),
  s3_key                text NOT NULL,
  sha256                char(64) NOT NULL UNIQUE,
  submitted_by          text NOT NULL,
  vendor_id             uuid,
  vendor_name           text,
  purchase_order_id     uuid,
  purchase_order_number text,
  invoice_number        text,
  currency              char(3),
  subtotal_cents        bigint CHECK (subtotal_cents >= 0),
  tax_cents             bigint CHECK (tax_cents >= 0),
  total_cents           bigint CHECK (total_cents >= 0),
  lines                 jsonb NOT NULL DEFAULT '[]',
  issue_date            date,
  due_date              date,
  status                text NOT NULL CHECK (status IN ('received', 'extracted', 'matched', 'exception', 'paying', 'paid', 'rejected')),
  extraction_confidence numeric(3, 2),
  budget_confirmed_at   timestamptz,
  paid_at               timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendor_id, invoice_number)
);
CREATE INDEX invoices_status ON invoices (status);
CREATE INDEX invoices_po ON invoices (purchase_order_id);
CREATE INDEX invoices_paid_at ON invoices (paid_at) WHERE status = 'paid';

CREATE TABLE invoice_status_history (
  id          bigserial PRIMARY KEY,
  invoice_id  uuid NOT NULL REFERENCES invoices(id),
  from_status text NOT NULL,
  to_status   text NOT NULL,
  reason      text NOT NULL,
  changed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE match_results (
  id           bigserial PRIMARY KEY,
  invoice_id   uuid NOT NULL REFERENCES invoices(id),
  outcome      text NOT NULL CHECK (outcome IN ('matched', 'exception')),
  variances    jsonb NOT NULL,
  evaluated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE invoice_exceptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      uuid NOT NULL REFERENCES invoices(id),
  reason          text NOT NULL,
  details         jsonb NOT NULL DEFAULT '{}',
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'rejected', 'superseded')),
  resolved_by     text,
  resolution_note text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz
);
CREATE UNIQUE INDEX invoice_exceptions_one_open ON invoice_exceptions (invoice_id) WHERE status = 'open';

CREATE TABLE payment_runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  summary     jsonb
);

-- One payment per invoice, ever. Together with the Stripe idempotency key this is what makes
-- "an invoice is paid at most once" hold across crashes and concurrent runs.
CREATE TABLE payments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id         uuid NOT NULL UNIQUE REFERENCES invoices(id),
  payment_run_id     uuid NOT NULL REFERENCES payment_runs(id),
  idempotency_key    text NOT NULL UNIQUE,
  amount_cents       bigint NOT NULL CHECK (amount_cents > 0),
  currency           char(3) NOT NULL,
  status             text NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed')),
  stripe_transfer_id text UNIQUE,
  failure_message    text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
