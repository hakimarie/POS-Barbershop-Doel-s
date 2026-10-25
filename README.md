# KetemuTerus Barber POS — Doel's Barbershop

POS multi-cabang untuk Doel's Barbershop, dirancang untuk 10 cabang.

## Architecture decisions

- **Backend/database:** Supabase PostgreSQL.
- **Authentication:** Supabase Auth; application profile IDs map to `auth.users.id`.
- **Authorization:** PostgreSQL Row Level Security (RLS) plus server-side role and branch checks.
- **Frontend:** Web/PWA with IndexedDB local storage and an explicit offline outbox (framework still to be confirmed).
- **Payments:** cash and provider-confirmed dynamic QRIS; provider selection remains open.

## Business requirements

- Harga layanan dapat berbeda per cabang.
- Kasir offline-first dengan sinkronisasi idempoten.
- Komisi barber berbasis tier persentase yang dikelola owner.
- Komisi dengan konfigurasi offline yang kedaluwarsa masuk review.
- Satu shift aktif per perangkat kasir; beberapa perangkat dapat aktif di cabang yang sama.

## Project status

Fondasi database dan rencana implementasi awal tersedia di branch `feat/initial-pos-foundation`.

- [Implementation plan](docs/implementation-plan.md)
- [Architecture decisions](docs/architecture.md)
- [Migration 001 — Supabase PostgreSQL baseline](supabase/migrations/001_initial_pos_foundation.sql)

**Important:** migration masih berupa baseline draft. Uji pada project Supabase development/staging sebelum produksi. RLS policies dan transaction-level business validation wajib diselesaikan sebelum data nyata digunakan.
