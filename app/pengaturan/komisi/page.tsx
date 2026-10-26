import Link from "next/link";
import SignOutButton from "@/components/auth/sign-out-button";
import CommissionRateForm from "@/components/commissions/commission-rate-form";
import { createClient } from "@/lib/supabase/server";

type Barber = { id: string; barber_code: string; full_name: string; is_active: boolean };
type Assignment = { barber_id: string; tier_id: string; effective_from: string; effective_to: string | null };
type TierVersion = { tier_id: string; rate_bps: number; effective_from: string; effective_to: string | null };

export default async function CommissionSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <main className="auth-shell"><section className="auth-card"><h1>Login diperlukan</h1><p className="auth-description">Silakan login untuk mengatur komisi.</p><Link className="text-link" href="/login">Ke halaman login →</Link></section></main>;

  const { data: profile } = await supabase.from("users").select("organization_id,full_name,role,is_active").eq("id", user.id).maybeSingle();
  if (!profile || !profile.is_active || !["owner", "admin"].includes(profile.role)) {
    return <main className="auth-shell"><section className="auth-card"><h1>Akses pengaturan dibatasi</h1><p className="auth-description">Hanya owner/admin aktif yang dapat mengubah tarif komisi.</p><Link className="text-link" href="/">Kembali ke dashboard →</Link></section></main>;
  }

  const now = new Date().toISOString();
  const [{ data: barberRows, error: barberError }, { data: assignmentRows, error: assignmentError }, { data: versionRows, error: versionError }] = await Promise.all([
    supabase.from("barbers").select("id,barber_code,full_name,is_active").eq("organization_id", profile.organization_id).eq("is_active", true).order("barber_code"),
    supabase.from("barber_commission_assignments").select("barber_id,tier_id,effective_from,effective_to").eq("organization_id", profile.organization_id).lte("effective_from", now),
    supabase.from("commission_tier_versions").select("tier_id,rate_bps,effective_from,effective_to").eq("organization_id", profile.organization_id).lte("effective_from", now),
  ]);

  const dataError = barberError || assignmentError || versionError;
  const barbers = (barberRows ?? []) as Barber[];
  const assignments = ((assignmentRows ?? []) as Assignment[]).filter((row) => !row.effective_to || Date.parse(row.effective_to) > Date.now());
  const versions = ((versionRows ?? []) as TierVersion[]).filter((row) => !row.effective_to || Date.parse(row.effective_to) > Date.now());
  const rateForBarber = new Map<string, number>();
  for (const assignment of assignments) {
    const version = versions.filter((row) => row.tier_id === assignment.tier_id).sort((a, b) => Date.parse(b.effective_from) - Date.parse(a.effective_from))[0];
    if (version) rateForBarber.set(assignment.barber_id, version.rate_bps / 100);
  }
  const formBarbers = barbers.map((barber) => ({ ...barber, rate_percent: rateForBarber.get(barber.id) ?? null }));

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
      <header className="topbar"><div className="breadcrumbs"><Link href="/">Workspace</Link><span>/</span><Link href="/pengaturan">Pengaturan</Link><span>/</span><strong>Aturan Komisi</strong></div><div className="topbar-right"><span className="offline-pill"><i /> Owner/admin</span><div className="avatar">KT</div><SignOutButton /></div></header>
      <div className="content settings-page">
        <div className="welcome-row settings-welcome"><div><p className="eyebrow">DOEL&apos;S BARBERSHOP · PENGATURAN TIM</p><h1>Aturan komisi barber</h1><p className="subtitle">Atur persentase komisi setiap barber. Tarif awal kebijakan adalah 30%, dan owner/admin dapat menetapkan tarif berbeda per orang.</p></div><Link className="secondary-button" href="/pengaturan">← Pengaturan</Link></div>
        <div className="commission-policy-summary"><span className="commission-policy-mark">%</span><div><strong>Kebijakan komisi berbasis persentase</strong><p>Nilai komisi dihitung dari dasar komisi layanan pada transaksi (harga layanan dikurangi diskon item). Tarif disimpan dengan periode efektif agar transaksi lama tetap memakai snapshot tarif saat transaksi.</p></div></div>
        {dataError ? <div className="sales-data-error"><span className="sales-error-mark">!</span><div><strong>Data komisi belum dapat dibaca</strong><p>Pastikan migration 020 telah diterapkan di staging dan kebijakan baca database mengizinkan owner/admin melihat data organisasi. Tidak ada perubahan yang disimpan dari halaman ini.</p></div></div> : <section className="section-block">
          <div className="section-heading"><div><h2>Tarif per barber</h2><p>Tarif disimpan per barber, bukan satu tarif global.</p></div><span className="section-count">{barbers.length} BARBER AKTIF</span></div>
          <CommissionRateForm barbers={formBarbers} />
        </section>}
        <footer className="footer">KetemuTerus Barber POS <span>•</span> Komisi efektif-dated <span>•</span> Audit log database</footer>
      </div>
    </section>
  </main>;
}
