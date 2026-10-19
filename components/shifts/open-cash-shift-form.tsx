"use client";

import { useState, useTransition } from "react";
import { openCashShift } from "@/app/actions/cash-shift";

type Branch = { id: string; code: string; name: string };
type Device = { id: string; branch_id: string; device_code: string; device_name: string };

export default function OpenCashShiftForm({ branches, devices }: { branches: Branch[]; devices: Device[] }) {
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [deviceId, setDeviceId] = useState("");
  const [openingCash, setOpeningCash] = useState("0");
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  const branchDevices = devices.filter((device) => device.branch_id === branchId);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setSuccess(false);
    const formData = new FormData(event.currentTarget);
    formData.set("branch_id", branchId);
    formData.set("device_id", deviceId);
    formData.set("opening_cash_amount", openingCash);

    startTransition(async () => {
      const result = await openCashShift(formData);
      setMessage(result.message);
      setSuccess(result.ok);
      if (result.ok) setOpeningCash("0");
    });
  }

  return (
    <section className="section-block" id="shift">
      <div className="section-heading">
        <div><h2>Buka shift kasir</h2><p>Shift hanya dibuka untuk perangkat aktif yang terdaftar pada cabang terpilih.</p></div>
        <span className="section-count">RPC TERVALIDASI</span>
      </div>
      {branches.length === 0 ? (
        <div className="notice"><div className="notice-icon">i</div><div><strong>Belum ada cabang yang dapat diakses</strong><p>Pastikan cabang aktif dan akses pengguna sudah dikonfigurasi.</p></div></div>
      ) : devices.length === 0 ? (
        <div className="notice"><div className="notice-icon">i</div><div><strong>Belum ada perangkat aktif</strong><p>Admin perlu mendaftarkan perangkat kasir aktif pada cabang sebelum shift dapat dibuka.</p></div></div>
      ) : (
        <form className="shift-form" onSubmit={handleSubmit}>
          <label htmlFor="shift-branch">Cabang</label>
          <select id="shift-branch" value={branchId} onChange={(event) => { setBranchId(event.target.value); setDeviceId(""); }} required>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.code} — {branch.name}</option>)}
          </select>
          <label htmlFor="shift-device">Perangkat kasir</label>
          <select id="shift-device" value={deviceId} onChange={(event) => setDeviceId(event.target.value)} required>
            <option value="">Pilih perangkat</option>
            {branchDevices.map((device) => <option key={device.id} value={device.id}>{device.device_code} — {device.device_name}</option>)}
          </select>
          <label htmlFor="shift-opening-cash">Saldo kas awal (Rp)</label>
          <input id="shift-opening-cash" type="number" min="0" step="1" inputMode="numeric" value={openingCash} onChange={(event) => setOpeningCash(event.target.value)} required />
          <button className="primary-button" type="submit" disabled={pending || !branchId || !deviceId || branchDevices.length === 0}>
            {pending ? "Memvalidasi..." : "Buka shift"}
          </button>
          {message ? <p className={success ? "shift-message success" : "shift-message error"} role="status">{message}</p> : null}
        </form>
      )}
      <p className="architecture-footnote">Pembukaan shift memerlukan koneksi internet. Dukungan transaksi offline setelah shift dibuka masih perlu dibangun dan diuji.</p>
    </section>
  );
}
