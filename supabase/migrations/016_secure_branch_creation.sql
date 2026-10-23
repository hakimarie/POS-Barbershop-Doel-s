-- KetemuTerus Barber POS — Migration 016
-- Owner/admin-only branch creation with a default cashier device.
BEGIN;

CREATE OR REPLACE FUNCTION public.kt_create_branch(
  p_branch_name text
)
RETURNS TABLE(
  branch_id uuid,
  branch_code text,
  branch_name text,
  device_id uuid,
  device_code text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
  v_role text;
  v_code text;
  v_name text;
  v_branch_id uuid;
  v_device_id uuid;
  v_device_code text;
  v_now timestamptz := clock_timestamp();
BEGIN
  v_user_id := (SELECT auth.uid());
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT u.organization_id, u.role
    INTO v_org_id, v_role
  FROM public.users u
  WHERE u.id = v_user_id AND u.is_active = true;

  IF NOT FOUND OR v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only an active owner or admin can create branches'
      USING ERRCODE = '42501';
  END IF;

  IF p_branch_name IS NULL OR length(trim(p_branch_name)) = 0 OR length(trim(p_branch_name)) > 120 THEN
    RAISE EXCEPTION 'Branch name is required and must be at most 120 characters'
      USING ERRCODE = '22023';
  END IF;

  -- Serialize code allocation per organization to avoid concurrent duplicate codes.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_org_id::text, 0));

  SELECT 'C' || lpad((COALESCE(MAX(substring(b.code FROM 2)::integer), 0) + 1)::text, 2, '0')
    INTO v_code
  FROM public.branches b
  WHERE b.organization_id = v_org_id
    AND b.code ~ '^C[0-9]+$';

  v_name := trim(p_branch_name);
  v_device_code := 'POS-' || v_code || '-01';

  INSERT INTO public.branches (organization_id, code, name, is_active)
  VALUES (v_org_id, v_code, v_name, true)
  RETURNING id INTO v_branch_id;

  INSERT INTO public.devices (organization_id, branch_id, device_code, device_name, is_active)
  VALUES (v_org_id, v_branch_id, v_device_code, 'Kasir Utama - ' || v_code, true)
  RETURNING id INTO v_device_id;

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  )
  VALUES (
    v_org_id, v_user_id, 'branch.created', 'branch', v_branch_id,
    jsonb_build_object(
      'branch_id', v_branch_id,
      'code', v_code,
      'name', v_name,
      'default_device_id', v_device_id,
      'default_device_code', v_device_code,
      'created_at', v_now
    )
  );

  RETURN QUERY SELECT v_branch_id, v_code, v_name, v_device_id, v_device_code;
END;
$$;

REVOKE ALL ON FUNCTION public.kt_create_branch(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kt_create_branch(text) TO authenticated;

COMMENT ON FUNCTION public.kt_create_branch(text) IS
  'Owner/admin-only branch creation. Creates a default cashier device and writes an audit log.';

COMMIT;
