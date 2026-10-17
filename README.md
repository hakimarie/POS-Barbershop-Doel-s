# KetemuTerus Barber POS — Doel's Barbershop

POS multi-cabang untuk Doel's Barbershop, dirancang untuk 10 cabang.

## Business requirements

- Harga layanan dapat berbeda per cabang.
- Pembayaran tunai dan QRIS dinamis dengan konfirmasi provider.
- Kasir offline-first dengan sinkronisasi idempoten.
- Komisi barber berbasis persentase tier yang dikelola owner.
- Komisi dengan konfigurasi offline yang kedaluwarsa masuk review.
- Satu shift aktif per perangkat kasir; beberapa perangkat dapat aktif di cabang yang sama.

## Project status

Fondasi database dan rencana implementasi awal tersedia di branch `feat/initial-pos-foundation`.

- [Implementation plan](docs/implementation-plan.md)
- [Migration 001 — PostgreSQL baseline](supabase/migrations/001_initial_pos_foundation.sql)

**Important:** migration masih berupa baseline draft. Jangan terapkan ke database produksi sebelum diuji di database staging/disposable. Provider QRIS dan stack aplikasi belum diputuskan.
