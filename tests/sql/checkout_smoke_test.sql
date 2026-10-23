-- Checkout acceptance smoke tests on disposable PostgreSQL.
-- Validates server-side total calculation, QRIS pending state and idempotency.
BEGIN;

INSERT INTO auth.users (id) VALUES ('61000000-0000-4000-8000-000000000001');
INSERT INTO public.organizations (id, name, slug)
VALUES ('62000000-0000-4000-8000-000000000001', 'Checkout Test Org', 'checkout-test-org');
INSERT INTO public.users (id, organization_id, full_name, email, role, is_active)
VALUES ('61000000-0000-4000-8000-000000000001',
        '62000000-0000-4000-8000-000000000001',
        'Checkout Owner', 'checkout-owner@example.test', 'owner', true);
INSERT INTO public.branches (id, organization_id, code, name, is_active)
VALUES ('63000000-0000-4000-8000-000000000001',
        '62000000-0000-4000-8000-000000000001', 'CHECKOUT-01', 'Checkout Branch', true);
INSERT INTO public.devices (id, organization_id, branch_id, device_code, device_name, is_active)
VALUES ('64000000-0000-4000-8000-000000000001',
        '62000000-0000-4000-8000-000000000001',
        '63000000-0000-4000-8000-000000000001', 'POS-01', 'Checkout Device', true);
INSERT INTO public.services (id, organization_id, code, name, duration_minutes, is_active)
VALUES ('65000000-0000-4000-8000-000000000001',
        '62000000-0000-4000-8000-000000000001', 'CUT-TEST', 'Test Haircut', 30, true);
INSERT INTO public.branch_service_prices
  (organization_id, branch_id, service_id, price_amount, effective_from)
VALUES ('62000000-0000-4000-8000-000000000001',
        '63000000-0000-4000-8000-000000000001',
        '65000000-0000-4000-8000-000000000001', 50000, now() - interval '1 day');
INSERT INTO public.barbers (id, organization_id, barber_code, full_name, is_active)
VALUES ('66000000-0000-4000-8000-000000000001',
        '62000000-0000-4000-8000-000000000001', 'BARBER-01', 'Test Barber', true);
INSERT INTO public.barber_branch_assignments
  (organization_id, barber_id, branch_id, effective_from)
VALUES ('62000000-0000-4000-8000-000000000001',
        '66000000-0000-4000-8000-000000000001',
        '63000000-0000-4000-8000-000000000001', now() - interval '1 day');
INSERT INTO public.cash_shifts
  (id, organization_id, branch_id, device_id, opened_by, opening_cash_amount, status)
VALUES ('67000000-0000-4000-8000-000000000001',
        '62000000-0000-4000-8000-000000000001',
        '63000000-0000-4000-8000-000000000001',
        '64000000-0000-4000-8000-000000000001',
        '61000000-0000-4000-8000-000000000001', 0, 'open');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000001', true);

DO $$
DECLARE
  v_first record;
  v_replay record;
  v_rejected_reuse boolean := false;
BEGIN
  SELECT * INTO v_first
  FROM public.kt_checkout_sale(
    '63000000-0000-4000-8000-000000000001',
    '67000000-0000-4000-8000-000000000001',
    '64000000-0000-4000-8000-000000000001',
    '65000000-0000-4000-8000-000000000001',
    '66000000-0000-4000-8000-000000000001',
    2, 'qris', '68000000-0000-4000-8000-000000000001'
  );

  IF v_first.sale_id IS NULL OR v_first.total_amount <> 100000
     OR v_first.sale_status <> 'pending_payment'
     OR v_first.payment_status <> 'pending' THEN
    RAISE EXCEPTION 'Checkout must calculate 2 x Rp50,000 and leave QRIS pending; got %', row_to_json(v_first);
  END IF;

  SELECT * INTO v_replay
  FROM public.kt_checkout_sale(
    '63000000-0000-4000-8000-000000000001',
    '67000000-0000-4000-8000-000000000001',
    '64000000-0000-4000-8000-000000000001',
    '65000000-0000-4000-8000-000000000001',
    '66000000-0000-4000-8000-000000000001',
    2, 'qris', '68000000-0000-4000-8000-000000000001'
  );

  IF v_replay.sale_id IS DISTINCT FROM v_first.sale_id
     OR v_replay.receipt_number IS DISTINCT FROM v_first.receipt_number THEN
    RAISE EXCEPTION 'Retry with the same transaction ID must return the original sale';
  END IF;

  BEGIN
    PERFORM * FROM public.kt_checkout_sale(
      '63000000-0000-4000-8000-000000000001',
      '67000000-0000-4000-8000-000000000001',
      '64000000-0000-4000-8000-000000000001',
      '65000000-0000-4000-8000-000000000001',
      '66000000-0000-4000-8000-000000000001',
      3, 'qris', '68000000-0000-4000-8000-000000000001'
    );
  EXCEPTION WHEN unique_violation THEN
    v_rejected_reuse := true;
  END;

  IF NOT v_rejected_reuse THEN
    RAISE EXCEPTION 'Transaction ID reuse with changed quantity must be rejected';
  END IF;

  IF (SELECT count(*) FROM public.sales
      WHERE organization_id = '62000000-0000-4000-8000-000000000001'
        AND client_transaction_id = '68000000-0000-4000-8000-000000000001') <> 1 THEN
    RAISE EXCEPTION 'Idempotent checkout must create exactly one sale';
  END IF;

  IF (SELECT count(*) FROM public.payments p JOIN public.sales s
      ON s.id=p.sale_id AND s.organization_id=p.organization_id
      WHERE s.client_transaction_id = '68000000-0000-4000-8000-000000000001') <> 1 THEN
    RAISE EXCEPTION 'Idempotent checkout must create exactly one payment';
  END IF;
END
$$;

RESET ROLE;
ROLLBACK;
