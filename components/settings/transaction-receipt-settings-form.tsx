"use client";

import { useState, useTransition, type FormEvent } from "react";
import { updateTransactionReceiptSettings } from "@/app/actions/branches";

type Props = {
  businessName: string;
  address: string;
  phone: string;
  logoUrl: string;
  footer: string;
  showCashier: boolean;
  showBarber: boolean;
  showAddress: boolean;
};

const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

export default function TransactionReceiptSettingsForm(props: Props) {
  const [footer, setFooter] = useState(props.footer);
  const [showCashier, setShowCashier] = useState(props.showCashier);
  const [showBarber, setShowBarber] = useState(props.showBarber);
  const [showAddress, setShowAddress] = useState(props.showAddress);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setSuccess(false);
    const data = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await updateTransactionReceiptSettings(data);
      setMessage(result.message);
      setSuccess(result.ok);
    });
  }

  return <div className="receipt-settings-layout">
    <form className="profile-settings-form receipt-settings-form" onSubmit={submit}>
      <section className="profile-form-section">
        <div className="profile-form-section-heading"><h2>Konten struk</h2><p>Atur informasi yang ditampilkan di struk pelanggan. Perubahan ini tidak mengubah total transaksi atau status pembayaran.</p></div>
        <div className="profile-form-grid">
          <label className="profile-field profile-field-wide">Pesan penutup<textarea name="receipt_footer" value={footer} maxLength={500} rows={3} onChange={(event) => setFooter(event.target.value)} placeholder="Terima kasih telah berkunjung!" /><small>{footer.length}/500 karakter · dapat berisi instruksi singkat atau ajakan kembali.</small></label>
        </div>
        <div className="receipt-toggle-list">
          <label className="receipt-toggle"><input type="checkbox" name="receipt_show_cashier" checked={showCashier} onChange={(event) => setShowCashier(event.target.checked)} /><span><strong>Nama kasir</strong><small>Tampilkan petugas yang memproses transaksi.</small></span></label>
          <label className="receipt-toggle"><input type="checkbox" name="receipt_show_barber" checked={showBarber} onChange={(event) => setShowBarber(event.target.checked)} /><span><strong>Nama kapster</strong><small>Tampilkan kapster yang melayani pelanggan.</small></span></label>
          <label className="receipt-toggle"><input type="checkbox" name="receipt_show_branch_address" checked={showAddress} onChange={(event) => setShowAddress(event.target.checked)} /><span><strong>Alamat usaha</strong><small>Tampilkan alamat yang diatur di Profil Barbershop.</small></span></label>
        </div>
      </section>
      {message ? <p className={success ? "profile-form-message success" : "profile-form-message error"} role="status">{message}</p> : null}
      <div className="profile-form-footer"><p>Disimpan di pengaturan organisasi dan dicatat ke audit log.</p><button className="primary-button" type="submit" disabled={pending}>{pending ? "Menyimpan..." : "Simpan pengaturan struk"}</button></div>
    </form>

    <aside className="receipt-preview-card">
      <div className="receipt-preview-heading"><div><p className="eyebrow">LIVE PREVIEW</p><h2>Pratinjau struk</h2></div><span className="receipt-preview-status">Contoh</span></div>
      <div className="receipt-paper">
        {props.logoUrl ? <img className="receipt-preview-logo" src={props.logoUrl} alt="Logo usaha" /> : <div className="receipt-preview-mark">KT</div>}
        <h3>{props.businessName || "Nama Barbershop"}</h3>
        {showAddress && props.address ? <p>{props.address}</p> : null}
        {props.phone ? <p>{props.phone}</p> : null}
        <div className="receipt-dash" />
        <div className="receipt-meta"><span>No. transaksi</span><strong>CONTOH-0001</strong></div>
        <div className="receipt-meta"><span>Tanggal</span><strong>{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date())}</strong></div>
        <div className="receipt-dash" />
        <div className="receipt-line"><span>Hair Cut &amp; Styling</span><span>{rupiah.format(35000)}</span></div>
        <div className="receipt-line"><span>Qty 1</span><span>{rupiah.format(35000)}</span></div>
        <div className="receipt-dash" />
        <div className="receipt-total"><span>Total contoh</span><strong>{rupiah.format(35000)}</strong></div>
        <p className="receipt-preview-payment">Metode: contoh tunai</p>
        {showCashier ? <p className="receipt-preview-detail">Kasir: Contoh Kasir</p> : null}
        {showBarber ? <p className="receipt-preview-detail">Kapster: Contoh Kapster</p> : null}
        <div className="receipt-dash" />
        <p className="receipt-footer-copy">{footer || " "}</p>
        <p className="receipt-preview-disclaimer">Pratinjau ilustratif — bukan bukti transaksi.</p>
      </div>
      <p className="receipt-preview-note">Contoh ini hanya memperlihatkan tata letak dan opsi yang dipilih. Data transaksi asli, nomor struk, pajak, dan konfirmasi QRIS tidak dibuat atau diubah dari halaman ini.</p>
    </aside>
  </div>;
}
