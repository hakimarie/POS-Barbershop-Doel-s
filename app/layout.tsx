import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KetemuTerus Barber POS",
  description: "Sistem kasir multi-cabang untuk Doel's Barbershop.",
  applicationName: "KetemuTerus Barber POS",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#111827",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
