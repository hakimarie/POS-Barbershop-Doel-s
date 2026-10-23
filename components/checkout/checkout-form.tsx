"use client";

import { useEffect, useMemo, useState, useTransition, type FormEvent } from "react";
import { checkoutSale, type CheckoutResult } from "@/app/actions/checkout";
import { loadOfflineDrafts, saveOfflineDrafts, type OfflineDraftRecord } from "@/lib/offline-drafts";

type Branch = { id: string; code: string; name: string };
type Device = { id: string; branch_id: string; device_code: string; device_name: string };
type Shift = { id: string; branch_id: string; device_id: string; status: string; opened_at: string };
type Service = { id: string; code: string; name: string; duration_minutes: number };
type Price = { branch_id: string; service_id: string; price_amount: number; effective_from: string };
type Barber = { id: string; barber_code: string; full_name: string };
type Assignment = { branch_id: string; barber_id: string };
type OfflineDraft = OfflineDraftRecord;

export default function CheckoutForm(props: {
  branches: Branch[]; devices: Device[]; shifts: Shift[]; services: Service[];
  prices: Price[]; barbers: Barber[]; assignments: Assignment[]; storageKey: string;
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
  const [offlineDrafts, setOfflineDrafts] = useState<OfflineDraft[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  const [offlineNotice, setOfflineNotice] = useState("");
  const [savingDraft, setSavingDraft] = useState(false);
  const [priceChangePending, setPriceChangePending] = useState<string | null>(null);
  const [priceChangeAcknowledged, setPriceChangeAcknowledged] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    loadOfflineDrafts(props.storageKey).then((drafts) => {
      if (!cancelled) setOfflineDrafts(drafts);
    }).catch(() => {
      if (!cancelled) setOfflineNotice("Draft lokal tidak dapat dibaca. Jangan hapus data browser; periksa penyimpanan perangkat sebelum melanjutkan.");
    });
    return () => { cancelled = true; };
  }, [props.storageKey]);

  useEffect(() => {
    const updateConnection = () => setIsOnline(window.navigator.onLine);
    updateConnection();
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    return () => { window.removeEventListener("online", updateConnection); window.removeEventListener("offline", updateConnection); };
  }, []);

  async function saveDrafts(next: OfflineDraft[]) {
    try {
      await saveOfflineDrafts(props.storageKey, next);
      setOfflineDrafts(next);
    } catch {
      setOfflineNotice("Penyimpanan draft lokal gagal. Jangan tutup halaman; catat transaksi secara manual sesuai SOP.");
      throw new Error("Penyimpanan draft lokal gagal");
    }
  }

  const devices = props.devices.filter((item) => item.branch_id === branchId);
  const shifts = props.shifts.filter((item) => item.branch_id === branchId && item.status === "open" && (!deviceId || item.device_id === deviceId));
  const services = props.services.filter((service) => props.prices.some((price) => price.branch_id === branchId && price.service_id === service.id && new Date(price.effective_from).getTime() <= Date.now()));
  const barbers = props.barbers.filter((barber) => props.assignments.some((assignment) => assignment.branch_id === branchId && assignment.barber_id === barber.id));
  const selectedPrice = useMemo(() => props.prices.filter((price) => price.branch_id === branchId && price.service_id === serviceId && new Date(price.effective_from).getTime() <= Date.now()).sort((a,b) => Date.parse(b.effective_from)-Date.parse(a.effective_from))[0], [props.prices, branchId, serviceId]);
  const total = (selectedPrice?.price_amount ?? 0) * Number(quantity || 0);

  function changeBranch(value: string) {
    setBranchId(value); setDeviceId(""); setShiftId(""); setServiceId(""); setBarberId(""); setResult(null);
    setPriceChangePending(null); setPriceChangeAcknowledged(false);
  }
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setResult(null); setOfflineNotice("");
    if (priceChangePending && !priceChangeAcknowledged) {
      setOfflineNotice("Harga draft berubah. Tinjau estimasi total terbaru lalu centang konfirmasi perubahan harga sebelum menyimpan transaksi.");
      return;
    }
    if (!isOnline) {
      if (savingDraft) return;
      if (method !== "cash") { setOfflineNotice("QRIS tidak dapat dibuat saat offline. Sambungkan internet sebelum memulai pembayaran QRIS."); return; }
      if (!selectedPrice || !branchId || !deviceId || !shiftId || !serviceId || !barberId) { setOfflineNotice("Lengkapi cabang, perangkat, shift, layanan, dan barber sebelum menyimpan draft."); return; }
      const draft: OfflineDraft = { transactionId, branchId, deviceId, shiftId, serviceId, barberId, quantity, totalAtDraft: total, branchLabel: props.branches.find((item) => item.id === branchId)?.name ?? "Cabang", serviceLabel: props.services.find((item) => item.id === serviceId)?.name ?? "Layanan", barberLabel: props.barbers.find((item) => item.id === barberId)?.full_name ?? "Barber", createdAt: new Date().toISOString() };
      setSavingDraft(true);
      void saveDrafts([draft, ...offlineDrafts.filter((item) => item.transactionId !== transactionId)])
        .then(() => {
          setOfflineNotice("Draft tunai tersimpan di IndexedDB pada perangkat ini. Draft belum menjadi transaksi resmi dan belum memiliki nomor struk. Setelah online, muat draft, periksa harga dan shift, lalu simpan transaksi.");
          setTransactionId(crypto.randomUUID()); setServiceId(""); setBarberId(""); setQuantity("1");
        })
        .catch(() => undefined)
        .finally(() => setSavingDraft(false));
      return;
    }
    const data = new FormData();
    data.set("branch_id", branchId); data.set("device_id", deviceId); data.set("shift_id", shiftId);
    data.set("service_id", serviceId); data.set("barber_id", barberId); data.set("quantity", quantity);
    data.set("payment_method", method); data.set("client_transaction_id", transactionId);
    startTransition(async () => {
      const response = await checkoutSale(data);
      setResult(response);
      if (response.ok) {
        void saveDrafts(offlineDrafts.filter((item) => item.transactionId !== transactionId)).catch(() => undefined);
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
      <div><label htmlFor="checkout-service">Layanan</label><select id="checkout-service" value={serviceId} onChange={(e) => { setServiceId(e.target.value); setPriceChangePending(null); setPriceChangeAcknowledged(false); }} required>
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
    {!isOnline && <div className="notice offline-draft-notice" role="status"><div className="notice-icon">!</div><div><strong>Mode offline aktif</strong><p>Hanya draft tunai yang dapat disimpan lokal. Draft bukan transaksi resmi; QRIS dinonaktifkan sampai koneksi kembali.</p></div></div>}
    {isOnline && offlineDrafts.length > 0 && <div className="notice offline-draft-notice" role="status"><div className="notice-icon">i</div><div><strong>{offlineDrafts.length} draft menunggu pemeriksaan</strong><p>Draft tidak dikirim otomatis. Muat setiap draft, pastikan shift masih terbuka dan harga sesuai, lalu kirim dengan ID transaksi yang sama agar retry aman.</p></div></div>}
    <div className="checkout-total"><span>Estimasi total</span><strong>Rp {total.toLocaleString("id-ID")}</strong><small>Harga final dihitung ulang oleh database saat checkout.</small></div>
    {priceChangePending && <label className="offline-price-confirmation"><input type="checkbox" checked={priceChangeAcknowledged} onChange={(e) => setPriceChangeAcknowledged(e.target.checked)} /> Saya memahami {priceChangePending} dan menyetujui penggunaan estimasi harga terbaru. Harga final tetap ditentukan server.</label>}
    <button className="primary-button" type="submit" disabled={pending || savingDraft || !branchId || !deviceId || !shiftId || !serviceId || !barberId || !selectedPrice}>{pending ? "Memproses transaksi..." : savingDraft ? "Menyimpan draft..." : !isOnline ? "Simpan draft offline" : "Simpan transaksi"}</button>
    {offlineNotice && <div className="notice offline-draft-notice" role="status"><div className="notice-icon">i</div><div><strong>Status draft offline</strong><p>{offlineNotice}</p></div></div>}
    {offlineDrafts.length > 0 && (
      <section className="offline-drafts" aria-label="Draft offline tersimpan">
        <div className="offline-drafts-heading"><strong>Draft offline tersimpan</strong><span>{offlineDrafts.length} draft</span></div>
        <p>Draft belum tercatat sebagai penjualan. Saat online, muat satu draft, periksa harga terbaru, lalu kirim secara manual.</p>
        {offlineDrafts.map((draft) => (
          <article className="offline-draft-item" key={draft.transactionId}>
            <div>
              <strong>{draft.serviceLabel} × {draft.quantity}</strong>
              <span>{draft.branchLabel} · {draft.barberLabel}</span>
              <small>Dibuat {new Date(draft.createdAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} · estimasi saat draft Rp {draft.totalAtDraft.toLocaleString("id-ID")}</small>
            </div>
            <div className="offline-draft-actions">
              <button type="button" className="secondary-button" onClick={() => {
                const branchAvailable = props.branches.some((item) => item.id === draft.branchId);
                const deviceAvailable = props.devices.some((item) => item.id === draft.deviceId && item.branch_id === draft.branchId);
                const shiftAvailable = props.shifts.some((item) => item.id === draft.shiftId && item.branch_id === draft.branchId && item.device_id === draft.deviceId && item.status === "open");
                const serviceAvailable = props.services.some((item) => item.id === draft.serviceId);
                const currentPrice = props.prices
                  .filter((item) => item.branch_id === draft.branchId && item.service_id === draft.serviceId && Date.parse(item.effective_from) <= Date.now())
                  .sort((a, b) => Date.parse(b.effective_from) - Date.parse(a.effective_from))[0];
                const priceAvailable = Boolean(currentPrice);
                const currentEstimate = (currentPrice?.price_amount ?? 0) * Number(draft.quantity || 0);
                const priceChanged = priceAvailable && currentEstimate !== draft.totalAtDraft;
                const barberAvailable = props.barbers.some((item) => item.id === draft.barberId) && props.assignments.some((item) => item.branch_id === draft.branchId && item.barber_id === draft.barberId);
                const selectedBranch = branchAvailable ? draft.branchId : (props.branches[0]?.id ?? "");
                const selectedDevice = deviceAvailable && branchAvailable ? draft.deviceId : "";
                const selectedShift = shiftAvailable && deviceAvailable && branchAvailable ? draft.shiftId : "";
                const selectedService = serviceAvailable && priceAvailable && branchAvailable ? draft.serviceId : "";
                const selectedBarber = barberAvailable && branchAvailable ? draft.barberId : "";
                setBranchId(selectedBranch);
                setDeviceId(selectedDevice);
                setShiftId(selectedShift);
                setServiceId(selectedService);
                setBarberId(selectedBarber);
                setQuantity(draft.quantity);
                setMethod("cash");
                setTransactionId(draft.transactionId);
                setResult(null);
                setPriceChangePending(priceChanged ? `harga berubah dari Rp ${draft.totalAtDraft.toLocaleString("id-ID")} menjadi Rp ${currentEstimate.toLocaleString("id-ID")}` : null);
                setPriceChangeAcknowledged(false);
                const issues = [
                  !branchAvailable ? "akses cabang berubah" : "",
                  !deviceAvailable ? "perangkat tidak tersedia" : "",
                  !shiftAvailable ? "shift lama tidak lagi terbuka; pilih shift aktif" : "",
                  !serviceAvailable || !priceAvailable ? "layanan/harga perlu dipilih ulang" : "",
                  priceChanged ? `harga berubah dari estimasi Rp ${draft.totalAtDraft.toLocaleString("id-ID")} menjadi Rp ${currentEstimate.toLocaleString("id-ID")}` : "",
                  !barberAvailable ? "penugasan barber perlu dipilih ulang" : "",
                ].filter(Boolean);
                setOfflineNotice(issues.length
                  ? `Draft dimuat dengan peringatan: ${issues.join("; ")}. Periksa pilihan dan harga terbaru. ID transaksi asli dipertahankan untuk mencegah transaksi ganda.`
                  : "Draft dimuat. Data cabang, perangkat, shift, layanan, harga, dan penugasan tersedia saat ini. Periksa total terbaru sebelum mengirim.");
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}>Muat & periksa</button>
              <button type="button" className="draft-remove" onClick={() => {
                void saveDrafts(offlineDrafts.filter((item) => item.transactionId !== draft.transactionId)).catch(() => undefined);
              }} aria-label="Hapus draft">Hapus</button>
            </div>
          </article>
        ))}
      </section>
    )}
    {!shifts.length && <p className="architecture-footnote">Belum ada shift terbuka untuk perangkat/cabang pilihan. Buka shift terlebih dahulu di dashboard.</p>}
    {result && <div className={result.ok ? "notice checkout-result" : "notice checkout-error"} role="status">
      <div className="notice-icon">{result.ok ? "✓" : "!"}</div><div><strong>{result.ok ? "Hasil checkout" : "Transaksi gagal"}</strong><p>{result.message}</p>
      {result.ok && <p><b>Struk:</b> {result.receipt}<br/><b>Total:</b> Rp {(result.total ?? 0).toLocaleString("id-ID")}<br/><b>Komisi:</b> Rp {(result.commission ?? 0).toLocaleString("id-ID")}{result.reviewRequired ? " — perlu review penetapan komisi" : ""}<br/><b>Status pembayaran:</b> {result.paymentStatus === "paid" ? "Lunas" : "Menunggu konfirmasi"}</p>}</div>
    </div>}
    <p className="architecture-footnote">Jangan menandai QRIS lunas secara manual. Integrasi verifikasi QRIS dan mode offline penuh belum termasuk tahap ini.</p>
  </form>;
}
