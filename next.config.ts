import type { NextConfig } from "next";

/**
 * Two ways to build:
 *  - normal (`npm run build`): a Node server, with security headers.
 *  - GitHub Pages (`GITHUB_PAGES=true npm run build`): a static site in `out/`,
 *    served from https://<user>.github.io/<repo>/. Everything runs in the browser,
 *    so nothing is lost by going static.
 */
const isPages = process.env.GITHUB_PAGES === "true";
const basePath = isPages ? `/${process.env.PAGES_REPO ?? "blockcardsv2"}` : "";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  ...(isPages
    ? { output: "export", basePath, trailingSlash: true, images: { unoptimized: true } }
    : {
        async headers() {
          return [{ source: "/:path*", headers: securityHeaders }];
        },
      }),
};

export default nextConfig;
