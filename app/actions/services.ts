"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SaveServiceResult = { ok: boolean; message: string };

export async function saveServiceBranchPrice(formData: FormData): Promise<SaveServiceResult> {
  const serviceIdRaw = String(formData.get("service_id") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const durationRaw = String(formData.get("duration_minutes") ?? "").trim();
  const branchId = String(formData.get("branch_id") ?? "").trim();
  const priceRaw = String(formData.get("price_amount") ?? "").trim();
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (serviceIdRaw && !uuidPattern.test(serviceIdRaw)) {
    return { ok: false, message: "Layanan yang dipilih tidak valid." };
  }
  if (!uuidPattern.test(branchId)) {
    return { ok: false, message: "Pilih cabang yang valid." };
  }
  if (!code || code.length > 40 || !name || name.length > 120) {
    return { ok: false, message: "Kode dan nama layanan wajib diisi. Kode maksimal 40 karakter, nama maksimal 120 karakter." };
  }
  if (!/^[1-9]\d*$/.test(durationRaw)) {
    return { ok: false, message: "Durasi harus berupa angka bulat lebih dari 0 menit." };
  }
  if (!/^(0|[1-9]\d*)$/.test(priceRaw)) {
    return { ok: false, message: "Harga harus berupa angka rupiah bulat, minimal 0." };
  }

  const duration = Number(durationRaw);
  const price = Number(priceRaw);
  if (!Number.isSafeInteger(duration) || duration > 1440 || !Number.isSafeInteger(price)) {
    return { ok: false, message: "Durasi atau harga berada di luar batas angka yang aman." };
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { ok: false, message: "Sesi tidak valid. Silakan login kembali." };

    const { error } = await supabase.rpc("kt_save_service_branch_price", {
      p_service_id: serviceIdRaw || null,
      p_code: code,
      p_name: name,
      p_duration_minutes: duration,
      p_branch_id: branchId,
      p_price_amount: price,
    });

    if (error) {
      if (error.code === "42501") {
        return { ok: false, message: "Akses ditolak. Hanya owner/admin aktif yang dapat mengubah layanan dan harga." };
      }
      if (error.code === "23505") {
        return { ok: false, message: "Kode layanan sudah digunakan. Gunakan kode yang berbeda." };
      }
      if (error.code === "22023") return { ok: false, message: error.message };
      if (error.code === "23503") return { ok: false, message: "Layanan atau cabang tidak ditemukan/aktif. Muat ulang halaman." };
      return { ok: false, message: "Perubahan belum tersimpan. Pastikan migration 007 sudah diterapkan di Supabase." };
    }

    revalidatePath("/layanan");
    revalidatePath("/");
    return { ok: true, message: "Layanan dan harga cabang berhasil disimpan. Harga baru berlaku mulai sekarang; riwayat harga sebelumnya tetap tercatat." };
  } catch {
    return { ok: false, message: "Tidak dapat menghubungi Supabase. Periksa koneksi dan konfigurasi." };
  }
}
