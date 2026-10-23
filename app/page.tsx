import Link from "next/link";
import SignOutButton from "@/components/auth/sign-out-button";
import OpenCashShiftForm from "@/components/shifts/open-cash-shift-form";
import BranchOverview from "@/components/dashboard/branch-overview";
import SalesPerformance, { type SalesDay } from "@/components/dashboard/sales-performance";
import { createClient } from "@/lib/supabase/server";

const quickActions: { number: string; title: string; description: string; href: string }[] = [
  { number: "01", title: "Kasir", description: "Buat transaksi layanan barber.", href: "/kasir" },
  { number: "02", title: "Layanan & harga", description: "Atur layanan dan harga per cabang.", href: "/layanan" },
  { number: "03", title: "Barber", description: "Kelola barber dan penugasan cabang.", href: "/barber" },
  { number: "04", title: "Pengaturan cabang", description: "Periksa cabang dan perangkat kasir.", href: "/cabang" },
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

type SetupStep = { number: string; title: string; description: string; href: string; complete: boolean | null };

async function getSetupSteps(organizationId: string, branches: WorkspaceBranch[], devices: WorkspaceDevice[], activeShifts: { status: string }[]): Promise<SetupStep[]> {
  const now = new Date().toISOString();
  try {
    const supabase = await createClient();
    const [{ data: serviceRows, error: servicesError }, { data: priceRows, error: pricesError }, { data: barberRows, error: barbersError }, { data: assignmentRows, error: assignmentsError }, { count: paidSales, error: salesError }] = await Promise.all([
      supabase.from("services").select("id").eq("organization_id", organizationId).eq("is_active", true),
      supabase.from("branch_service_prices").select("branch_id,service_id,effective_from,effective_to").eq("organization_id", organizationId).lte("effective_from", now),
      supabase.from("barbers").select("id").eq("organization_id", organizationId).eq("is_active", true),
      supabase.from("barber_branch_assignments").select("branch_id,barber_id,effective_from,effective_to").eq("organization_id", organizationId).lte("effective_from", now),
      supabase.from("sales").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "paid"),
    ]);
    const services = serviceRows ?? [];
    const activeServices = new Set(services.map((service) => service.id));
    const effectivePrices = (priceRows ?? []).filter((price) => !price.effective_to || Date.parse(price.effective_to) > Date.now());
    const pricePairs = new Set(effectivePrices.filter((price) => activeServices.has(price.service_id)).map((price) => `${price.branch_id}:${price.service_id}`));
    const priceCoverageComplete = branches.length > 0 && activeServices.size > 0 && branches.every((branch) => [...activeServices].every((serviceId) => pricePairs.has(`${branch.id}:${serviceId}`)));
    const activeBarbers = new Set((barberRows ?? []).map((barber) => barber.id));
    const currentAssignments = (assignmentRows ?? []).filter((assignment) => (!assignment.effective_to || Date.parse(assignment.effective_to) > Date.now()) && activeBarbers.has(assignment.barber_id));
    const assignedBranches = new Set(currentAssignments.map((assignment) => assignment.branch_id));
    const barberCoverageComplete = activeBarbers.size > 0 && branches.length > 0 && branches.every((item) => assignedBranches.has(item.id));
    return [
      { number: "01", title: "Cabang & perangkat", description: `${branches.length} cabang aktif · ${devices.length} perangkat aktif. Target awal: 10 cabang dan perangkat terdaftar.`, href: "/cabang", complete: branches.length >= 10 && branches.every((item) => devices.some((device) => device.branch_id === item.id)) },
      { number: "02", title: "Layanan & harga", description: "Setiap layanan aktif perlu memiliki harga efektif di seluruh cabang aktif.", href: "/layanan", complete: servicesError || pricesError ? null : priceCoverageComplete },
      { number: "03", title: "Barber & penugasan", description: "Pastikan barber aktif ditugaskan ke setiap cabang yang beroperasi.", href: "/barber", complete: barbersError || assignmentsError ? null : barberCoverageComplete },
      { number: "04", title: "Shift kasir", description: "Buka shift sebelum mulai mencatat transaksi.", href: "/kasir", complete: activeShifts.some((shift) => shift.status === "open") },
      { number: "05", title: "Transaksi pertama", description: "Checklist selesai setelah transaksi berstatus lunas tercatat.", href: "/kasir", complete: salesError ? null : (paidSales ?? 0) > 0 },
    ];
  } catch {
    return [
      { number: "01", title: "Cabang & perangkat", description: "Status setup belum dapat diverifikasi dari database.", href: "/cabang", complete: null },
      { number: "02", title: "Layanan & harga", description: "Status setup belum dapat diverifikasi dari database.", href: "/layanan", complete: null },
      { number: "03", title: "Barber & penugasan", description: "Status setup belum dapat diverifikasi dari database.", href: "/barber", complete: null },
      { number: "04", title: "Shift kasir", description: "Status setup belum dapat diverifikasi dari database.", href: "/kasir", complete: null },
      { number: "05", title: "Transaksi pertama", description: "Status setup belum dapat diverifikasi dari database.", href: "/kasir", complete: null },
    ];
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

function OnboardingChecklist({ steps }: { steps: SetupStep[] }) {
  const completed = steps.filter((step) => step.complete === true).length;
  const percent = Math.round((completed / steps.length) * 100);
  return (
    <section className="onboarding-panel section-block" aria-labelledby="onboarding-title">
      <div className="onboarding-header">
        <div><p className="eyebrow">PANDUAN PENGGUNA BARU</p><h2 id="onboarding-title">Siapkan POS barbershop</h2><p>Ikuti langkah inti sebelum sistem dipakai operasional di seluruh cabang.</p></div>
        <div className="onboarding-progress"><strong>{completed}/{steps.length}</strong><span>langkah selesai</span></div>
      </div>
      <div className="progress-track" role="progressbar" aria-label="Progres persiapan POS" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={completed}><span style={{ width: `${percent}%` }} /></div>
      <div className="onboarding-steps">
        {steps.map((step) => (
          <article className={`onboarding-step ${step.complete === true ? "is-complete" : step.complete === null ? "is-unknown" : ""}`} key={step.number}>
            <span className="onboarding-step-number">{step.complete === true ? "✓" : step.number}</span>
            <div className="onboarding-step-copy"><h3>{step.title}</h3><p>{step.description}</p></div>
            <span className={`onboarding-status ${step.complete === true ? "status-done" : step.complete === null ? "status-unknown" : "status-pending"}`}>{step.complete === true ? "Selesai" : step.complete === null ? "Belum diverifikasi" : "Perlu disiapkan"}</span>
            <Link className="onboarding-link" href={step.href}>{step.complete === true ? "Buka" : "Lanjut"} <span aria-hidden="true">↗</span></Link>
          </article>
        ))}
      </div>
      <p className="onboarding-footnote">Status berasal dari data yang dapat dibaca dashboard. Offline sync dan QRIS tidak ditandai selesai hanya karena konfigurasi dasar tersedia.</p>
    </section>
  );
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
                  <Link className="coming-soon" href={action.href}>Buka modul <span>↗</span></Link>
                </article>
              ))}
            </div>
          </section>

          {isCentralRole && !workspace.error && workspace.profile ? (
            <OnboardingChecklist steps={await getSetupSteps(workspace.profile.organization_id, workspace.branches, workspace.devices, workspace.activeShifts)} />
          ) : null}
          <footer className="footer">KetemuTerus Barber POS <span>•</span> Internal foundation build <span>•</span> v0.1.0</footer>
        </div>
      </section>
    </main>
  );
}
