-- RLS smoke tests for the disposable PostgreSQL CI database.
-- Fixtures are inserted as the migration owner; assertions run as authenticated.
BEGIN;

INSERT INTO auth.users (id) VALUES
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000003'),
  ('20000000-0000-4000-8000-000000000001');

INSERT INTO public.organizations (id, name, slug) VALUES
  ('30000000-0000-4000-8000-000000000001', 'Test Org One', 'test-org-one'),
  ('30000000-0000-4000-8000-000000000002', 'Test Org Two', 'test-org-two');

INSERT INTO public.users (id, organization_id, full_name, email, role) VALUES
  ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Branch Manager', 'manager@example.test', 'manager'),
  ('10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', 'Other Manager', 'other@example.test', 'manager'),
  ('10000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001', 'Central Owner', 'central@example.test', 'owner'),
  ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', 'Other Tenant Owner', 'owner@example.test', 'owner');

INSERT INTO public.branches (id, organization_id, code, name) VALUES
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'A', 'Branch A'),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', 'B', 'Branch B'),
  ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000002', 'C', 'Branch C');

INSERT INTO public.branch_memberships (organization_id, branch_id, user_id) VALUES
  ('30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002'),
  ('30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003'),
  ('30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

DO $$
DECLARE
  visible_branches integer;
  visible_orgs integer;
BEGIN
  SELECT count(*) INTO visible_branches FROM public.branches;
  IF visible_branches <> 1 THEN
    RAISE EXCEPTION 'Branch manager should see exactly their assigned branch; saw %', visible_branches;
  END IF;

  SELECT count(*) INTO visible_orgs FROM public.organizations;
  IF visible_orgs <> 1 THEN
    RAISE EXCEPTION 'Branch manager should see exactly their own organization; saw %', visible_orgs;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.branches
    WHERE id IN (
      '40000000-0000-4000-8000-000000000002',
      '40000000-0000-4000-8000-000000000003'
    )
  ) THEN
    RAISE EXCEPTION 'Branch manager can see an unassigned branch or another tenant';
  END IF;

  -- Owner can see all branches in their own organization, but never another tenant.
  PERFORM set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
  SELECT count(*) INTO visible_branches FROM public.branches;
  IF visible_branches <> 2 THEN
    RAISE EXCEPTION 'Owner should see both branches in their organization; saw %', visible_branches;
  END IF;
  IF EXISTS (SELECT 1 FROM public.branches WHERE id = '40000000-0000-4000-8000-000000000003') THEN
    RAISE EXCEPTION 'Owner can see another tenant branch';
  END IF;

END
$;
-- Change membership as the migration owner, not as the authenticated test role.
RESET ROLE;
UPDATE public.branch_memberships
SET is_active = false
WHERE user_id = '10000000-0000-4000-8000-000000000001'
  AND branch_id = '40000000-0000-4000-8000-000000000001';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
DO $inactive_membership$
DECLARE
  visible_branches integer;
BEGIN
  SELECT count(*) INTO visible_branches FROM public.branches;
  IF visible_branches <> 0 THEN
    RAISE EXCEPTION 'Inactive membership must not grant branch visibility; saw % branches', visible_branches;
  END IF;
END
$inactive_membership$;

RESET ROLE;
ROLLBACK;
