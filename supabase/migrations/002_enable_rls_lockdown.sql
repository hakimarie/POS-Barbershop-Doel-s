-- KetemuTerus Barber POS — Migration 002
-- Security baseline: enable RLS on every application table.
-- Intentionally defines NO client policies yet. This denies access through
-- anon/authenticated roles until reviewed, least-privilege policies are added.
-- Do not treat service_role access as an application authorization strategy.

BEGIN;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_service_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barber_branch_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_tier_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barber_commission_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_provider_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_review_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_payout_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

COMMIT;
