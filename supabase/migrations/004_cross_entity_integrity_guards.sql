-- KetemuTerus Barber POS — Migration 004
-- Cross-entity integrity guards. Apply only after migrations 001–003 are reviewed.
-- These triggers supplement (not replace) server-side authorization and price calculation.

BEGIN;

CREATE OR REPLACE FUNCTION public.kt_guard_cash_shift_device_branch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_device_branch_id uuid;
BEGIN
  SELECT d.branch_id
    INTO v_device_branch_id
  FROM public.devices AS d
  WHERE d.id = NEW.device_id
    AND d.organization_id = NEW.organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cash shift device does not belong to this organization'
      USING ERRCODE = '23503';
  END IF;

  IF v_device_branch_id <> NEW.branch_id THEN
    RAISE EXCEPTION 'Cash shift branch must match device branch'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.kt_guard_cash_shift_device_branch() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kt_guard_cash_shift_device_branch() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_cash_shift_device_branch ON public.cash_shifts;
CREATE TRIGGER trg_guard_cash_shift_device_branch
BEFORE INSERT OR UPDATE OF organization_id, branch_id, device_id
ON public.cash_shifts
FOR EACH ROW
EXECUTE FUNCTION public.kt_guard_cash_shift_device_branch();


CREATE OR REPLACE FUNCTION public.kt_guard_sale_shift_device_branch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_shift_branch_id uuid;
  v_shift_device_id uuid;
  v_device_branch_id uuid;
BEGIN
  SELECT cs.branch_id, cs.device_id
    INTO v_shift_branch_id, v_shift_device_id
  FROM public.cash_shifts AS cs
  WHERE cs.id = NEW.shift_id
    AND cs.organization_id = NEW.organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale shift does not belong to this organization'
      USING ERRCODE = '23503';
  END IF;

  IF v_shift_branch_id <> NEW.branch_id OR v_shift_device_id <> NEW.device_id THEN
    RAISE EXCEPTION 'Sale branch and device must match its cash shift'
      USING ERRCODE = '23514';
  END IF;

  SELECT d.branch_id
    INTO v_device_branch_id
  FROM public.devices AS d
  WHERE d.id = NEW.device_id
    AND d.organization_id = NEW.organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale device does not belong to this organization'
      USING ERRCODE = '23503';
  END IF;

  IF v_device_branch_id <> NEW.branch_id THEN
    RAISE EXCEPTION 'Sale branch must match device branch'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.kt_guard_sale_shift_device_branch() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kt_guard_sale_shift_device_branch() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_sale_shift_device_branch ON public.sales;
CREATE TRIGGER trg_guard_sale_shift_device_branch
BEFORE INSERT OR UPDATE OF organization_id, branch_id, shift_id, device_id
ON public.sales
FOR EACH ROW
EXECUTE FUNCTION public.kt_guard_sale_shift_device_branch();


CREATE OR REPLACE FUNCTION public.kt_guard_commission_entry_matches_sale_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sale_id uuid;
  v_barber_id uuid;
  v_basis_amount bigint;
  v_rate_bps integer;
  v_commission_amount bigint;
BEGIN
  SELECT
    si.sale_id,
    si.barber_id,
    si.commission_basis_amount,
    si.commission_rate_bps_snapshot,
    si.commission_amount
  INTO
    v_sale_id,
    v_barber_id,
    v_basis_amount,
    v_rate_bps,
    v_commission_amount
  FROM public.sale_items AS si
  WHERE si.id = NEW.sale_item_id
    AND si.organization_id = NEW.organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commission entry sale item does not belong to this organization'
      USING ERRCODE = '23503';
  END IF;

  IF v_sale_id <> NEW.sale_id OR v_barber_id <> NEW.barber_id THEN
    RAISE EXCEPTION 'Commission entry sale and barber must match the source sale item'
      USING ERRCODE = '23514';
  END IF;

  IF v_rate_bps IS NULL THEN
    RAISE EXCEPTION 'Cannot create commission entry without a saved commission rate snapshot'
      USING ERRCODE = '23514';
  END IF;

  IF v_basis_amount <> NEW.basis_amount
     OR v_rate_bps <> NEW.rate_bps
     OR v_commission_amount <> NEW.commission_amount THEN
    RAISE EXCEPTION 'Commission entry amounts must match the source sale item snapshot'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.kt_guard_commission_entry_matches_sale_item() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kt_guard_commission_entry_matches_sale_item() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_commission_entry_matches_sale_item ON public.commission_entries;
CREATE TRIGGER trg_guard_commission_entry_matches_sale_item
BEFORE INSERT OR UPDATE OF organization_id, sale_id, sale_item_id, barber_id, basis_amount, rate_bps, commission_amount
ON public.commission_entries
FOR EACH ROW
EXECUTE FUNCTION public.kt_guard_commission_entry_matches_sale_item();

COMMIT;
