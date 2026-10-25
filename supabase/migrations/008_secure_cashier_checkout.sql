-- Migration 008: atomic checkout RPC. Direct table writes remain revoked.
BEGIN;
CREATE OR REPLACE FUNCTION public.kt_checkout_sale(
  p_branch_id uuid,
  p_shift_id uuid,
  p_device_id uuid,
  p_service_id uuid,
  p_barber_id uuid,
  p_payment_method text,
  p_client_transaction_id uuid
)
RETURNS TABLE(sale_id uuid, receipt_number text, sale_status text, total_amount bigint, payment_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_role text;
  v_now timestamptz := clock_timestamp();
  v_price bigint;
  v_service_name text;
  v_total bigint;
  v_sale uuid;
  v_receipt text;
  v_status text;
  v_pay_status text;
  v_existing public.sales%ROWTYPE;
  v_existing_method text;
  v_existing_service uuid;
  v_existing_barber uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT organization_id, role INTO v_org, v_role FROM public.users WHERE id=v_uid AND is_active;
  IF NOT FOUND OR v_role NOT IN ('owner','admin','manager','cashier') THEN
    RAISE EXCEPTION 'Active cashier profile required' USING ERRCODE='42501';
  END IF;
  IF p_branch_id IS NULL OR p_shift_id IS NULL OR p_device_id IS NULL OR p_service_id IS NULL
     OR p_barber_id IS NULL OR p_client_transaction_id IS NULL THEN
    RAISE EXCEPTION 'All checkout fields are required' USING ERRCODE='22023';
  END IF;
  IF p_payment_method NOT IN ('cash','qris') THEN RAISE EXCEPTION 'Unsupported payment method' USING ERRCODE='22023'; END IF;
  IF NOT public.kt_can_operate_branch(p_branch_id) THEN RAISE EXCEPTION 'Branch access denied' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_org::text || ':' || p_client_transaction_id::text, 0));
  SELECT * INTO v_existing FROM public.sales WHERE organization_id=v_org AND client_transaction_id=p_client_transaction_id;
  IF FOUND THEN
    SELECT method INTO v_existing_method FROM public.payments WHERE organization_id=v_org AND sale_id=v_existing.id LIMIT 1;
    SELECT service_id, barber_id INTO v_existing_service, v_existing_barber FROM public.sale_items WHERE organization_id=v_org AND sale_id=v_existing.id LIMIT 1;
    IF v_existing.branch_id IS DISTINCT FROM p_branch_id OR v_existing.shift_id IS DISTINCT FROM p_shift_id
       OR v_existing.device_id IS DISTINCT FROM p_device_id OR v_existing_service IS DISTINCT FROM p_service_id
       OR v_existing_barber IS DISTINCT FROM p_barber_id OR v_existing_method IS DISTINCT FROM p_payment_method THEN
      RAISE EXCEPTION 'Transaction key reused with different details' USING ERRCODE='23505';
    END IF;
    RETURN QUERY SELECT v_existing.id, v_existing.receipt_number, v_existing.status, v_existing.total_amount,
      (SELECT status FROM public.payments WHERE organization_id=v_org AND sale_id=v_existing.id LIMIT 1);
    RETURN;
  END IF;
  PERFORM 1 FROM public.cash_shifts WHERE id=p_shift_id AND organization_id=v_org AND branch_id=p_branch_id
    AND device_id=p_device_id AND status='open' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Open shift required for selected branch and device' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.devices WHERE id=p_device_id AND organization_id=v_org AND branch_id=p_branch_id AND is_active) THEN
    RAISE EXCEPTION 'Active device must belong to selected branch' USING ERRCODE='23514';
  END IF;
  SELECT s.name, p.price_amount INTO v_service_name, v_price
  FROM public.services s JOIN public.branch_service_prices p ON p.service_id=s.id AND p.organization_id=s.organization_id
  WHERE s.id=p_service_id AND s.organization_id=v_org AND s.is_active
    AND p.branch_id=p_branch_id AND p.effective_from<=v_now AND (p.effective_to IS NULL OR p.effective_to>v_now)
  ORDER BY p.effective_from DESC LIMIT 1 FOR SHARE OF p;
  IF NOT FOUND THEN RAISE EXCEPTION 'No active branch price found for service' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.barbers b JOIN public.barber_branch_assignments a
      ON a.barber_id=b.id AND a.organization_id=b.organization_id
      WHERE b.id=p_barber_id AND b.organization_id=v_org AND b.is_active
      AND a.branch_id=p_branch_id AND a.effective_from<=v_now AND (a.effective_to IS NULL OR a.effective_to>v_now)) THEN
    RAISE EXCEPTION 'Active barber assignment required for selected branch' USING ERRCODE='23514';
  END IF;
  IF v_price<=0 THEN RAISE EXCEPTION 'Service price must be positive' USING ERRCODE='22023'; END IF;
  v_total := v_price;
  v_receipt := 'KT-' || to_char(v_now AT TIME ZONE 'Asia/Jakarta','YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  v_status := CASE WHEN p_payment_method='cash' THEN 'paid' ELSE 'pending_payment' END;
  v_pay_status := CASE WHEN p_payment_method='cash' THEN 'paid' ELSE 'pending' END;
  INSERT INTO public.sales(organization_id,branch_id,shift_id,device_id,cashier_user_id,client_transaction_id,
    receipt_number,status,subtotal_amount,discount_amount,total_amount,currency,device_created_at,server_received_at,sync_status)
  VALUES(v_org,p_branch_id,p_shift_id,p_device_id,v_uid,p_client_transaction_id,v_receipt,v_status,
    v_total,0,v_total,'IDR',v_now,v_now,'synced') RETURNING id INTO v_sale;
  INSERT INTO public.sale_items(organization_id,sale_id,service_id,barber_id,service_name_snapshot,
    unit_price_amount,quantity,gross_amount,discount_amount,commission_basis_amount,commission_amount,commission_review_required)
  VALUES(v_org,v_sale,p_service_id,p_barber_id,v_service_name,v_price,1,v_total,0,v_total,0,true);
  INSERT INTO public.payments(organization_id,sale_id,method,status,amount,provider,confirmed_at)
  VALUES(v_org,v_sale,p_payment_method,v_pay_status,v_total,CASE WHEN p_payment_method='qris' THEN 'manual_qris' ELSE NULL END,
    CASE WHEN p_payment_method='cash' THEN v_now ELSE NULL END);
  INSERT INTO public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,after_data)
  VALUES(v_org,v_uid,'sale.checkout_created','sale',v_sale,jsonb_build_object('receipt_number',v_receipt,
    'branch_id',p_branch_id,'service_id',p_service_id,'barber_id',p_barber_id,'total_amount',v_total,
    'payment_method',p_payment_method,'payment_status',v_pay_status));
  RETURN QUERY SELECT v_sale,v_receipt,v_status,v_total,v_pay_status;
END;
$$;
REVOKE ALL ON FUNCTION public.kt_checkout_sale(uuid,uuid,uuid,uuid,uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kt_checkout_sale(uuid,uuid,uuid,uuid,uuid,text,uuid) TO authenticated;
COMMIT;
