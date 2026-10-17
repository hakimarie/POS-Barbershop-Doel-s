# KetemuTerus Barber POS — Implementation Plan

## Scope and locked business rules

- Initial customer: Doel's Barbershop, target 10 branches.
- Service price is configured per branch; sale items preserve a price/name snapshot.
- Payment methods: cash and provider-confirmed dynamic QRIS. QRIS provider selection remains open.
- Cashier must support offline sale capture using a local IndexedDB outbox and idempotent sync.
- Commission is based on each sale item's gross amount less the discount allocated to that item.
- Owner manages commission tiers (for example 20%, 30%, 40%). Each barber has one active tier, consistent across branches.
- If offline commission configuration is stale or differs from server truth, hold the commission for review.
- At most one open cash shift per device/register. Different devices at one branch can have separate open shifts.
- Do not trust a client-side QRIS success screen or screenshot; confirm through authenticated provider webhook/status API.
- No hard deletes for completed financial records. Use adjustments/reversals with audit trail.

## Repository status at kickoff

This repository was initially empty except for a minimal README. Work begins on branch `feat/initial-pos-foundation`; `main` is kept untouched.

## Implementation phases

1. **Foundation (current):** baseline PostgreSQL migration and architecture/implementation plan.
2. **Application shell:** choose/confirm app stack, auth strategy, organization/branch context, role permissions.
3. **Master data:** branches, services/prices, barbers, commission tiers and assignments.
4. **Cashier and shifts:** open/close shift, cart, branch price snapshot, cash payment, receipt.
5. **Offline-first:** IndexedDB schema, outbox, deterministic operation IDs, idempotent batch sync, conflict queue.
6. **Commission controls:** immutable rate snapshots, stale-config review cases, approvals and payout batches.
7. **QRIS:** select provider, implement dynamic QR creation, signed webhook verification, event deduplication and reconciliation.
8. **Reporting and rollout:** branch sales, barber commission, cash variance, reconciliation, QA and staged pilot.

## Important implementation notes

- Migration 001 is a **baseline draft**, not a production-approved migration. Run it against a disposable PostgreSQL database and test before applying to any real environment.
- PostgreSQL RLS and server-side authorization policies must be designed before production; organization IDs from the browser are never trusted by themselves.
- Cross-table business rules (tier active/effective date, assignment validity, shift branch/device match, totals matching item sums, paid status only after payment confirmation) need transaction-level service validation and tests.
- For offline sales, distinguish business status from sync status. Do not remove local outbox records until the server acknowledges each operation.
- Provider secrets belong only in server-side environment variables. Webhooks must verify provider authenticity, amount, currency, reference, and event idempotency.
- QRIS provider and deployment stack are not assumed by this baseline.

## First QA checklist

- [ ] Migration applies cleanly on a fresh PostgreSQL database.
- [ ] Cross-organization references are rejected.
- [ ] Overlapping branch price periods are rejected.
- [ ] More than one open shift on the same device is rejected; separate devices are allowed.
- [ ] Duplicate client transaction and idempotency keys do not create duplicate sales.
- [ ] Stale commission tier config creates a review case, not an approved commission.
- [ ] QRIS sale cannot be marked paid from a frontend-only event.
- [ ] Refund/void creates a traceable adjustment and commission reversal.
- [ ] Branch users cannot read or mutate another branch/organization's data.
