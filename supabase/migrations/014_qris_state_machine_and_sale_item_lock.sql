-- Migration 014: enforce sale/payment state transitions and freeze QRIS-pending sale items.
-- Provider signature, amount and currency verification must happen before migration 013's trusted RPC is called.
BEGIN;

CREATE OR REPLACE FUNCTION private.kt_guard_sale_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.status = 'pending_payment' AND NEW.status IN ('paid', 'cancelled', 'review_required'))
    OR (OLD.status = 'paid' AND NEW.status IN ('partially_refunded', 'refunded', 'review_required'))
    OR (OLD.status = 'partially_refunded' AND NEW.status IN ('refunded', 'review_required'))
    OR (OLD.status = 'review_required' AND NEW.status IN ('paid', 'cancelled', 'partially_refunded', 'refunded'))
  ) THEN
    RAISE EXCEPTION 'Invalid sale status transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.kt_guard_sale_status_transition() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_sale_status_transition ON public.sales;
CREATE TRIGGER trg_guard_sale_status_transition
BEFORE UPDATE OF status ON public.sales
FOR EACH ROW EXECUTE FUNCTION private.kt_guard_sale_status_transition();

CREATE OR REPLACE FUNCTION private.kt_guard_payment_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.status = 'pending' AND NEW.status IN ('paid', 'failed', 'expired', 'cancelled'))
    OR (OLD.status = 'paid' AND NEW.status IN ('reversed', 'partially_refunded', 'refunded'))
    OR (OLD.status = 'partially_refunded' AND NEW.status IN ('refunded', 'reversed'))
  ) THEN
    RAISE EXCEPTION 'Invalid payment status transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.kt_guard_payment_status_transition() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_payment_status_transition ON public.payments;
CREATE TRIGGER trg_guard_payment_status_transition
BEFORE UPDATE OF status ON public.payments
FOR EACH ROW EXECUTE FUNCTION private.kt_guard_payment_status_transition();

-- Extend the original snapshot guard to reject inserts into finalized sales too.
CREATE OR REPLACE FUNCTION private.kt_guard_finalized_sale_item_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $finalized$
DECLARE
  v_sale_id uuid;
  v_org_id uuid;
  v_sale_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_sale_id := OLD.sale_id;
    v_org_id := OLD.organization_id;
  ELSE
    v_sale_id := NEW.sale_id;
    v_org_id := NEW.organization_id;
  END IF;

  SELECT s.status INTO v_sale_status
  FROM public.sales AS s
  WHERE s.id = v_sale_id AND s.organization_id = v_org_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale item parent sale was not found' USING ERRCODE = '23503';
  END IF;

  IF v_sale_status IN ('paid', 'partially_refunded', 'refunded', 'cancelled', 'review_required') THEN
    RAISE EXCEPTION 'Cannot add or change sale items on a finalized sale'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' AND (
       NEW.sale_id IS DISTINCT FROM OLD.sale_id
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     ) THEN
    RAISE EXCEPTION 'Sale item cannot be moved between sales or organizations'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') AND EXISTS (
    SELECT 1 FROM public.commission_entries AS ce
    WHERE ce.organization_id = OLD.organization_id AND ce.sale_item_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'Sale item with a commission entry is immutable'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$finalized$;

REVOKE ALL ON FUNCTION private.kt_guard_finalized_sale_item_snapshot() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_finalized_sale_item_snapshot ON public.sale_items;
CREATE TRIGGER trg_guard_finalized_sale_item_snapshot
BEFORE INSERT OR UPDATE OR DELETE ON public.sale_items
FOR EACH ROW EXECUTE FUNCTION private.kt_guard_finalized_sale_item_snapshot();

