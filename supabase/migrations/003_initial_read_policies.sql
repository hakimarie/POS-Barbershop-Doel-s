-- KetemuTerus Barber POS — Migration 003
-- Initial least-privilege READ policies only.
-- All writes remain denied to anon/authenticated until transactional server
-- endpoints and explicit write policies/RPCs are reviewed.
BEGIN;

-- SECURITY DEFINER helpers avoid recursive RLS evaluation when policies need
-- to inspect the authenticated user's profile or branch membership.
CREATE OR REPLACE FUNCTION public.kt_current_org_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.organization_id
  FROM public.users AS u
  WHERE u.id = (SELECT auth.uid())
    AND u.is_active = true
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.kt_current_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.role
  FROM public.users AS u
  WHERE u.id = (SELECT auth.uid())
    AND u.is_active = true
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.kt_is_org_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(public.kt_current_role() IN ('owner','admin'), false)
$$;

CREATE OR REPLACE FUNCTION public.kt_can_access_branch(p_branch_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.branches b
    WHERE b.id = p_branch_id
      AND b.organization_id = public.kt_current_org_id()
      AND b.is_active = true
      AND (
        public.kt_is_org_admin()
        OR EXISTS (
          SELECT 1
          FROM public.branch_memberships bm
          WHERE bm.organization_id = b.organization_id
            AND bm.branch_id = b.id
            AND bm.user_id = (SELECT auth.uid())
        )
      )
  )
$$;

REVOKE ALL ON FUNCTION public.kt_current_org_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kt_current_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kt_is_org_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kt_can_access_branch(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kt_current_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.kt_current_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.kt_is_org_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.kt_can_access_branch(uuid) TO authenticated;

-- Organization and user profiles.
CREATE POLICY org_read_own ON public.organizations
  FOR SELECT TO authenticated
  USING (id = (SELECT public.kt_current_org_id()));

CREATE POLICY user_read_self_or_admin ON public.users
  FOR SELECT TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR (
      organization_id = (SELECT public.kt_current_org_id())
      AND (SELECT public.kt_is_org_admin())
    )
  );

-- Branch directory and branch assignments.
CREATE POLICY branch_read_authorized ON public.branches
  FOR SELECT TO authenticated
  USING (
    organization_id = (SELECT public.kt_current_org_id())
    AND (
      (SELECT public.kt_is_org_admin())
      OR (SELECT public.kt_can_access_branch(id))
    )
  );

CREATE POLICY branch_membership_read_authorized ON public.branch_memberships
  FOR SELECT TO authenticated
  USING (
    organization_id = (SELECT public.kt_current_org_id())
    AND (
      user_id = (SELECT auth.uid())
      OR (SELECT public.kt_is_org_admin())
      OR (SELECT public.kt_can_access_branch(branch_id))
    )
  );

CREATE POLICY device_read_authorized ON public.devices
  FOR SELECT TO authenticated
  USING (
    organization_id = (SELECT public.kt_current_org_id())
    AND (SELECT public.kt_can_access_branch(branch_id))
  );

-- Organization-level service catalogue is readable by active organization users.
CREATE POLICY service_read_org ON public.services
  FOR SELECT TO authenticated
  USING (organization_id = (SELECT public.kt_current_org_id()));

CREATE POLICY service_price_read_branch ON public.branch_service_prices
  FOR SELECT TO authenticated
  USING (
    organization_id = (SELECT public.kt_current_org_id())
    AND (SELECT public.kt_can_access_branch(branch_id))
  );

CREATE POLICY barber_read_org ON public.barbers
  FOR SELECT TO authenticated
  USING (organization_id = (SELECT public.kt_current_org_id()));

CREATE POLICY barber_branch_assignment_read_org ON public.barber_branch_assignments
  FOR SELECT TO authenticated
  USING (
    organization_id = (SELECT public.kt_current_org_id())
    AND (
      (SELECT public.kt_is_org_admin())
      OR (SELECT public.kt_can_access_branch(branch_id))
      OR barber_id IN (
        SELECT b.id FROM public.barbers b
        WHERE b.organization_id = (SELECT public.kt_current_org_id())
          AND EXISTS (
            SELECT 1 FROM public.branch_memberships bm
            WHERE bm.organization_id = b.organization_id
              AND bm.user_id = (SELECT auth.uid())
          )
      )
    )
  );

-- Sensitive commission configuration is restricted to owner/admin and the
-- signed-in barber's own active assignment/version information is not exposed
-- through these policies yet; implement a dedicated safe view for that use.
CREATE POLICY commission_tier_read_admin ON public.commission_tiers
  FOR SELECT TO authenticated
  USING (
    organization_id = (SELECT public.kt_current_org_id())
    AND (SELECT public.kt_is_org_admin())
  );

CREATE POLICY commission_tier_version_read_admin ON public.commission_tier_versions
  FOR SELECT TO authenticated
  USING (
    organization_id = (SELECT public.kt_current_org_id())
    AND (SELECT public.kt_is_org_admin())
  );

