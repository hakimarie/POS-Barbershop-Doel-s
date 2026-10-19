-- KetemuTerus Barber POS — Migration 007
-- Admin-only atomic service catalogue and branch-price maintenance.
-- Direct table writes remain revoked from browser roles.

BEGIN;

CREATE OR REPLACE FUNCTION public.kt_save_service_and_price(
  p_service_id uuid,
  p_code text,
  p_name text,
  p_duration_minutes integer,
  p_is_active boolean,
  p_branch_id uuid,
  p_price_amount bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
  v_role text;
  v_service_id uuid;
  v_old_service jsonb;
  v_new_service jsonb;
  v_old_price bigint;
  v_now timestamptz := clock_timestamp();
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
    RAISE EXCEPTION 'Only an active owner or admin may maintain services and prices'
      USING ERRCODE = '42501';
  END IF;

  IF p_code IS NULL OR length(btrim(p_code)) < 1 OR length(btrim(p_code)) > 32
     OR p_name IS NULL OR length(btrim(p_name)) < 2 OR length(btrim(p_name)) > 120
     OR p_duration_minutes IS NULL OR p_duration_minutes < 5 OR p_duration_minutes > 480
     OR p_is_active IS NULL
     OR p_branch_id IS NULL
     OR p_price_amount IS NULL OR p_price_amount < 0 OR p_price_amount > 9000000000000000 THEN
    RAISE EXCEPTION 'Invalid service or price values' USING ERRCODE = '22023';
  END IF;

  IF NOT public.kt_can_operate_branch(p_branch_id) THEN
    RAISE EXCEPTION 'No operational access to this branch' USING ERRCODE = '42501';
  END IF;

  IF p_service_id IS NULL THEN
    INSERT INTO public.services (organization_id, code, name, duration_minutes, is_active)
    VALUES (v_org_id, upper(btrim(p_code)), btrim(p_name), p_duration_minutes, p_is_active)
    RETURNING id INTO v_service_id;
    v_old_service := NULL;
  ELSE
    SELECT to_jsonb(s) INTO v_old_service
    FROM public.services AS s
    WHERE s.id = p_service_id AND s.organization_id = v_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Service not found in this organization' USING ERRCODE = '23503';
    END IF;

    UPDATE public.services
    SET code = upper(btrim(p_code)),
        name = btrim(p_name),
        duration_minutes = p_duration_minutes,
        is_active = p_is_active
    WHERE id = p_service_id AND organization_id = v_org_id
    RETURNING id INTO v_service_id;
  END IF;

  SELECT bsp.price_amount INTO v_old_price
  FROM public.branch_service_prices AS bsp
  WHERE bsp.organization_id = v_org_id
    AND bsp.branch_id = p_branch_id
    AND bsp.service_id = v_service_id
    AND bsp.effective_from <= v_now
    AND (bsp.effective_to IS NULL OR bsp.effective_to > v_now)
  ORDER BY bsp.effective_from DESC
  LIMIT 1
  FOR UPDATE;

  IF v_old_price IS DISTINCT FROM p_price_amount THEN
    UPDATE public.branch_service_prices
    SET effective_to = v_now
    WHERE organization_id = v_org_id
      AND branch_id = p_branch_id
      AND service_id = v_service_id
      AND effective_to IS NULL
      AND effective_from < v_now;

    INSERT INTO public.branch_service_prices (
      organization_id, branch_id, service_id, price_amount, effective_from
    ) VALUES (
      v_org_id, p_branch_id, v_service_id, p_price_amount, v_now
    );
  END IF;

  SELECT to_jsonb(s) INTO v_new_service
  FROM public.services AS s
  WHERE s.id = v_service_id;

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) VALUES (
    v_org_id, v_user_id,
    CASE WHEN p_service_id IS NULL THEN 'service.create_and_price' ELSE 'service.update_and_price' END,
    'service', v_service_id, v_old_service,
    v_new_service || jsonb_build_object(
      'branch_id', p_branch_id,
      'branch_price_amount', p_price_amount,
      'previous_branch_price_amount', v_old_price
    )
  );

  RETURN jsonb_build_object(
    'service_id', v_service_id,
    'branch_id', p_branch_id,
    'price_amount', p_price_amount,
    'price_changed', v_old_price IS DISTINCT FROM p_price_amount
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Service code already exists in this organization' USING ERRCODE = '23505';
END;
$$;

REVOKE ALL ON FUNCTION public.kt_save_service_and_price(uuid, text, text, integer, boolean, uuid, bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kt_save_service_and_price(uuid, text, text, integer, boolean, uuid, bigint)
  TO authenticated;

COMMENT ON FUNCTION public.kt_save_service_and_price(uuid, text, text, integer, boolean, uuid, bigint) IS
  'Atomically creates or updates an organization service and the selected branch price. Owner/admin only; records audit log and keeps historical prices effective-dated.';

COMMIT;
