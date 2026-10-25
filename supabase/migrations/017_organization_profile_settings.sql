-- KetemuTerus Barber POS — Migration 017
-- Organization profile settings with owner/admin-only write access.
BEGIN;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS receipt_logo_url text,
  ADD COLUMN IF NOT EXISTS operating_hours jsonb NOT NULL
    DEFAULT '{"mon":"09:00-21:00","tue":"09:00-21:00","wed":"09:00-21:00","thu":"09:00-21:00","fri":"09:00-21:00","sat":"09:00-21:00","sun":"09:00-21:00"}'::jsonb;

CREATE OR REPLACE FUNCTION public.kt_update_organization_profile(
  p_name text,
  p_address text,
  p_contact_phone text,
  p_receipt_logo_url text,
  p_operating_hours jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
  v_role text;
  v_before jsonb;
  v_after jsonb;
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
    RAISE EXCEPTION 'Only an active owner or admin can update organization profile'
      USING ERRCODE = '42501';
  END IF;

  IF p_name IS NULL OR length(pg_catalog.btrim(p_name)) = 0 OR length(pg_catalog.btrim(p_name)) > 120 THEN
    RAISE EXCEPTION 'Business name is required and must be at most 120 characters' USING ERRCODE = '22023';
  END IF;
  IF p_address IS NOT NULL AND length(p_address) > 300 THEN
    RAISE EXCEPTION 'Address must be at most 300 characters' USING ERRCODE = '22023';
  END IF;
  IF p_contact_phone IS NOT NULL AND length(p_contact_phone) > 40 THEN
    RAISE EXCEPTION 'Contact phone must be at most 40 characters' USING ERRCODE = '22023';
  END IF;
  IF p_receipt_logo_url IS NOT NULL AND length(p_receipt_logo_url) > 2048 THEN
    RAISE EXCEPTION 'Receipt logo URL must be at most 2048 characters' USING ERRCODE = '22023';
  END IF;
  IF p_receipt_logo_url IS NOT NULL AND p_receipt_logo_url !~* '^https://[^[:space:]]+$' THEN
    RAISE EXCEPTION 'Receipt logo must use an HTTPS URL' USING ERRCODE = '22023';
  END IF;
  IF p_operating_hours IS NULL OR pg_catalog.jsonb_typeof(p_operating_hours) <> 'object' THEN
    RAISE EXCEPTION 'Operating hours must be a JSON object' USING ERRCODE = '22023';
  END IF;

  SELECT pg_catalog.to_jsonb(o) INTO v_before
  FROM public.organizations o WHERE o.id = v_org_id FOR UPDATE;

  UPDATE public.organizations
  SET name = pg_catalog.btrim(p_name),
      address = NULLIF(pg_catalog.btrim(COALESCE(p_address, '')), ''),
      contact_phone = NULLIF(pg_catalog.btrim(COALESCE(p_contact_phone, '')), ''),
      receipt_logo_url = NULLIF(pg_catalog.btrim(COALESCE(p_receipt_logo_url, '')), ''),
      operating_hours = p_operating_hours,
      updated_at = pg_catalog.now()
  WHERE id = v_org_id;

  SELECT pg_catalog.to_jsonb(o) INTO v_after
  FROM public.organizations o WHERE o.id = v_org_id;

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) VALUES (
    v_org_id, v_user_id, 'organization.profile.updated', 'organization', v_org_id, v_before, v_after
  );
END;
$$;

REVOKE ALL ON FUNCTION public.kt_update_organization_profile(text,text,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kt_update_organization_profile(text,text,text,text,jsonb) TO authenticated;

COMMENT ON FUNCTION public.kt_update_organization_profile(text,text,text,text,jsonb) IS
  'Owner/admin-only update of organization name, contact details, receipt logo URL and operating hours, with audit logging.';

COMMIT;
