"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type Branch = { id: string; code: string; name: string; is_active: boolean };
type Device = { id: string; branch_id: string; device_code: string; device_name: string };
type Shift = { id: string; device_id: string; status: string; opened_at: string; opening_cash_amount: number };
type Props = { branches: Branch[]; devices: Device[]; activeShifts: Shift[] };

export default function BranchOverview({ branches, devices, activeShifts }: Props) {
  const [showAll, setShowAll] = useState(false);
  const branchRows = useMemo(() => branches.map((branch) => {
    const branchDevices = devices.filter((device) => device.branch_id === branch.id);
    const openShifts = activeShifts.filter((shift) =>
      shift.status === "open" && branchDevices.some((device) => device.id === shift.device_id)
    );
    return { ...branch, deviceCount: branchDevices.length, openShiftCount: openShifts.length };
  }), [branches, devices, activeShifts]);
  const displayedBranches = showAll ? branchRows : branchRows.slice(0, 1);

  return (
    <section className="section-block branch-overview branch-overview-simple" aria-labelledby="branch-overview-title">
      <div className="section-heading branch-overview-heading">
        <div>
          <h2 id="branch-overview-title">Monitor cabang</h2>
          <p>{branches.length} cabang terdaftar · ringkasan menampilkan satu cabang dulu.</p>
        </div>
        <Link className="branch-add-button" href="/cabang"><span aria-hidden="true">＋</span> Tambah cabang</Link>
      </div>

      {displayedBranches.length === 0 ? (
        <div className="branch-empty">
          <span className="branch-empty-icon">⌖</span>
          <strong>Belum ada cabang aktif</strong>
          <p>Tambahkan cabang pertama untuk mulai mengatur perangkat kasir.</p>
          <Link className="text-link" href="/cabang">Tambah cabang →</Link>
        </div>
      ) : (
        <div className="branch-grid branch-grid-simple">
          {displayedBranches.map((branch) => (
            <article className="branch-card branch-card-simple" key={branch.id}>
              <div className="branch-card-top">
                <span className="branch-code">{branch.code}</span>
                <span className={branch.openShiftCount > 0 ? "branch-status is-open" : "branch-status is-idle"}>
                  <i />{branch.openShiftCount > 0 ? "Shift aktif" : "Belum ada shift"}
                </span>
              </div>
              <div className="branch-card-simple-main">
                <div><h3>{branch.name}</h3><p>{branch.deviceCount} perangkat aktif</p></div>
                <Link href="/kasir" aria-label={`Buka modul kasir untuk ${branch.name}`}>Buka kasir <span aria-hidden="true">↗</span></Link>
              </div>
            </article>
          ))}
        </div>
      )}
      {branchRows.length > 1 ? (
        <button className="branch-expand-button" type="button" onClick={() => setShowAll((value) => !value)}>
          {showAll ? "Tampilkan satu cabang saja" : `Tampilkan semua ${branchRows.length} cabang`}
          <span aria-hidden="true">{showAll ? "↑" : "↓"}</span>
        </button>
      ) : null}
    </section>
  );
}
