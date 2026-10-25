"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type OpenShiftResult = { ok: boolean; message: string };

export async function openCashShift(formData: FormData): Promise<OpenShiftResult> {
  const branchId = String(formData.get("branch_id") ?? "").trim();
  const deviceId = String(formData.get("device_id") ?? "").trim();
  const openingCashRaw = String(formData.get("opening_cash_amount") ?? "").trim();

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(branchId) || !uuidPattern.test(deviceId)) {
    return { ok: false, message: "Pilih cabang dan perangkat yang valid." };
  }
  if (!/^(0|[1-9]\d*)$/.test(openingCashRaw)) {
    return { ok: false, message: "Kas awal harus berupa angka rupiah bulat, minimal 0." };
  }

  const openingCash = Number(openingCashRaw);
  if (!Number.isSafeInteger(openingCash) || openingCash < 0) {
    return { ok: false, message: "Nominal kas awal di luar batas angka yang aman." };
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { ok: false, message: "Sesi tidak valid. Silakan login kembali." };
    }

    const { data, error } = await supabase.rpc("kt_open_cash_shift", {
      p_branch_id: branchId,
      p_device_id: deviceId,
      p_opening_cash_amount: openingCash,
    });

    if (error) {
      const lowerMessage = error.message.toLowerCase();
      if (error.code === "42501") {
        return { ok: false, message: "Akses ditolak. Pastikan profil aktif dan Anda memiliki akses operasional ke cabang." };
      }
      if (error.code === "23505" || lowerMessage.includes("already has an open")) {
        return { ok: false, message: "Perangkat ini sudah memiliki shift aktif atau menunggu pemeriksaan." };
      }
      if (error.code === "23514" || error.code === "23503") {
        return { ok: false, message: "Cabang/perangkat tidak cocok atau perangkat tidak aktif. Muat ulang data lalu coba lagi." };
      }
      return { ok: false, message: "Shift belum dapat dibuka. Periksa apakah migration 005 sudah diterapkan di Supabase staging." };
    }

    if (!data) {
      return { ok: false, message: "Supabase tidak mengembalikan data shift. Status belum dapat dipastikan." };
    }

    revalidatePath("/");
    return { ok: true, message: "Shift kasir berhasil dibuka. Catat saldo kas awal sebelum mulai transaksi." };
  } catch {
    return { ok: false, message: "Tidak dapat menghubungi Supabase. Periksa koneksi dan konfigurasi." };
  }
}
