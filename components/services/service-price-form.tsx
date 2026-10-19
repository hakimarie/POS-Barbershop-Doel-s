"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { saveServiceBranchPrice } from "@/app/actions/services";

type Branch = { id: string; code: string; name: string };
type Service = { id: string; code: string; name: string; duration_minutes: number };

export default function ServicePriceForm({ branches, services }: { branches: Branch[]; services: Service[] }) {
  const [serviceId, setServiceId] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [duration, setDuration] = useState("30");
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [price, setPrice] = useState("");
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!serviceId) {
      setCode("");
      setName("");
      setDuration("30");
      setPrice("");
      return;
    }
    const selected = services.find((service) => service.id === serviceId);
    if (selected) {
      setCode(selected.code);
      setName(selected.name);
      setDuration(String(selected.duration_minutes));
    }
  }, [serviceId, services]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setSuccess(false);
    const formData = new FormData();
    formData.set("service_id", serviceId);
    formData.set("code", code);
    formData.set("name", name);
    formData.set("duration_minutes", duration);
    formData.set("branch_id", branchId);
    formData.set("price_amount", price);

    startTransition(async () => {
      const result = await saveServiceBranchPrice(formData);
      setMessage(result.message);
      setSuccess(result.ok);
      if (result.ok) {
        setServiceId("");
        setCode("");
        setName("");
        setDuration("30");
        setPrice("");
        window.location.reload();
      }
    });
  }

  return (
    <form className="service-form" onSubmit={handleSubmit}>
      <div className="service-form-intro">
        <h3>Tambah layanan atau atur harga cabang</h3>
        <p>Pilih “Layanan baru” untuk membuat katalog. Pilih layanan yang ada untuk mengubah detailnya sekaligus menetapkan harga baru pada cabang yang dipilih.</p>
      </div>
      <label htmlFor="service-existing">Layanan</label>
      <select id="service-existing" value={serviceId} onChange={(event) => setServiceId(event.target.value)}>
        <option value="">＋ Layanan baru</option>
        {services.map((service) => <option key={service.id} value={service.id}>{service.code} — {service.name}</option>)}
      </select>

      <div className="service-form-fields">
        <div><label htmlFor="service-code">Kode layanan</label><input id="service-code" value={code} onChange={(event) => setCode(event.target.value)} maxLength={40} placeholder="Contoh: CUT-REG" required /></div>
        <div><label htmlFor="service-name">Nama layanan</label><input id="service-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="Contoh: Haircut Regular" required /></div>
        <div><label htmlFor="service-duration">Durasi (menit)</label><input id="service-duration" type="number" min="1" max="1440" step="1" value={duration} onChange={(event) => setDuration(event.target.value)} required /></div>
      </div>

      <div className="service-form-fields service-price-fields">
        <div><label htmlFor="service-branch">Cabang untuk harga</label><select id="service-branch" value={branchId} onChange={(event) => setBranchId(event.target.value)} required>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.code} — {branch.name}</option>)}</select></div>
        <div><label htmlFor="service-price">Harga (Rp)</label><input id="service-price" type="number" min="0" step="1" inputMode="numeric" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="Contoh: 50000" required /></div>
      </div>

      <button className="primary-button" type="submit" disabled={pending || branches.length === 0}>{pending ? "Menyimpan..." : "Simpan layanan & harga"}</button>
      {message ? <p className={success ? "shift-message success" : "shift-message error"} role="status">{message}</p> : null}
      <p className="architecture-footnote">Penyimpanan memerlukan koneksi internet. Perubahan harga dicatat sebagai periode baru dan transaksi nanti harus menyimpan snapshot harga saat penjualan.</p>
    </form>
  );
}
