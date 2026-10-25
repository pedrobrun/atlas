CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  full_name     text NOT NULL,
  manager_id    uuid REFERENCES users(id),
  slack_user_id text,
  active        boolean NOT NULL DEFAULT true
);

CREATE TABLE cost_centers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,
  name        text NOT NULL,
  owner_id    uuid REFERENCES users(id),
  netsuite_id text UNIQUE,
  active      boolean NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE gl_accounts (
  netsuite_id text PRIMARY KEY,
  number      text NOT NULL UNIQUE,
  name        text NOT NULL,
  type        text NOT NULL,
  active      boolean NOT NULL DEFAULT true
);

CREATE TABLE category_gl_mappings (
  category_code     text PRIMARY KEY,
  gl_account_number text NOT NULL
);

CREATE TABLE budgets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cost_center_id  uuid NOT NULL REFERENCES cost_centers(id),
  fiscal_year     int NOT NULL,
  currency        char(3) NOT NULL,
  allocated_cents bigint NOT NULL CHECK (allocated_cents >= 0),
  reserved_cents  bigint NOT NULL DEFAULT 0 CHECK (reserved_cents >= 0),
  consumed_cents  bigint NOT NULL DEFAULT 0 CHECK (consumed_cents >= 0),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cost_center_id, fiscal_year),
  -- Backstop for budgets/overspend-guard.ts: available funds can never go below zero.
  CONSTRAINT budget_not_negative CHECK (allocated_cents - reserved_cents - consumed_cents >= 0)
);

CREATE TABLE budget_movements (
  id                bigserial PRIMARY KEY,
  budget_id         uuid NOT NULL REFERENCES budgets(id),
  kind              text NOT NULL CHECK (kind IN ('reserve', 'release', 'consume')),
  amount_cents      bigint NOT NULL CHECK (amount_cents > 0),
  requisition_id    uuid NOT NULL,
  purchase_order_id uuid,
  invoice_id        uuid,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX budget_movements_requisition ON budget_movements (requisition_id);
CREATE UNIQUE INDEX budget_movements_consume_once ON budget_movements (invoice_id) WHERE kind = 'consume';

CREATE TABLE vendors (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name        text NOT NULL,
  country           char(2) NOT NULL,
  tax_id            text NOT NULL,
  contact_email     text NOT NULL,
  categories        text[] NOT NULL DEFAULT '{}',
  status            text NOT NULL DEFAULT 'pending_kyb'
                    CHECK (status IN ('pending_kyb', 'active', 'suspended', 'rejected')),
  risk_level        text CHECK (risk_level IN ('low', 'medium', 'high', 'blocked')),
  risk_score        int,
  stripe_account_id text,
  payout_currency   char(3),
  netsuite_id       text UNIQUE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (country, tax_id)
);

CREATE SEQUENCE requisition_number_seq;
CREATE TABLE requisitions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number         text NOT NULL UNIQUE DEFAULT ('REQ-' || lpad(nextval('requisition_number_seq')::text, 6, '0')),
  requester_id   uuid NOT NULL REFERENCES users(id),
  cost_center_id uuid NOT NULL REFERENCES cost_centers(id),
  vendor_id      uuid REFERENCES vendors(id),
  title          text NOT NULL,
  justification  text NOT NULL DEFAULT '',
  currency       char(3) NOT NULL,
  total_cents    bigint NOT NULL CHECK (total_cents >= 0),
  status         text NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'withdrawn', 'ordered')),
  needed_by      date,
  submitted_at   timestamptz,
  approved_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX requisitions_requester ON requisitions (requester_id, created_at DESC);

CREATE TABLE requisition_lines (
  requisition_id   uuid NOT NULL REFERENCES requisitions(id) ON DELETE CASCADE,
  line_no          int NOT NULL,
  description      text NOT NULL,
  category_code    text NOT NULL,
  quantity         int NOT NULL CHECK (quantity > 0),
  unit_price_cents bigint NOT NULL CHECK (unit_price_cents >= 0),
  catalog_item_id  uuid,
  PRIMARY KEY (requisition_id, line_no)
);

CREATE SEQUENCE po_number_seq;
CREATE TABLE purchase_orders (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number         text NOT NULL UNIQUE,
  requisition_id uuid NOT NULL UNIQUE REFERENCES requisitions(id),
  vendor_id      uuid NOT NULL REFERENCES vendors(id),
  cost_center_id uuid NOT NULL REFERENCES cost_centers(id),
  currency       char(3) NOT NULL,
  total_cents    bigint NOT NULL CHECK (total_cents >= 0),
  invoiced_cents bigint NOT NULL DEFAULT 0 CHECK (invoiced_cents >= 0),
  status         text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'amended', 'cancelled', 'closed')),
  version        int NOT NULL DEFAULT 1,
  issued_at      timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (invoiced_cents <= total_cents)
);
CREATE INDEX purchase_orders_updated_at ON purchase_orders (updated_at);

CREATE TABLE purchase_order_lines (
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  line_no           int NOT NULL,
  description       text NOT NULL,
  category_code     text NOT NULL,
  quantity          int NOT NULL CHECK (quantity > 0),
  unit_price_cents  bigint NOT NULL CHECK (unit_price_cents >= 0),
  gl_account_number text,
  PRIMARY KEY (purchase_order_id, line_no)
);

CREATE TABLE goods_receipts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id),
  received_by       uuid NOT NULL REFERENCES users(id),
  received_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE goods_receipt_lines (
  goods_receipt_id  uuid NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
  line_no           int NOT NULL,
  quantity_received int NOT NULL CHECK (quantity_received > 0),
  PRIMARY KEY (goods_receipt_id, line_no)
);