-- Serialize item writes against the parent sale and freeze items while its QRIS payment is pending.
-- Checkout inserts the sale item before inserting the payment, so the initial checkout remains valid.
CREATE OR REPLACE FUNCTION private.kt_guard_qris_pending_sale_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sale_id uuid;
  v_org_id uuid;
  v_sale_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_sale_id := OLD.sale_id;
    v_org_id := OLD.organization_id;
  ELSE
    v_sale_id := NEW.sale_id;
    v_org_id := NEW.organization_id;
  END IF;

  SELECT s.status INTO v_sale_status
  FROM public.sales AS s
  WHERE s.id = v_sale_id AND s.organization_id = v_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale item parent sale not found'
      USING ERRCODE = '23503';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payments AS p
    WHERE p.organization_id = v_org_id
      AND p.sale_id = v_sale_id
      AND p.method = 'qris'
      AND p.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Sale items are locked while QRIS payment is pending'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.kt_guard_qris_pending_sale_item() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_qris_pending_sale_item ON public.sale_items;
CREATE TRIGGER trg_guard_qris_pending_sale_item
BEFORE INSERT OR UPDATE OR DELETE ON public.sale_items
FOR EACH ROW EXECUTE FUNCTION private.kt_guard_qris_pending_sale_item();

-- Keep event ingestion, payment transition, sale transition, and audit in one transaction.
-- Failed/expired QRIS payments must not leave a sale in pending_payment indefinitely.
CREATE OR REPLACE FUNCTION public.kt_apply_verified_qris_event(
  p_provider text,
  p_provider_event_id text,
  p_event_type text,
  p_payment_id uuid,
  p_provider_reference text,
  p_result_status text,
  p_verified_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_sale public.sales%ROWTYPE;
  v_inserted integer;
  v_now timestamptz := clock_timestamp();
  v_sale_status text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Trusted payment backend required' USING ERRCODE = '42501';
  END IF;

  IF p_provider IS NULL OR length(btrim(p_provider)) NOT BETWEEN 1 AND 64
     OR p_provider_event_id IS NULL OR length(btrim(p_provider_event_id)) NOT BETWEEN 1 AND 200
     OR p_event_type IS NULL OR length(btrim(p_event_type)) NOT BETWEEN 1 AND 100
     OR p_payment_id IS NULL
     OR p_provider_reference IS NULL OR length(btrim(p_provider_reference)) NOT BETWEEN 1 AND 200
     OR p_result_status IS NULL OR p_result_status NOT IN ('paid','failed','expired')
     OR p_verified_payload IS NULL THEN
    RAISE EXCEPTION 'Invalid verified provider event' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.payment_provider_events
    (provider, provider_event_id, event_type, payload, processing_status)
  VALUES
    (btrim(p_provider), btrim(p_provider_event_id), btrim(p_event_type),
     p_verified_payload, 'received')
  ON CONFLICT (provider, provider_event_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    RETURN jsonb_build_object('ok', true, 'duplicate_event', true, 'changed', false);
  END IF;

  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id AND method = 'qris'
  FOR UPDATE;

  IF NOT FOUND THEN
    UPDATE public.payment_provider_events
      SET processing_status = 'ignored', processed_at = v_now,
          processing_error = 'QRIS payment not found'
    WHERE provider = btrim(p_provider) AND provider_event_id = btrim(p_provider_event_id);
    RETURN jsonb_build_object('ok', false, 'ignored', true, 'reason', 'payment_not_found');
  END IF;

  SELECT * INTO v_sale
  FROM public.sales
  WHERE id = v_payment.sale_id AND organization_id = v_payment.organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale for QRIS payment not found' USING ERRCODE = '23503';
  END IF;

  IF v_payment.status IN ('failed','expired','cancelled','reversed','refunded','partially_refunded') THEN
    UPDATE public.payment_provider_events
      SET processing_status = 'ignored', processed_at = v_now,
          processing_error = 'Payment already in terminal state: ' || v_payment.status
    WHERE provider = btrim(p_provider) AND provider_event_id = btrim(p_provider_event_id);
    RETURN jsonb_build_object('ok', true, 'ignored', true, 'reason', 'payment_terminal');
  END IF;

  IF v_payment.status = 'paid' THEN
    UPDATE public.payment_provider_events
      SET processing_status = 'processed', processed_at = v_now
    WHERE provider = btrim(p_provider) AND provider_event_id = btrim(p_provider_event_id);
    RETURN jsonb_build_object('ok', true, 'duplicate_payment_confirmation', true, 'changed', false);
  END IF;

  IF v_payment.provider_reference IS NOT NULL
     AND v_payment.provider_reference IS DISTINCT FROM btrim(p_provider_reference) THEN
    UPDATE public.payment_provider_events
      SET processing_status = 'failed', processed_at = v_now,
          processing_error = 'Provider reference mismatch'
    WHERE provider = btrim(p_provider) AND provider_event_id = btrim(p_provider_event_id);
    RETURN jsonb_build_object('ok', false, 'ignored', true, 'reason', 'provider_reference_mismatch');
  END IF;

  UPDATE public.payments
  SET provider = btrim(p_provider),
      provider_reference = btrim(p_provider_reference),
      status = p_result_status,
      confirmed_at = CASE WHEN p_result_status = 'paid' THEN v_now ELSE confirmed_at END,
      updated_at = v_now
  WHERE id = v_payment.id
    AND organization_id = v_payment.organization_id
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'QRIS payment changed concurrently; retry event'
      USING ERRCODE = '40001';
  END IF;

  v_sale_status := v_sale.status;
  IF p_result_status = 'paid' THEN
    IF v_sale.status <> 'pending_payment' THEN
      RAISE EXCEPTION 'Cannot mark QRIS payment paid for sale status %', v_sale.status
        USING ERRCODE = '23514';
    END IF;
    UPDATE public.sales
      SET status = 'paid'
    WHERE id = v_sale.id AND organization_id = v_sale.organization_id
      AND status = 'pending_payment';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Sale changed concurrently; retry event' USING ERRCODE = '40001';
    END IF;
    v_sale_status := 'paid';
  ELSE
    IF v_sale.status = 'pending_payment' THEN
      UPDATE public.sales
        SET status = 'cancelled'
      WHERE id = v_sale.id AND organization_id = v_sale.organization_id
        AND status = 'pending_payment';
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Sale changed concurrently; retry event' USING ERRCODE = '40001';
      END IF;
      v_sale_status := 'cancelled';
    ELSIF v_sale.status <> 'cancelled' THEN
      RAISE EXCEPTION 'Cannot fail/expire QRIS payment for sale status %', v_sale.status
        USING ERRCODE = '23514';
    END IF;
  END IF;

  UPDATE public.payment_provider_events
    SET processing_status = 'processed', processed_at = v_now
  WHERE provider = btrim(p_provider) AND provider_event_id = btrim(p_provider_event_id);

  INSERT INTO public.audit_logs
    (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  VALUES
    (v_payment.organization_id, NULL, 'payment.provider_event_applied', 'payment', v_payment.id,
     jsonb_build_object('provider', btrim(p_provider),
       'provider_event_id', btrim(p_provider_event_id),
       'provider_reference', btrim(p_provider_reference),
       'payment_status', p_result_status,
       'sale_id', v_payment.sale_id,
       'sale_status', v_sale_status));

  RETURN jsonb_build_object('ok', true, 'duplicate_event', false, 'changed', true,
    'payment_id', v_payment.id, 'payment_status', p_result_status,
    'sale_id', v_sale.id, 'sale_status', v_sale_status);
END;
$fn$;

REVOKE ALL ON FUNCTION public.kt_apply_verified_qris_event(text,text,text,uuid,text,text,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kt_apply_verified_qris_event(text,text,text,uuid,text,text,jsonb)
  TO service_role;

COMMENT ON FUNCTION public.kt_apply_verified_qris_event(text,text,text,uuid,text,text,jsonb) IS
  'Applies an already-verified provider QRIS event atomically and idempotently. Caller must verify provider signature, amount and currency before calling.';

COMMIT;
