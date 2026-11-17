import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorker } from "@/components/ServiceWorker";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "Kitchen Blockcards",
  description: "Meal counts, prep lists, rotating menus and recipes — the cook's notebook, digitized.",
  manifest: `${base}/manifest.webmanifest`,
  appleWebApp: { capable: true, title: "Blockcards", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: `${base}/icon.svg`, type: "image/svg+xml" },
      { url: `${base}/icon-192.png`, sizes: "192x192", type: "image/png" },
    ],
    // iOS ignores SVG touch icons; it needs a PNG.
    apple: { url: `${base}/apple-touch-icon.png`, sizes: "180x180" },
  },
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
      {process.env.NEXT_PUBLIC_STATIC === "true" && (
        <head>
          {/* GitHub Pages can't send headers, so the static build carries its policy here:
              everything same-origin, no third-party scripts, connections, frames or plugins. */}
          <meta
            httpEquiv="Content-Security-Policy"
            content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'"
          />
        </head>
      )}
      <body className="min-h-dvh antialiased">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
