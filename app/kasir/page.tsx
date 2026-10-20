import Link from "next/link";
import SignOutButton from "@/components/auth/sign-out-button";
import CheckoutForm from "@/components/checkout/checkout-form";
import { createClient } from "@/lib/supabase/server";

type Branch = { id: string; code: string; name: string };
type Device = { id: string; branch_id: string; device_code: string; device_name: string };
type Shift = { id: string; branch_id: string; device_id: string; status: string; opened_at: string };
type Service = { id: string; code: string; name: string; duration_minutes: number; is_active: boolean };
type Price = { branch_id: string; service_id: string; price_amount: number; effective_from: string };
type Barber = { id: string; barber_code: string; full_name: string; is_active: boolean };
type Assignment = { branch_id: string; barber_id: string; effective_from: string; effective_to: string | null };

export default async function CashierPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <main className="auth-shell"><section className="auth-card"><h1>Login diperlukan</h1><p className="auth-description">Silakan login untuk membuka kasir.</p><Link className="text-link" href="/login">Ke halaman login →</Link></section></main>;

  const { data: profile } = await supabase.from("users").select("organization_id,full_name,role,is_active").eq("id",user.id).maybeSingle();
  if (!profile || !profile.is_active || !["owner","admin","manager","cashier"].includes(profile.role)) {
    return <main className="auth-shell"><section className="auth-card"><h1>Akses kasir tidak tersedia</h1><p className="auth-description">Profil POS harus aktif dan memiliki peran owner, admin, manager, atau cashier.</p><Link className="text-link" href="/">Kembali ke dashboard →</Link></section></main>;
  }

  const now = new Date().toISOString();
  const [{data: branchRows},{data: deviceRows},{data: shiftRows},{data: serviceRows},{data: priceRows},{data: barberRows},{data: assignmentRows}] = await Promise.all([
    supabase.from("branches").select("id,code,name").eq("organization_id",profile.organization_id).eq("is_active",true).order("code"),
    supabase.from("devices").select("id,branch_id,device_code,device_name").eq("organization_id",profile.organization_id).eq("is_active",true).order("device_code"),
    supabase.from("cash_shifts").select("id,branch_id,device_id,status,opened_at").eq("organization_id",profile.organization_id).eq("status","open").order("opened_at",{ascending:false}),
    supabase.from("services").select("id,code,name,duration_minutes,is_active").eq("organization_id",profile.organization_id).eq("is_active",true).order("code"),
    supabase.from("branch_service_prices").select("branch_id,service_id,price_amount,effective_from").eq("organization_id",profile.organization_id).is("effective_to",null).lte("effective_from",now),
    supabase.from("barbers").select("id,barber_code,full_name,is_active").eq("organization_id",profile.organization_id).eq("is_active",true).order("full_name"),
    supabase.from("barber_branch_assignments").select("branch_id,barber_id,effective_from,effective_to").eq("organization_id",profile.organization_id).lte("effective_from",now),
  ]);

  const branches = (branchRows ?? []) as Branch[];
  const devices = (deviceRows ?? []) as Device[];
  const shifts = (shiftRows ?? []) as Shift[];
  const services = (serviceRows ?? []) as Service[];
  const prices = (priceRows ?? []) as Price[];
  const barbers = (barberRows ?? []) as Barber[];
  const assignments = ((assignmentRows ?? []) as Assignment[]).filter((a) => !a.effective_to || Date.parse(a.effective_to) > Date.now());

  return <main className="app-shell">
    <aside className="sidebar">
      <Link className="brand" href="/" aria-label="KetemuTerus Barber POS beranda"><span className="brand-mark">KT</span><span className="brand-copy"><strong>KetemuTerus</strong><small>BARBER POS</small></span></Link>
      <div className="sidebar-label">WORKSPACE</div>
      <nav className="nav-list" aria-label="Navigasi utama">
        <Link className="nav-item" href="/">▦ Dashboard</Link>
        <Link className="nav-item active" href="/kasir" aria-current="page">＋ Kasir</Link>
        <Link className="nav-item" href="/layanan">◇ Layanan & harga</Link>
        <Link className="nav-item" href="/#shift">◷ Shift kasir</Link>
      </nav>
      <div className="sidebar-bottom"><span className="status-dot" /><div><strong>{profile.full_name}</strong><small>{profile.role}</small></div></div>
    </aside>
    <section className="main-panel">
      <header className="topbar"><div className="breadcrumbs"><Link href="/">Workspace</Link><span>/</span><strong>Kasir</strong></div><div className="topbar-right"><span className="offline-pill"><i /> Checkout staging</span><div className="avatar">DO</div><SignOutButton /></div></header>
      <div className="content">
        <div className="welcome-row"><div><p className="eyebrow">DOEL'S BARBERSHOP · POINT OF SALE</p><h1>Kasir baru</h1><p className="subtitle">Buat transaksi untuk layanan barber dengan harga efektif per cabang.</p></div><Link className="secondary-button" href="/">← Dashboard</Link></div>
        <div className="notice"><div className="notice-icon">i</div><div><strong>Uji di staging terlebih dahulu</strong><p>Transaksi tunai dicatat lunas. QRIS hanya berstatus menunggu konfirmasi. Komisi tanpa konfigurasi aktif ditandai perlu review dan tidak dihitung sebagai komisi final.</p></div></div>
        {branches.length && devices.length && shifts.length && services.length && prices.length && barbers.length && assignments.length ? <CheckoutForm branches={branches} devices={devices} shifts={shifts} services={services} prices={prices} barbers={barbers} assignments={assignments} /> :
          <div className="notice"><div className="notice-icon">!</div><div><strong>Data operasional belum lengkap</strong><p>Pastikan ada cabang dan perangkat aktif, shift terbuka, layanan dengan harga efektif, barber aktif, serta penugasan barber ke cabang ini. Buka shift dari dashboard dan lengkapi master data terlebih dahulu.</p></div></div>}
        <footer className="footer">KetemuTerus Barber POS <span>•</span> Kasir <span>•</span> Uji staging</footer>
      </div>
    </section>
  </main>;
}
