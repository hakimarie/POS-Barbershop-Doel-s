"use client";

import { useState, useTransition, type FormEvent } from "react";
import { saveBarberCommissionRate } from "@/app/actions/commissions";

type BarberOption = { id: string; barber_code: string; full_name: string; rate_percent: number | null };

export default function CommissionRateForm({ barbers }: { barbers: BarberOption[] }) {
  const [rates, setRates] = useState<Record<string, string>>(
    Object.fromEntries(barbers.map((barber) => [barber.id, String(barber.rate_percent ?? 30)]))
  );
  const [messages, setMessages] = useState<Record<string, { text: string; ok: boolean }>>({});
  const [pendingBarber, setPendingBarber] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>, barberId: string) {
    event.preventDefault();
    setMessages((current) => ({ ...current, [barberId]: { text: "", ok: false } }));
    const formData = new FormData();
    formData.set("barber_id", barberId);
    formData.set("rate_percent", rates[barberId] ?? "30");
    setPendingBarber(barberId);
    startTransition(async () => {
      const result = await saveBarberCommissionRate(formData);
      setMessages((current) => ({ ...current, [barberId]: { text: result.message, ok: result.ok } }));
      setPendingBarber(null);
      if (result.ok) window.location.reload();
    });
  }

  if (!barbers.length) return <div className="notice"><div className="notice-icon">i</div><div><strong>Belum ada barber aktif</strong><p>Tambahkan dan tugaskan barber terlebih dahulu sebelum mengatur komisi.</p></div></div>;

  return <div className="commission-rate-list">
    {barbers.map((barber) => {
      const configured = barber.rate_percent !== null;
      return <form className="commission-rate-row" key={barber.id} onSubmit={(event) => handleSubmit(event, barber.id)}>
        <div className="commission-rate-person">
          <span className="commission-rate-avatar" aria-hidden="true">♙</span>
          <div><strong>{barber.full_name}</strong><small>{barber.barber_code} · {configured ? "Tarif aktif" : "Belum dikonfigurasi"}</small></div>
        </div>
        <div className="commission-rate-control">
          <label htmlFor={`commission-rate-${barber.id}`}>Komisi (% dari dasar komisi layanan)</label>
          <div className="commission-rate-input-wrap">
            <input id={`commission-rate-${barber.id}`} type="number" min="0" max="100" step="0.01" inputMode="decimal" required value={rates[barber.id] ?? "30"} onChange={(event) => setRates((current) => ({ ...current, [barber.id]: event.target.value }))} />
            <span>%</span>
          </div>
          <small className="commission-rate-example">Contoh harga Rp100.000 tanpa diskon: {Math.round((Number(rates[barber.id] ?? 30) || 0) * 1000).toLocaleString("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 })}</small>
        </div>
        <button className="primary-button commission-rate-save" type="submit" disabled={pending}>{pending && pendingBarber === barber.id ? "Menyimpan..." : "Simpan tarif"}</button>
        {messages[barber.id]?.text ? <p className={messages[barber.id].ok ? "shift-message success commission-rate-message" : "shift-message error commission-rate-message"} role="status">{messages[barber.id].text}</p> : null}
      </form>;
    })}
    <p className="architecture-footnote">Perubahan berlaku mulai waktu penyimpanan. Tarif disimpan sebagai versi efektif dan perubahan dicatat ke audit log oleh database. Penjualan lama tidak dihitung ulang.</p>
  </div>;
}
