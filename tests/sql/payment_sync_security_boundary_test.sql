-- Security boundary smoke tests for payment confirmation and offline sync.
-- This test intentionally verifies that clients cannot self-confirm QRIS or
-- write raw offline batches. It does not claim a trusted provider/sync worker exists.
BEGIN;

DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.payments', 'UPDATE') THEN
    RAISE EXCEPTION 'Authenticated clients must not update payment status directly';
  END IF;
  IF has_table_privilege('authenticated', 'public.payments', 'INSERT') THEN
    RAISE EXCEPTION 'Authenticated clients must not insert payment records directly';
  END IF;
  IF has_table_privilege('authenticated', 'public.payment_provider_events', 'INSERT')
     OR has_table_privilege('authenticated', 'public.payment_provider_events', 'UPDATE') THEN
    RAISE EXCEPTION 'Provider events must be written only by trusted server-side code';
  END IF;
  IF has_table_privilege('authenticated', 'public.sync_batches', 'INSERT')
     OR has_table_privilege('authenticated', 'public.sync_batches', 'UPDATE') THEN
    RAISE EXCEPTION 'Authenticated clients must not write raw sync batches directly';
  END IF;
  IF has_table_privilege('authenticated', 'public.idempotency_records', 'INSERT')
     OR has_table_privilege('authenticated', 'public.idempotency_records', 'UPDATE') THEN
    RAISE EXCEPTION 'Idempotency records must be managed by trusted server-side code';
  END IF;
  IF has_table_privilege('authenticated', 'public.sales', 'INSERT')
     OR has_table_privilege('authenticated', 'public.sales', 'UPDATE') THEN
    RAISE EXCEPTION 'Authenticated clients must not mutate sales directly';
  END IF;
END
$$;

ROLLBACK;
