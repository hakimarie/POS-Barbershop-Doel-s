"use client";

import { useMemo, useState } from "react";

export type SalesDay = { date: string; revenue: number; transactions: number };
type Props = {
  days: SalesDay[];
  totalRevenue: number;
  paidTransactions: number;
  averageTicket: number;
  pendingPayments: number;
  dataError?: string | null;
};

const idr = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const compactIdr = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });

function shortDate(date: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(date + "T12:00:00Z"));
}

export default function SalesPerformance({ days, totalRevenue, paidTransactions, averageTicket, pendingPayments, dataError }: Props) {
  const [range, setRange] = useState<7 | 30>(7);
  const visibleDays = useMemo(() => days.slice(-range), [days, range]);
  const maxRevenue = Math.max(1, ...visibleDays.map((day) => day.revenue));
  const hasPaidData = visibleDays.some((day) => day.revenue > 0);
  const periodRevenue = visibleDays.reduce((sum, day) => sum + day.revenue, 0);
  const periodTransactions = visibleDays.reduce((sum, day) => sum + day.transactions, 0);
  const barWidth = range === 7 ? 26 : 10;

  return (
    <section className="sales-performance section-block" aria-labelledby="sales-performance-title">
      <div className="section-heading sales-heading">
        <div>
          <h2 id="sales-performance-title">Performa penjualan</h2>
          <p>Hanya transaksi berstatus lunas, berdasarkan data penjualan tersimpan.</p>
        </div>
        <div className="sales-range" role="group" aria-label="Periode laporan penjualan">
          <button type="button" className={range === 7 ? "sales-range-button active" : "sales-range-button"} onClick={() => setRange(7)}>7 hari</button>
          <button type="button" className={range === 30 ? "sales-range-button active" : "sales-range-button"} onClick={() => setRange(30)}>30 hari</button>
        </div>
      </div>

      {dataError ? (
        <div className="sales-data-error" role="status">
          <span className="sales-error-mark">!</span>
          <div><strong>Data penjualan belum dapat dimuat</strong><p>{dataError}</p></div>
        </div>
      ) : (
        <>
          <div className="sales-kpis">
            <article className="sales-kpi sales-kpi-primary">
              <span className="sales-kpi-label">Pendapatan lunas · {range} hari</span>
              <strong>{idr.format(periodRevenue)}</strong>
              <small>Total pendapatan pada periode terpilih</small>
            </article>
            <article className="sales-kpi">
              <span className="sales-kpi-label">Transaksi lunas</span>
              <strong>{periodTransactions.toLocaleString("id-ID")}</strong>
              <small>Dalam periode terpilih</small>
            </article>
            <article className="sales-kpi">
              <span className="sales-kpi-label">Rata-rata transaksi</span>
              <strong>{idr.format(periodTransactions ? periodRevenue / periodTransactions : 0)}</strong>
              <small>Nilai rata-rata per transaksi lunas</small>
            </article>
            <article className="sales-kpi">
              <span className="sales-kpi-label">Menunggu pembayaran</span>
              <strong>{pendingPayments.toLocaleString("id-ID")}</strong>
              <small>Transaksi belum berstatus lunas · 30 hari</small>
            </article>
          </div>

          <div className="sales-chart-panel">
            <div className="sales-chart-heading">
              <div><strong>Tren pendapatan</strong><span>{hasPaidData ? `Total ${idr.format(periodRevenue)} selama ${range} hari` : "Belum ada transaksi lunas pada periode ini"}</span></div>
              <span className="sales-legend"><i /> Pendapatan</span>
            </div>
            {hasPaidData ? (
              <div className={range === 30 ? "sales-chart is-month" : "sales-chart"} role="img" aria-label={`Grafik pendapatan harian selama ${range} hari`}>
                {visibleDays.map((day) => (
                  <div className="sales-chart-column" key={day.date} title={`${shortDate(day.date)}: ${idr.format(day.revenue)} · ${day.transactions} transaksi`}>
                    <div className="sales-bar-track">
                      <div className="sales-bar" style={{ height: `${Math.max(day.revenue > 0 ? 4 : 0, day.revenue / maxRevenue * 100)}%`, width: barWidth }} />
                    </div>
                    <span className="sales-chart-label">{range === 7 ? shortDate(day.date) : new Date(day.date + "T12:00:00Z").getUTCDate() % 5 === 1 ? new Date(day.date + "T12:00:00Z").getUTCDate() : ""}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="sales-chart-empty"><span>▥</span><strong>Belum ada data penjualan</strong><p>Grafik akan terisi setelah transaksi lunas tersimpan.</p></div>
            )}
            <div className="sales-chart-footer"><span>Terendah: {idr.format(Math.min(...visibleDays.map((day) => day.revenue)))}</span><span>Tertinggi: {idr.format(Math.max(...visibleDays.map((day) => day.revenue)))}</span></div>
          </div>
        </>
      )}
      <p className="sales-footnote">Ringkasan ini memakai tanggal transaksi yang tercatat di server dan mengecualikan transaksi yang belum lunas. Data tidak diestimasi atau diisi dengan angka demo.</p>
    </section>
  );
}
