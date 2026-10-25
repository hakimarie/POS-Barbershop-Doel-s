"use client";

import { useState, useTransition, type FormEvent } from "react";
import { saveBarberBranchAssignment } from "@/app/actions/barbers";

type Branch = { id: string; code: string; name: string };

export default function BarberAssignmentForm({ branches }: { branches: Branch[] }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setSuccess(false);
    const formData = new FormData();
    formData.set("barber_code", code);
    formData.set("full_name", name);
    formData.set("branch_id", branchId);
    startTransition(async () => {
      const result = await saveBarberBranchAssignment(formData);
      setMessage(result.message);
      setSuccess(result.ok);
      if (result.ok) {
        setCode("");
        setName("");
        window.location.reload();
      }
    });
  }

  return <form className="service-form" onSubmit={handleSubmit}>
    <div className="service-form-intro">
      <h3>Tambah barber dan penugasan cabang</h3>
      <p>Membuat barber aktif atau mengaktifkan kembali barber dengan kode yang sama, lalu memastikan penugasannya berlaku di cabang yang dipilih. Hanya owner/admin yang dapat menyimpan.</p>
    </div>
    <div className="service-form-fields">
      <div><label htmlFor="barber-code">Kode barber</label><input id="barber-code" value={code} onChange={(event) => setCode(event.target.value)} maxLength={40} placeholder="Contoh: BR-001" required /></div>
      <div><label htmlFor="barber-name">Nama barber</label><input id="barber-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="Nama sesuai data operasional" required /></div>
    </div>
    <div className="service-form-fields service-price-fields">
      <div><label htmlFor="barber-branch">Cabang penugasan</label><select id="barber-branch" value={branchId} onChange={(event) => setBranchId(event.target.value)} required>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.code} — {branch.name}</option>)}</select></div>
    </div>
    <button className="primary-button form-submit-button" type="submit" disabled={pending || branches.length === 0}>{pending ? "Menyimpan..." : "Simpan barber & penugasan"}</button>
    {message ? <p className={success ? "shift-message success" : "shift-message error"} role="status">{message}</p> : null}
    <p className="architecture-footnote">Aksi disimpan secara atomik oleh RPC database dan dicatat pada audit log. Tidak mengubah transaksi atau komisi historis.</p>
  </form>;
}
