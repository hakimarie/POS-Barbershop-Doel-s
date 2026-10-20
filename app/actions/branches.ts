"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type RenameBranchResult = { ok: boolean; message: string };

export async function renameBranch(formData: FormData): Promise<RenameBranchResult> {
  const branchId = String(formData.get("branch_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(branchId)) return { ok: false, message: "Cabang yang dipilih tidak valid." };
  if (!name || name.length > 120) return { ok: false, message: "Nama cabang wajib diisi, maksimal 120 karakter." };

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { ok: false, message: "Sesi tidak valid. Silakan login kembali." };

    const { error } = await supabase.rpc("kt_rename_branch", {
      p_branch_id: branchId,
      p_new_name: name,
    });

    if (error) {
      if (error.code === "42501") return { ok: false, message: "Akses ditolak. Hanya owner/admin aktif yang dapat mengganti nama cabang." };
      if (error.code === "23503") return { ok: false, message: "Cabang tidak ditemukan atau tidak aktif. Muat ulang halaman." };
      if (error.code === "22023") return { ok: false, message: error.message };
      if (error.code === "PGRST202" || error.code === "42883") return { ok: false, message: "RPC belum tersedia. Terapkan migration 011 di Supabase staging terlebih dahulu." };
      return { ok: false, message: `Nama belum tersimpan (database ${error.code ?? "error"}). Pastikan migration 011 sudah diterapkan.` };
    }

    revalidatePath("/");
    revalidatePath("/cabang");
    revalidatePath("/kasir");
    revalidatePath("/layanan");
    revalidatePath("/barber");
    return { ok: true, message: "Nama cabang berhasil diperbarui. Kode dan ID cabang tetap sama; perubahan tercatat di audit log." };
  } catch {
    return { ok: false, message: "Tidak dapat menghubungi Supabase. Periksa koneksi dan konfigurasi." };
  }
}
