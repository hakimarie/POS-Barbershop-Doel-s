"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SaveBarberResult = { ok: boolean; message: string };

export async function saveBarberBranchAssignment(formData: FormData): Promise<SaveBarberResult> {
  const code = String(formData.get("barber_code") ?? "").trim();
  const name = String(formData.get("full_name") ?? "").trim();
  const branchId = String(formData.get("branch_id") ?? "").trim();
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!code || code.length > 40 || !/^[a-zA-Z0-9_-]+$/.test(code)) {
    return { ok: false, message: "Kode barber wajib diisi, maksimal 40 karakter, hanya huruf, angka, tanda hubung, atau garis bawah." };
  }
  if (!name || name.length > 120) return { ok: false, message: "Nama barber wajib diisi, maksimal 120 karakter." };
  if (!uuidPattern.test(branchId)) return { ok: false, message: "Pilih cabang yang valid." };

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { ok: false, message: "Sesi tidak valid. Silakan login kembali." };

    const { error } = await supabase.rpc("kt_save_barber_branch_assignment", {
      p_barber_code: code,
      p_full_name: name,
      p_branch_id: branchId,
    });

    if (error) {
      if (error.code === "42501") return { ok: false, message: "Akses ditolak. Hanya owner/admin aktif yang dapat mengelola barber." };
      if (error.code === "23505") return { ok: false, message: "Kode barber sudah digunakan atau terjadi konflik data. Muat ulang lalu coba lagi." };
      if (error.code === "23503") return { ok: false, message: "Cabang tidak ditemukan atau tidak aktif. Muat ulang halaman." };
      if (error.code === "22023") return { ok: false, message: error.message };
      return { ok: false, message: "Belum tersimpan. Pastikan migration 010 sudah diterapkan di Supabase staging." };
    }

    revalidatePath("/barber");
    revalidatePath("/kasir");
    revalidatePath("/");
    return { ok: true, message: "Barber aktif dan penugasan cabang berhasil disimpan." };
  } catch {
    return { ok: false, message: "Tidak dapat menghubungi Supabase. Periksa koneksi dan konfigurasi." };
  }
}
