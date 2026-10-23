-- Migration 015: secure, idempotent cashier shift closing and cash reconciliation.
BEGIN;

CREATE OR REPLACE FUNCTION public.kt_close_cash_shift(
  p_shift_id uuid,
  p_closing_cash_amount bigint,
  p_notes text DEFAULT NULL
)
RETURNS public.cash_shifts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $close_shift$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
  v_role text;
  v_shift public.cash_shifts%ROWTYPE;
  v_expected_cash bigint;
  v_variance bigint;
  v_before jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_shift_id IS NULL OR p_closing_cash_amount IS NULL OR p_closing_cash_amount < 0 THEN
    RAISE EXCEPTION 'Shift ID and non-negative closing cash amount are required'
      USING ERRCODE = '22023';
  END IF;
  IF p_notes IS NOT NULL AND length(btrim(p_notes)) > 1000 THEN
    RAISE EXCEPTION 'Shift closing notes must be at most 1000 characters'
      USING ERRCODE = '22023';
  END IF;

  SELECT u.organization_id, u.role INTO v_org_id, v_role
  FROM public.users AS u
  WHERE u.id = v_user_id AND u.is_active = true;
  IF NOT FOUND OR v_role NOT IN ('owner','admin','manager','cashier') THEN
    RAISE EXCEPTION 'Active cashier profile required to close a shift'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_shift
  FROM public.cash_shifts AS cs
  WHERE cs.id = p_shift_id AND cs.organization_id = v_org_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cash shift not found in this organization'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.kt_can_operate_branch(v_shift.branch_id) THEN
    RAISE EXCEPTION 'No operational access to this branch'
      USING ERRCODE = '42501';
  END IF;

  -- Safe retry: an identical close request returns the stored result without
  -- writing a second audit event. A conflicting retry must be reviewed manually.
  IF v_shift.status <> 'open' THEN
    IF v_shift.closing_cash_amount IS NOT DISTINCT FROM p_closing_cash_amount
       AND v_shift.notes IS NOT DISTINCT FROM NULLIF(btrim(p_notes), '') THEN
      RETURN v_shift;
    END IF;
    RAISE EXCEPTION 'Cash shift is already closed or requires review'
      USING ERRCODE = '23514';
  END IF;

  v_before := to_jsonb(v_shift);

  -- Count only settled cash tenders attached to sales in this shift.
  -- QRIS is deliberately excluded; refund method tracking is not yet modeled.
  SELECT v_shift.opening_cash_amount + COALESCE(SUM(p.amount), 0)
    INTO v_expected_cash
  FROM public.payments AS p
  JOIN public.sales AS s
    ON s.id = p.sale_id AND s.organization_id = p.organization_id
  WHERE p.organization_id = v_org_id
    AND s.shift_id = v_shift.id
    AND p.method = 'cash'
    AND p.status = 'paid'
    AND s.status = 'paid';

  v_variance := p_closing_cash_amount - v_expected_cash;

  UPDATE public.cash_shifts
  SET closed_by = v_user_id,
      closed_at = clock_timestamp(),
      closing_cash_amount = p_closing_cash_amount,
      expected_cash_amount = v_expected_cash,
      variance_amount = v_variance,
      notes = NULLIF(btrim(p_notes), ''),
      status = CASE WHEN v_variance = 0 THEN 'closed' ELSE 'review_required' END
  WHERE id = v_shift.id AND organization_id = v_org_id AND status = 'open'
  RETURNING * INTO v_shift;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cash shift changed concurrently; retry'
      USING ERRCODE = '40001';
  END IF;

  INSERT INTO public.audit_logs
    (organization_id, actor_user_id, action, entity_type, entity_id, before_data, after_data)
  VALUES
    (v_org_id, v_user_id, 'cash_shift.closed', 'cash_shift', v_shift.id,
     v_before,
     jsonb_build_object(
       'status', v_shift.status,
       'opening_cash_amount', v_shift.opening_cash_amount,
       'expected_cash_amount', v_shift.expected_cash_amount,
       'closing_cash_amount', v_shift.closing_cash_amount,
       'variance_amount', v_shift.variance_amount,
       'closed_by', v_user_id,
       'closed_at', v_shift.closed_at,
       'notes', v_shift.notes
     ));

  RETURN v_shift;
END;
$close_shift$;

REVOKE ALL ON FUNCTION public.kt_close_cash_shift(uuid,bigint,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kt_close_cash_shift(uuid,bigint,text)
  TO authenticated;

COMMENT ON FUNCTION public.kt_close_cash_shift(uuid,bigint,text) IS
  'Closes an open shift with server-calculated expected cash, discrepancy review state, audit trail, and idempotent identical retries. Expected cash includes settled cash tenders only; refund-method reconciliation is not modeled yet.';

COMMIT;
