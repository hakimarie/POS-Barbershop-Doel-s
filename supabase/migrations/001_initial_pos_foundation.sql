-- KetemuTerus Barber POS — Migration 001
-- PostgreSQL baseline. Review in staging before production.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  currency char(3) NOT NULL DEFAULT 'IDR',
  timezone text NOT NULL DEFAULT 'Asia/Jakarta',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Application profile keyed to the authenticated Supabase Auth identity.
CREATE TABLE users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  full_name text NOT NULL,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner','admin','manager','cashier','barber')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, email)
);

CREATE TABLE branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  code text NOT NULL,
  name text NOT NULL,
  address text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, code)
);

CREATE TABLE branch_memberships (
  organization_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (branch_id, user_id),
  FOREIGN KEY (organization_id, branch_id) REFERENCES branches(organization_id, id),
  FOREIGN KEY (organization_id, user_id) REFERENCES users(organization_id, id)
);

CREATE TABLE devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  branch_id uuid NOT NULL,
  device_code text NOT NULL,
  device_name text NOT NULL,
  last_seen_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, device_code),
  FOREIGN KEY (organization_id, branch_id) REFERENCES branches(organization_id, id)
);

CREATE TABLE services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  code text NOT NULL,
  name text NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 30 CHECK (duration_minutes > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, code)
);

CREATE TABLE branch_service_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  branch_id uuid NOT NULL,
  service_id uuid NOT NULL,
  price_amount bigint NOT NULL CHECK (price_amount >= 0),
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to > effective_from),
  FOREIGN KEY (organization_id, branch_id) REFERENCES branches(organization_id, id),
  FOREIGN KEY (organization_id, service_id) REFERENCES services(organization_id, id),
  EXCLUDE USING gist (
    branch_id WITH =,
    service_id WITH =,
    tstzrange(effective_from, effective_to, '[)') WITH &&
  )
);

CREATE TABLE barbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  barber_code text NOT NULL,
  full_name text NOT NULL,
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, barber_code)
);

CREATE TABLE barber_branch_assignments (
  organization_id uuid NOT NULL,
  barber_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  PRIMARY KEY (barber_id, branch_id, effective_from),
  CHECK (effective_to IS NULL OR effective_to > effective_from),
  FOREIGN KEY (organization_id, barber_id) REFERENCES barbers(organization_id, id),
  FOREIGN KEY (organization_id, branch_id) REFERENCES branches(organization_id, id),
  EXCLUDE USING gist (
    barber_id WITH =,
    branch_id WITH =,
    tstzrange(effective_from, effective_to, '[)') WITH &&
  )
);

CREATE TABLE commission_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, name)
);

CREATE TABLE commission_tier_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  tier_id uuid NOT NULL,
  rate_bps integer NOT NULL CHECK (rate_bps BETWEEN 0 AND 10000),
  effective_from timestamptz NOT NULL,
  effective_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to > effective_from),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, tier_id) REFERENCES commission_tiers(organization_id, id),
  EXCLUDE USING gist (
    tier_id WITH =,
    tstzrange(effective_from, effective_to, '[)') WITH &&
  )
);

CREATE TABLE barber_commission_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  barber_id uuid NOT NULL,
  tier_id uuid NOT NULL,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to > effective_from),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, barber_id) REFERENCES barbers(organization_id, id),
  FOREIGN KEY (organization_id, tier_id) REFERENCES commission_tiers(organization_id, id),
  EXCLUDE USING gist (
    barber_id WITH =,
    tstzrange(effective_from, effective_to, '[)') WITH &&
  )
);

CREATE TABLE cash_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  device_id uuid NOT NULL,
  opened_by uuid NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  opening_cash_amount bigint NOT NULL DEFAULT 0 CHECK (opening_cash_amount >= 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','review_required')),
  closed_by uuid,
  closed_at timestamptz,
  closing_cash_amount bigint CHECK (closing_cash_amount IS NULL OR closing_cash_amount >= 0),
  expected_cash_amount bigint,
  variance_amount bigint,
  notes text,
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, branch_id) REFERENCES branches(organization_id, id),
  FOREIGN KEY (organization_id, device_id) REFERENCES devices(organization_id, id),
  FOREIGN KEY (organization_id, opened_by) REFERENCES users(organization_id, id),
  FOREIGN KEY (organization_id, closed_by) REFERENCES users(organization_id, id),
  CHECK ((status = 'open' AND closed_at IS NULL) OR (status <> 'open' AND closed_at IS NOT NULL))
);
CREATE UNIQUE INDEX one_open_shift_per_device
  ON cash_shifts(device_id) WHERE status = 'open';

