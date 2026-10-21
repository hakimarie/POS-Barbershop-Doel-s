import Link from "next/link";
import SignOutButton from "@/components/auth/sign-out-button";
import OpenCashShiftForm from "@/components/shifts/open-cash-shift-form";
import BranchOverview from "@/components/dashboard/branch-overview";
import SalesPerformance, { type SalesDay } from "@/components/dashboard/sales-performance";
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
    let allowedBranchIds: string[] | null = null;
    if (profile.role !== "owner" && profile.role !== "admin") {
      const { data: memberships, error: membershipError } = await supabase
        .from("branch_memberships")
        .select("branch_id")
        .eq("organization_id", profile.organization_id)
        .eq("user_id", user.id)
        .eq("is_active", true);
      if (membershipError) {
        return { profile, organizationName: org?.name ?? null, branches: [], devices: [], activeShifts: [], error: "Keanggotaan cabang belum dapat diverifikasi. Akses ditutup sampai policy RLS dan membership diperiksa." };
      }
      allowedBranchIds = [...new Set((memberships ?? []).map((membership) => membership.branch_id as string))];
    }
    const scopedBranches = (branchData ?? []).filter((branch) => allowedBranchIds === null || allowedBranchIds.includes(branch.id)) as WorkspaceBranch[];
    const scopedBranchIds = new Set(scopedBranches.map((branch) => branch.id));
    const scopedDevices = ((deviceData ?? []) as WorkspaceDevice[]).filter((device) => scopedBranchIds.has(device.branch_id));
    const scopedDeviceIds = new Set(scopedDevices.map((device) => device.id));
    const scopedShifts = (shiftData ?? []).filter((shift) => scopedDeviceIds.has(shift.device_id));
    return { profile, organizationName: org?.name ?? null, branches: scopedBranches, devices: scopedDevices, activeShifts: scopedShifts, error: null };
  } catch {
    return { profile: null, organizationName: null, branches: [], devices: [], activeShifts: [], error: "Supabase belum siap atau konfigurasi server belum lengkap." };
  }
}

async function getSalesOverview(organizationId: string, branchIds?: string[]): Promise<{ days: SalesDay[]; pendingPayments: number; error: string | null }> {
  const now = new Date();
  const start = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
  const dayKey = (date: Date) => new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
  const days: SalesDay[] = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(start.getTime() + index * 24 * 60 * 60 * 1000);
    return { date: dayKey(date), revenue: 0, transactions: 0 };
  });
  try {
    const supabase = await createClient();
    if (branchIds && branchIds.length === 0) return { days, pendingPayments: 0, error: null };
    let salesQuery = supabase.from("sales").select("id, branch_id, status, total_amount, created_at").eq("organization_id", organizationId).gte("created_at", start.toISOString()).order("created_at", { ascending: true }).limit(10000);
    let pendingQuery = supabase.from("sales").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "pending_payment").gte("created_at", start.toISOString());
    if (branchIds) {
      salesQuery = salesQuery.in("branch_id", branchIds);
      pendingQuery = pendingQuery.in("branch_id", branchIds);
    }
    const [{ data: sales, error: salesError }, { count: pendingPayments, error: pendingError }] = await Promise.all([salesQuery, pendingQuery]);
    if (salesError || pendingError) {
      return { days, pendingPayments: 0, error: "Periksa izin baca tabel sales dan policy RLS. Angka tidak ditampilkan bila query gagal." };
    }
    const indexByDate = new Map(days.map((day, index) => [day.date, index]));
    for (const sale of sales ?? []) {
      const date = dayKey(new Date(sale.created_at));
      const index = indexByDate.get(date);
      if (index === undefined) continue;
      if (sale.status === "paid") {
        days[index].revenue += Number(sale.total_amount ?? 0);
        days[index].transactions += 1;
      }
    }
    return { days, pendingPayments: pendingPayments ?? 0, error: null };
  } catch {
    return { days, pendingPayments: 0, error: "Koneksi atau konfigurasi Supabase belum tersedia untuk laporan penjualan." };
  }
}

export default async function HomePage() {
  const workspace = await getWorkspaceContext();
  const isCentralRole = workspace.profile?.role === "owner" || workspace.profile?.role === "admin";
  const salesOverview = workspace.profile && !workspace.error
    ? await getSalesOverview(workspace.profile.organization_id, isCentralRole ? undefined : workspace.branches.map((branch) => branch.id))
    : null;
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="KetemuTerus Barber POS beranda">
          <span className="brand-mark">KT</span>
          <span className="brand-copy"><strong>KetemuTerus</strong><small>BARBER POS</small></span>
        </Link>
        <div className="sidebar-label">WORKSPACE</div>
        <nav className="nav-list" aria-label="Navigasi utama">
          <a className="nav-item active" href="#dashboard"><span>▦</span> Dashboard</a>
          <Link className="nav-item" href="/kasir"><span>＋</span> Kasir</Link>
          <a className="nav-item" href="#shift"><span>◷</span> Shift kasir</a>
          {isCentralRole ? <><Link className="nav-item" href="/barber"><span>♙</span> Barber & penugasan</Link><Link className="nav-item" href="/layanan"><span>◇</span> Layanan & harga</Link><Link className="nav-item" href="/cabang"><span>⌖</span> Pengaturan cabang</Link><a className="nav-item" href="#laporan"><span>▤</span> Laporan</a></> : null}
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
              <p className="eyebrow">DOEL&apos;S BARBERSHOP · MULTI-CABANG</p>
              <h1>{isCentralRole ? "Dashboard pusat" : workspace.profile?.role === "manager" ? "Dashboard manajer cabang" : workspace.profile?.role === "barber" ? "Dashboard barber" : "Dashboard kasir"}</h1>
              <p className="subtitle">{isCentralRole ? "Pantau performa lintas cabang, penjualan, dan status operasional Doel’s Barbershop." : "Pantau operasional dan transaksi hanya pada cabang yang ditugaskan ke akun Anda."}</p>
            </div>
            {workspace.profile && workspace.profile.role !== "barber" ? <Link className="primary-button" href="/kasir">＋ Transaksi baru</Link> : null}
          </div>

          {workspace.error ? (
            <div className="notice" role="status">
              <div className="notice-icon">!</div>
              <div><strong>Perlu tindakan administrator</strong><p>{workspace.error}</p></div>
            </div>
          ) : (
            <BranchOverview branches={workspace.branches} devices={workspace.devices} activeShifts={workspace.activeShifts} />
          )}
          {!workspace.error && workspace.profile && ["owner", "admin", "manager", "cashier"].includes(workspace.profile.role) ? (
            <OpenCashShiftForm branches={workspace.branches} devices={workspace.devices} activeShifts={workspace.activeShifts} />
          ) : null}
          {salesOverview ? (
            <SalesPerformance days={salesOverview.days} pendingPayments={salesOverview.pendingPayments} dataError={salesOverview.error} />
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
            <div className="section-heading"><div><h2>{isCentralRole ? "Akses manajemen" : "Akses operasional"}</h2><p>{isCentralRole ? "Kontrol lintas cabang dan konfigurasi organisasi." : "Modul yang relevan untuk pekerjaan cabang Anda."}</p></div><span className="section-count">{isCentralRole ? "MANAJEMEN" : "CABANG"}</span></div>
            <div className="actions-grid">
              {quickActions.filter((action) => isCentralRole || action.href === "/kasir").map((action) => (
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
