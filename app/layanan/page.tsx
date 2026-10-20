import Link from "next/link";
import SignOutButton from "@/components/auth/sign-out-button";
import ServicePriceForm from "@/components/services/service-price-form";
import { createClient } from "@/lib/supabase/server";

type Service = { id: string; code: string; name: string; is_active: boolean; category: string };
type Branch = { id: string; code: string; name: string; is_active: boolean };
type Price = { id: string; branch_id: string; service_id: string; price_amount: number; effective_from: string; effective_to: string | null };

export default async function ServicesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return <main className="auth-shell"><section className="auth-card"><h1>Sesi login berakhir</h1><p className="auth-description">Silakan login kembali untuk membuka master data layanan.</p><Link className="text-link" href="/login">Ke halaman login →</Link></section></main>;
  }

  const { data: profile } = await supabase.from("users").select("organization_id, full_name, role, is_active").eq("id", user.id).maybeSingle();
  if (!profile || !profile.is_active) {
    return <main className="auth-shell"><section className="auth-card"><h1>Profil POS tidak tersedia</h1><p className="auth-description">Akun ini belum memiliki profil POS aktif. Hubungi administrator.</p><Link className="text-link" href="/">Kembali ke dashboard →</Link></section></main>;
  }

  const [{ data: branchRows }, { data: serviceRows }, { data: priceRows }] = await Promise.all([
    supabase.from("branches").select("id, code, name, is_active").eq("organization_id", profile.organization_id).eq("is_active", true).order("code"),
    supabase.from("services").select("id, code, name, is_active, category").eq("organization_id", profile.organization_id).order("code"),
    supabase.from("branch_service_prices").select("id, branch_id, service_id, price_amount, effective_from, effective_to").eq("organization_id", profile.organization_id).is("effective_to", null).order("effective_from", { ascending: false }),
  ]);

  const branches = (branchRows ?? []) as Branch[];
  const services = (serviceRows ?? []) as Service[];
  const prices = ((priceRows ?? []) as Price[]).filter((price) => new Date(price.effective_from).getTime() <= Date.now());
  const canManage = profile.role === "owner" || profile.role === "admin";
  const branchMap = new Map(branches.map((branch) => [branch.id, branch]));
    const groupedPrices = new Map<string, Price[]>();
  for (const price of prices) {
    const key = price.service_id;
    const list = groupedPrices.get(key) ?? [];
    list.push(price);
    groupedPrices.set(key, list);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="KetemuTerus Barber POS beranda"><span className="brand-mark">KT</span><span className="brand-copy"><strong>KetemuTerus</strong><small>BARBER POS</small></span></Link>
        <div className="sidebar-label">WORKSPACE</div>
        <nav className="nav-list" aria-label="Navigasi utama">
          <Link className="nav-item" href="/"><span>▦</span> Dashboard</Link>
          <Link className="nav-item" href="/layanan" aria-current="page"><span>◇</span> Layanan & harga</Link>
          <Link className="nav-item" href="/barber"><span>♙</span> Barber & penugasan</Link>
          <Link className="nav-item" href="/cabang"><span>⌖</span> Pengaturan cabang</Link>
          <Link className="nav-item" href="/#shift"><span>◷</span> Shift kasir</Link>
        </nav>
        <div className="sidebar-bottom"><span className="status-dot" /><div><strong>{profile.full_name}</strong><small>{profile.role}</small></div></div>
      </aside>
      <section className="main-panel">
        <header className="topbar"><div className="breadcrumbs"><Link href="/">Workspace</Link><span>/</span><strong>Layanan & harga</strong></div><div className="topbar-right"><span className="offline-pill"><i /> Master data</span><div className="avatar">DO</div><SignOutButton /></div></header>
        <div className="content">
          <div className="welcome-row"><div><p className="eyebrow">DOEL'S BARBERSHOP · MASTER DATA</p><h1>Layanan & harga cabang</h1><p className="subtitle">Kelola katalog layanan dan harga efektif untuk setiap cabang.</p></div><Link className="secondary-button" href="/">← Kembali ke dashboard</Link></div>
          {!canManage ? <div className="notice"><div className="notice-icon">i</div><div><strong>Mode lihat saja</strong><p>Akun dengan peran {profile.role} dapat melihat katalog, tetapi hanya owner/admin yang dapat mengubah layanan dan harga.</p></div></div> : null}
          {canManage ? <ServicePriceForm branches={branches} services={services.filter((service) => service.is_active)} /> : null}
          <section className="section-block">
            <div className="section-heading"><div><h2>Katalog layanan aktif</h2><p>Harga ditampilkan per cabang berdasarkan periode efektif saat ini.</p></div><span className="section-count">{services.filter((service) => service.is_active).length} LAYANAN</span></div>
            {services.length === 0 ? <div className="notice"><div className="notice-icon">i</div><div><strong>Belum ada layanan</strong><p>Tambahkan layanan pertama menggunakan formulir di atas.</p></div></div> : (
              <div className="service-table-wrap"><table className="service-table"><thead><tr><th>Kategori</th><th>Kode</th><th>Layanan</th><th>Harga per cabang</th><th>Status</th></tr></thead><tbody>
                {services.map((service) => {
                  const servicePrices = (groupedPrices.get(service.id) ?? []).sort((a, b) => (branchMap.get(a.branch_id)?.code ?? "").localeCompare(branchMap.get(b.branch_id)?.code ?? ""));
                  return <tr key={service.id}><td>{service.category === "Service Lainnya" ? "Service Lainnya" : "Hair Cut & Styling"}</td><td><span className="service-code">{service.code}</span></td><td><strong>{service.name}</strong></td><td><div className="branch-price-list">{servicePrices.length ? servicePrices.map((price) => <div key={price.id}><span>{branchMap.get(price.branch_id)?.name ?? branchMap.get(price.branch_id)?.code ?? "Cabang"}</span><strong>Rp {Number(price.price_amount).toLocaleString("id-ID")}</strong></div>) : <span className="muted-text">Harga belum diatur</span>}</div></td><td><span className={service.is_active ? "status-tag active-tag" : "status-tag inactive-tag"}>{service.is_active ? "Aktif" : "Nonaktif"}</span></td></tr>;
                })}
              </tbody></table></div>
            )}
          </section>
          <div className="notice"><div className="notice-icon">i</div><div><strong>Catatan integritas harga</strong><p>Harga baru dibuat sebagai periode efektif baru. Sebelum POS dipakai untuk transaksi nyata, modul penjualan harus menyimpan harga snapshot pada item transaksi agar perubahan harga tidak mengubah struk atau komisi historis.</p></div></div>
          <footer className="footer">KetemuTerus Barber POS <span>•</span> Master data <span>•</span> v0.2.0</footer>
        </div>
      </section>
    </main>
  );
}
