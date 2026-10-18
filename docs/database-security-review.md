# Database Security Review — Barber POS

Status: **pre-implementation review; not production-ready**  
Scope: migrations 001–003 and the initial Next.js scaffold.

## Immediate safety rule

Do not execute migration 001 by itself. Migration 001 creates application tables but does not enable Row Level Security (RLS). Migration 002 enables RLS on every application table without client policies; migration 003 adds a limited SELECT-only policy baseline. Even with migration 003, client writes remain denied, and the policies have not been tested against the actual Supabase project.

Apply migrations only in a controlled review/staging step, in order. Do not expose a Supabase service-role key to the browser. Service-role access bypasses RLS and must remain server-side and narrowly scoped.

Use the [staging validation checklist](staging-validation-checklist.md) for preflight checks, schema/RLS inventory, and the role-based test matrix.

## Confirmed product rules to preserve

- One owner can monitor all 10 branches.
- Branch-level prices may differ.
- Commission is a percentage of the service item price after its allocated discount.
- Each barber has one active commission tier at a time, consistently across branches.
- Offline transactions with stale commission configuration must be held for review before commission approval.
- Cash and QRIS are supported; QRIS confirmation must be verified server-side from provider events.
- Each device/register may have at most one open cash shift; separate devices at one branch may have separate shifts.
- Offline transaction sync must be idempotent and conflicts must be reviewable.

## Findings to resolve before production

1. **RLS policy baseline is incomplete.** Migration 002 enables RLS; migration 003 adds only SELECT policies. No client INSERT/UPDATE/DELETE operations are authorized. This is intentionally fail-closed, but the app is not yet usable for transactional POS workflows.
2. **Role and branch authorization must be enforced server-side and in RLS.** Do not trust a role, organization ID, branch ID, price, commission rate, or payment status supplied by the browser.
3. **Cross-entity consistency needs stronger enforcement or transactional validation.** Current foreign keys do not fully guarantee that a sale's shift and device belong to the same branch, or that every sale item uses a service/barber valid for that branch at transaction time.
4. **Provider events are global and have no organization ID.** Keep `payment_provider_events` server-only; validate provider signatures and event idempotency before changing payment/sale state.
5. **Commission payout semantics need a business decision.** `UNIQUE (commission_entry_id)` in `commission_payout_items` permits a commission entry to be paid in only one payout. Keep it only if partial/split payouts are explicitly prohibited.
6. **Offline sync needs a trusted server transaction.** The browser must not directly mark a payment as paid, approve a commission, close a shift, or bypass a stale-configuration review. Use authenticated server endpoints/RPC with idempotency and audit logging.
7. **Money and totals need transactional validation.** Recalculate line totals, allocated discounts, sale totals, payment sums, refunds, and commissions on the server; do not rely only on client-calculated values or CHECK constraints.
8. **Authentication lifecycle needs handling.** The `users` profile references `auth.users`; onboarding must create the organization/profile through a controlled server-side flow and must not let a user self-assign the owner role.
9. **Barber identity mapping is missing.** There is no explicit link between a barber record and a Supabase Auth identity. Do not infer the link from names, phone numbers, or organization membership. Barber self-service commission/payout access must wait until a validated mapping exists.

## Migration and policy status

- Migration 001 creates the core schema and indexes.
- Migration 002 enables RLS across the 25 application tables and intentionally creates no policies.
- Migration 003 adds fixed-`search_path` SECURITY DEFINER helpers and initial organization/branch-scoped SELECT policies. PUBLIC execution is revoked from these helpers; execute is granted to `authenticated`.
- The helper functions and policies have **not** been run against the Supabase project or validated with automated tests.
- PostgreSQL extensions `pgcrypto` and `btree_gist` are installed in the project.
- Migration 001 has not been applied to the Supabase database as of the latest user confirmation.
- The Next.js UI is a scaffold, not a connected or tested POS.

## RLS baseline limitations

- No client-facing INSERT/UPDATE/DELETE policies have been added.
- `payment_provider_events` and `idempotency_records` remain server-managed and have no client policies.
- Commission tier configuration and payout records are restricted to organization owner/admin in the initial read baseline.
- Manager commission/review access is scoped through authorized branch membership.
- The current schema does not grant barber self-service access to their own commission/payout records.
- RLS enabled is not proof of security. Tests must execute as realistic authenticated identities, not only as the privileged SQL editor role.

## Required next implementation steps

1. Validate migrations 001–003 in a disposable/staging Supabase project using the [staging validation checklist](staging-validation-checklist.md).
2. Add automated RLS tests for cross-organization denial, cross-branch denial, owner access across branches, inactive users, missing profiles, and role boundaries.
3. Add database constraints and/or transactional server checks for shift/device/branch consistency and valid service/barber assignments.
4. Decide whether commission payouts can be split; adjust the uniqueness rule if partial payouts are required.
5. Design trusted transactional endpoints/RPCs for sale creation, shift lifecycle, offline sync, payment confirmation, commission approval, and payout. Keep privileged operations server-side and log them.
6. Add explicit barber-user mapping before implementing barber self-service policies.
7. Only after review and staging tests pass, consider applying migrations to the intended production project and verify table/RLS state.

## Release gate

**Do not treat this branch as production-ready.** Do not apply migrations 001–003 to the live project yet. No production writes, QRIS integration, or offline-sync rollout should proceed until schema validation, authorization tests, transactional server logic, and the remaining business decisions are complete.
