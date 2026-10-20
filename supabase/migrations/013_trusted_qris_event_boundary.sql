-- Migration 013: trusted, idempotent QRIS payment state transition boundary.
-- A provider webhook/Edge Function MUST verify the provider signature and
-- amount/currency before calling this function with the service_role JWT.
-- This function is not itself a provider-signature verifier.
BEGIN;

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
BEGIN
  -- Supabase Edge Function / trusted backend only. Never expose service_role
  -- credentials to a browser, installed POS device, or client-side bundle.
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Trusted payment backend required' USING ERRCODE = '42501';
  END IF;

  IF p_provider IS NULL OR length(btrim(p_provider)) NOT BETWEEN 1 AND 64
     OR p_provider_event_id IS NULL OR length(btrim(p_provider_event_id)) NOT BETWEEN 1 AND 200
     OR p_event_type IS NULL OR length(btrim(p_event_type)) NOT BETWEEN 1 AND 100
     OR p_payment_id IS NULL
     OR p_provider_reference IS NULL OR length(btrim(p_provider_reference)) NOT BETWEEN 1 AND 200
     OR p_result_status NOT IN ('paid','failed','expired')
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
  WHERE id = p_payment_id
    AND method = 'qris'
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
  WHERE id = v_payment.sale_id
    AND organization_id = v_payment.organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale for QRIS payment not found' USING ERRCODE = '23503';
  END IF;

  -- Amount validation must happen in the webhook/Edge Function before this
  -- RPC. The DB still prevents a previously terminal payment being rewritten.
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

  IF p_result_status = 'paid' THEN
    UPDATE public.sales
    SET status = 'paid'
    WHERE id = v_sale.id
      AND organization_id = v_sale.organization_id
      AND status = 'pending_payment';
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
       'sale_id', v_payment.sale_id));

  RETURN jsonb_build_object('ok', true, 'duplicate_event', false, 'changed', true,
    'payment_id', v_payment.id, 'payment_status', p_result_status,
    'sale_id', v_sale.id,
    'sale_status', CASE WHEN p_result_status = 'paid' THEN 'paid' ELSE v_sale.status END);
END;
$fn$;

REVOKE ALL ON FUNCTION public.kt_apply_verified_qris_event(text,text,text,uuid,text,text,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kt_apply_verified_qris_event(text,text,text,uuid,text,text,jsonb)
  TO service_role;

COMMENT ON FUNCTION public.kt_apply_verified_qris_event(text,text,text,uuid,text,text,jsonb) IS
  'Applies an already-verified provider QRIS event atomically and idempotently. Must only be called by a trusted backend after provider signature, amount and currency verification.';

COMMIT;
