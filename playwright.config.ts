import { defineConfig, devices } from "@playwright/test";

/**
 * Two modes:
 *  - default: `next start` (server build)
 *  - E2E_STATIC=1: the GitHub Pages static export (built with PAGES_BASE="" so it
 *    serves from the root), served by a plain static file server — the same shape
 *    as the live site, including its Content-Security-Policy and service worker.
 */
const STATIC = !!process.env.E2E_STATIC;
const PORT = Number(process.env.E2E_PORT ?? (STATIC ? 3124 : 3123));

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: { baseURL: `http://localhost:${PORT}`, ...devices["iPhone 13"], browserName: "chromium" },
  webServer: {
    command: STATIC ? `npx http-server out -p ${PORT} -s -c-1` : `npx next start -p ${PORT}`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
