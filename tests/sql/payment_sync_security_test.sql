-- Payment and offline-sync security contract smoke test.
-- This asserts that browser roles cannot mutate payment/provider/sync records directly.
-- It does NOT implement a provider webhook or trusted sync endpoint.
BEGIN;

DO $$
DECLARE
  table_name text;
  protected_tables text[] := ARRAY[
    'public.sales',
    'public.sale_items',
    'public.payments',
    'public.payment_provider_events',
    'public.idempotency_records',
    'public.sync_batches',
    'public.audit_logs'
  ];
  operation text;
BEGIN
  FOREACH table_name IN ARRAY protected_tables LOOP
    IF to_regclass(table_name) IS NULL THEN
      RAISE EXCEPTION 'Protected table % is missing', table_name;
    END IF;

    FOREACH operation IN ARRAY ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
      IF has_table_privilege('authenticated', table_name, operation) THEN
        RAISE EXCEPTION 'authenticated unexpectedly has % privilege on %', operation, table_name;
      END IF;
      IF has_table_privilege('anon', table_name, operation) THEN
        RAISE EXCEPTION 'anon unexpectedly has % privilege on %', operation, table_name;
      END IF;
    END LOOP;
  END LOOP;

  -- Until a verified provider callback and trusted sync service are implemented,
  -- browser-executable confirmation/sync RPCs must not exist as callable routines.
  IF to_regprocedure('public.kt_confirm_qris_payment(uuid,text,jsonb)') IS NOT NULL
     AND has_function_privilege('authenticated',
       'public.kt_confirm_qris_payment(uuid,text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Browser role can execute the QRIS confirmation RPC';
  END IF;

  IF to_regprocedure('public.kt_apply_sync_batch(uuid,jsonb)') IS NOT NULL
     AND has_function_privilege('authenticated',
       'public.kt_apply_sync_batch(uuid,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Browser role can execute the offline sync RPC';
  END IF;
END
$$;

ROLLBACK;
