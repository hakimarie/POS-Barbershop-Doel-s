-- KetemuTerus Barber POS — Migration 005
-- Secure cash-shift opening through a narrowly scoped authenticated RPC.
-- Browser roles still receive no direct INSERT/UPDATE/DELETE privileges.

BEGIN;

CREATE OR REPLACE FUNCTION public.kt_open_cash_shift(
  p_branch_id uuid,
  p_device_id uuid,
  p_opening_cash_amount bigint DEFAULT 0
)
RETURNS public.cash_shifts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
  v_role text;
  v_device_branch_id uuid;
  v_shift public.cash_shifts%ROWTYPE;
BEGIN
  v_user_id := (SELECT auth.uid());

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF p_branch_id IS NULL OR p_device_id IS NULL THEN
    RAISE EXCEPTION 'Branch and device are required'
      USING ERRCODE = '22023';
  END IF;

  IF p_opening_cash_amount IS NULL OR p_opening_cash_amount < 0 THEN
    RAISE EXCEPTION 'Opening cash amount must be zero or greater'
      USING ERRCODE = '22023';
  END IF;

  SELECT u.organization_id, u.role
    INTO v_org_id, v_role
  FROM public.users AS u
  WHERE u.id = v_user_id
    AND u.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active POS user profile required'
      USING ERRCODE = '42501';
  END IF;

  IF v_role NOT IN ('owner', 'admin', 'manager', 'cashier') THEN
    RAISE EXCEPTION 'This role is not allowed to open a cashier shift'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.kt_can_operate_branch(p_branch_id) THEN
    RAISE EXCEPTION 'No operational access to this branch'
      USING ERRCODE = '42501';
  END IF;

  -- Lock the device row so simultaneous open requests for the same device
  -- serialize. The partial unique index remains the final race-condition guard.
  SELECT d.branch_id
    INTO v_device_branch_id
  FROM public.devices AS d
  WHERE d.id = p_device_id
    AND d.organization_id = v_org_id
    AND d.is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active device not found in this organization'
      USING ERRCODE = '23503';
  END IF;

  IF v_device_branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'Selected device does not belong to the selected branch'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.cash_shifts (
    organization_id,
    branch_id,
    device_id,
    opened_by,
    opening_cash_amount,
    status
  )
  VALUES (
    v_org_id,
    p_branch_id,
    p_device_id,
    v_user_id,
    p_opening_cash_amount,
    'open'
  )
  RETURNING * INTO v_shift;

  RETURN v_shift;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'This device already has an open or review-required shift'
      USING ERRCODE = '23505';
END;
$$;

REVOKE ALL ON FUNCTION public.kt_open_cash_shift(uuid, uuid, bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kt_open_cash_shift(uuid, uuid, bigint)
  TO authenticated;

COMMENT ON FUNCTION public.kt_open_cash_shift(uuid, uuid, bigint) IS
  'Opens a cashier shift only for an active authorized POS user, an operationally accessible branch, and an active device assigned to that branch. Direct table writes remain revoked.';

COMMIT;
