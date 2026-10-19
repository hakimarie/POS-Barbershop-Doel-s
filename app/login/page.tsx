"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const configMissing =
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const authError = searchParams.get("error");
  const callbackFailed = authError === "auth";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setBusy(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setMessage("Login gagal. Periksa email dan password, lalu coba lagi.");
        return;
      }

      const next = searchParams.get("next");
      const destination = next?.startsWith("/") && !next.startsWith("//") ? next : "/";
      router.replace(destination);
      router.refresh();
    } catch {
      setMessage("Supabase belum dikonfigurasi. Periksa environment variables deployment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="login-title">
        <a className="brand auth-brand" href="/" aria-label="KetemuTerus Barber POS">
          <span className="brand-mark">KT</span>
          <span className="brand-copy"><strong>KetemuTerus</strong><small>BARBER POS</small></span>
        </a>
        <p className="eyebrow">DOEL&apos;S BARBERSHOP · MULTI-CABANG</p>
        <h1 id="login-title">Masuk ke workspace</h1>
        <p className="auth-description">Gunakan akun operasional yang telah didaftarkan oleh administrator.</p>

        {configMissing || authError === "config" ? (
          <div className="auth-alert" role="alert">
            Supabase belum dikonfigurasi. Atur <code>NEXT_PUBLIC_SUPABASE_URL</code> dan <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> pada environment deployment.
          </div>
        ) : null}

        {callbackFailed ? <div className="auth-alert" role="alert">Sesi autentikasi tidak berhasil diverifikasi. Silakan masuk kembali.</div> : null}
        {message ? <div className="auth-alert" role="alert">{message}</div> : null}

        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="nama@perusahaan.com"
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Masukkan password"
          />
          <button className="auth-submit" type="submit" disabled={busy || configMissing}>
            {busy ? "Memverifikasi..." : "Masuk"}
          </button>
        </form>

        <p className="auth-footnote">Akses hanya untuk pengguna yang dibuat oleh administrator. Registrasi publik tidak tersedia.</p>
      </section>
    </main>
  );
}
