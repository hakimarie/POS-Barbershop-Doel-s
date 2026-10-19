-- KetemuTerus Barber POS — Migration 006
-- One-time bootstrap for the first organization owner.
-- Create the first Auth user in Supabase Auth before calling this RPC.
-- This function can only succeed while no organization exists.

BEGIN;

CREATE OR REPLACE FUNCTION public.kt_bootstrap_initial_owner(
  p_organization_name text,
  p_organization_slug text,
  p_full_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_email text;
  v_org_id uuid;
BEGIN
  v_user_id := (SELECT auth.uid());

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF NULLIF(pg_catalog.btrim(p_organization_name), '') IS NULL
     OR NULLIF(pg_catalog.btrim(p_organization_slug), '') IS NULL
     OR NULLIF(pg_catalog.btrim(p_full_name), '') IS NULL THEN
    RAISE EXCEPTION 'Organization name, slug, and owner name are required'
      USING ERRCODE = '22023';
  END IF;

  IF p_organization_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION 'Organization slug must use lowercase letters, numbers, and single hyphens'
      USING ERRCODE = '22023';
  END IF;

  -- Serialize simultaneous first-owner attempts. The lock is transaction-scoped.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('kt_bootstrap_initial_owner', 0)
  );

  IF EXISTS (SELECT 1 FROM public.organizations) THEN
    RAISE EXCEPTION 'Initial bootstrap is already complete'
      USING ERRCODE = '42501';
  END IF;

  SELECT au.email
    INTO v_email
  FROM auth.users AS au
  WHERE au.id = v_user_id;

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Authenticated account email is unavailable'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.organizations (name, slug)
  VALUES (
    pg_catalog.btrim(p_organization_name),
    p_organization_slug
  )
  RETURNING id INTO v_org_id;

  INSERT INTO public.users (
    id,
    organization_id,
    full_name,
    email,
    role,
    is_active
  )
  VALUES (
    v_user_id,
    v_org_id,
    pg_catalog.btrim(p_full_name),
    v_email,
    'owner',
    true
  );

  RETURN v_org_id;
END;
$$;

REVOKE ALL ON FUNCTION public.kt_bootstrap_initial_owner(text, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kt_bootstrap_initial_owner(text, text, text)
  TO authenticated;

COMMENT ON FUNCTION public.kt_bootstrap_initial_owner(text, text, text) IS
  'One-time bootstrap: creates the first organization and owner profile for the currently authenticated Supabase Auth user. Refuses to run after any organization exists.';

COMMIT;
