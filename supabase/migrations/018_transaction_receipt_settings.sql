-- KetemuTerus Barber POS — Migration 018
-- Receipt presentation settings with owner/admin-only writes and audit logging.
BEGIN;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS receipt_footer text NOT NULL DEFAULT 'Terima kasih telah berkunjung!',
  ADD COLUMN IF NOT EXISTS receipt_show_cashier boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS receipt_show_barber boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS receipt_show_branch_address boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.kt_update_transaction_receipt_settings(
  p_receipt_footer text,
  p_show_cashier boolean,
  p_show_barber boolean,
  p_show_branch_address boolean
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
    RAISE EXCEPTION 'Only an active owner or admin can update receipt settings'
      USING ERRCODE = '42501';
  END IF;

  IF p_receipt_footer IS NULL OR length(p_receipt_footer) > 500 THEN
    RAISE EXCEPTION 'Receipt footer is required and must be at most 500 characters'
      USING ERRCODE = '22023';
  END IF;
  IF p_show_cashier IS NULL OR p_show_barber IS NULL OR p_show_branch_address IS NULL THEN
    RAISE EXCEPTION 'Receipt display options must be provided' USING ERRCODE = '22023';
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'receipt_footer', o.receipt_footer,
    'receipt_show_cashier', o.receipt_show_cashier,
    'receipt_show_barber', o.receipt_show_barber,
    'receipt_show_branch_address', o.receipt_show_branch_address
  ) INTO v_before
  FROM public.organizations o
  WHERE o.id = v_org_id
  FOR UPDATE;

  UPDATE public.organizations
  SET receipt_footer = p_receipt_footer,
      receipt_show_cashier = p_show_cashier,
      receipt_show_barber = p_show_barber,
      receipt_show_branch_address = p_show_branch_address,
      updated_at = pg_catalog.now()
  WHERE id = v_org_id;

  SELECT pg_catalog.jsonb_build_object(
    'receipt_footer', o.receipt_footer,
    'receipt_show_cashier', o.receipt_show_cashier,
    'receipt_show_barber', o.receipt_show_barber,
    'receipt_show_branch_address', o.receipt_show_branch_address
  ) INTO v_after
  FROM public.organizations o
  WHERE o.id = v_org_id;

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) VALUES (
    v_org_id, v_user_id, 'organization.receipt_settings.updated',
    'organization', v_org_id, v_before, v_after
  );
END;
$$;

REVOKE ALL ON FUNCTION public.kt_update_transaction_receipt_settings(text,boolean,boolean,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kt_update_transaction_receipt_settings(text,boolean,boolean,boolean) TO authenticated;

COMMENT ON FUNCTION public.kt_update_transaction_receipt_settings(text,boolean,boolean,boolean) IS
  'Owner/admin-only update of receipt display preferences, with audit logging. Does not alter sale totals or payment state.';

COMMIT;
