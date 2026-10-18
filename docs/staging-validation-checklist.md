# Staging Validation Checklist — Barber POS

Status: **test plan only; not evidence that migrations have passed**.

Target branch: `feat/initial-pos-foundation`  
Migrations in scope:
- `001_initial_pos_foundation.sql` — schema
- `002_enable_rls_lockdown.sql` — RLS enabled, no client policies
- `003_initial_read_policies.sql` — initial SELECT policies

## Safety gates

- [ ] Use a disposable Supabase project or isolated staging database, not the production project.
- [ ] Confirm the target project and database before running any migration.
- [ ] Apply migrations in order, as one reviewed set: 001 → 002 → 003.
- [ ] Stop on the first SQL error. Do not continue by manually skipping statements.
- [ ] Do not put a service-role key in browser code, screenshots, GitHub, or test fixtures.
- [ ] Do not enable client writes until server-side transactional endpoints/RPCs and write authorization are reviewed.

## 1. Preflight: extension and migration state

Run in the staging SQL editor:

```sql
select current_database() as database_name,
       current_user as database_role,
       current_setting('server_version') as postgres_version;

select extname, extversion
from pg_extension
where extname in ('pgcrypto', 'btree_gist')
order by extname;
```

Expected: intended staging database; both extensions installed. This is a preflight only and does not apply the application schema.

## 2. Post-migration inventory

After all three migrations succeed in staging:

```sql
-- Expected application tables. Count and inspect names, not just a success message.
select tablename
from pg_tables
where schemaname = 'public'
  and tablename in (
    'organizations','users','branches','branch_memberships','devices',
    'services','branch_service_prices','barbers','barber_branch_assignments',
    'commission_tiers','commission_tier_versions','barber_commission_assignments',
    'cash_shifts','sales','sale_items','payments','payment_provider_events',
    'commission_entries','commission_review_cases','commission_payouts',
    'commission_payout_items','sale_adjustments','idempotency_records',
    'sync_batches','audit_logs'
  )
order by tablename;

-- Every application table should have RLS enabled.
select c.relname as table_name, c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'organizations','users','branches','branch_memberships','devices',
    'services','branch_service_prices','barbers','barber_branch_assignments',
    'commission_tiers','commission_tier_versions','barber_commission_assignments',
    'cash_shifts','sales','sale_items','payments','payment_provider_events',
    'commission_entries','commission_review_cases','commission_payouts',
    'commission_payout_items','sale_adjustments','idempotency_records',
    'sync_batches','audit_logs'
  )
order by c.relname;

-- Review the effective policy inventory.
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

Expected:
- 25 listed application tables exist.
- RLS is enabled on all 25 tables.
- Migration 003 adds SELECT policies only; there must not be client INSERT/UPDATE/DELETE policies yet.
- `payment_provider_events` and `idempotency_records` have no client-facing policies.
- Do not interpret RLS enabled as proof that every role/table combination is safe; run the role-based checks below.

## 3. Role-based RLS test matrix

Create synthetic fixtures only in staging. Use at least two organizations, two branches in organization A, one branch in organization B, an owner/admin, a manager assigned to only one branch, a cashier assigned to one branch, an inactive user, and an authenticated identity with no `public.users` profile.

Run each case as the corresponding authenticated JWT identity (Supabase test harness or equivalent), not as the SQL editor's privileged postgres role.

| Actor | Operation | Expected result |
|---|---|---|
| Owner/admin in org A | Read org A branches, including branches without a direct membership | Allowed |
| Owner/admin in org A | Read org B rows | Denied / zero rows |
| Manager assigned to branch A1 | Read branch A1 sales, shifts, devices and associated sale items/payments | Allowed |
| Manager assigned to branch A1 | Read branch A2 sales or branch B data | Denied / zero rows |
| Cashier assigned to branch A1 | Read branch A1 operational data | Allowed where the policy grants branch reads |
| Cashier | Read commission tiers, tier versions, payout records or audit logs | Denied / zero rows |
| Inactive user | Read organization/branch operational data | Denied / zero rows |
| Authenticated identity without profile | Read organization/branch operational data | Denied / zero rows |
| Any authenticated client | Insert/update/delete any application row | Denied; no write policies are present |
| Any authenticated client | Read provider webhook payloads or idempotency records | Denied / zero rows |

Record the test identity, role, query, expected result, actual result, and pass/fail. Do not use real customer or employee data.

## 4. Schema invariant tests

Before approving the schema, add and execute tests for:

- [ ] Two open shifts cannot exist for the same device; separate devices at one branch may each have an open shift.
- [ ] A sale's branch, cash shift, and device belong to the same organization and branch.
- [ ] A sale's cashier belongs to the same organization and is authorized for the branch.
- [ ] Each sale item references a service and barber valid for the sale's branch and transaction time.
- [ ] A barber has at most one effective commission assignment at any timestamp, across all branches.
- [ ] Commission uses the server-validated service price after the allocated item discount, with a stable tier/version snapshot.
- [ ] A stale offline commission configuration creates a review case and cannot be approved automatically.
- [ ] Duplicate offline transaction retries are idempotent; same idempotency key with a different request hash is rejected or escalated.
- [ ] Duplicate/out-of-order payment webhooks do not duplicate payment confirmation or sale transitions.
- [ ] Sale totals, payment totals, refunds, and commission amounts are recalculated and validated server-side.
- [ ] Commission payout semantics are explicit: current schema allows each commission entry in only one payout. Decide whether partial/split payouts are prohibited before retaining that constraint.
- [ ] A barber's application identity is explicitly mapped before any self-service commission/payout policies are added.

Foreign keys and CHECK constraints alone do not cover every invariant above; use reviewed database constraints and/or transactional server functions.

## 5. Security review before application integration

- [ ] Review all SECURITY DEFINER functions, ownership, execute grants, and fixed `search_path`.
- [ ] Confirm authenticated users cannot change their own role or organization profile.
- [ ] Confirm owner/admin bootstrap cannot be self-assigned through a public signup path.
- [ ] Confirm no service-role secret is present in `NEXT_PUBLIC_*` variables or browser bundles.
- [ ] Confirm provider signature verification and event processing are server-only.
- [ ] Confirm audit records are written by trusted server-side code and cannot be forged by clients.
- [ ] Confirm policies do not rely on a client-supplied organization ID, branch ID, role, price, commission rate, or payment status.
- [ ] Re-test RLS after every policy or schema change.

## Current known limitations

- These migrations have not been validated against the user's Supabase project.
- Migration 003 is a SELECT-policy baseline, not a complete production authorization model.
- Client writes, offline sync, QRIS processing, commission approval/payout workflows, and automated tests are not implemented.
- Do not connect a production UI or real payment provider until the above gates are addressed.