CREATE TABLE sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  shift_id uuid NOT NULL,
  device_id uuid NOT NULL,
  cashier_user_id uuid NOT NULL,
  client_transaction_id uuid NOT NULL,
  receipt_number text NOT NULL,
  status text NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment','paid','cancelled','partially_refunded','refunded','review_required')),
  subtotal_amount bigint NOT NULL DEFAULT 0 CHECK (subtotal_amount >= 0),
  discount_amount bigint NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  total_amount bigint NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  currency char(3) NOT NULL DEFAULT 'IDR',
  device_created_at timestamptz NOT NULL,
  server_received_at timestamptz NOT NULL DEFAULT now(),
  sync_status text NOT NULL DEFAULT 'synced' CHECK (sync_status IN ('local_only','pending_sync','synced','conflict')),
  config_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, client_transaction_id),
  UNIQUE (organization_id, receipt_number),
  FOREIGN KEY (organization_id, branch_id) REFERENCES branches(organization_id, id),
  FOREIGN KEY (organization_id, shift_id) REFERENCES cash_shifts(organization_id, id),
  FOREIGN KEY (organization_id, device_id) REFERENCES devices(organization_id, id),
  FOREIGN KEY (organization_id, cashier_user_id) REFERENCES users(organization_id, id)
);

CREATE TABLE sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  sale_id uuid NOT NULL,
  service_id uuid NOT NULL,
  barber_id uuid NOT NULL,
  service_name_snapshot text NOT NULL,
  unit_price_amount bigint NOT NULL CHECK (unit_price_amount >= 0),
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  gross_amount bigint NOT NULL CHECK (gross_amount >= 0),
  discount_amount bigint NOT NULL DEFAULT 0 CHECK (discount_amount >= 0 AND discount_amount <= gross_amount),
  commission_basis_amount bigint NOT NULL CHECK (commission_basis_amount >= 0),
  commission_tier_version_id_snapshot uuid,
  commission_tier_name_snapshot text,
  commission_rate_bps_snapshot integer CHECK (commission_rate_bps_snapshot BETWEEN 0 AND 10000),
  commission_amount bigint NOT NULL DEFAULT 0 CHECK (commission_amount >= 0),
  commission_review_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, sale_id) REFERENCES sales(organization_id, id),
  FOREIGN KEY (organization_id, service_id) REFERENCES services(organization_id, id),
  FOREIGN KEY (organization_id, barber_id) REFERENCES barbers(organization_id, id),
  FOREIGN KEY (organization_id, commission_tier_version_id_snapshot)
    REFERENCES commission_tier_versions(organization_id, id),
  CHECK (commission_basis_amount = gross_amount - discount_amount),
  CHECK (
    (commission_tier_version_id_snapshot IS NULL AND commission_rate_bps_snapshot IS NULL)
    OR (commission_tier_version_id_snapshot IS NOT NULL AND commission_rate_bps_snapshot IS NOT NULL)
  )
);

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  sale_id uuid NOT NULL,
  method text NOT NULL CHECK (method IN ('cash','qris')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','failed','expired','cancelled','reversed','partially_refunded','refunded')),
  amount bigint NOT NULL CHECK (amount > 0),
  provider text,
  provider_reference text,
  qr_payload text,
  expires_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, sale_id) REFERENCES sales(organization_id, id),
  CHECK (method <> 'qris' OR provider IS NOT NULL OR status IN ('failed','cancelled'))
);

CREATE UNIQUE INDEX unique_provider_reference
  ON payments(provider, provider_reference)
  WHERE provider_reference IS NOT NULL;

CREATE TABLE payment_provider_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_status text NOT NULL DEFAULT 'received'
    CHECK (processing_status IN ('received','processed','ignored','failed')),
  processing_error text,
  UNIQUE (provider, provider_event_id)
);

