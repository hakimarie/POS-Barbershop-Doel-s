-- KetemuTerus Barber POS — Migration 007
-- Secure service catalogue and branch-specific effective-dated pricing.
BEGIN;

CREATE OR REPLACE FUNCTION public.kt_save_service_branch_price(
  p_service_id uuid,
  p_code text,
  p_name text,
  p_duration_minutes integer,
  p_branch_id uuid,
  p_price_amount bigint
)
RETURNS TABLE(service_id uuid, price_id uuid, effective_from timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
  v_role text;
  v_service_id uuid;
  v_price_id uuid;
  v_now timestamptz := clock_timestamp();
  v_old_price public.branch_service_prices%ROWTYPE;
  v_has_old_price boolean := false;
  v_service_before jsonb;
BEGIN
  v_user_id := (SELECT auth.uid());
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT u.organization_id, u.role
    INTO v_org_id, v_role
  FROM public.users AS u
  WHERE u.id = v_user_id AND u.is_active = true;

  IF NOT FOUND OR v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only an active owner or admin can manage services and prices'
      USING ERRCODE = '42501';
  END IF;

  IF p_code IS NULL OR length(trim(p_code)) = 0 OR length(trim(p_code)) > 40 THEN
    RAISE EXCEPTION 'Service code is required and must be at most 40 characters'
      USING ERRCODE = '22023';
  END IF;
  IF p_name IS NULL OR length(trim(p_name)) = 0 OR length(trim(p_name)) > 120 THEN
    RAISE EXCEPTION 'Service name is required and must be at most 120 characters'
      USING ERRCODE = '22023';
  END IF;
  IF p_duration_minutes IS NULL OR p_duration_minutes < 1 OR p_duration_minutes > 1440 THEN
    RAISE EXCEPTION 'Duration must be between 1 and 1440 minutes'
      USING ERRCODE = '22023';
  END IF;
  IF p_price_amount IS NULL OR p_price_amount < 0 THEN
    RAISE EXCEPTION 'Price must be zero or greater'
      USING ERRCODE = '22023';
  END IF;
  IF p_branch_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.branches b
    WHERE b.id = p_branch_id
      AND b.organization_id = v_org_id
      AND b.is_active = true
  ) THEN
    RAISE EXCEPTION 'Active branch not found in this organization'
      USING ERRCODE = '23503';
  END IF;

  IF p_service_id IS NULL THEN
    INSERT INTO public.services (organization_id, code, name, duration_minutes, is_active)
    VALUES (v_org_id, upper(trim(p_code)), trim(p_name), p_duration_minutes, true)
    RETURNING id INTO v_service_id;
  ELSE
    SELECT to_jsonb(s) INTO v_service_before
    FROM public.services s
    WHERE s.id = p_service_id
      AND s.organization_id = v_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Service not found in this organization'
        USING ERRCODE = '23503';
    END IF;

    UPDATE public.services
    SET code = upper(trim(p_code)),
        name = trim(p_name),
        duration_minutes = p_duration_minutes
    WHERE id = p_service_id AND organization_id = v_org_id
    RETURNING id INTO v_service_id;
  END IF;

  -- Serialize pricing changes for the same branch/service pair.
  PERFORM 1
  FROM public.services s
  WHERE s.id = v_service_id AND s.organization_id = v_org_id
  FOR UPDATE;

  SELECT p.* INTO v_old_price
  FROM public.branch_service_prices p
  WHERE p.organization_id = v_org_id
    AND p.branch_id = p_branch_id
    AND p.service_id = v_service_id
    AND p.effective_to IS NULL
  FOR UPDATE;
  v_has_old_price := FOUND;

  IF v_has_old_price AND v_old_price.effective_from >= v_now THEN
    RAISE EXCEPTION 'A future-dated price already exists for this branch and service'
      USING ERRCODE = '22023';
  END IF;

  IF v_has_old_price THEN
    UPDATE public.branch_service_prices
    SET effective_to = v_now
    WHERE id = v_old_price.id;
  END IF;

  INSERT INTO public.branch_service_prices (
    organization_id, branch_id, service_id, price_amount, effective_from
  )
  VALUES (v_org_id, p_branch_id, v_service_id, p_price_amount, v_now)
  RETURNING id INTO v_price_id;

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id,
    before_data, after_data
  )
  VALUES (
    v_org_id, v_user_id, 'service_branch_price.saved', 'service', v_service_id,
    jsonb_build_object(
      'service', v_service_before,
      'branch_id', p_branch_id,
      'previous_price_id', CASE WHEN v_has_old_price THEN v_old_price.id ELSE NULL END,
      'previous_price_amount', CASE WHEN v_has_old_price THEN v_old_price.price_amount ELSE NULL END
    ),
    jsonb_build_object(
      'service_id', v_service_id,
      'code', upper(trim(p_code)),
      'name', trim(p_name),
      'duration_minutes', p_duration_minutes,
      'branch_id', p_branch_id,
      'price_id', v_price_id,
      'price_amount', p_price_amount,
      'effective_from', v_now
    )
  );

  RETURN QUERY SELECT v_service_id, v_price_id, v_now;
END;
$$;

REVOKE ALL ON FUNCTION public.kt_save_service_branch_price(uuid, text, text, integer, uuid, bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kt_save_service_branch_price(uuid, text, text, integer, uuid, bigint)
  TO authenticated;

COMMENT ON FUNCTION public.kt_save_service_branch_price(uuid, text, text, integer, uuid, bigint) IS
  'Owner/admin-only service and branch price save. Ends the current price period, inserts a new effective-dated price, and records an audit log atomically.';

COMMIT;
