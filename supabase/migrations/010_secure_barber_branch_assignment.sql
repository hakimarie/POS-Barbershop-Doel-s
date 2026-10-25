-- KetemuTerus Barber POS — Migration 010
-- Secure barber master and branch assignment.
BEGIN;

CREATE OR REPLACE FUNCTION public.kt_save_barber_branch_assignment(
  p_barber_code text,
  p_full_name text,
  p_branch_id uuid
)
RETURNS TABLE(barber_id uuid, assignment_branch_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
  v_role text;
  v_barber_id uuid;
  v_barber_before jsonb;
  v_assignment_before jsonb;
  v_now timestamptz := clock_timestamp();
BEGIN
  v_user_id := (SELECT auth.uid());
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT u.organization_id, u.role INTO v_org_id, v_role
  FROM public.users u
  WHERE u.id = v_user_id AND u.is_active = true;

  IF NOT FOUND OR v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only an active owner or admin can manage barbers'
      USING ERRCODE = '42501';
  END IF;

  IF p_barber_code IS NULL OR length(trim(p_barber_code)) = 0 OR length(trim(p_barber_code)) > 40 THEN
    RAISE EXCEPTION 'Barber code is required and must be at most 40 characters'
      USING ERRCODE = '22023';
  END IF;
  IF p_full_name IS NULL OR length(trim(p_full_name)) = 0 OR length(trim(p_full_name)) > 120 THEN
    RAISE EXCEPTION 'Barber name is required and must be at most 120 characters'
      USING ERRCODE = '22023';
  END IF;
  IF p_branch_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.branches b
    WHERE b.id = p_branch_id AND b.organization_id = v_org_id AND b.is_active = true
  ) THEN
    RAISE EXCEPTION 'Active branch not found in this organization' USING ERRCODE = '23503';
  END IF;

  SELECT b.id, to_jsonb(b) INTO v_barber_id, v_barber_before
  FROM public.barbers b
  WHERE b.organization_id = v_org_id AND b.barber_code = upper(trim(p_barber_code))
  FOR UPDATE;

  IF v_barber_id IS NULL THEN
    INSERT INTO public.barbers (organization_id, barber_code, full_name, is_active)
    VALUES (v_org_id, upper(trim(p_barber_code)), trim(p_full_name), true)
    RETURNING id INTO v_barber_id;
  ELSE
    UPDATE public.barbers
    SET full_name = trim(p_full_name), is_active = true
    WHERE id = v_barber_id AND organization_id = v_org_id;
  END IF;

  SELECT to_jsonb(a) INTO v_assignment_before
  FROM public.barber_branch_assignments a
  WHERE a.organization_id = v_org_id
    AND a.barber_id = v_barber_id
    AND a.branch_id = p_branch_id
    AND a.effective_from <= v_now
    AND (a.effective_to IS NULL OR a.effective_to > v_now)
  LIMIT 1;

  IF v_assignment_before IS NULL THEN
    INSERT INTO public.barber_branch_assignments (
      organization_id, barber_id, branch_id, effective_from
    ) VALUES (v_org_id, v_barber_id, p_branch_id, v_now);
  END IF;

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) VALUES (
    v_org_id, v_user_id, 'barber_branch_assignment.saved', 'barber', v_barber_id,
    jsonb_build_object('barber', v_barber_before, 'assignment', v_assignment_before),
    jsonb_build_object(
      'barber_id', v_barber_id,
      'barber_code', upper(trim(p_barber_code)),
      'full_name', trim(p_full_name),
      'branch_id', p_branch_id,
      'assignment_active', true
    )
  );

  RETURN QUERY SELECT v_barber_id, p_branch_id;
END;
$$;

REVOKE ALL ON FUNCTION public.kt_save_barber_branch_assignment(text, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kt_save_barber_branch_assignment(text, text, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.kt_save_barber_branch_assignment(text, text, uuid) IS
  'Owner/admin-only create or reactivate barber and ensure current assignment to an active branch; writes audit log atomically.';

COMMIT;
