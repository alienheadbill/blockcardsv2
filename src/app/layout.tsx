import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorker } from "@/components/ServiceWorker";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "Kitchen Blockcards",
  description: "Meal counts, prep lists, rotating menus and recipes — the cook's notebook, digitized.",
  manifest: `${base}/manifest.webmanifest`,
  appleWebApp: { capable: true, title: "Blockcards", statusBarStyle: "default" },
  icons: { icon: `${base}/icon.svg`, apple: `${base}/icon.svg` },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1b2a4a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
