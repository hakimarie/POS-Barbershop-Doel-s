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

  let allowedBranchIds: Set<string> | null = null;
  if (profile.role !== "owner" && profile.role !== "admin") {
    const { data: memberships, error: membershipError } = await supabase
      .from("branch_memberships")
      .select("branch_id")
      .eq("organization_id", profile.organization_id)
      .eq("user_id", user.id)
      .eq("is_active", true);
    if (membershipError) {
      return <main className="auth-shell"><section className="auth-card"><h1>Akses cabang belum dapat diverifikasi</h1><p className="auth-description">Kasir ditutup sampai keanggotaan cabang dapat diverifikasi. Periksa policy RLS dan coba lagi.</p><Link className="text-link" href="/">Kembali ke dashboard →</Link></section></main>;
    }
    allowedBranchIds = new Set((memberships ?? []).map((membership) => membership.branch_id as string));
  }
  const branches = ((branchRows ?? []) as Branch[]).filter((branch) => allowedBranchIds === null || allowedBranchIds.has(branch.id));
  const branchIds = new Set(branches.map((branch) => branch.id));
  const devices = ((deviceRows ?? []) as Device[]).filter((device) => branchIds.has(device.branch_id));
  const deviceIds = new Set(devices.map((device) => device.id));
  const shifts = ((shiftRows ?? []) as Shift[]).filter((shift) => branchIds.has(shift.branch_id) && deviceIds.has(shift.device_id));
  const services = (serviceRows ?? []) as Service[];
  const prices = (priceRows ?? []) as Price[];
  const barbers = (barberRows ?? []) as Barber[];
  const assignments = ((assignmentRows ?? []) as Assignment[]).filter((a) => !a.effective_to || Date.parse(a.effective_to) > Date.now());

  const missingRequirements = [
    { label: "Cabang aktif", ok: branches.length > 0, count: branches.length },
    { label: "Perangkat aktif", ok: devices.length > 0, count: devices.length },
    { label: "Shift terbuka", ok: shifts.length > 0, count: shifts.length },
    { label: "Layanan aktif", ok: services.length > 0, count: services.length },
    { label: "Harga layanan efektif", ok: prices.length > 0, count: prices.length },
    { label: "Barber aktif", ok: barbers.length > 0, count: barbers.length },
    { label: "Penugasan barber ke cabang", ok: assignments.length > 0, count: assignments.length },
  ];
  const operationalDataComplete = missingRequirements.every((item) => item.ok);

  return <main className="app-shell">
    <aside className="sidebar">
      <Link className="brand" href="/" aria-label="KetemuTerus Barber POS beranda"><span className="brand-mark">KT</span><span className="brand-copy"><strong>KetemuTerus</strong><small>BARBER POS</small></span></Link>
      <div className="sidebar-label">WORKSPACE</div>
      <nav className="nav-list" aria-label="Navigasi utama">
        <Link className="nav-item" href="/">▦ Dashboard</Link>
        <Link className="nav-item active" href="/kasir" aria-current="page">＋ Kasir</Link>
        <Link className="nav-item" href="/layanan">◇ Layanan & harga</Link>
        <Link className="nav-item" href="/barber">♙ Manajemen kapster</Link>
        <Link className="nav-item" href="/#shift">◷ Shift kasir</Link>
      </nav>
      <div className="sidebar-settings">{(profile.role === "owner" || profile.role === "admin") ? <Link className="nav-item" href="/pengaturan"><span>⚙</span> Pengaturan</Link> : null}</div>
      <div className="sidebar-bottom"><span className="status-dot" /><div><strong>{profile.full_name}</strong><small>{profile.role}</small></div></div>
    </aside>
    <section className="main-panel">
      <header className="topbar"><div className="breadcrumbs"><Link href="/">Workspace</Link><span>/</span><strong>Kasir</strong></div><div className="topbar-right"><span className="offline-pill"><i /> Checkout staging</span><div className="avatar">DO</div><SignOutButton /></div></header>
      <div className="content">
        <div className="welcome-row"><div><p className="eyebrow">DOEL&apos;S BARBERSHOP · POINT OF SALE</p><h1>Kasir baru</h1><p className="subtitle">Buat transaksi untuk layanan barber dengan harga efektif per cabang.</p></div><Link className="secondary-button" href="/">← Dashboard</Link></div>
        <div className="notice"><div className="notice-icon">i</div><div><strong>Uji di staging terlebih dahulu</strong><p>Transaksi tunai dicatat lunas. QRIS hanya berstatus menunggu konfirmasi. Komisi tanpa konfigurasi aktif ditandai perlu review dan tidak dihitung sebagai komisi final.</p></div></div>
        {operationalDataComplete ? <CheckoutForm branches={branches} devices={devices} shifts={shifts} services={services} prices={prices} barbers={barbers} assignments={assignments} storageKey={`kt-pos-offline-drafts:${profile.organization_id}:${user.id}`} /> :
          <div className="notice"><div className="notice-icon">!</div><div><strong>Data operasional belum lengkap</strong><p>Berikut pemeriksaan data yang dibutuhkan halaman kasir. Angka menunjukkan jumlah data aktif/efektif yang berhasil dibaca untuk organisasi ini.</p>
            <ul className="operational-checklist">{missingRequirements.map((item) => <li key={item.label}><span aria-hidden="true">{item.ok ? "✓" : "!"}</span><strong>{item.label}</strong><span>{item.count} data</span><em>{item.ok ? "Tersedia" : "Perlu dilengkapi"}</em></li>)}</ul>
            <p>Lengkapi item yang bertanda “Perlu dilengkapi”, lalu muat ulang halaman. Untuk penugasan barber, pastikan penugasan masih berlaku saat ini dan mengarah ke cabang yang dipilih.</p>
          </div></div>}
        <footer className="footer">KetemuTerus Barber POS <span>•</span> Kasir <span>•</span> Uji staging</footer>
      </div>
    </section>
  </main>;
}
