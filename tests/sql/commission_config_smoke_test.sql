-- Per-barber commission configuration acceptance tests on disposable PostgreSQL.
-- Validates RPC guardrails, effective-dated rates, and audit logging only.
BEGIN;

INSERT INTO auth.users (id) VALUES ('61000000-0000-4000-8000-000000000001');
INSERT INTO public.organizations (id, name, slug)
VALUES ('62000000-0000-4000-8000-000000000001', 'Commission Test Org', 'commission-test-org');
INSERT INTO public.users (id, organization_id, full_name, email, role, is_active)
VALUES ('61000000-0000-4000-8000-000000000001',
        '62000000-0000-4000-8000-000000000001',
        'Commission Owner', 'commission-owner@example.test', 'owner', true);
INSERT INTO public.barbers (id, organization_id, barber_code, full_name, is_active)
VALUES ('63000000-0000-4000-8000-000000000001',
        '62000000-0000-4000-8000-000000000001', 'COM-001', 'Commission Barber', true);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000001', true);

DO $$
DECLARE
  v_result record;
  v_rejected boolean := false;
  v_version_count integer;
BEGIN
  IF NOT has_function_privilege('authenticated',
    'public.kt_save_barber_commission_rate(uuid,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated role must execute the guarded commission RPC';
  END IF;

  IF has_table_privilege('authenticated', 'public.commission_tiers', 'INSERT')
     OR has_table_privilege('authenticated', 'public.commission_tier_versions', 'INSERT')
     OR has_table_privilege('authenticated', 'public.barber_commission_assignments', 'INSERT') THEN
    RAISE EXCEPTION 'Authenticated clients must not have direct INSERT privileges on commission configuration tables';
  END IF;

  BEGIN
    PERFORM * FROM public.kt_save_barber_commission_rate(
      '63000000-0000-4000-8000-000000000001', 10001
    );
  EXCEPTION WHEN SQLSTATE '22023' THEN
    v_rejected := true;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'RPC accepted a commission rate above 100 percent';
  END IF;

  SELECT * INTO v_result
  FROM public.kt_save_barber_commission_rate(
    '63000000-0000-4000-8000-000000000001', 3000
  );
  IF v_result.barber_id <> '63000000-0000-4000-8000-000000000001'
     OR v_result.rate_bps <> 3000 OR v_result.tier_id IS NULL THEN
    RAISE EXCEPTION 'RPC did not return the expected 30 percent configuration';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.barber_commission_assignments a
    WHERE a.organization_id = '62000000-0000-4000-8000-000000000001'
      AND a.barber_id = '63000000-0000-4000-8000-000000000001'
      AND a.tier_id = v_result.tier_id AND a.effective_to IS NULL
  ) THEN RAISE EXCEPTION 'Active barber-to-commission-tier assignment was not created'; END IF;

  SELECT * INTO v_result
  FROM public.kt_save_barber_commission_rate(
    '63000000-0000-4000-8000-000000000001', 2500
  );
  IF v_result.rate_bps <> 2500 THEN
    RAISE EXCEPTION 'RPC did not return the updated 25 percent rate';
  END IF;

  SELECT count(*) INTO v_version_count
  FROM public.commission_tier_versions
  WHERE organization_id = '62000000-0000-4000-8000-000000000001'
    AND tier_id = v_result.tier_id;
  IF v_version_count <> 2 THEN
    RAISE EXCEPTION 'Rate update must preserve two effective-dated versions';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.commission_tier_versions
    WHERE organization_id = '62000000-0000-4000-8000-000000000001'
      AND tier_id = v_result.tier_id AND rate_bps = 3000 AND effective_to IS NOT NULL
  ) THEN RAISE EXCEPTION 'Previous 30 percent rate was not closed as historical'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.commission_tier_versions
    WHERE organization_id = '62000000-0000-4000-8000-000000000001'
      AND tier_id = v_result.tier_id AND rate_bps = 2500 AND effective_to IS NULL
  ) THEN RAISE EXCEPTION 'Current 25 percent rate is not active'; END IF;

  IF (SELECT count(*) FROM public.audit_logs
      WHERE organization_id = '62000000-0000-4000-8000-000000000001'
        AND actor_user_id = '61000000-0000-4000-8000-000000000001'
        AND entity_id = '63000000-0000-4000-8000-000000000001'
        AND action = 'barber_commission_rate.saved') <> 2 THEN
    RAISE EXCEPTION 'Expected one audit log entry for each saved rate';
  END IF;
END
$$;

RESET ROLE;
ROLLBACK;
