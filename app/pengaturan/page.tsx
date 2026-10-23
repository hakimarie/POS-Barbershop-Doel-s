import Link from "next/link";
import SignOutButton from "@/components/auth/sign-out-button";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <main className="auth-shell"><section className="auth-card"><h1>Login diperlukan</h1><p className="auth-description">Silakan login untuk membuka pengaturan.</p><Link className="text-link" href="/login">Ke halaman login →</Link></section></main>;

  const { data: profile } = await supabase.from("users").select("organization_id,full_name,role,is_active").eq("id", user.id).maybeSingle();
  if (!profile || !profile.is_active || !["owner", "admin"].includes(profile.role)) {
    return <main className="auth-shell"><section className="auth-card"><h1>Akses pengaturan dibatasi</h1><p className="auth-description">Menu pengaturan organisasi hanya tersedia untuk owner dan admin aktif.</p><Link className="text-link" href="/">Kembali ke dashboard →</Link></section></main>;
  }

  return <main className="app-shell">
    <aside className="sidebar">
      <Link className="brand" href="/" aria-label="KetemuTerus Barber POS beranda"><span className="brand-mark">KT</span><span className="brand-copy"><strong>KetemuTerus</strong><small>BARBER POS</small></span></Link>
      <div className="sidebar-label">WORKSPACE</div>
      <nav className="nav-list" aria-label="Navigasi utama">
        <Link className="nav-item" href="/">▦ Dashboard</Link>
        <Link className="nav-item" href="/kasir">＋ Kasir</Link>
        <Link className="nav-item" href="/layanan">◇ Layanan & harga</Link>
        <Link className="nav-item" href="/barber">♙ Manajemen kapster</Link>
        <Link className="nav-item" href="/cabang">⌖ Pengaturan cabang</Link>
      </nav>
      <div className="sidebar-settings"><Link className="nav-item" href="/pengaturan" aria-current="page"><span>⚙</span> Pengaturan</Link></div>
      <div className="sidebar-bottom"><span className="status-dot" /><div><strong>{profile.full_name}</strong><small>{profile.role}</small></div></div>
    </aside>
    <section className="main-panel">
      <header className="topbar"><div className="breadcrumbs"><Link href="/">Workspace</Link><span>/</span><strong>Pengaturan</strong></div><div className="topbar-right"><span className="offline-pill"><i /> Konfigurasi</span><div className="avatar">KT</div><SignOutButton /></div></header>
      <div className="content">
        <div className="welcome-row"><div><p className="eyebrow">DOEL&apos;S BARBERSHOP · WORKSPACE</p><h1>Pengaturan</h1><p className="subtitle">Pusat akses konfigurasi yang sudah tersedia di POS.</p></div><Link className="secondary-button" href="/">← Dashboard</Link></div>
        <div className="settings-grid">
          <Link className="settings-card" href="/cabang"><span className="settings-card-icon">⌖</span><span className="settings-card-copy"><h2>Cabang & perangkat</h2><p>Tambah cabang, ubah nama outlet, dan kelola perangkat kasir utama.</p></span><span className="settings-card-arrow">↗</span></Link>
          <Link className="settings-card" href="/layanan"><span className="settings-card-icon">◇</span><span className="settings-card-copy"><h2>Layanan & harga</h2><p>Kelola daftar layanan dan harga yang berlaku di setiap cabang.</p></span><span className="settings-card-arrow">↗</span></Link>
          <Link className="settings-card" href="/barber"><span className="settings-card-icon">♙</span><span className="settings-card-copy"><h2>Manajemen kapster</h2><p>Kelola data barber dan penugasan mereka ke cabang.</p></span><span className="settings-card-arrow">↗</span></Link>
        </div>
        <p className="settings-note">Pengaturan metode pembayaran, profil struk, notifikasi, dan langganan belum ditampilkan sebagai menu aktif karena belum tersedia sebagai modul yang dapat dikonfigurasi di versi POS ini.</p>
      </div>
    </section>
  </main>;
}
