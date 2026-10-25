import Link from "next/link";
import SignOutButton from "@/components/auth/sign-out-button";
import OrganizationProfileForm from "@/components/settings/organization-profile-form";
import { createClient } from "@/lib/supabase/server";

type Hours = { closed?: boolean; open?: string; close?: string };

export default async function OrganizationProfileSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <main className="auth-shell"><section className="auth-card"><h1>Login diperlukan</h1><p className="auth-description">Silakan login untuk mengatur profil usaha.</p><Link className="text-link" href="/login">Ke halaman login →</Link></section></main>;

  const { data: profile } = await supabase.from("users").select("organization_id,full_name,role,is_active").eq("id", user.id).maybeSingle();
  if (!profile || !profile.is_active || !["owner", "admin"].includes(profile.role)) {
    return <main className="auth-shell"><section className="auth-card"><h1>Akses dibatasi</h1><p className="auth-description">Pengaturan profil organisasi hanya tersedia untuk owner/admin aktif.</p><Link className="text-link" href="/pengaturan">Kembali ke pengaturan →</Link></section></main>;
  }

  const { data: organization } = await supabase.from("organizations").select("*").eq("id", profile.organization_id).maybeSingle();
  const org = (organization ?? {}) as unknown as {
    name?: string; address?: string | null; contact_phone?: string | null;
    receipt_logo_url?: string | null; operating_hours?: Record<string, Hours> | null;
  };
  const defaultHours: Record<string, Hours> = Object.fromEntries(
    ["mon","tue","wed","thu","fri","sat","sun"].map((day) => [day, { closed: false, open: "09:00", close: "21:00" }])
  );
  const hours = { ...defaultHours, ...(org.operating_hours ?? {}) };

  return <main className="app-shell">
    <aside className="sidebar">
      <Link className="brand" href="/" aria-label="KetemuTerus Barber POS beranda"><span className="brand-mark">KT</span><span className="brand-copy"><strong>KetemuTerus</strong><small>BARBER POS</small></span></Link>
      <div className="sidebar-label">WORKSPACE</div>
      <nav className="nav-list" aria-label="Navigasi utama">
        <Link className="nav-item" href="/">▦ Dashboard</Link>
        <Link className="nav-item" href="/kasir">＋ Kasir</Link>
        <Link className="nav-item" href="/layanan">◇ Layanan & harga</Link>
        <Link className="nav-item" href="/barber">♙ Manajemen kapster</Link>
        <Link className="nav-item" href="/cabang">⌖ Cabang</Link>
      </nav>
      <div className="sidebar-settings"><Link className="nav-item active" href="/pengaturan" aria-current="page"><span>⚙</span> Pengaturan</Link></div>
      <div className="sidebar-bottom"><span className="status-dot" /><div><strong>{profile.full_name}</strong><small>{profile.role}</small></div></div>
    </aside>
    <section className="main-panel">
      <header className="topbar"><div className="breadcrumbs"><Link href="/">Workspace</Link><span>/</span><Link href="/pengaturan">Pengaturan</Link><span>/</span><strong>Profil Barbershop</strong></div><div className="topbar-right"><span className="offline-pill"><i /> Profil usaha</span><div className="avatar">KT</div><SignOutButton /></div></header>
      <div className="content settings-page">
        <div className="welcome-row settings-welcome"><div><p className="eyebrow">PENGATURAN UMUM</p><h1>Profil Barbershop</h1><p className="subtitle">Atur identitas usaha, kontak, logo struk, dan jam operasional.</p></div><Link className="secondary-button" href="/pengaturan">← Semua pengaturan</Link></div>
        {!org.name ? <div className="notice"><span className="notice-icon">i</span><div><strong>Data profil belum dapat dimuat.</strong><p>Pastikan organisasi tersedia dan migration 017 sudah diterapkan di Supabase staging. Form di bawah dapat dicoba setelah migration aktif.</p></div></div> : null}
        <OrganizationProfileForm name={org.name ?? ""} address={org.address ?? ""} phone={org.contact_phone ?? ""} logoUrl={org.receipt_logo_url ?? ""} hours={hours} />
      </div>
    </section>
  </main>;
}
