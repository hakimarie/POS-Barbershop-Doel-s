-- QRIS state machine acceptance tests on disposable PostgreSQL.
-- Does not test provider signature/amount verification, which belongs in the provider adapter.
BEGIN;

INSERT INTO auth.users (id) VALUES ('61000000-0000-4000-8000-000000000011');
INSERT INTO public.organizations (id, name, slug)
VALUES ('62000000-0000-4000-8000-000000000011', 'QRIS Transition Test Org', 'qris-transition-test-org');
INSERT INTO public.users (id, organization_id, full_name, email, role, is_active)
VALUES ('61000000-0000-4000-8000-000000000011',
        '62000000-0000-4000-8000-000000000011',
        'QRIS Test Owner', 'qris-owner@example.test', 'owner', true);
INSERT INTO public.branches (id, organization_id, code, name, is_active)
VALUES ('63000000-0000-4000-8000-000000000011',
        '62000000-0000-4000-8000-000000000011', 'QRIS-01', 'QRIS Branch', true);
INSERT INTO public.devices (id, organization_id, branch_id, device_code, device_name, is_active)
VALUES ('64000000-0000-4000-8000-000000000011',
        '62000000-0000-4000-8000-000000000011',
        '63000000-0000-4000-8000-000000000011', 'QRIS-POS-01', 'QRIS Test Device', true);
INSERT INTO public.services (id, organization_id, code, name, duration_minutes, is_active)
VALUES ('65000000-0000-4000-8000-000000000011',
        '62000000-0000-4000-8000-000000000011', 'QRIS-CUT', 'QRIS Test Haircut', 30, true);
INSERT INTO public.branch_service_prices
  (organization_id, branch_id, service_id, price_amount, effective_from)
VALUES ('62000000-0000-4000-8000-000000000011',
        '63000000-0000-4000-8000-000000000011',
        '65000000-0000-4000-8000-000000000011', 50000, now() - interval '1 day');
INSERT INTO public.barbers (id, organization_id, barber_code, full_name, is_active)
VALUES ('66000000-0000-4000-8000-000000000011',
        '62000000-0000-4000-8000-000000000011', 'QRIS-B01', 'QRIS Test Barber', true);
INSERT INTO public.barber_branch_assignments
  (organization_id, barber_id, branch_id, effective_from)
VALUES ('62000000-0000-4000-8000-000000000011',
        '66000000-0000-4000-8000-000000000011',
        '63000000-0000-4000-8000-000000000011', now() - interval '1 day');
INSERT INTO public.cash_shifts
  (id, organization_id, branch_id, device_id, opened_by, opening_cash_amount, status)
VALUES ('67000000-0000-4000-8000-000000000011',
        '62000000-0000-4000-8000-000000000011',
        '63000000-0000-4000-8000-000000000011',
        '64000000-0000-4000-8000-000000000011',
        '61000000-0000-4000-8000-000000000011', 0, 'open');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000011', true);
SELECT * FROM public.kt_checkout_sale(
  '63000000-0000-4000-8000-000000000011','67000000-0000-4000-8000-000000000011',
  '64000000-0000-4000-8000-000000000011','65000000-0000-4000-8000-000000000011',
  '66000000-0000-4000-8000-000000000011',1,'qris','68000000-0000-4000-8000-000000000011'
);
SELECT * FROM public.kt_checkout_sale(
  '63000000-0000-4000-8000-000000000011','67000000-0000-4000-8000-000000000011',
  '64000000-0000-4000-8000-000000000011','65000000-0000-4000-8000-000000000011',
  '66000000-0000-4000-8000-000000000011',1,'qris','68000000-0000-4000-8000-000000000012'
);

DO $$
DECLARE
  v_sale_paid uuid;
  v_sale_expired uuid;
  v_payment_paid uuid;
  v_payment_expired uuid;
  v_result jsonb;
  v_locked boolean := false;
BEGIN
  SELECT id INTO v_sale_paid FROM public.sales
  WHERE client_transaction_id='68000000-0000-4000-8000-000000000011';
  SELECT id INTO v_sale_expired FROM public.sales
  WHERE client_transaction_id='68000000-0000-4000-8000-000000000012';
  SELECT id INTO v_payment_paid FROM public.payments WHERE sale_id=v_sale_paid AND method='qris';
  SELECT id INTO v_payment_expired FROM public.payments WHERE sale_id=v_sale_expired AND method='qris';

  BEGIN
    UPDATE public.sale_items SET quantity=2
    WHERE sale_id=v_sale_paid;
  EXCEPTION WHEN check_violation THEN
    v_locked := true;
  END;
  IF NOT v_locked THEN
    RAISE EXCEPTION 'Sale item mutation must be blocked while QRIS is pending';
  END IF;

  PERFORM set_config('request.jwt.claim.role','service_role',true);
  v_result := public.kt_apply_verified_qris_event(
    'test-provider','qris-paid-event-001','payment.paid',v_payment_paid,
    'qris-reference-paid-001','paid','{"test":true}'::jsonb
  );
  IF v_result->>'payment_status' IS DISTINCT FROM 'paid'
     OR v_result->>'sale_status' IS DISTINCT FROM 'paid' THEN
    RAISE EXCEPTION 'Paid event must transition payment and sale atomically; got %',v_result;
  END IF;
  IF (SELECT status FROM public.payments WHERE id=v_payment_paid) <> 'paid'
     OR (SELECT status FROM public.sales WHERE id=v_sale_paid) <> 'paid' THEN
    RAISE EXCEPTION 'Paid QRIS state was not persisted consistently';
  END IF;

  v_result := public.kt_apply_verified_qris_event(
    'test-provider','qris-expired-event-001','payment.expired',v_payment_expired,
    'qris-reference-expired-001','expired','{"test":true}'::jsonb
  );
  IF v_result->>'payment_status' IS DISTINCT FROM 'expired'
     OR v_result->>'sale_status' IS DISTINCT FROM 'cancelled' THEN
    RAISE EXCEPTION 'Expired event must expire payment and cancel pending sale; got %',v_result;
  END IF;
  IF (SELECT status FROM public.payments WHERE id=v_payment_expired) <> 'expired'
     OR (SELECT status FROM public.sales WHERE id=v_sale_expired) <> 'cancelled' THEN
    RAISE EXCEPTION 'Expired QRIS state was not persisted consistently';
  END IF;

  v_result := public.kt_apply_verified_qris_event(
    'test-provider','qris-paid-event-001','payment.paid',v_payment_paid,
    'qris-reference-paid-001','paid','{"test":true}'::jsonb
  );
  IF v_result->>'duplicate_event' IS DISTINCT FROM 'true'
     OR v_result->>'changed' IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'Repeated provider event must be idempotent; got %',v_result;
  END IF;
END
$$;

RESET ROLE;
ROLLBACK;