CREATE POLICY barber_commission_assignment_read_admin ON public.barber_commission_assignments
  FOR SELECT TO authenticated
  USING (
    organization_id = (SELECT public.kt_current_org_id())
    AND (SELECT public.kt_is_org_admin())
  );

-- Branch-level operational records: reads are limited to authorized branches.
CREATE POLICY cash_shift_read_branch ON public.cash_shifts
  FOR SELECT TO authenticated
  USING (
    organization_id = (SELECT public.kt_current_org_id())
    AND (SELECT public.kt_can_access_branch(branch_id))
  );

CREATE POLICY sale_read_branch ON public.sales
  FOR SELECT TO authenticated
  USING (
    organization_id = (SELECT public.kt_current_org_id())
    AND (SELECT public.kt_can_access_branch(branch_id))
  );

CREATE POLICY sale_item_read_authorized ON public.sale_items
  FOR SELECT TO authenticated
  USING (
    organization_id = (SELECT public.kt_current_org_id())
    AND EXISTS (
      SELECT 1 FROM public.sales s
      WHERE s.id = sale_items.sale_id
        AND s.organization_id = sale_items.organization_id
        AND (SELECT public.kt_can_access_branch(s.branch_id))
    )
  );

CREATE POLICY payment_read_authorized ON public.payments
  FOR SELECT TO authenticated
  USING (
    organization_id = (SELECT public.kt_current_org_id())
    AND EXISTS (
      SELECT 1 FROM public.sales s
      WHERE s.id = payments.sale_id
        AND s.organization_id = payments.organization_id
        AND (SELECT public.kt_can_access_branch(s.branch_id))
    )
  );

CREATE POLICY commission_entry_read_admin_or_branch_manager ON public.commission_entries
  FOR SELECT TO authenticated
  USING (
    organization_id = (SELECT public.kt_current_org_id())
    AND (
      (SELECT public.kt_is_org_admin())
      OR (
        (SELECT public.kt_current_role()) = 'manager'
        AND EXISTS (
          SELECT 1
          FROM public.sales s
          WHERE s.id = commission_entries.sale_id
            AND s.organization_id = commission_entries.organization_id
            AND (SELECT public.kt_can_access_branch(s.branch_id))
        )
      )
      OR (
        barber_id IN (
          SELECT b.id FROM public.barbers b
          WHERE b.organization_id = (SELECT public.kt_current_org_id())
            AND b.full_name IS NOT NULL
        )
        AND (SELECT public.kt_current_role()) = 'barber'
        AND EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.id = (SELECT auth.uid())
            AND u.organization_id = commission_entries.organization_id
        )
      )
    )
  );

CREATE POLICY commission_review_read_admin_manager ON public.commission_review_cases
  FOR SELECT TO authenticated
  USING (
    organization_id = (SELECT public.kt_current_org_id())
    AND (
      (SELECT public.kt_is_org_admin())
      OR (SELECT public.kt_current_role()) = 'manager'
    )
  );

CREATE POLICY commission_payout_read_admin_or_own_barber ON public.commission_payouts
  FOR SELECT TO authenticated
  USING (
    organization_id = (SELECT public.kt_current_org_id())
    AND (
      (SELECT public.kt_is_org_admin())
      OR (
        (SELECT public.kt_current_role()) = 'barber'
        AND EXISTS (
          SELECT 1 FROM public.barbers b
          WHERE b.id = commission_payouts.barber_id
            AND b.organization_id = commission_payouts.organization_id
            AND b.full_name IS NOT NULL
        )
      )
    )
  );

CREATE POLICY commission_payout_item_read_admin ON public.commission_payout_items
  FOR SELECT TO authenticated
  USING (
    organization_id = (SELECT public.kt_current_org_id())
    AND (SELECT public.kt_is_org_admin())
  );

CREATE POLICY sale_adjustment_read_branch ON public.sale_adjustments
  FOR SELECT TO authenticated
  USING (
    organization_id = (SELECT public.kt_current_org_id())
    AND EXISTS (
      SELECT 1 FROM public.sales s
      WHERE s.id = sale_adjustments.sale_id
        AND s.organization_id = sale_adjustments.organization_id
        AND (SELECT public.kt_can_access_branch(s.branch_id))
    )
  );

CREATE POLICY sync_batch_read_admin_or_device_branch ON public.sync_batches
  FOR SELECT TO authenticated
  USING (
    organization_id = (SELECT public.kt_current_org_id())
    AND (
      (SELECT public.kt_is_org_admin())
      OR EXISTS (
        SELECT 1 FROM public.devices d
        WHERE d.id = sync_batches.device_id
          AND d.organization_id = sync_batches.organization_id
          AND (SELECT public.kt_can_access_branch(d.branch_id))
      )
    )
  );

CREATE POLICY audit_log_read_admin ON public.audit_logs
  FOR SELECT TO authenticated
  USING (
    organization_id = (SELECT public.kt_current_org_id())
    AND (SELECT public.kt_is_org_admin())
  );

-- Intentionally no client-facing policies for provider events or idempotency
-- records. They are server-managed. There are also no INSERT/UPDATE/DELETE
-- policies yet: those operations remain denied to authenticated clients.

COMMIT;
