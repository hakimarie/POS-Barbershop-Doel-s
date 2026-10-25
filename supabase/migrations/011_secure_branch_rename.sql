-- KetemuTerus Barber POS — Migration 011
-- Owner/admin-only branch rename; stable branch IDs and codes are preserved.
BEGIN;

CREATE OR REPLACE FUNCTION public.kt_rename_branch(
  p_branch_id uuid,
  p_new_name text
)
RETURNS TABLE(branch_id uuid, branch_code text, branch_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
  v_role text;
  v_before jsonb;
  v_branch_code text;
  v_name text;
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
    RAISE EXCEPTION 'Only an active owner or admin can rename branches'
      USING ERRCODE = '42501';
  END IF;

  IF p_new_name IS NULL OR length(trim(p_new_name)) = 0 OR length(trim(p_new_name)) > 120 THEN
    RAISE EXCEPTION 'Branch name is required and must be at most 120 characters'
      USING ERRCODE = '22023';
  END IF;

  SELECT to_jsonb(b), b.code INTO v_before, v_branch_code
  FROM public.branches b
  WHERE b.id = p_branch_id
    AND b.organization_id = v_org_id
    AND b.is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active branch not found in this organization'
      USING ERRCODE = '23503';
  END IF;

  UPDATE public.branches
  SET name = trim(p_new_name)
  WHERE id = p_branch_id AND organization_id = v_org_id
  RETURNING name INTO v_name;

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id,
    before_data, after_data
  )
  VALUES (
    v_org_id, v_user_id, 'branch.renamed', 'branch', p_branch_id,
    v_before,
    jsonb_build_object(
      'branch_id', p_branch_id,
      'code', v_branch_code,
      'name', v_name,
      'changed_at', v_now
    )
  );

  RETURN QUERY SELECT p_branch_id, v_branch_code, v_name;
END;
$$;

REVOKE ALL ON FUNCTION public.kt_rename_branch(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kt_rename_branch(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.kt_rename_branch(uuid, text) IS
  'Owner/admin-only branch rename. Preserves branch ID/code and writes an audit log.';

COMMIT;
