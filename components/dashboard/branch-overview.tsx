"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type Branch = { id: string; code: string; name: string; is_active: boolean };
type Device = { id: string; branch_id: string; device_code: string; device_name: string };
type Shift = { id: string; device_id: string; status: string; opened_at: string; opening_cash_amount: number };

type Props = { branches: Branch[]; devices: Device[]; activeShifts: Shift[] };

export default function BranchOverview({ branches, devices, activeShifts }: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "idle">("all");

  const branchRows = useMemo(() => branches.map((branch) => {
    const branchDevices = devices.filter((device) => device.branch_id === branch.id);
    const openShifts = activeShifts.filter((shift) =>
      shift.status === "open" && branchDevices.some((device) => device.id === shift.device_id)
    );
    return { ...branch, deviceCount: branchDevices.length, openShiftCount: openShifts.length };
  }), [branches, devices, activeShifts]);

  const visibleBranches = branchRows.filter((branch) => {
    const matchesQuery = `${branch.name} ${branch.code}`.toLowerCase().includes(query.trim().toLowerCase());
    const matchesFilter = filter === "all" || (filter === "open" ? branch.openShiftCount > 0 : branch.openShiftCount === 0);
    return matchesQuery && matchesFilter;
  });

  return (
    <section className="section-block branch-overview" aria-labelledby="branch-overview-title">
      <div className="section-heading branch-overview-heading">
        <div>
          <h2 id="branch-overview-title">Monitor cabang</h2>
          <p>Status berdasarkan data cabang, perangkat, dan shift dari Supabase.</p>
        </div>
        <span className="section-count">{branches.length} CABANG AKTIF</span>
      </div>

      <div className="branch-toolbar">
        <label className="branch-search">
          <span aria-hidden="true">⌕</span>
          <input
            aria-label="Cari cabang"
            placeholder="Cari nama atau kode cabang…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="branch-filters" role="group" aria-label="Filter status shift">
          <button type="button" className={filter === "all" ? "branch-filter active" : "branch-filter"} onClick={() => setFilter("all")}>Semua</button>
          <button type="button" className={filter === "open" ? "branch-filter active" : "branch-filter"} onClick={() => setFilter("open")}>Shift aktif</button>
          <button type="button" className={filter === "idle" ? "branch-filter active" : "branch-filter"} onClick={() => setFilter("idle")}>Belum aktif</button>
        </div>
      </div>

      {visibleBranches.length === 0 ? (
        <div className="branch-empty">
          <span className="branch-empty-icon">⌕</span>
          <strong>{branches.length === 0 ? "Belum ada cabang aktif" : "Cabang tidak ditemukan"}</strong>
          <p>{branches.length === 0 ? "Tambahkan cabang dan membership pengguna melalui proses administrasi yang tervalidasi." : "Coba kata kunci atau filter status yang berbeda."}</p>
          {branches.length > 0 ? <button type="button" className="text-link" onClick={() => { setQuery(""); setFilter("all"); }}>Reset pencarian</button> : null}
        </div>
      ) : (
        <div className="branch-grid">
          {visibleBranches.map((branch) => (
            <article className="branch-card" key={branch.id}>
              <div className="branch-card-top">
                <span className="branch-code">{branch.code}</span>
                <span className={branch.openShiftCount > 0 ? "branch-status is-open" : "branch-status is-idle"}>
                  <i />{branch.openShiftCount > 0 ? "Shift aktif" : "Belum ada shift"}
                </span>
              </div>
              <h3>{branch.name}</h3>
              <div className="branch-meta">
                <span><i className="meta-icon">▣</i>{branch.deviceCount} perangkat</span>
                <span><i className="meta-icon">◷</i>{branch.openShiftCount} shift berjalan</span>
              </div>
              <div className="branch-card-bottom">
                <span className="branch-access">Akses terverifikasi</span>
                <Link href="/kasir" aria-label={`Buka modul kasir untuk ${branch.name}`}>Buka kasir <span aria-hidden="true">↗</span></Link>
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="branch-footnote">Informasi mengikuti hak akses akun yang sedang login. Membuka modul kasir tetap memerlukan pemilihan cabang dan perangkat yang valid.</p>
    </section>
  );
}
