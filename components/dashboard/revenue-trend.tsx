"use client";

import { useMemo, useState } from "react";

type Sale = { branch_id: string; total_amount: number; created_at: string; status: string };
type Props = { sales: Sale[]; loadError: boolean; branches: { id: string; name: string }[] };

const idr = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const shortIDR = (value: number) => value >= 1_000_000 ? `Rp${(value / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt` : value >= 1_000 ? `Rp${Math.round(value / 1_000)} rb` : `Rp${value.toLocaleString("id-ID")}`;

function localDayKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export default function RevenueTrend({ sales, loadError, branches }: Props) {
  const [period, setPeriod] = useState<7 | 30>(7);
  const chart = useMemo(() => {
    const now = new Date();
    const todayKey = localDayKey(now);
    const days = Array.from({ length: period }, (_, index) => {
      const date = new Date(now.getTime() - (period - 1 - index) * 86400000);
      const key = localDayKey(date);
      return { key, label: new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: period === 7 ? "short" : "2-digit" }).format(date), revenue: 0, transactions: 0 };
    });
    const byKey = new Map(days.map(day => [day.key, day]));
    sales.filter(sale => sale.status === "paid").forEach(sale => {
      const day = byKey.get(localDayKey(new Date(sale.created_at)));
      if (day) { day.revenue += Number(sale.total_amount) || 0; day.transactions += 1; }
    });
    return { days, todayKey, totalRevenue: days.reduce((sum, day) => sum + day.revenue, 0), totalTransactions: days.reduce((sum, day) => sum + day.transactions, 0) };
  }, [sales, period]);

  const max = Math.max(1, ...chart.days.map(day => day.revenue));
  const width = 640, height = 190, left = 12, right = 12, top = 16, bottom = 28;
  const points = chart.days.map((day, index) => {
    const x = left + (index * (width - left - right)) / Math.max(1, chart.days.length - 1);
    const y = top + (height - top - bottom) * (1 - day.revenue / max);
    return { ...day, x, y };
  });
  const line = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const area = `${line} L ${points[points.length - 1]?.x ?? left} ${height - bottom} L ${points[0]?.x ?? left} ${height - bottom} Z`;
  const today = chart.days.find(day => day.key === chart.todayKey);

  return (
    <section className="section-block revenue-panel" aria-labelledby="revenue-title">
      <div className="section-heading revenue-heading">
        <div><h2 id="revenue-title">Tren pendapatan</h2><p>Penjualan berstatus lunas, berdasarkan waktu transaksi Jakarta.</p></div>
        <div className="branch-filters" role="group" aria-label="Periode grafik">
          <button type="button" className={period === 7 ? "branch-filter active" : "branch-filter"} onClick={() => setPeriod(7)}>7 hari</button>
          <button type="button" className={period === 30 ? "branch-filter active" : "branch-filter"} onClick={() => setPeriod(30)}>30 hari</button>
        </div>
      </div>
      {loadError ? (
        <div className="revenue-empty"><strong>Data pendapatan belum dapat dimuat</strong><p>Periksa policy RLS tabel sales dan konfigurasi Supabase. Angka tidak ditampilkan sebagai data aktual sebelum query berhasil.</p></div>
      ) : (
        <>
          <div className="revenue-highlights">
            <div><span>Total {period} hari</span><strong>{idr.format(chart.totalRevenue)}</strong><small>{chart.totalTransactions} transaksi lunas</small></div>
            <div><span>Pendapatan hari ini</span><strong>{idr.format(today?.revenue ?? 0)}</strong><small>{today?.transactions ?? 0} transaksi lunas</small></div>
          </div>
          {chart.totalTransactions === 0 ? (
            <div className="revenue-empty"><strong>Belum ada transaksi lunas pada periode ini</strong><p>Grafik akan terisi otomatis saat data penjualan berstatus paid tersedia.</p></div>
          ) : (
            <div className="revenue-chart-wrap">
              <div className="revenue-axis"><span>{shortIDR(max)}</span><span>{shortIDR(max / 2)}</span><span>Rp0</span></div>
              <svg className="revenue-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Grafik pendapatan ${period} hari terakhir`} preserveAspectRatio="none">
                <defs><linearGradient id="revenue-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#2563eb" stopOpacity=".2"/><stop offset="100%" stopColor="#2563eb" stopOpacity=".015"/></linearGradient></defs>
                {[0, .5, 1].map(tick => <line key={tick} x1={left} x2={width-right} y1={top+(height-top-bottom)*tick} y2={top+(height-top-bottom)*tick} stroke="#e8edf5" strokeDasharray="4 5" />)}
                <path d={area} fill="url(#revenue-fill)" />
                <path d={line} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                {points.map(point => <circle key={point.key} cx={point.x} cy={point.y} r={period === 7 ? 4 : 2.5} fill="#fff" stroke="#2563eb" strokeWidth="2" vectorEffect="non-scaling-stroke"><title>{point.label}: {idr.format(point.revenue)} · {point.transactions} transaksi</title></circle>)}
              </svg>
              <div className="revenue-labels">{points.filter((_, index) => period === 7 || index % 5 === 0 || index === points.length - 1).map(point => <span key={point.key}>{point.label}</span>)}</div>
            </div>
          )}
          <div className="revenue-branch-note">{branches.length} cabang dalam workspace · Grafik mencakup seluruh cabang yang dapat diakses.</div>
        </>
      )}
    </section>
  );
}