CREATE TABLE commission_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  sale_id uuid NOT NULL,
  sale_item_id uuid NOT NULL,
  barber_id uuid NOT NULL,
  basis_amount bigint NOT NULL CHECK (basis_amount >= 0),
  rate_bps integer NOT NULL CHECK (rate_bps BETWEEN 0 AND 10000),
  commission_amount bigint NOT NULL CHECK (commission_amount >= 0),
  status text NOT NULL DEFAULT 'pending_sync'
    CHECK (status IN ('pending_sync','pending_review','pending_approval','approved','payable','paid','adjusted','reversed')),
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, sale_item_id),
  FOREIGN KEY (organization_id, sale_id) REFERENCES sales(organization_id, id),
  FOREIGN KEY (organization_id, sale_item_id) REFERENCES sale_items(organization_id, id),
  FOREIGN KEY (organization_id, barber_id) REFERENCES barbers(organization_id, id),
  FOREIGN KEY (organization_id, approved_by) REFERENCES users(organization_id, id),
  CHECK (commission_amount = ((basis_amount * rate_bps + 5000) / 10000))
);

CREATE TABLE commission_review_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  commission_entry_id uuid NOT NULL,
  reason_code text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','approved','rejected')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_note text,
  FOREIGN KEY (organization_id, commission_entry_id) REFERENCES commission_entries(organization_id, id),
  FOREIGN KEY (organization_id, resolved_by) REFERENCES users(organization_id, id)
);
CREATE UNIQUE INDEX one_open_review_per_commission
  ON commission_review_cases(commission_entry_id) WHERE status = 'open';

CREATE TABLE commission_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  barber_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  total_amount bigint NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','paid','cancelled')),
  created_by uuid NOT NULL,
  paid_by uuid,
  paid_at timestamptz,
  payment_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, barber_id) REFERENCES barbers(organization_id, id),
  FOREIGN KEY (organization_id, created_by) REFERENCES users(organization_id, id),
  FOREIGN KEY (organization_id, paid_by) REFERENCES users(organization_id, id),
  CHECK (period_end >= period_start)
);

CREATE TABLE commission_payout_items (
  organization_id uuid NOT NULL,
  payout_id uuid NOT NULL,
  commission_entry_id uuid NOT NULL,
  amount bigint NOT NULL CHECK (amount >= 0),
  PRIMARY KEY (payout_id, commission_entry_id),
  UNIQUE (commission_entry_id),
  FOREIGN KEY (organization_id, payout_id) REFERENCES commission_payouts(organization_id, id),
  FOREIGN KEY (organization_id, commission_entry_id) REFERENCES commission_entries(organization_id, id)
);

CREATE TABLE sale_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  sale_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('discount_correction','refund','void','other')),
  amount bigint NOT NULL CHECK (amount >= 0),
  reason text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, sale_id) REFERENCES sales(organization_id, id),
  FOREIGN KEY (organization_id, created_by) REFERENCES users(organization_id, id)
);

CREATE TABLE idempotency_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  response_status integer,
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  UNIQUE (organization_id, idempotency_key)
);

CREATE TABLE sync_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  device_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received','processing','completed','partial','failed')),
  submitted_count integer NOT NULL DEFAULT 0,
  accepted_count integer NOT NULL DEFAULT 0,
  rejected_count integer NOT NULL DEFAULT 0,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (organization_id, batch_id),
  FOREIGN KEY (organization_id, device_id) REFERENCES devices(organization_id, id)
);

CREATE TABLE audit_logs (
  id bigserial PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  actor_user_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, actor_user_id) REFERENCES users(organization_id, id)
);

CREATE INDEX sales_branch_created_idx ON sales(branch_id, created_at DESC);
CREATE INDEX sales_shift_status_idx ON sales(shift_id, status);
CREATE INDEX sale_items_barber_idx ON sale_items(organization_id, barber_id, created_at DESC);
CREATE INDEX commission_entries_barber_status_idx ON commission_entries(organization_id, barber_id, status);
CREATE INDEX payments_sale_status_idx ON payments(sale_id, status);
CREATE INDEX sync_batches_device_created_idx ON sync_batches(device_id, created_at DESC);
CREATE INDEX audit_logs_entity_idx ON audit_logs(organization_id, entity_type, entity_id, created_at DESC);

COMMIT;
