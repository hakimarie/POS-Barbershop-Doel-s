import Link from "next/link";
import SignOutButton from "@/components/auth/sign-out-button";
import { createClient } from "@/lib/supabase/server";

type SettingItem = {
  title: string;
  description: string;
  status: string;
  href?: string;
  icon: string;
};

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <main className="auth-shell"><section className="auth-card"><h1>Login diperlukan</h1><p className="auth-description">Silakan login untuk membuka pengaturan.</p><Link className="text-link" href="/login">Ke halaman login →</Link></section></main>;

  const { data: profile } = await supabase.from("users").select("organization_id,full_name,role,is_active").eq("id", user.id).maybeSingle();
  if (!profile || !profile.is_active || !["owner", "admin"].includes(profile.role)) {
    return <main className="auth-shell"><section className="auth-card"><h1>Akses pengaturan dibatasi</h1><p className="auth-description">Pengaturan organisasi hanya tersedia untuk owner dan admin aktif.</p><Link className="text-link" href="/">Kembali ke dashboard →</Link></section></main>;
  }

  const [{ count: branchCount }, { count: barberCount }, { count: cashierCount }, { count: serviceCount }] = await Promise.all([
    supabase.from("branches").select("id", { count: "exact", head: true }).eq("organization_id", profile.organization_id).eq("is_active", true),
    supabase.from("barbers").select("id", { count: "exact", head: true }).eq("organization_id", profile.organization_id).eq("is_active", true),
    supabase.from("users").select("id", { count: "exact", head: true }).eq("organization_id", profile.organization_id).eq("is_active", true).eq("role", "cashier"),
    supabase.from("services").select("id", { count: "exact", head: true }).eq("organization_id", profile.organization_id).eq("is_active", true),
  ]);

  const groups: { title: string; items: SettingItem[] }[] = [
    { title: "Umum", items: [
      { title: "Profil Barbershop", description: "Nama usaha, logo pada struk, alamat, jam operasional, dan kontak.", status: "Konfigurasi profil usaha", href: "/pengaturan/profil", icon: "⌂" },
      { title: "Langganan", description: "Status paket POS, masa aktif, dan informasi tagihan.", status: "Belum terhubung", icon: "◇" },
    ]},
    { title: "Penjualan dan struk", items: [
      { title: "Transaksi & Struk", description: "Format struk, penomoran transaksi, pajak PB1, dan instruksi tambahan.", status: "Konfigurasi struk belum tersedia", icon: "▤" },
      { title: "Metode Pembayaran", description: "Metode pembayaran yang diizinkan: tunai, QRIS, kartu, dan e-wallet.", status: "Tunai & QRIS menjadi target MVP", icon: "▣" },
      { title: "Tipe Kunjungan", description: "Walk-in, booking online, dan home service.", status: "Walk-in untuk MVP · booking/home service belum tersedia", icon: "↗" },
    ]},
    { title: "Cabang, tim & komisi", items: [
      { title: "Cabang & Kursi", description: "Kelola outlet, perangkat, dan kapasitas kursi/station.", status: `${branchCount ?? "—"} cabang aktif`, href: "/cabang", icon: "⌖" },
      { title: "Kapster & Kasir", description: "Kelola data kapster, penugasan cabang, akun kasir, dan hak akses.", status: `${barberCount ?? "—"} kapster aktif · ${cashierCount ?? "—"} akun kasir aktif`, href: "/barber", icon: "♙" },
      { title: "Aturan Komisi", description: "Atur skema bagi hasil jasa berdasarkan persentase atau nominal tetap.", status: "Komisi persentase adalah aturan MVP · konfigurasi belum tersedia", icon: "%" },
    ]},
    { title: "Notifikasi dan keamanan", items: [
      { title: "Notifikasi WhatsApp", description: "Pengingat booking otomatis dan pengiriman struk digital.", status: "Belum tersedia", icon: "◉" },
      { title: "Log Aktivitas", description: "Pantau aktivitas kasir dan perubahan transaksi untuk audit.", status: "Audit log tersedia di database · halaman log belum tersedia", icon: "≡" },
      { title: "Akun Saya", description: "Pengaturan akun, email, password, dan autentikasi dua faktor.", status: "Kelola sesi melalui autentikasi · pengaturan 2FA belum tersedia", icon: "♙" },
    ]},
  ];

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
      <header className="topbar"><div className="breadcrumbs"><Link href="/">Workspace</Link><span>/</span><strong>Pengaturan</strong></div><div className="topbar-right"><span className="offline-pill"><i /> Pengaturan workspace</span><div className="avatar">KT</div><SignOutButton /></div></header>
      <div className="content settings-page">
        <div className="welcome-row settings-welcome"><div><p className="eyebrow">DOEL&apos;S BARBERSHOP · WORKSPACE</p><h1>Pengaturan</h1><p className="subtitle">Kelola preferensi usaha, penjualan, tim, dan keamanan dari satu tempat.</p></div></div>
        {groups.map((group) => <section className="settings-group" key={group.title}>
          <h2 className="settings-group-title">{group.title}</h2>
          <div className="settings-list">
            {group.items.map((item) => {
              const content = <><span className="settings-row-icon" aria-hidden="true">{item.icon}</span><span className="settings-row-main"><strong>{item.title}</strong><small>{item.description}</small><span className="settings-row-status">{item.status}</span></span><span className="settings-row-arrow" aria-hidden="true">{item.href ? "↗" : "—"}</span></>;
              return item.href ? <Link className="settings-row settings-row-link" href={item.href} key={item.title}>{content}</Link> : <div className="settings-row settings-row-disabled" key={item.title}>{content}</div>;
            })}
          </div>
        </section>)}
        <p className="settings-footnote">Status pada setiap item menunjukkan kondisi fitur saat ini. Item tanpa tautan belum memiliki halaman konfigurasi aktif; angka cabang, kapster, kasir, dan layanan diambil dari data workspace.</p>
      </div>
    </section>
  </main>;
}
