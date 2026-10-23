-- Service catalogue / branch-price acceptance smoke tests on disposable PostgreSQL.
-- This validates RPC guardrails, not Supabase staging credentials or production behavior.
BEGIN;

INSERT INTO auth.users (id) VALUES ('51000000-0000-4000-8000-000000000001');
INSERT INTO public.organizations (id, name, slug)
VALUES ('52000000-0000-4000-8000-000000000001', 'Pricing Test Org', 'pricing-test-org');
INSERT INTO public.users (id, organization_id, full_name, email, role, is_active)
VALUES ('51000000-0000-4000-8000-000000000001',
        '52000000-0000-4000-8000-000000000001',
        'Pricing Owner', 'pricing-owner@example.test', 'owner', true);
INSERT INTO public.branches (id, organization_id, code, name, is_active)
VALUES ('53000000-0000-4000-8000-000000000001',
        '52000000-0000-4000-8000-000000000001', 'PRICING-01', 'Pricing Branch', true);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000001', true);

DO $$
DECLARE
  v_rejected_zero boolean := false;
  v_service_id uuid;
  v_price_id uuid;
BEGIN
  IF NOT has_function_privilege('authenticated',
    'public.kt_save_service_branch_price(uuid,text,text,integer,uuid,bigint)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated role must execute the guarded service-price RPC';
  END IF;

  IF has_table_privilege('authenticated', 'public.services', 'INSERT')
     OR has_table_privilege('authenticated', 'public.branch_service_prices', 'INSERT') THEN
    RAISE EXCEPTION 'Authenticated clients must not have direct INSERT privileges on service/pricing tables';
  END IF;

  BEGIN
    PERFORM * FROM public.kt_save_service_branch_price(
      NULL, 'ZERO-PRICE', 'Zero Price Test', 30,
      '53000000-0000-4000-8000-000000000001', 0
    );
  EXCEPTION WHEN SQLSTATE '22023' THEN
    v_rejected_zero := true;
  END;

  IF NOT v_rejected_zero THEN
    RAISE EXCEPTION 'RPC accepted a zero service price';
  END IF;

  SELECT result.service_id, result.price_id
    INTO v_service_id, v_price_id
  FROM public.kt_save_service_branch_price(
    NULL, 'POSITIVE-PRICE', 'Positive Price Test', 30,
    '53000000-0000-4000-8000-000000000001', 50000
  ) AS result;

  IF v_service_id IS NULL OR v_price_id IS NULL THEN
    RAISE EXCEPTION 'RPC did not return the created service and price IDs';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.branch_service_prices
    WHERE id = v_price_id
      AND organization_id = '52000000-0000-4000-8000-000000000001'
      AND branch_id = '53000000-0000-4000-8000-000000000001'
      AND service_id = v_service_id
      AND price_amount = 50000
      AND effective_to IS NULL
  ) THEN
    RAISE EXCEPTION 'RPC did not persist the expected active branch price';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.audit_logs
    WHERE organization_id = '52000000-0000-4000-8000-000000000001'
      AND actor_user_id = '51000000-0000-4000-8000-000000000001'
      AND entity_id = v_service_id
      AND action = 'service_branch_price.saved'
  ) THEN
    RAISE EXCEPTION 'RPC did not create the expected audit log';
  END IF;
END
$$;

RESET ROLE;
ROLLBACK;
