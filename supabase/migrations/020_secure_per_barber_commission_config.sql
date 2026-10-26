-- KetemuTerus Barber POS — Migration 020
-- Secure per-barber percentage commission configuration with effective-dated versions and audit trail.
BEGIN;

CREATE OR REPLACE FUNCTION public.kt_save_barber_commission_rate(
  p_barber_id uuid,
  p_rate_bps integer
)
RETURNS TABLE(barber_id uuid, tier_id uuid, rate_bps integer, effective_from timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
  v_role text;
  v_barber_code text;
  v_tier_id uuid;
  v_now timestamptz;
  v_version_before jsonb;
  v_assignment_before jsonb;
  v_old_version public.commission_tier_versions%ROWTYPE;
  v_old_assignment public.barber_commission_assignments%ROWTYPE;
  v_has_version boolean := false;
  v_has_assignment boolean := false;
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
    RAISE EXCEPTION 'Only an active owner or admin can manage barber commission rates'
      USING ERRCODE = '42501';
  END IF;

  IF p_barber_id IS NULL THEN
    RAISE EXCEPTION 'Barber is required' USING ERRCODE = '22023';
  END IF;
  IF p_rate_bps IS NULL OR p_rate_bps < 0 OR p_rate_bps > 10000 THEN
    RAISE EXCEPTION 'Commission rate must be between 0 and 10000 basis points'
      USING ERRCODE = '22023';
  END IF;

  SELECT b.barber_code
    INTO v_barber_code
  FROM public.barbers b
  WHERE b.id = p_barber_id
    AND b.organization_id = v_org_id
    AND b.is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active barber not found in this organization' USING ERRCODE = '23503';
  END IF;

  -- Lock the barber first; timestamp after acquiring the lock to keep effective periods ordered.
  v_now := clock_timestamp();

  SELECT t.id INTO v_tier_id
  FROM public.commission_tiers t
  WHERE t.organization_id = v_org_id
    AND t.name = 'Komisi Barber ' || upper(trim(v_barber_code))
  FOR UPDATE;

  IF v_tier_id IS NULL THEN
    INSERT INTO public.commission_tiers (organization_id, name, is_active)
    VALUES (v_org_id, 'Komisi Barber ' || upper(trim(v_barber_code)), true)
    RETURNING id INTO v_tier_id;
  ELSE
    UPDATE public.commission_tiers
    SET is_active = true
    WHERE id = v_tier_id AND organization_id = v_org_id;
  END IF;

  SELECT v.* INTO v_old_version
  FROM public.commission_tier_versions v
  WHERE v.organization_id = v_org_id
    AND v.tier_id = v_tier_id
    AND v.effective_to IS NULL
  FOR UPDATE;
  v_has_version := FOUND;

  IF v_has_version THEN
    IF v_old_version.effective_from >= v_now THEN
      RAISE EXCEPTION 'A future-dated commission rate exists; review it before changing the rate'
        USING ERRCODE = '22023';
    END IF;
    v_version_before := to_jsonb(v_old_version);
    UPDATE public.commission_tier_versions
    SET effective_to = v_now
    WHERE id = v_old_version.id;
  END IF;

  INSERT INTO public.commission_tier_versions (
    organization_id, tier_id, rate_bps, effective_from
  ) VALUES (
    v_org_id, v_tier_id, p_rate_bps, v_now
  );

  SELECT a.* INTO v_old_assignment
  FROM public.barber_commission_assignments a
  WHERE a.organization_id = v_org_id
    AND a.barber_id = p_barber_id
    AND a.effective_to IS NULL
  FOR UPDATE;
  v_has_assignment := FOUND;

  IF v_has_assignment THEN
    IF v_old_assignment.effective_from >= v_now THEN
      RAISE EXCEPTION 'A future-dated barber commission assignment exists; review it before changing the rate'
        USING ERRCODE = '22023';
    END IF;
    v_assignment_before := to_jsonb(v_old_assignment);
    IF v_old_assignment.tier_id <> v_tier_id THEN
      UPDATE public.barber_commission_assignments
      SET effective_to = v_now
      WHERE organization_id = v_org_id
        AND barber_id = p_barber_id
        AND tier_id = v_old_assignment.tier_id
        AND effective_from = v_old_assignment.effective_from;
      INSERT INTO public.barber_commission_assignments (
        organization_id, barber_id, tier_id, effective_from
      ) VALUES (v_org_id, p_barber_id, v_tier_id, v_now);
    END IF;
  ELSE
    INSERT INTO public.barber_commission_assignments (
      organization_id, barber_id, tier_id, effective_from
    ) VALUES (v_org_id, p_barber_id, v_tier_id, v_now);
  END IF;

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) VALUES (
    v_org_id, v_user_id, 'barber_commission_rate.saved', 'barber', p_barber_id,
    jsonb_build_object(
      'previous_rate_version', v_version_before,
      'previous_assignment', v_assignment_before
    ),
    jsonb_build_object(
      'barber_id', p_barber_id,
      'barber_code', upper(trim(v_barber_code)),
      'tier_id', v_tier_id,
      'rate_bps', p_rate_bps,
      'rate_percent', p_rate_bps::numeric / 100,
      'effective_from', v_now
    )
  );

  RETURN QUERY SELECT p_barber_id, v_tier_id, p_rate_bps, v_now;
END;
$$;

REVOKE ALL ON FUNCTION public.kt_save_barber_commission_rate(uuid, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kt_save_barber_commission_rate(uuid, integer)
  TO authenticated;

COMMENT ON FUNCTION public.kt_save_barber_commission_rate(uuid, integer) IS
  'Owner/admin-only per-barber commission configuration. Stores effective-dated rate snapshots and an audit log atomically; does not rewrite historical sales.';

COMMIT;
