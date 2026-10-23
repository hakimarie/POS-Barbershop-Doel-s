"use client";

import { useState, useTransition, type FormEvent } from "react";
import { createBranch } from "@/app/actions/branches";

export default function CreateBranchForm() {
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setSuccess(false);
    const formData = new FormData();
    formData.set("name", name);
    startTransition(async () => {
      const result = await createBranch(formData);
      setMessage(result.message);
      setSuccess(result.ok);
      if (result.ok) window.location.reload();
    });
  }

  return <form className="service-form branch-create-form" onSubmit={handleSubmit}>
    <div className="service-form-intro">
      <h3>Tambah cabang</h3>
      <p>Masukkan nama outlet. Sistem akan membuat kode cabang berikutnya dan satu perangkat kasir utama secara otomatis.</p>
    </div>
    <div className="branch-create-fields">
      <div>
        <label htmlFor="new-branch-name">Nama cabang</label>
        <input id="new-branch-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="Contoh: Doels Pitara" required />
      </div>
      <button className="primary-button form-submit-button" type="submit" disabled={pending || !name.trim()}>{pending ? "Membuat..." : "Tambah cabang"}</button>
    </div>
    {message ? <p className={success ? "shift-message success" : "shift-message error"} role="status">{message}</p> : null}
    <p className="architecture-footnote">Akses khusus owner/admin. Pembuatan cabang dicatat di audit log. Migration 016 harus diterapkan di Supabase sebelum fitur ini dapat menyimpan data.</p>
  </form>;
}
