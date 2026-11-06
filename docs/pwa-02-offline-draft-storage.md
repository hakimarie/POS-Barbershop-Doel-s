# PWA-02 — Offline draft storage safety

## Scope

This change hardens the existing IndexedDB draft store used by the cashier form. It is **not** a complete offline cashier or automatic sync implementation.

- Draft writes are upserts by stable `transactionId`.
- Deleting a draft targets only its transaction ID.
- A successful server checkout removes only the matching local draft.
- Legacy localStorage drafts are imported into IndexedDB before the legacy key is removed.
- QRIS remains unavailable while offline.
- Drafts remain unconfirmed local records until a signed-in cashier explicitly submits them online; the server recalculates price and validates branch, device, shift, barber assignment, and idempotency.

## Manual QA checklist

Run on a disposable browser profile and staging database:

1. Create draft A while offline; verify it appears after navigating away and returning online.
2. Create draft B in a second tab; verify saving B does not erase A.
3. Delete A; verify B remains in IndexedDB.
4. Load B and submit online; verify the original client transaction ID is sent and only B is removed after server success.
5. Force a server/network error during submit; verify B remains available for retry.
6. Attempt to submit the same ID twice; verify the database returns the original sale rather than creating a duplicate.
7. Change branch price after drafting; verify the operator sees the updated estimate and must acknowledge the change before submit.
8. Close the shift after drafting; verify the server rejects checkout and the local draft remains.
9. Verify QRIS cannot be drafted/confirmed offline.

## Known limitations / release blockers

- The authenticated `/kasir` page and operational master data are still server-rendered and require a valid online session. A hard reload while offline displays the static offline notice, not the cashier UI.
- No trusted offline authentication / device authorization model exists yet.
- No background sync or automatic outbox delivery exists. Drafts are reviewed and submitted manually after reconnecting.
- No server endpoint currently accepts a batch of offline operations with device-bound credentials, per-item acknowledgements, or conflict statuses.
- Commission tier/config snapshots are not captured in the draft. Server-side checkout remains authoritative and may mark commission for review.
- No production-ready QRIS provider verification is introduced by this change.

Do not market this stage as full offline POS and do not enable production rollout based on this PR alone.
