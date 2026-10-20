"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type CheckoutResult = {
  ok: boolean;
  message: string;
  receipt?: string;
  total?: number;
  commission?: number;
  paymentStatus?: string;
  saleStatus?: string;
  reviewRequired?: boolean;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function checkoutSale(formData: FormData): Promise<CheckoutResult> {
  const branchId = String(formData.get("branch_id") ?? "");
  const shiftId = String(formData.get("shift_id") ?? "");
  const deviceId = String(formData.get("device_id") ?? "");
  const serviceId = String(formData.get("service_id") ?? "");
  const barberId = String(formData.get("barber_id") ?? "");
  const quantityRaw = String(formData.get("quantity") ?? "1");
  const method = String(formData.get("payment_method") ?? "");
  const transactionId = String(formData.get("client_transaction_id") ?? "");

  if (![branchId, shiftId, deviceId, serviceId, barberId, transactionId].every((v) => uuidPattern.test(v))) {
    return { ok: false, message: "Pilih cabang, shift, perangkat, layanan, dan barber yang valid. Muat ulang formulir jika perlu." };
  }
  if (!/^[1-9]\d*$/.test(quantityRaw) || !Number.isSafeInteger(Number(quantityRaw)) || Number(quantityRaw) > 20) {
    return { ok: false, message: "Jumlah layanan harus 1–20." };
  }
  if (method !== "cash" && method !== "qris") return { ok: false, message: "Pilih pembayaran tunai atau QRIS." };

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { ok: false, message: "Sesi login berakhir. Silakan login kembali." };

    const { data, error } = await supabase.rpc("kt_checkout_sale", {
      p_branch_id: branchId,
      p_shift_id: shiftId,
      p_device_id: deviceId,
      p_service_id: serviceId,
      p_barber_id: barberId,
      p_quantity: Number(quantityRaw),
      p_payment_method: method,
      p_client_transaction_id: transactionId,
    });

    if (error) {
      if (error.code === "42501") return { ok: false, message: "Akses ditolak. Periksa peran pengguna dan akses cabang." };
      if (error.code === "23514" || error.code === "23503") return { ok: false, message: error.message || "Shift, harga, barber, atau cabang tidak memenuhi syarat transaksi." };
      if (error.code === "23505") return { ok: false, message: "ID transaksi sudah dipakai untuk data yang berbeda. Muat ulang kasir untuk membuat ID baru." };
      return { ok: false, message: "Checkout gagal. Pastikan migration 008 dan 009 sudah diterapkan di Supabase staging." };
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.sale_id || !row?.receipt_number) return { ok: false, message: "Database belum mengembalikan bukti transaksi. Periksa riwayat transaksi sebelum mencoba ulang." };
    revalidatePath("/kasir");
    revalidatePath("/");
    return {
      ok: true,
      message: row.payment_status === "pending"
        ? "Transaksi tercatat. Pembayaran QRIS masih MENUNGGU konfirmasi; jangan serahkan sebagai transaksi lunas."
        : "Transaksi tunai berhasil dicatat lunas.",
      receipt: row.receipt_number,
      total: Number(row.total_amount),
      commission: Number(row.commission_amount ?? 0),
      paymentStatus: row.payment_status,
      saleStatus: row.sale_status,
      reviewRequired: Boolean(row.commission_review_required),
    };
  } catch {
    return { ok: false, message: "Tidak dapat menghubungi server. Periksa koneksi sebelum mengulangi transaksi." };
  }
}
