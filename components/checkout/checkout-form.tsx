"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { checkoutSale, type CheckoutResult } from "@/app/actions/checkout";

type Branch = { id: string; code: string; name: string };
type Device = { id: string; branch_id: string; device_code: string; device_name: string };
type Shift = { id: string; branch_id: string; device_id: string; status: string; opened_at: string };
type Service = { id: string; code: string; name: string; duration_minutes: number };
type Price = { branch_id: string; service_id: string; price_amount: number; effective_from: string };
type Barber = { id: string; barber_code: string; full_name: string };
type Assignment = { branch_id: string; barber_id: string };

export default function CheckoutForm(props: {
  branches: Branch[]; devices: Device[]; shifts: Shift[]; services: Service[];
  prices: Price[]; barbers: Barber[]; assignments: Assignment[];
}) {
  const [branchId, setBranchId] = useState(props.branches[0]?.id ?? "");
  const [deviceId, setDeviceId] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [barberId, setBarberId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [method, setMethod] = useState("cash");
  const [transactionId, setTransactionId] = useState(() => crypto.randomUUID());
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [pending, startTransition] = useTransition();

  const devices = props.devices.filter((item) => item.branch_id === branchId);
  const shifts = props.shifts.filter((item) => item.branch_id === branchId && item.status === "open" && (!deviceId || item.device_id === deviceId));
  const services = props.services.filter((service) => props.prices.some((price) => price.branch_id === branchId && price.service_id === service.id && new Date(price.effective_from).getTime() <= Date.now()));
  const barbers = props.barbers.filter((barber) => props.assignments.some((assignment) => assignment.branch_id === branchId && assignment.barber_id === barber.id));
  const selectedPrice = useMemo(() => props.prices.filter((price) => price.branch_id === branchId && price.service_id === serviceId && new Date(price.effective_from).getTime() <= Date.now()).sort((a,b) => Date.parse(b.effective_from)-Date.parse(a.effective_from))[0], [props.prices, branchId, serviceId]);
  const total = (selectedPrice?.price_amount ?? 0) * Number(quantity || 0);

  function changeBranch(value: string) {
    setBranchId(value); setDeviceId(""); setShiftId(""); setServiceId(""); setBarberId(""); setResult(null);
  }
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setResult(null);
    const data = new FormData();
    data.set("branch_id", branchId); data.set("device_id", deviceId); data.set("shift_id", shiftId);
    data.set("service_id", serviceId); data.set("barber_id", barberId); data.set("quantity", quantity);
    data.set("payment_method", method); data.set("client_transaction_id", transactionId);
    startTransition(async () => {
      const response = await checkoutSale(data);
      setResult(response);
      if (response.ok) {
        setTransactionId(crypto.randomUUID()); setQuantity("1"); setServiceId(""); setBarberId("");
      }
    });
  }

  return <form className="service-form checkout-form" onSubmit={handleSubmit}>
    <div className="service-form-intro"><h3>Transaksi layanan</h3><p>Harga ditentukan server berdasarkan harga efektif cabang. Satu transaksi berisi satu jenis layanan; jumlah dapat diatur.</p></div>
    <label htmlFor="checkout-branch">Cabang</label>
    <select id="checkout-branch" value={branchId} onChange={(e) => changeBranch(e.target.value)} required>
      {props.branches.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}
    </select>
    <div className="service-form-fields">
      <div><label htmlFor="checkout-device">Perangkat kasir</label><select id="checkout-device" value={deviceId} onChange={(e) => { setDeviceId(e.target.value); setShiftId(""); }} required>
        <option value="">Pilih perangkat</option>{devices.map((d) => <option key={d.id} value={d.id}>{d.device_code} — {d.device_name}</option>)}
      </select></div>
      <div><label htmlFor="checkout-shift">Shift terbuka</label><select id="checkout-shift" value={shiftId} onChange={(e) => setShiftId(e.target.value)} required>
        <option value="">Pilih shift aktif</option>{shifts.map((s) => <option key={s.id} value={s.id}>Dibuka {new Date(s.opened_at).toLocaleString("id-ID",{dateStyle:"short",timeStyle:"short",timeZone:"Asia/Jakarta"})}</option>)}
      </select></div>
    </div>
    <div className="service-form-fields">
      <div><label htmlFor="checkout-service">Layanan</label><select id="checkout-service" value={serviceId} onChange={(e) => setServiceId(e.target.value)} required>
        <option value="">Pilih layanan</option>{services.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name} ({s.duration_minutes} menit)</option>)}
      </select></div>
      <div><label htmlFor="checkout-barber">Barber</label><select id="checkout-barber" value={barberId} onChange={(e) => setBarberId(e.target.value)} required>
        <option value="">Pilih barber</option>{barbers.map((b) => <option key={b.id} value={b.id}>{b.barber_code} — {b.full_name}</option>)}
      </select></div>
    </div>
    <div className="service-form-fields">
      <div><label htmlFor="checkout-quantity">Jumlah layanan</label><input id="checkout-quantity" type="number" min="1" max="20" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} required /></div>
      <div><label htmlFor="checkout-payment">Metode pembayaran</label><select id="checkout-payment" value={method} onChange={(e) => setMethod(e.target.value)}><option value="cash">Tunai</option><option value="qris">QRIS — menunggu konfirmasi</option></select></div>
    </div>
    <div className="checkout-total"><span>Estimasi total</span><strong>Rp {total.toLocaleString("id-ID")}</strong><small>Harga final dihitung ulang oleh database saat checkout.</small></div>
    <button className="primary-button" type="submit" disabled={pending || !branchId || !deviceId || !shiftId || !serviceId || !barberId || !selectedPrice}>{pending ? "Memproses transaksi..." : "Simpan transaksi"}</button>
    {!shifts.length && <p className="architecture-footnote">Belum ada shift terbuka untuk perangkat/cabang pilihan. Buka shift terlebih dahulu di dashboard.</p>}
    {result && <div className={result.ok ? "notice checkout-result" : "notice checkout-error"} role="status">
      <div className="notice-icon">{result.ok ? "✓" : "!"}</div><div><strong>{result.ok ? "Hasil checkout" : "Transaksi gagal"}</strong><p>{result.message}</p>
      {result.ok && <p><b>Struk:</b> {result.receipt}<br/><b>Total:</b> Rp {(result.total ?? 0).toLocaleString("id-ID")}<br/><b>Komisi:</b> Rp {(result.commission ?? 0).toLocaleString("id-ID")}{result.reviewRequired ? " — perlu review penetapan komisi" : ""}<br/><b>Status pembayaran:</b> {result.paymentStatus === "paid" ? "Lunas" : "Menunggu konfirmasi"}</p>}</div>
    </div>}
    <p className="architecture-footnote">Jangan menandai QRIS lunas secara manual. Integrasi verifikasi QRIS dan mode offline penuh belum termasuk tahap ini.</p>
  </form>;
}
