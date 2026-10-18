# Staging Validation Checklist — Barber POS

Status: **test plan only; migrations have not been executed or validated against PostgreSQL**.

Target branch: `feat/initial-pos-foundation`  
Migrations in scope:
- `001_initial_pos_foundation.sql` — schema
- `002_enable_rls_lockdown.sql` — RLS enabled, no client policies
- `003_initial_read_policies.sql` — initial SELECT policies
- `004_cross_entity_integrity_guards.sql` — shift/device/branch and commission snapshot guards

## Vercel deployment note

- The repository's `main` branch was previously confirmed to contain only a README and no `package.json`; a deployment built from `main` may fail with `NEXT_NO_VERSION`.
- The Next.js app is on `feat/initial-pos-foundation`. Use a Vercel Preview Deployment for that branch while keeping `main` as the Production Branch until the pull request is reviewed and build/security checks have passed.
- After pushing code or documentation, inspect Vercel Deployments for a new Preview deployment. Its build log must identify `feat/initial-pos-foundation`. Do not merge the draft PR just to silence a build error.

## Safety gates

- [ ] Confirm the target project and database before running any migration.
- [ ] Confirm the database is an isolated staging project/database. A project being empty does not by itself prove it is a disposable staging environment.
- [ ] Review all four migrations as one ordered set: 001 → 002 → 003 → 004.
- [ ] Apply them in order and stop at the first SQL error. Do not continue by manually skipping statements.
- [ ] Do not put a service-role key in browser code, screenshots, GitHub, or test fixtures.
- [ ] Do not enable client writes until server-side transactional endpoints/RPCs and write authorization are reviewed.
- [ ] These migrations have not been executed or tested against the live project yet.

## 1. Preflight

Run in the staging SQL editor:

```sql
select current_database() as database_name,
       current_user as database_role,
       current_setting('server_version') as postgres_version;

select extname, extversion
from pg_extension
where extname in ('pgcrypto', 'btree_gist')
order by extname;

select table_schema, count(*) as existing_tables
from information_schema.tables
where table_schema = 'public'
  and table_type = 'BASE TABLE'
group by table_schema;
```

## 2. Post-migration schema checks

After migrations have been reviewed and applied in staging:

- [ ] Confirm expected application tables exist.
- [ ] Confirm RLS is enabled for all application tables.
- [ ] Confirm helper functions have the intended privileges and an empty `search_path`.
- [ ] Confirm authenticated has SELECT only on tables with read policies; provider events and idempotency records have no client table privileges.
- [ ] Confirm the integrity triggers from migration 004 exist and are enabled, including sale-item immutability.
- [ ] Confirm no client INSERT/UPDATE/DELETE policy has been added unintentionally.

## 3. Integrity guard tests

Use only disposable test fixtures in staging. These are negative tests: each invalid write should fail.

- [ ] A cash shift whose device belongs to a different branch is rejected.
- [ ] A sale whose branch or device does not match its shift is rejected.
- [ ] A sale whose device belongs to a different branch is rejected.
- [ ] A new online sale against a closed/review-required shift is rejected.
- [ ] A second shift cannot be opened on a device while its prior shift is open or awaiting review.
- [ ] A delayed offline sale within its shift's open/close timestamps is forced to `review_required` and `conflict`; verify sync flags/timestamps are assigned by trusted server code, not blindly accepted from the client.
- [ ] A delayed offline sale outside the shift window is rejected for manual reconciliation.
- [ ] A commission entry whose sale, barber, basis, rate, or amount differs from the source sale-item snapshot is rejected.
- [ ] Commission arithmetic uses the agreed half-up rounding formula.
- [ ] A finalized sale item or an item with a commission entry cannot be updated/deleted; corrections use adjustments/reversals.
- [ ] An inactive branch remains readable for authorized historical reporting, but cannot be used for new operations through the dedicated operation helper.
- [ ] Setting a branch membership to inactive removes branch access.

Also verify valid matching records can be inserted by the approved server-side path. Do not test by granting broad client write access.

## 4. Security and business-logic tests still required

- [ ] Test RLS with separate authenticated users for different branches and organizations.
- [ ] Implement and test server-side authorization for every write path.
- [ ] Recalculate subtotal, discount allocation, total, payment amount, and commission on the server; never trust client-supplied totals.
- [ ] Verify barber-to-auth-user mapping and role permissions.
- [ ] Verify offline sync idempotency, stale configuration review, duplicate submissions, and conflict handling.
- [ ] Verify QRIS signature validation, replay protection, event idempotency, and payment reconciliation after a provider is selected.
- [ ] Decide whether partial commission payouts are allowed; current schema has `UNIQUE (commission_entry_id)` in `commission_payout_items`, so one commission entry cannot be split across multiple payouts.
- [ ] Verify cross-entity invariants not covered by the current triggers, including barber/service eligibility at transaction time, sale totals versus sale items/payments, and verified QRIS events.
- [ ] Verify a closed-shift offline record cannot be forged merely by setting client-supplied timestamps or sync flags; server-side sync authentication and idempotency are mandatory.
- [ ] Run automated migration tests and a full application build before production rollout.

## Current project state

The dashboard is still a placeholder and the Supabase project has not yet had these application migrations applied. This checklist records planned validation; it is not a claim that the tests have passed.
