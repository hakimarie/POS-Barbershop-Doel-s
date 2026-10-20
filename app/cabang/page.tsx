import Link from "next/link";
import SignOutButton from "@/components/auth/sign-out-button";
import BranchNameForm from "@/components/branches/branch-name-form";
import { createClient } from "@/lib/supabase/server";

type Branch = { id: string; code: string; name: string; is_active: boolean };

export default async function BranchesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <main className="auth-shell"><section className="auth-card"><h1>Login diperlukan</h1><p className="auth-description">Silakan login untuk mengelola nama cabang.</p><Link className="text-link" href="/login">Ke halaman login →</Link></section></main>;

  const { data: profile } = await supabase.from("users").select("organization_id,full_name,role,is_active").eq("id", user.id).maybeSingle();
  if (!profile || !profile.is_active) return <main className="auth-shell"><section className="auth-card"><h1>Profil POS tidak tersedia</h1><p className="auth-description">Akun ini belum memiliki profil POS aktif.</p><Link className="text-link" href="/">Kembali ke dashboard →</Link></section></main>;

  const { data, error } = await supabase.from("branches").select("id,code,name,is_active").eq("organization_id", profile.organization_id).order("code");
  const branches = (data ?? []) as Branch[];
  const canManage = profile.role === "owner" || profile.role === "admin";

  return <main className="app-shell">
    <aside className="sidebar">
      <Link className="brand" href="/" aria-label="KetemuTerus Barber POS beranda"><span className="brand-mark">KT</span><span className="brand-copy"><strong>KetemuTerus</strong><small>BARBER POS</small></span></Link>
      <div className="sidebar-label">WORKSPACE</div>
      <nav className="nav-list" aria-label="Navigasi utama">
        <Link className="nav-item" href="/">▦ Dashboard</Link>
        <Link className="nav-item" href="/kasir">＋ Kasir</Link>
        <Link className="nav-item" href="/layanan">◇ Layanan & harga</Link>
        <Link className="nav-item" href="/barber">♙ Barber & penugasan</Link>
        <Link className="nav-item active" href="/cabang" aria-current="page">⌖ Cabang</Link>
      </nav>
      <div className="sidebar-bottom"><span className="status-dot" /><div><strong>{profile.full_name}</strong><small>{profile.role}</small></div></div>
    </aside>
    <section className="main-panel">
      <header className="topbar"><div className="breadcrumbs"><Link href="/">Workspace</Link><span>/</span><strong>Cabang</strong></div><div className="topbar-right"><span className="offline-pill"><i /> Master data</span><div className="avatar">DO</div><SignOutButton /></div></header>
      <div className="content">
        <div className="welcome-row"><div><p className="eyebrow">DOEL&apos;S BARBERSHOP · MASTER DATA</p><h1>Pengaturan cabang</h1><p className="subtitle">Tetapkan nama outlet tanpa mengganti kode internal cabang.</p></div><Link className="secondary-button" href="/">← Kembali ke dashboard</Link></div>
        {error ? <div className="notice"><div className="notice-icon">!</div><div><strong>Data cabang belum dapat dimuat</strong><p>Periksa koneksi Supabase dan policy RLS.</p></div></div> : null}
        {!error && canManage ? <BranchNameForm branches={branches.filter((branch) => branch.is_active)} /> : null}
        {!canManage ? <div className="notice"><div className="notice-icon">i</div><div><strong>Mode lihat saja</strong><p>Hanya owner/admin yang dapat mengganti nama cabang.</p></div></div> : null}
        <section className="section-block">
          <div className="section-heading"><div><h2>Daftar cabang</h2><p>ID dan kode internal tetap stabil walaupun nama outlet berubah.</p></div><span className="section-count">{branches.length} CABANG</span></div>
          {branches.length === 0 ? <div className="notice"><div className="notice-icon">i</div><div><strong>Belum ada cabang</strong><p>Cabang akan muncul setelah data tersedia.</p></div></div> :
            <div className="service-table-wrap"><table className="service-table"><thead><tr><th>Kode</th><th>Nama cabang</th><th>Status</th></tr></thead><tbody>{branches.map((branch) => <tr key={branch.id}><td><span className="service-code">{branch.code}</span></td><td><strong>{branch.name}</strong></td><td><span className={branch.is_active ? "status-tag active-tag" : "status-tag inactive-tag"}>{branch.is_active ? "Aktif" : "Nonaktif"}</span></td></tr>)}</tbody></table></div>}
        </section>
        <div className="notice"><div className="notice-icon">i</div><div><strong>Integritas data</strong><p>Mengubah nama cabang tidak mengubah ID, kode, transaksi, shift, harga efektif, atau komisi historis. Perubahan nama dicatat di audit log.</p></div></div>
        <footer className="footer">KetemuTerus Barber POS <span>•</span> Master data cabang</footer>
      </div>
    </section>
  </main>;
}
