CREATE TABLE vendor_bank_accounts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id      uuid NOT NULL REFERENCES vendors(id),
  kind           text NOT NULL CHECK (kind IN ('iban', 'us_ach')),
  masked_number  text NOT NULL,
  bic            text,
  routing_number text,
  verified       boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendor_id, masked_number)
);

CREATE TABLE vendor_contracts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id            uuid NOT NULL REFERENCES vendors(id),
  title                text NOT NULL,
  status               text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'signed', 'declined', 'voided')),
  docusign_envelope_id text UNIQUE,
  signer_email         text NOT NULL,
  signer_name          text NOT NULL,
  effective_from       date,
  effective_to         date,
  created_by           uuid NOT NULL REFERENCES users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE catalog_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku              text NOT NULL UNIQUE,
  name             text NOT NULL,
  category_code    text NOT NULL,
  unit             text NOT NULL DEFAULT 'each',
  list_price_cents bigint NOT NULL CHECK (list_price_cents >= 0),
  currency         char(3) NOT NULL,
  active           boolean NOT NULL DEFAULT true
);
CREATE INDEX catalog_items_name ON catalog_items USING gin (to_tsvector('english', name));

CREATE TABLE catalog_prices (
  catalog_item_id  uuid NOT NULL REFERENCES catalog_items(id),
  vendor_id        uuid NOT NULL REFERENCES vendors(id),
  min_quantity     int NOT NULL DEFAULT 1 CHECK (min_quantity > 0),
  unit_price_cents bigint NOT NULL CHECK (unit_price_cents >= 0),
  contract_id      uuid REFERENCES vendor_contracts(id),
  valid_from       date NOT NULL,
  valid_to         date,
  PRIMARY KEY (catalog_item_id, vendor_id, min_quantity, valid_from)
);

CREATE TABLE preferred_vendors (
  category_code text NOT NULL,
  vendor_id     uuid NOT NULL REFERENCES vendors(id),
  PRIMARY KEY (category_code, vendor_id)
);
