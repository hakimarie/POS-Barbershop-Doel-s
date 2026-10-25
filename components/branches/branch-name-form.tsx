"use client";

import { useState, useTransition, type FormEvent } from "react";
import { renameBranch } from "@/app/actions/branches";

type Branch = { id: string; code: string; name: string };

export default function BranchNameForm({ branches }: { branches: Branch[] }) {
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const selected = branches.find((branch) => branch.id === branchId);
  const [name, setName] = useState(selected?.name ?? "");
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  function chooseBranch(id: string) {
    setBranchId(id);
    setName(branches.find((branch) => branch.id === id)?.name ?? "");
    setMessage("");
    setSuccess(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setSuccess(false);
    const formData = new FormData();
    formData.set("branch_id", branchId);
    formData.set("name", name);
    startTransition(async () => {
      const result = await renameBranch(formData);
      setMessage(result.message);
      setSuccess(result.ok);
      if (result.ok) window.location.reload();
    });
  }

  return <form className="service-form" onSubmit={handleSubmit}>
    <div className="service-form-intro">
      <h3>Ubah nama cabang</h3>
      <p>Pilih cabang berdasarkan kode internal, lalu tetapkan nama outlet. Kode dan ID permanen tidak berubah sehingga transaksi, shift, perangkat, harga, dan komisi tetap terhubung.</p>
    </div>
    <div className="service-form-fields service-price-fields">
      <div>
        <label htmlFor="branch-select">Cabang</label>
        <select id="branch-select" value={branchId} onChange={(event) => chooseBranch(event.target.value)} required>
          {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.code} — {branch.name}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="branch-name">Nama cabang baru</label>
        <input id="branch-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="Contoh: Doels Pitara" required />
      </div>
    </div>
    <button className="primary-button form-submit-button" type="submit" disabled={pending || !branchId || !name.trim()}>{pending ? "Menyimpan..." : "Simpan nama cabang"}</button>
    {message ? <p className={success ? "shift-message success" : "shift-message error"} role="status">{message}</p> : null}
    <p className="architecture-footnote">Akses dibatasi untuk owner/admin. Setiap perubahan dicatat dalam audit log. Pastikan migration 011 sudah diterapkan sebelum menyimpan.</p>
  </form>;
}
