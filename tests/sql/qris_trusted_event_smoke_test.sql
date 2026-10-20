-- Trusted QRIS event boundary acceptance tests on disposable PostgreSQL.
-- Signature and amount validation remain the responsibility of the provider webhook.
BEGIN;

DO $$
BEGIN
  IF has_function_privilege('authenticated',
    'public.kt_apply_verified_qris_event(text,text,text,uuid,text,text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated clients must not execute the trusted QRIS transition';
  END IF;
  IF has_function_privilege('anon',
    'public.kt_apply_verified_qris_event(text,text,text,uuid,text,text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous clients must not execute the trusted QRIS transition';
  END IF;
  IF NOT has_function_privilege('service_role',
    'public.kt_apply_verified_qris_event(text,text,text,uuid,text,text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Trusted service_role must be able to execute the QRIS transition';
  END IF;
END
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
DO $$
DECLARE v_denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.kt_apply_verified_qris_event(
      'test-provider','event-auth-denied','payment.paid',
      '71000000-0000-4000-8000-000000000001','ref-auth-denied','paid','{}'::jsonb
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Authenticated role was not denied by QRIS transition'; END IF;
END
$$;
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
DO $$
DECLARE v_first jsonb; v_second jsonb;
BEGIN
  v_first := public.kt_apply_verified_qris_event(
    'test-provider','event-idempotent-001','payment.paid',
    '71000000-0000-4000-8000-000000000001','ref-001','paid','{"test":true}'::jsonb
  );
  IF v_first->>'reason' IS DISTINCT FROM 'payment_not_found' THEN
    RAISE EXCEPTION 'Unknown payment should be safely ignored; got %', v_first;
  END IF;

  v_second := public.kt_apply_verified_qris_event(
    'test-provider','event-idempotent-001','payment.paid',
    '71000000-0000-4000-8000-000000000001','ref-001','paid','{"test":true}'::jsonb
  );
  IF v_second->>'duplicate_event' IS DISTINCT FROM 'true'
     OR v_second->>'changed' IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'Repeated provider event must be idempotent; got %', v_second;
  END IF;

  IF (SELECT count(*) FROM public.payment_provider_events
      WHERE provider='test-provider' AND provider_event_id='event-idempotent-001') <> 1 THEN
    RAISE EXCEPTION 'Duplicate provider event created more than one event record';
  END IF;
END
$$;
RESET ROLE;

ROLLBACK;
