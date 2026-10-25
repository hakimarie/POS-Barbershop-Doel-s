-- Cash shift close and reconciliation acceptance test.
BEGIN;

INSERT INTO auth.users (id) VALUES ('61000000-0000-4000-8000-000000000021');
INSERT INTO public.organizations (id, name, slug)
VALUES ('62000000-0000-4000-8000-000000000021', 'Shift Close Test Org', 'shift-close-test-org');
INSERT INTO public.users (id, organization_id, full_name, email, role, is_active)
VALUES ('61000000-0000-4000-8000-000000000021',
        '62000000-0000-4000-8000-000000000021',
        'Shift Close Owner', 'shift-close-owner@example.test', 'owner', true);
INSERT INTO public.branches (id, organization_id, code, name, is_active)
VALUES ('63000000-0000-4000-8000-000000000021',
        '62000000-0000-4000-8000-000000000021', 'SHIFT-01', 'Shift Branch', true);
INSERT INTO public.devices (id, organization_id, branch_id, device_code, device_name, is_active)
VALUES ('64000000-0000-4000-8000-000000000021',
        '62000000-0000-4000-8000-000000000021',
        '63000000-0000-4000-8000-000000000021', 'SHIFT-POS-01', 'Shift Test Device', true);
INSERT INTO public.services (id, organization_id, code, name, duration_minutes, is_active)
VALUES ('65000000-0000-4000-8000-000000000021',
        '62000000-0000-4000-8000-000000000021', 'SHIFT-CUT', 'Shift Test Haircut', 30, true);
INSERT INTO public.branch_service_prices
  (organization_id, branch_id, service_id, price_amount, effective_from)
VALUES ('62000000-0000-4000-8000-000000000021',
        '63000000-0000-4000-8000-000000000021',
        '65000000-0000-4000-8000-000000000021', 50000, now() - interval '1 day');
INSERT INTO public.barbers (id, organization_id, barber_code, full_name, is_active)
VALUES ('66000000-0000-4000-8000-000000000021',
        '62000000-0000-4000-8000-000000000021', 'SHIFT-B01', 'Shift Test Barber', true);
INSERT INTO public.barber_branch_assignments
  (organization_id, barber_id, branch_id, effective_from)
VALUES ('62000000-0000-4000-8000-000000000021',
        '66000000-0000-4000-8000-000000000021',
        '63000000-0000-4000-8000-000000000021', now() - interval '1 day');
INSERT INTO public.cash_shifts
  (id, organization_id, branch_id, device_id, opened_by, opening_cash_amount, status)
VALUES ('67000000-0000-4000-8000-000000000021',
        '62000000-0000-4000-8000-000000000021',
        '63000000-0000-4000-8000-000000000021',
        '64000000-0000-4000-8000-000000000021',
        '61000000-0000-4000-8000-000000000021', 100000, 'open');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000021', true);

SELECT * FROM public.kt_checkout_sale(
  '63000000-0000-4000-8000-000000000021',
  '67000000-0000-4000-8000-000000000021',
  '64000000-0000-4000-8000-000000000021',
  '65000000-0000-4000-8000-000000000021',
  '66000000-0000-4000-8000-000000000021',
  1, 'cash', '68000000-0000-4000-8000-000000000021'
);

DO $shift_test$
DECLARE
  v_shift public.cash_shifts%ROWTYPE;
  v_retry public.cash_shifts%ROWTYPE;
  v_rejected boolean := false;
BEGIN
  v_shift := public.kt_close_cash_shift('67000000-0000-4000-8000-000000000021',150000,'End of day count');
  IF v_shift.status <> 'closed'
     OR v_shift.expected_cash_amount <> 150000
     OR v_shift.closing_cash_amount <> 150000
     OR v_shift.variance_amount <> 0 THEN
    RAISE EXCEPTION 'Exact cash reconciliation should close shift with zero variance; got %',row_to_json(v_shift);
  END IF;

  v_retry := public.kt_close_cash_shift('67000000-0000-4000-8000-000000000021',150000,'End of day count');
  IF v_retry.id IS DISTINCT FROM v_shift.id OR v_retry.closed_at IS DISTINCT FROM v_shift.closed_at THEN
    RAISE EXCEPTION 'Identical retry should return the already-closed shift without changing close time';
  END IF;

  BEGIN
    PERFORM public.kt_close_cash_shift('67000000-0000-4000-8000-000000000021',149000,'Different recount');
  EXCEPTION WHEN check_violation THEN
    v_rejected := true;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'Conflicting retry must not overwrite the stored reconciliation';
  END IF;
END
$shift_test$;

RESET ROLE;
ROLLBACK;
