import Link from "next/link";
import SignOutButton from "@/components/auth/sign-out-button";
import TransactionReceiptSettingsForm from "@/components/settings/transaction-receipt-settings-form";
import { createClient } from "@/lib/supabase/server";

export default async function TransactionReceiptSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <main className="auth-shell"><section className="auth-card"><h1>Login diperlukan</h1><p className="auth-description">Silakan login untuk mengatur struk.</p><Link className="text-link" href="/login">Ke halaman login →</Link></section></main>;

  const { data: profile } = await supabase.from("users").select("organization_id,full_name,role,is_active").eq("id", user.id).maybeSingle();
  if (!profile || !profile.is_active || !["owner", "admin"].includes(profile.role)) {
    return <main className="auth-shell"><section className="auth-card"><h1>Akses dibatasi</h1><p className="auth-description">Pengaturan struk hanya tersedia untuk owner/admin aktif.</p><Link className="text-link" href="/pengaturan">Kembali ke pengaturan →</Link></section></main>;
  }

  const { data: organization, error } = await supabase.from("organizations")
    .select("name,address,contact_phone,receipt_logo_url,receipt_footer,receipt_show_cashier,receipt_show_barber,receipt_show_branch_address")
    .eq("id", profile.organization_id).maybeSingle();

  const org = organization as {
    name?: string | null; address?: string | null; contact_phone?: string | null; receipt_logo_url?: string | null;
    receipt_footer?: string | null; receipt_show_cashier?: boolean | null; receipt_show_barber?: boolean | null;
    receipt_show_branch_address?: boolean | null;
  } | null;

  return <main className="app-shell">
    <aside className="sidebar">
      <Link className="brand" href="/" aria-label="KetemuTerus Barber POS beranda"><span className="brand-mark">KT</span><span className="brand-copy"><strong>KetemuTerus</strong><small>BARBER POS</small></span></Link>
      <div className="sidebar-label">WORKSPACE</div>
      <nav className="nav-list" aria-label="Navigasi utama">
        <Link className="nav-item" href="/">▦ Dashboard</Link><Link className="nav-item" href="/kasir">＋ Kasir</Link>
        <Link className="nav-item" href="/layanan">◇ Layanan & harga</Link><Link className="nav-item" href="/barber">♙ Manajemen kapster</Link>
        <Link className="nav-item" href="/cabang">⌖ Cabang</Link>
      </nav>
      <div className="sidebar-settings"><Link className="nav-item active" href="/pengaturan" aria-current="page"><span>⚙</span> Pengaturan</Link></div>
      <div className="sidebar-bottom"><span className="status-dot" /><div><strong>{profile.full_name}</strong><small>{profile.role}</small></div></div>
    </aside>
    <section className="main-panel">
      <header className="topbar"><div className="breadcrumbs"><Link href="/">Workspace</Link><span>/</span><Link href="/pengaturan">Pengaturan</Link><span>/</span><strong>Transaksi &amp; Struk</strong></div><div className="topbar-right"><span className="offline-pill"><i /> Preferensi struk</span><div className="avatar">KT</div><SignOutButton /></div></header>
      <div className="content settings-page">
        <div className="welcome-row settings-welcome"><div><p className="eyebrow">PENJUALAN DAN STRUK</p><h1>Transaksi &amp; Struk</h1><p className="subtitle">Atur informasi yang dicetak untuk pelanggan dan lihat pratinjau sebelum menyimpan.</p></div><Link className="secondary-button" href="/pengaturan">← Semua pengaturan</Link></div>
        {error || !org ? <div className="notice"><span className="notice-icon">i</span><div><strong>Pengaturan struk belum dapat dimuat.</strong><p>Pastikan migration 018 sudah diterapkan di Supabase staging. Setelah itu, muat ulang halaman ini.</p></div></div> : null}
        <div className="receipt-settings-intro"><span className="receipt-intro-icon">▤</span><div><strong>Preferensi tampilan, bukan aturan pembayaran</strong><p>Pengaturan ini hanya mengubah informasi struk. Pajak PB1, diskon, penomoran transaksi, total checkout, dan status pembayaran tidak diubah oleh halaman ini.</p></div></div>
        <TransactionReceiptSettingsForm businessName={org?.name ?? "Nama Barbershop"} address={org?.address ?? ""} phone={org?.contact_phone ?? ""} logoUrl={org?.receipt_logo_url ?? ""} footer={org?.receipt_footer ?? "Terima kasih telah berkunjung!"} showCashier={org?.receipt_show_cashier ?? true} showBarber={org?.receipt_show_barber ?? true} showAddress={org?.receipt_show_branch_address ?? true} />
      </div>
    </section>
  </main>;
}
