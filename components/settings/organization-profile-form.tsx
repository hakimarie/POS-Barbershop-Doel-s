"use client";

import { useState, useTransition, type FormEvent } from "react";
import { updateOrganizationProfile } from "@/app/actions/branches";

type Day = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
type Hours = { closed?: boolean; open?: string; close?: string };
type Props = { name: string; address: string; phone: string; logoUrl: string; hours: Record<string, Hours> };
const days: { key: Day; label: string }[] = [
  { key: "mon", label: "Senin" }, { key: "tue", label: "Selasa" }, { key: "wed", label: "Rabu" },
  { key: "thu", label: "Kamis" }, { key: "fri", label: "Jumat" }, { key: "sat", label: "Sabtu" }, { key: "sun", label: "Minggu" },
];

export default function OrganizationProfileForm({ name, address, phone, logoUrl, hours }: Props) {
  const [closed, setClosed] = useState<Record<Day, boolean>>({
    mon: !!hours.mon?.closed, tue: !!hours.tue?.closed, wed: !!hours.wed?.closed, thu: !!hours.thu?.closed,
    fri: !!hours.fri?.closed, sat: !!hours.sat?.closed, sun: !!hours.sun?.closed,
  });
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setSuccess(false);
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await updateOrganizationProfile(formData);
      setMessage(result.message);
      setSuccess(result.ok);
    });
  }

  return <form className="profile-settings-form" onSubmit={submit}>
    <section className="profile-form-section">
      <div className="profile-form-section-heading"><h2>Informasi usaha</h2><p>Informasi yang digunakan pada workspace dan struk transaksi.</p></div>
      <div className="profile-form-grid">
        <label className="profile-field profile-field-wide">Nama barbershop<input name="business_name" defaultValue={name} maxLength={120} required placeholder="Nama usaha" /></label>
        <label className="profile-field profile-field-wide">Alamat outlet utama<textarea name="address" defaultValue={address} maxLength={300} rows={2} placeholder="Alamat usaha" /></label>
        <label className="profile-field">Nomor kontak<input name="contact_phone" defaultValue={phone} maxLength={40} placeholder="Contoh: 08xxxxxxxxxx" /></label>
        <label className="profile-field">URL logo untuk struk<input name="receipt_logo_url" type="url" defaultValue={logoUrl} maxLength={2048} placeholder="https://..." /><small>Gunakan URL HTTPS publik. Upload file logo belum tersedia.</small></label>
      </div>
    </section>
    <section className="profile-form-section">
      <div className="profile-form-section-heading"><h2>Jam operasional</h2><p>Atur jam buka setiap hari atau tandai hari libur.</p></div>
      <div className="operating-hours-list">
        {days.map((day) => <div className="operating-hours-row" key={day.key}>
          <strong>{day.label}</strong>
          <label className="hours-time-field"><span>Buka</span><input aria-label={day.label + " jam buka"} name={day.key + "_open"} type="time" defaultValue={hours[day.key]?.open ?? "09:00"} disabled={closed[day.key]} /></label>
          <label className="hours-time-field"><span>Tutup</span><input aria-label={day.label + " jam tutup"} name={day.key + "_close"} type="time" defaultValue={hours[day.key]?.close ?? "21:00"} disabled={closed[day.key]} /></label>
          <label className="hours-closed"><input type="checkbox" name={day.key + "_closed"} checked={closed[day.key]} onChange={(event) => setClosed((current) => ({ ...current, [day.key]: event.target.checked }))} /> Tutup</label>
        </div>)}
      </div>
    </section>
    {message ? <p className={success ? "profile-form-message success" : "profile-form-message error"} role="status">{message}</p> : null}
    <div className="profile-form-footer"><p>Perubahan disimpan ke profil organisasi dan dicatat di audit log.</p><button className="primary-button" type="submit" disabled={pending}>{pending ? "Menyimpan..." : "Simpan perubahan"}</button></div>
  </form>;
}
