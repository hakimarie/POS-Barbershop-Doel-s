const stats = [
  { label: "Penjualan hari ini", value: "Rp 0", note: "Belum ada transaksi tersinkron" },
  { label: "Transaksi", value: "0", note: "Semua metode pembayaran" },
  { label: "Komisi barber", value: "Rp 0", note: "Menunggu data transaksi" },
  { label: "Status sinkronisasi", value: "Siap", note: "Antrean offline belum diaktifkan" },
];

const quickActions = [
  { number: "01", title: "Kasir baru", description: "Pilih cabang, barber, dan layanan." },
  { number: "02", title: "Riwayat transaksi", description: "Tinjau transaksi dan status pembayaran." },
  { number: "03", title: "Shift kasir", description: "Buka atau tutup shift pada perangkat ini." },
  { number: "04", title: "Kelola layanan", description: "Atur harga layanan untuk tiap cabang." },
];

export default function HomePage() {
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="KetemuTerus Barber POS beranda">
          <span className="brand-mark">KT</span>
          <span className="brand-copy"><strong>KetemuTerus</strong><small>BARBER POS</small></span>
        </a>
        <div className="sidebar-label">WORKSPACE</div>
        <nav className="nav-list" aria-label="Navigasi utama">
          <a className="nav-item active" href="#dashboard"><span>▦</span> Dashboard</a>
          <a className="nav-item" href="#kasir"><span>＋</span> Kasir</a>
          <a className="nav-item" href="#transaksi"><span>↔</span> Transaksi</a>
          <a className="nav-item" href="#shift"><span>◷</span> Shift kasir</a>
          <a className="nav-item" href="#barber"><span>♙</span> Barber & komisi</a>
          <a className="nav-item" href="#layanan"><span>◇</span> Layanan & harga</a>
          <a className="nav-item" href="#cabang"><span>⌖</span> Cabang</a>
          <a className="nav-item" href="#laporan"><span>▤</span> Laporan</a>
        </nav>
        <div className="sidebar-bottom">
          <span className="status-dot" />
          <div><strong>Mode demo</strong><small>Belum terhubung ke database</small></div>
        </div>
      </aside>

      <section className="main-panel" id="dashboard">
        <header className="topbar">
          <div className="breadcrumbs">Workspace <span>/</span> <strong>Dashboard</strong></div>
          <div className="topbar-right"><span className="offline-pill"><i /> Offline-ready · fondasi</span><div className="avatar">DO</div></div>
        </header>
        <div className="content">
          <div className="welcome-row">
            <div>
              <p className="eyebrow">DOEL'S BARBERSHOP · MULTI-CABANG</p>
              <h1>Dashboard operasional</h1>
              <p className="subtitle">Pantau penjualan, shift kasir, dan komisi barber dari satu tempat.</p>
            </div>
            <button className="primary-button" type="button" disabled title="Akan aktif setelah alur transaksi dibangun">＋ Transaksi baru</button>
          </div>

          <div className="notice">
            <div className="notice-icon">i</div>
            <div><strong>Fondasi aplikasi sudah disiapkan</strong><p>Angka di bawah adalah placeholder. Data penjualan nyata baru ditampilkan setelah Supabase dikonfigurasi dan alur transaksi diuji.</p></div>
          </div>

          <section className="stats-grid" aria-label="Ringkasan metrik">
            {stats.map((stat) => (
              <article className="stat-card" key={stat.label}>
                <span className="stat-label">{stat.label}</span>
                <strong className="stat-value">{stat.value}</strong>
                <span className="stat-note">{stat.note}</span>
              </article>
            ))}
          </section>

          <section className="section-block">
            <div className="section-heading"><div><h2>Akses cepat</h2><p>Area kerja utama untuk operasional harian.</p></div><span className="section-count">04 MODUL</span></div>
            <div className="actions-grid">
              {quickActions.map((action) => (
                <article className="action-card" key={action.number}>
                  <span className="action-number">{action.number}</span>
                  <h3>{action.title}</h3>
                  <p>{action.description}</p>
                  <span className="coming-soon">Tahap berikutnya <span>↗</span></span>
                </article>
              ))}
            </div>
          </section>

          <section className="section-block lower-grid">
            <article className="panel-card">
              <div className="section-heading"><div><h2>Kontrol operasional</h2><p>Hal-hal yang perlu siap sebelum rollout.</p></div></div>
              <ul className="check-list">
                <li><span className="check pending">1</span><div><strong>Konfigurasi 10 cabang</strong><small>Data cabang dan perangkat kasir</small></div><span className="tag pending-tag">Belum</span></li>
                <li><span className="check pending">2</span><div><strong>Harga layanan per cabang</strong><small>Daftar layanan dan harga efektif</small></div><span className="tag pending-tag">Belum</span></li>
                <li><span className="check pending">3</span><div><strong>Supabase Auth & RLS</strong><small>Login dan pembatasan akses data</small></div><span className="tag pending-tag">Belum</span></li>
                <li><span className="check pending">4</span><div><strong>Offline sync & QRIS</strong><small>Antrean lokal dan konfirmasi pembayaran</small></div><span className="tag pending-tag">Belum</span></li>
              </ul>
            </article>
            <article className="panel-card architecture-card">
              <span className="mini-label">TECH STACK</span><h2>Fondasi sistem</h2>
              <div className="stack-item"><span className="stack-icon next-icon">N</span><div><strong>Next.js + TypeScript</strong><small>Web POS / PWA</small></div></div>
              <div className="stack-item"><span className="stack-icon supa-icon">S</span><div><strong>Supabase</strong><small>PostgreSQL + Auth + RLS</small></div></div>
              <div className="stack-item"><span className="stack-icon local-icon">↻</span><div><strong>IndexedDB + sync queue</strong><small>Transaksi saat koneksi terputus</small></div></div>
              <p className="architecture-footnote">Keamanan transaksi, aturan komisi, dan sinkronisasi perlu diuji sebelum digunakan di cabang.</p>
            </article>
          </section>
          <footer className="footer">KetemuTerus Barber POS <span>•</span> Internal foundation build <span>•</span> v0.1.0</footer>
        </div>
      </section>
    </main>
  );
}
