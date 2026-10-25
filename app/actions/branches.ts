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


export async function createBranch(formData: FormData): Promise<RenameBranchResult> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > 120) return { ok: false, message: "Nama cabang wajib diisi, maksimal 120 karakter." };

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { ok: false, message: "Sesi tidak valid. Silakan login kembali." };

    const { error } = await supabase.rpc("kt_create_branch", { p_branch_name: name });
    if (error) {
      if (error.code === "42501") return { ok: false, message: "Akses ditolak. Hanya owner/admin aktif yang dapat menambah cabang." };
      if (error.code === "22023") return { ok: false, message: error.message };
      if (error.code === "PGRST202" || error.code === "42883") return { ok: false, message: "Fitur tambah cabang belum aktif. Terapkan migration 016 di Supabase staging terlebih dahulu." };
      return { ok: false, message: `Cabang belum tersimpan (database ${error.code ?? "error"}). Pastikan migration 016 sudah diterapkan.` };
    }

    revalidatePath("/");
    revalidatePath("/cabang");
    revalidatePath("/kasir");
    return { ok: true, message: "Cabang berhasil ditambahkan bersama perangkat kasir utama." };
  } catch {
    return { ok: false, message: "Tidak dapat menghubungi Supabase. Periksa koneksi dan konfigurasi." };
  }
}


export async function updateOrganizationProfile(formData: FormData): Promise<RenameBranchResult> {
  const name = String(formData.get("business_name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const phone = String(formData.get("contact_phone") ?? "").trim();
  const logoUrl = String(formData.get("receipt_logo_url") ?? "").trim();
  const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
  const operatingHours: Record<string, { closed: boolean; open?: string; close?: string }> = {};

  if (!name || name.length > 120) return { ok: false, message: "Nama usaha wajib diisi, maksimal 120 karakter." };
  if (address.length > 300 || phone.length > 40 || logoUrl.length > 2048) return { ok: false, message: "Alamat, nomor kontak, atau URL logo melebihi batas karakter." };
  if (logoUrl && !/^https:\/\/[^\s]+$/i.test(logoUrl)) return { ok: false, message: "URL logo struk harus menggunakan HTTPS." };

  for (const day of days) {
    const closed = formData.get(day + "_closed") === "on";
    const open = String(formData.get(day + "_open") ?? "");
    const close = String(formData.get(day + "_close") ?? "");
    if (!closed && (!/^([01]\d|2[0-3]):[0-5]\d$/.test(open) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(close) || open >= close)) {
      return { ok: false, message: "Jam buka/tutup belum valid. Pilih jam yang benar atau tandai hari sebagai tutup." };
    }
    operatingHours[day] = closed ? { closed: true } : { closed: false, open, close };
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { ok: false, message: "Sesi tidak valid. Silakan login kembali." };
    const { error } = await supabase.rpc("kt_update_organization_profile", {
      p_name: name, p_address: address || null, p_contact_phone: phone || null,
      p_receipt_logo_url: logoUrl || null, p_operating_hours: operatingHours,
    });
    if (error) {
      if (error.code === "42501") return { ok: false, message: "Akses ditolak. Hanya owner/admin aktif yang dapat mengubah profil usaha." };
      if (error.code === "22023") return { ok: false, message: error.message };
      if (["PGRST202", "42883", "42703"].includes(error.code ?? "")) return { ok: false, message: "Pengaturan profil belum aktif di database. Terapkan migration 017 di Supabase staging, lalu coba lagi." };
      return { ok: false, message: `Profil belum tersimpan (database ${error.code ?? "error"}). Periksa migration 017.` };
    }
    revalidatePath("/pengaturan");
    revalidatePath("/pengaturan/profil");
    revalidatePath("/");
    return { ok: true, message: "Profil barbershop berhasil disimpan." };
  } catch {
    return { ok: false, message: "Tidak dapat menghubungi Supabase. Periksa koneksi dan konfigurasi." };
  }
}

export async function updateTransactionReceiptSettings(formData: FormData): Promise<RenameBranchResult> {
  const footer = String(formData.get("receipt_footer") ?? "").trim();
  const showCashier = formData.get("receipt_show_cashier") === "on";
  const showBarber = formData.get("receipt_show_barber") === "on";
  const showAddress = formData.get("receipt_show_branch_address") === "on";

  if (footer.length > 500) return { ok: false, message: "Pesan penutup maksimal 500 karakter." };

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { ok: false, message: "Sesi tidak valid. Silakan login kembali." };

    const { error } = await supabase.rpc("kt_update_transaction_receipt_settings", {
      p_receipt_footer: footer,
      p_show_cashier: showCashier,
      p_show_barber: showBarber,
      p_show_branch_address: showAddress,
    });
    if (error) {
      if (error.code === "42501") return { ok: false, message: "Akses ditolak. Hanya owner/admin aktif yang dapat mengubah format struk." };
      if (error.code === "22023") return { ok: false, message: error.message };
      if (["PGRST202", "42883", "42703"].includes(error.code ?? "")) return { ok: false, message: "Pengaturan struk belum aktif di database. Terapkan migration 018 di Supabase staging, lalu coba lagi." };
      return { ok: false, message: `Pengaturan struk belum tersimpan (database ${error.code ?? "error"}). Periksa migration 018.` };
    }

    revalidatePath("/pengaturan");
    revalidatePath("/pengaturan/transaksi");
    revalidatePath("/pengaturan/profil");
    revalidatePath("/kasir");
    return { ok: true, message: "Pengaturan tampilan struk berhasil disimpan." };
  } catch {
    return { ok: false, message: "Tidak dapat menghubungi Supabase. Periksa koneksi dan konfigurasi." };
  }
}
