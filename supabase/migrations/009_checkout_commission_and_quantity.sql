-- Migration 009: quantity-aware checkout with commission snapshots.
BEGIN;
DROP FUNCTION IF EXISTS public.kt_checkout_sale(uuid,uuid,uuid,uuid,uuid,text,uuid);

CREATE OR REPLACE FUNCTION public.kt_checkout_sale(
  p_branch_id uuid, p_shift_id uuid, p_device_id uuid, p_service_id uuid,
  p_barber_id uuid, p_quantity integer, p_payment_method text, p_client_transaction_id uuid
)
RETURNS TABLE(sale_id uuid, receipt_number text, sale_status text, total_amount bigint,
  commission_amount bigint, commission_rate_bps integer, commission_review_required boolean, payment_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_uid uuid := auth.uid(); v_org uuid; v_role text; v_now timestamptz := clock_timestamp();
  v_price bigint; v_service_name text; v_total bigint; v_sale uuid; v_receipt text;
  v_status text; v_pay_status text; v_existing public.sales%ROWTYPE;
  v_existing_item public.sale_items%ROWTYPE; v_existing_payment public.payments%ROWTYPE;
  v_assignment public.barber_commission_assignments%ROWTYPE;
  v_tier public.commission_tier_versions%ROWTYPE; v_tier_name text;
  v_rate integer; v_commission bigint := 0; v_review boolean := false; v_item uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT organization_id, role INTO v_org, v_role FROM public.users WHERE id=v_uid AND is_active;
  IF NOT FOUND OR v_role NOT IN ('owner','admin','manager','cashier') THEN RAISE EXCEPTION 'Active cashier profile required' USING ERRCODE='42501'; END IF;
  IF p_branch_id IS NULL OR p_shift_id IS NULL OR p_device_id IS NULL OR p_service_id IS NULL OR p_barber_id IS NULL OR p_client_transaction_id IS NULL THEN
    RAISE EXCEPTION 'Checkout fields are required' USING ERRCODE='22023';
  END IF;
  IF p_quantity IS NULL OR p_quantity NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Quantity must be 1 to 20' USING ERRCODE='22023'; END IF;
  IF p_payment_method NOT IN ('cash','qris') THEN RAISE EXCEPTION 'Unsupported payment method' USING ERRCODE='22023'; END IF;
  IF NOT public.kt_can_operate_branch(p_branch_id) THEN RAISE EXCEPTION 'Branch access denied' USING ERRCODE='42501'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_org::text || ':' || p_client_transaction_id::text,0));
  SELECT * INTO v_existing FROM public.sales WHERE organization_id=v_org AND client_transaction_id=p_client_transaction_id;
  IF FOUND THEN
    SELECT si.* INTO v_existing_item
    FROM public.sale_items AS si
    WHERE si.organization_id = v_org AND si.sale_id = v_existing.id
    LIMIT 1;
    SELECT pay.* INTO v_existing_payment
    FROM public.payments AS pay
    WHERE pay.organization_id = v_org AND pay.sale_id = v_existing.id
    LIMIT 1;
    IF v_existing.branch_id IS DISTINCT FROM p_branch_id OR v_existing.shift_id IS DISTINCT FROM p_shift_id
      OR v_existing.device_id IS DISTINCT FROM p_device_id OR v_existing_item.service_id IS DISTINCT FROM p_service_id
      OR v_existing_item.barber_id IS DISTINCT FROM p_barber_id OR v_existing_item.quantity IS DISTINCT FROM p_quantity
      OR v_existing_payment.method IS DISTINCT FROM p_payment_method THEN
      RAISE EXCEPTION 'Transaction ID reused with different details' USING ERRCODE='23505';
    END IF;
    RETURN QUERY SELECT v_existing.id,v_existing.receipt_number,v_existing.status,v_existing.total_amount,
      v_existing_item.commission_amount,v_existing_item.commission_rate_bps_snapshot,
      v_existing_item.commission_review_required,v_existing_payment.status;
    RETURN;
  END IF;

  PERFORM 1 FROM public.cash_shifts WHERE id=p_shift_id AND organization_id=v_org AND branch_id=p_branch_id
    AND device_id=p_device_id AND status='open' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Open shift required for this branch/device' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.devices WHERE id=p_device_id AND organization_id=v_org AND branch_id=p_branch_id AND is_active) THEN
    RAISE EXCEPTION 'Active device must belong to selected branch' USING ERRCODE='23514';
  END IF;

  SELECT s.name,p.price_amount INTO v_service_name,v_price FROM public.services s
    JOIN public.branch_service_prices p ON p.service_id=s.id AND p.organization_id=s.organization_id
  WHERE s.id=p_service_id AND s.organization_id=v_org AND s.is_active AND p.branch_id=p_branch_id
    AND p.effective_from<=v_now AND (p.effective_to IS NULL OR p.effective_to>v_now)
  ORDER BY p.effective_from DESC LIMIT 1 FOR SHARE OF p;
  IF NOT FOUND OR v_price<=0 THEN RAISE EXCEPTION 'No positive effective branch price for service' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.barbers b JOIN public.barber_branch_assignments a
    ON a.barber_id=b.id AND a.organization_id=b.organization_id
    WHERE b.id=p_barber_id AND b.organization_id=v_org AND b.is_active AND a.branch_id=p_branch_id
    AND a.effective_from<=v_now AND (a.effective_to IS NULL OR a.effective_to>v_now)) THEN
    RAISE EXCEPTION 'Active barber assignment required for this branch' USING ERRCODE='23514';
  END IF;
  v_total := v_price*p_quantity;

  SELECT * INTO v_assignment FROM public.barber_commission_assignments
  WHERE organization_id=v_org AND barber_id=p_barber_id AND effective_from<=v_now
    AND (effective_to IS NULL OR effective_to>v_now) ORDER BY effective_from DESC LIMIT 1;
  IF FOUND THEN
    SELECT * INTO v_tier FROM public.commission_tier_versions WHERE organization_id=v_org
      AND tier_id=v_assignment.tier_id AND effective_from<=v_now AND (effective_to IS NULL OR effective_to>v_now)
      ORDER BY effective_from DESC LIMIT 1;
    IF FOUND THEN
      SELECT name INTO v_tier_name FROM public.commission_tiers WHERE id=v_tier.tier_id AND organization_id=v_org AND is_active;
      IF FOUND THEN v_rate:=v_tier.rate_bps; v_commission:=((v_total*v_rate+5000)/10000);
      ELSE v_review:=true; END IF;
    ELSE v_review:=true; END IF;
  ELSE v_review:=true; END IF;

  v_receipt := 'KT-'||to_char(v_now AT TIME ZONE 'Asia/Jakarta','YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  v_status := CASE WHEN p_payment_method='cash' THEN 'paid' ELSE 'pending_payment' END;
  v_pay_status := CASE WHEN p_payment_method='cash' THEN 'paid' ELSE 'pending' END;
  INSERT INTO public.sales(organization_id,branch_id,shift_id,device_id,cashier_user_id,client_transaction_id,
    receipt_number,status,subtotal_amount,discount_amount,total_amount,currency,device_created_at,server_received_at,sync_status)
  VALUES(v_org,p_branch_id,p_shift_id,p_device_id,v_uid,p_client_transaction_id,v_receipt,v_status,
    v_total,0,v_total,'IDR',v_now,v_now,'synced') RETURNING id INTO v_sale;
  INSERT INTO public.sale_items(organization_id,sale_id,service_id,barber_id,service_name_snapshot,unit_price_amount,
    quantity,gross_amount,discount_amount,commission_basis_amount,commission_tier_version_id_snapshot,
    commission_tier_name_snapshot,commission_rate_bps_snapshot,commission_amount,commission_review_required)
  VALUES(v_org,v_sale,p_service_id,p_barber_id,v_service_name,v_price,p_quantity,v_total,0,v_total,
    CASE WHEN v_rate IS NULL THEN NULL ELSE v_tier.id END,CASE WHEN v_rate IS NULL THEN NULL ELSE v_tier_name END,
    v_rate,v_commission,v_review) RETURNING id INTO v_item;
  INSERT INTO public.payments(organization_id,sale_id,method,status,amount,provider,confirmed_at)
  VALUES(v_org,v_sale,p_payment_method,v_pay_status,v_total,CASE WHEN p_payment_method='qris' THEN 'manual_qris' ELSE NULL END,
    CASE WHEN p_payment_method='cash' THEN v_now ELSE NULL END);
  IF v_rate IS NOT NULL THEN
    INSERT INTO public.commission_entries(organization_id,sale_id,sale_item_id,barber_id,basis_amount,rate_bps,commission_amount,status)
    VALUES(v_org,v_sale,v_item,p_barber_id,v_total,v_rate,v_commission,'pending_approval');
  END IF;
  INSERT INTO public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,after_data)
  VALUES(v_org,v_uid,'sale.checkout_created','sale',v_sale,jsonb_build_object('receipt_number',v_receipt,
    'branch_id',p_branch_id,'service_id',p_service_id,'barber_id',p_barber_id,'quantity',p_quantity,
    'unit_price_amount',v_price,'total_amount',v_total,'payment_method',p_payment_method,
    'payment_status',v_pay_status,'commission_rate_bps',v_rate,'commission_amount',v_commission,'commission_review_required',v_review));
  RETURN QUERY SELECT v_sale,v_receipt,v_status,v_total,v_commission,v_rate,v_review,v_pay_status;
END;
$fn$;
REVOKE ALL ON FUNCTION public.kt_checkout_sale(uuid,uuid,uuid,uuid,uuid,integer,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.kt_checkout_sale(uuid,uuid,uuid,uuid,uuid,integer,text,uuid) TO authenticated;
COMMIT;
