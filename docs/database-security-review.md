# Database Security Review — Barber POS

Status: **pre-implementation review; not production-ready**  
Scope: `supabase/migrations/001_initial_pos_foundation.sql` and the RLS lockdown migration.

## Immediate safety rule

Do not execute migration 001 by itself. Migration 001 creates application tables but does not enable Row Level Security (RLS). Migration 002 enables RLS on every table and deliberately creates no client-access policies yet. Until least-privilege policies are reviewed and added, Supabase `anon` and `authenticated` access is expected to be denied. This is a safe interim lock, not a usable application authorization configuration.

Apply migrations only in a controlled review/staging step, in order. Do not expose a Supabase service-role key to the browser. Service-role access bypasses RLS and must remain server-side and narrowly scoped.

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

1. **RLS policies are absent in migration 001.** Migration 002 enables RLS without adding policies, so authenticated app access remains locked until explicit policies are implemented.
2. **Role and branch authorization must be enforced server-side and in RLS.** Do not trust a role, organization ID, branch ID, price, commission rate, or payment status supplied by the browser.
3. **Cross-entity consistency needs stronger enforcement or transactional validation.** The current foreign keys prove that referenced rows belong to an organization, but do not fully guarantee that a sale's shift and device belong to the same branch, or that every sale item uses a service/barber valid for that branch at transaction time.
4. **Provider events are global and have no organization ID.** Keep `payment_provider_events` server-only; validate provider signatures and event idempotency before changing payment/sale state.
5. **Commission payout semantics need a business decision.** `UNIQUE (commission_entry_id)` in `commission_payout_items` permits a commission entry to be paid in only one payout. Keep it only if partial/split payouts are explicitly prohibited.
6. **Offline sync needs a trusted server transaction.** The browser must not directly mark a payment as paid, approve a commission, close a shift, or bypass a stale-configuration review. Use authenticated server endpoints/RPC with idempotency and audit logging.
7. **Money and totals need transactional validation.** Recalculate line totals, allocated discounts, sale totals, payment sums, and commissions on the server; do not rely only on client-calculated values or CHECK constraints.
8. **Authentication lifecycle needs handling.** The `users` profile references `auth.users`; onboarding must create the organization/profile through a controlled server-side flow and must not let a user self-assign the owner role.

## Required next implementation steps

1. Add narrowly scoped RLS helper functions with a fixed `search_path`, and policies based on authenticated user membership, role, and branch membership.
2. Keep payment-provider event ingestion, commission approval/payout, and privileged setup operations server-only.
3. Add database constraints or server-side transactional checks for shift/device/branch consistency and valid service/barber assignments.
4. Decide whether commission payouts can be split; adjust the uniqueness rule if partial payouts are required.
5. Add tests for cross-organization access denial, cross-branch access denial, owner access across all branches, idempotent offline retries, stale commission config, and duplicate payment webhooks.
6. Only then run the reviewed migrations against the Supabase project and verify table/RLS state.

## Current status

- PostgreSQL extensions `pgcrypto` and `btree_gist` are installed in the project.
- Migration 001 has not been applied to the Supabase database as of the latest user confirmation.
- Migration 002 is a fail-closed RLS baseline; it is not the final policy set.
- The Next.js UI is a scaffold, not a connected or tested POS.
