import Link from "next/link";
import SignOutButton from "@/components/auth/sign-out-button";
import BarberAssignmentForm from "@/components/barbers/barber-assignment-form";
import { createClient } from "@/lib/supabase/server";

type Branch = { id: string; code: string; name: string };
type Barber = { id: string; barber_code: string; full_name: string; is_active: boolean };
type Assignment = { barber_id: string; branch_id: string; effective_from: string; effective_to: string | null };

export default async function BarberPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <main className="auth-shell"><section className="auth-card"><h1>Login diperlukan</h1><p className="auth-description">Silakan login untuk mengelola data barber.</p><Link className="text-link" href="/login">Ke halaman login →</Link></section></main>;

  const { data: profile } = await supabase.from("users").select("organization_id,full_name,role,is_active").eq("id", user.id).maybeSingle();
  if (!profile || !profile.is_active || !["owner", "admin", "manager", "cashier"].includes(profile.role)) {
    return <main className="auth-shell"><section className="auth-card"><h1>Akses barber tidak tersedia</h1><p className="auth-description">Profil POS aktif diperlukan untuk membuka data barber.</p><Link className="text-link" href="/">Kembali ke dashboard →</Link></section></main>;
  }

  const now = new Date().toISOString();
  const [{ data: branchRows }, { data: barberRows }, { data: assignmentRows }] = await Promise.all([
    supabase.from("branches").select("id,code,name").eq("organization_id", profile.organization_id).eq("is_active", true).order("code"),
    supabase.from("barbers").select("id,barber_code,full_name,is_active").eq("organization_id", profile.organization_id).order("barber_code"),
    supabase.from("barber_branch_assignments").select("barber_id,branch_id,effective_from,effective_to").eq("organization_id", profile.organization_id).lte("effective_from", now),
  ]);
  const branches = (branchRows ?? []) as Branch[];
  const barbers = (barberRows ?? []) as Barber[];
  const assignments = ((assignmentRows ?? []) as Assignment[]).filter((a) => !a.effective_to || Date.parse(a.effective_to) > Date.now());
  const branchMap = new Map(branches.map((branch) => [branch.id, branch]));
  const canManage = profile.role === "owner" || profile.role === "admin";

  return <main className="app-shell">
    <aside className="sidebar">
      <Link className="brand" href="/" aria-label="KetemuTerus Barber POS beranda"><span className="brand-mark">KT</span><span className="brand-copy"><strong>KetemuTerus</strong><small>BARBER POS</small></span></Link>
      <div className="sidebar-label">WORKSPACE</div>
      <nav className="nav-list" aria-label="Navigasi utama">
        <Link className="nav-item" href="/">▦ Dashboard</Link>
        <Link className="nav-item" href="/kasir">＋ Kasir</Link>
        <Link className="nav-item" href="/layanan">◇ Layanan & harga</Link>
        <Link className="nav-item active" href="/barber" aria-current="page">♙ Manajemen kapster</Link>
      </nav>
      <div className="sidebar-settings">{canManage ? <Link className="nav-item" href="/pengaturan"><span>⚙</span> Pengaturan</Link> : null}</div>
      <div className="sidebar-bottom"><span className="status-dot" /><div><strong>{profile.full_name}</strong><small>{profile.role}</small></div></div>
    </aside>
    <section className="main-panel">
      <header className="topbar"><div className="breadcrumbs"><Link href="/">Workspace</Link><span>/</span><strong>Barber</strong></div><div className="topbar-right"><span className="offline-pill"><i /> Master data</span><div className="avatar">DO</div><SignOutButton /></div></header>
      <div className="content">
        <div className="welcome-row"><div><p className="eyebrow">DOEL&apos;S BARBERSHOP · MASTER DATA</p><h1>Manajemen kapster</h1><p className="subtitle">Kelola barber aktif dan cabang tempat mereka dapat menerima transaksi.</p></div><Link className="secondary-button" href="/">← Dashboard</Link></div>
        {!canManage ? <div className="notice"><div className="notice-icon">i</div><div><strong>Mode lihat saja</strong><p>Hanya owner/admin yang dapat menambah atau mengaktifkan barber dan penugasan cabang.</p></div></div> : <BarberAssignmentForm branches={branches} />}
        <section className="section-block">
          <div className="section-heading"><div><h2>Daftar barber</h2><p>Penugasan aktif ditentukan berdasarkan periode efektif.</p></div><span className="section-count">{barbers.filter((b) => b.is_active).length} BARBER AKTIF</span></div>
          {barbers.length === 0 ? <div className="notice"><div className="notice-icon">i</div><div><strong>Belum ada data barber</strong><p>Tambahkan barber menggunakan formulir di atas.</p></div></div> : <div className="service-table-wrap"><table className="service-table"><thead><tr><th>Kode</th><th>Nama barber</th><th>Status</th><th>Cabang aktif</th></tr></thead><tbody>{barbers.map((barber) => {
            const activeAssignments = assignments.filter((a) => a.barber_id === barber.id);
            const branchNames = activeAssignments.map((a) => branchMap.get(a.branch_id)).filter(Boolean).map((b) => b!.name);
            return <tr key={barber.id}><td><span className="service-code">{barber.barber_code}</span></td><td><strong>{barber.full_name}</strong></td><td><span className={barber.is_active ? "status-tag active-tag" : "status-tag inactive-tag"}>{barber.is_active ? "Aktif" : "Nonaktif"}</span></td><td>{branchNames.length ? branchNames.join(", ") : <span className="muted-text">Belum ditugaskan</span>}</td></tr>;
          })}</tbody></table></div>}
        </section>
        <footer className="footer">KetemuTerus Barber POS <span>•</span> Master data barber <span>•</span> Uji staging</footer>
      </div>
    </section>
  </main>;
}
