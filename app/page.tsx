import Link from "next/link";
import SignOutButton from "@/components/auth/sign-out-button";
import OpenCashShiftForm from "@/components/shifts/open-cash-shift-form";
import BranchOverview from "@/components/dashboard/branch-overview";
import { createClient } from "@/lib/supabase/server";

const quickActions: { number: string; title: string; description: string; href?: string }[] = [
  { number: "01", title: "Kasir baru", description: "Pilih cabang, barber, dan layanan.", href: "/kasir" },
  { number: "02", title: "Riwayat transaksi", description: "Tinjau transaksi dan status pembayaran." },
  { number: "03", title: "Shift kasir", description: "Buka atau tutup shift pada perangkat ini." },
  { number: "04", title: "Kelola layanan", description: "Atur harga layanan untuk tiap cabang.", href: "/layanan" },
];

type WorkspaceProfile = {
  id: string;
  organization_id: string;
  full_name: string;
  email: string;
  role: "owner" | "admin" | "manager" | "cashier" | "barber";
  is_active: boolean;
};
type WorkspaceBranch = { id: string; code: string; name: string; is_active: boolean };
type WorkspaceDevice = { id: string; branch_id: string; device_code: string; device_name: string };

async function getWorkspaceContext() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { profile: null as WorkspaceProfile | null, organizationName: null as string | null, branches: [] as WorkspaceBranch[], devices: [] as WorkspaceDevice[], activeShifts: [] as { id: string; device_id: string; status: string; opened_at: string; opening_cash_amount: number }[], error: "Sesi tidak dapat diverifikasi. Silakan login kembali." };
    }
    const { data, error: profileError } = await supabase.from("users")
      .select("id, organization_id, full_name, email, role, is_active").eq("id", user.id).maybeSingle();
    if (profileError) {
      return { profile: null, organizationName: null, branches: [], devices: [], activeShifts: [], error: "Profil belum dapat dibaca. Periksa policy RLS dan konfigurasi Supabase." };
    }
    if (!data) {
      return { profile: null, organizationName: null, branches: [], devices: [], activeShifts: [], error: "Akun login belum terhubung ke profil POS. Admin perlu membuat baris users dengan ID yang sama dengan Supabase Auth." };
    }
    const profile = data as WorkspaceProfile;
    if (!profile.is_active) {
      return { profile, organizationName: null, branches: [], devices: [], activeShifts: [], error: "Profil POS ini dinonaktifkan. Hubungi administrator." };
    }
    const [{ data: org }, { data: branchData, error: branchError }, { data: deviceData, error: deviceError }, { data: shiftData, error: shiftError }] = await Promise.all([
      supabase.from("organizations").select("name").eq("id", profile.organization_id).maybeSingle(),
      supabase.from("branches").select("id, code, name, is_active").eq("organization_id", profile.organization_id).eq("is_active", true).order("name"),
      supabase.from("devices").select("id, branch_id, device_code, device_name").eq("organization_id", profile.organization_id).eq("is_active", true).order("device_name"),
      supabase.from("cash_shifts").select("id, device_id, status, opened_at, opening_cash_amount").eq("organization_id", profile.organization_id).in("status", ["open", "review_required"]).order("opened_at", { ascending: false }),
    ]);
    if (branchError || deviceError || shiftError) {
      return { profile, organizationName: org?.name ?? null, branches: [], devices: [], activeShifts: [], error: "Profil terverifikasi, tetapi cabang atau perangkat tidak dapat dimuat. Periksa policy RLS." };
    }
    return { profile, organizationName: org?.name ?? null, branches: (branchData ?? []) as WorkspaceBranch[], devices: (deviceData ?? []) as WorkspaceDevice[], activeShifts: shiftData ?? [], error: null };
  } catch {
    return { profile: null, organizationName: null, branches: [], devices: [], activeShifts: [], error: "Supabase belum siap atau konfigurasi server belum lengkap." };
  }
}

