# Architecture Decisions — KetemuTerus Barber POS

## Confirmed

- Backend and relational database: Supabase PostgreSQL.
- Authentication: Supabase Auth.
- The public `users` table is an application profile/authorization table; its `id` must equal `auth.users.id`.
- Multi-branch tenancy is enforced in server-side authorization and PostgreSQL RLS.
- Frontend will be a web/PWA; exact framework and deployment target are still open.
- Offline cashier transactions use IndexedDB + an outbox with stable client transaction IDs and idempotent server sync.
- Cash payment can be recorded offline as a locally captured transaction, then reconciled on sync.
- Dynamic QRIS creation requires a network connection; payment success is only confirmed by verified provider webhook/status response.
- QRIS provider is not selected yet.

## Supabase implementation requirements

1. Apply migrations to a dedicated development/staging Supabase project first.
2. Enable RLS on all tables exposed through the Data API.
3. Add policies that scope users to their organization and branch memberships. Do not trust organization or branch IDs supplied by the browser without authorization checks.
4. Keep service-role keys and payment-provider secrets exclusively server-side.
5. Implement privileged operations (sale creation, payment confirmation, commission approval/payout, sync ingestion) as transactional server-side functions/services. Do not allow clients to update financial statuses directly.
6. Add audit records for changes to prices, tier assignments, payment states, sale adjustments, approvals and payouts.
7. Add tests for tenant isolation, branch access, offline idempotency, stale commission configuration and duplicate payment webhooks.

## Open decisions

- Frontend framework: Next.js or another supported web/PWA stack.
- Hosting/deployment target.
- QRIS provider.
- Whether shifts may be opened/closed offline (not included in the current baseline).
- Whether commission payouts can be split across multiple payout batches (current draft models one payout allocation per commission entry).

## Security note

The initial migration is a schema baseline, not a production-ready authorization layer. Do not expose tables to client access until RLS policies and server-side validation are implemented and tested.
