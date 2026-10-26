"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SaveCommissionResult = { ok: boolean; message: string };

export async function saveBarberCommissionRate(formData: FormData): Promise<SaveCommissionResult> {
  const barberId = String(formData.get("barber_id") ?? "").trim();
  const rateRaw = String(formData.get("rate_percent") ?? "").trim();
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(barberId)) return { ok: false, message: "Pilih barber aktif yang valid." };
  if (!/^(?:0|[1-9]\d?)(?:\.\d{1,2})?$|^100(?:\.0{1,2})?$/.test(rateRaw)) {
    return { ok: false, message: "Tarif harus antara 0–100% dengan maksimal 2 angka desimal." };
  }

  const rate = Number(rateRaw);
  const rateBps = Math.round(rate * 100);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100 || !Number.isInteger(rateBps)) {
    return { ok: false, message: "Tarif komisi tidak valid." };
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { ok: false, message: "Sesi tidak valid. Silakan login kembali." };

    const { error } = await supabase.rpc("kt_save_barber_commission_rate", {
      p_barber_id: barberId,
      p_rate_bps: rateBps,
    });

    if (error) {
      if (error.code === "42501") return { ok: false, message: "Akses ditolak. Hanya owner/admin aktif yang dapat mengubah komisi." };
      if (error.code === "22023") return { ok: false, message: error.message };
      if (error.code === "23503") return { ok: false, message: "Barber tidak ditemukan atau tidak aktif. Muat ulang halaman." };
      if (error.code === "23505" || error.code === "23P01") return { ok: false, message: "Konflik periode tarif komisi. Muat ulang data dan coba lagi." };
      return { ok: false, message: "Komisi belum tersimpan. Pastikan migration 020 sudah diterapkan pada staging." };
    }

    revalidatePath("/pengaturan/komisi");
    revalidatePath("/pengaturan");
    revalidatePath("/kasir");
    revalidatePath("/");
    return { ok: true, message: `Tarif komisi ${rate.toLocaleString("id-ID", { maximumFractionDigits: 2 })}% berhasil disimpan. Riwayat tarif lama dan transaksi yang sudah terjadi tidak diubah.` };
  } catch {
    return { ok: false, message: "Tidak dapat menghubungi Supabase. Periksa koneksi dan konfigurasi." };
  }
}