export default async function HomePage() {
  const workspace = await getWorkspaceContext();
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
          <Link className="nav-item" href="/kasir"><span>＋</span> Kasir</Link>
          <a className="nav-item" href="#transaksi"><span>↔</span> Transaksi</a>
          <a className="nav-item" href="#shift"><span>◷</span> Shift kasir</a>
          <Link className="nav-item" href="/barber"><span>♙</span> Barber & penugasan</Link>
          <Link className="nav-item" href="/layanan"><span>◇</span> Layanan & harga</Link>
          <Link className="nav-item" href="/cabang"><span>⌖</span> Pengaturan cabang</Link>
          <a className="nav-item" href="#laporan"><span>▤</span> Laporan</a>
        </nav>
        <div className="sidebar-bottom">
          <span className="status-dot" />
          <div><strong>{workspace.profile?.full_name ?? "Sesi terautentikasi"}</strong><small>{workspace.profile ? workspace.profile.role : "Profil POS belum terhubung"}</small></div>
        </div>
      </aside>

      <section className="main-panel" id="dashboard">
        <header className="topbar">
          <div className="breadcrumbs">Workspace <span>/</span> <strong>Dashboard</strong></div>
          <div className="topbar-right"><span className="offline-pill"><i /> Offline-ready · fondasi</span><div className="avatar" aria-label="Doel’s Barbershop">DO</div><SignOutButton /></div>
        </header>
        <div className="content">
          <div className="welcome-row">
            <div>
              <p className="eyebrow">DOEL'S BARBERSHOP · MULTI-CABANG</p>
              <h1>Dashboard operasional</h1>
              <p className="subtitle">Pantau penjualan, shift kasir, dan komisi barber dari satu tempat.</p>
            </div>
            <Link className="primary-button" href="/kasir">＋ Transaksi baru</Link>
          </div>

          {workspace.error ? (
            <div className="notice" role="status">
              <div className="notice-icon">!</div>
              <div><strong>Perlu tindakan administrator</strong><p>{workspace.error}</p></div>
            </div>
          ) : (
            <BranchOverview branches={workspace.branches} devices={workspace.devices} activeShifts={workspace.activeShifts} />
          )}
          {!workspace.error ? (
            <OpenCashShiftForm branches={workspace.branches} devices={workspace.devices} activeShifts={workspace.activeShifts} />
          ) : null}
          <section className="ops-summary" aria-label="Ringkasan operasional">
            <article className="ops-summary-card">
              <span className="ops-summary-icon blue">⌖</span>
              <div><span className="ops-summary-label">Cabang dapat diakses</span><strong>{workspace.branches.length}</strong><small>Dari data organisasi aktif</small></div>
            </article>
            <article className="ops-summary-card">
              <span className="ops-summary-icon violet">▣</span>
              <div><span className="ops-summary-label">Perangkat aktif</span><strong>{workspace.devices.length}</strong><small>Terdaftar di workspace</small></div>
            </article>
            <article className="ops-summary-card">
              <span className="ops-summary-icon green">◷</span>
              <div><span className="ops-summary-label">Shift terbuka</span><strong>{workspace.activeShifts.filter((shift) => shift.status === "open").length}</strong><small>Termasuk perangkat yang terhubung</small></div>
            </article>
            <article className="ops-summary-card">
              <span className="ops-summary-icon amber">!</span>
              <div><span className="ops-summary-label">Perlu ditinjau</span><strong>{workspace.activeShifts.filter((shift) => shift.status === "review_required").length}</strong><small>Shift dengan status review</small></div>
            </article>
          </section>

          <section className="section-block">
            <div className="section-heading"><div><h2>Akses cepat</h2><p>Area kerja utama untuk operasional harian.</p></div><span className="section-count">04 MODUL</span></div>
            <div className="actions-grid">
              {quickActions.map((action) => (
                <article className="action-card" key={action.number}>
                  <span className="action-number">{action.number}</span>
                  <h3>{action.title}</h3>
                  <p>{action.description}</p>
                  {action.href ? <Link className="coming-soon" href={action.href}>Buka modul <span>↗</span></Link> : <span className="coming-soon">Tahap berikutnya <span>↗</span></span> }
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

          </section>
          <footer className="footer">KetemuTerus Barber POS <span>•</span> Internal foundation build <span>•</span> v0.1.0</footer>
        </div>
      </section>
    </main>
  );
}
