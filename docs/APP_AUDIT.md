# Kitchen Blockcards V2 — Application Audit

Audit date: 2026-11-17 · Commit audited: `29bbb4d` · Auditor: Claude (Claude Code session)

Method: full read of `src/`, `tests/`, `e2e/`, `docs/`, `.github/workflows/pages.yml`; type check, unit and
end-to-end test runs; `npm audit`; a computed WCAG contrast check of every theme color pair; a simulated
year of dinner counts to measure storage growth; inspection of the production CSS bundle.

Severity: **Critical** (data loss / safety) · **High** (breaks a core workflow or will fail in normal use) ·
**Medium** (noticeable problem with a workaround) · **Low** (polish).

Status column is updated as fixes land (see `IMPROVEMENT_ROADMAP.md`). All "Fixed" items are covered by the tests listed in `TEST_RESULTS.md`.

## What exists today (inventory)

| Area | Implementation | State |
|---|---|---|
| App shell | Next.js 15 App Router, React 19, Tailwind 4, three themed workspaces (`/stann`, `/truck`, `/home`), bottom nav, header with Convert / Switch / profile chip | Working |
| Persistence | Whole `AppState` JSON in `localStorage` (`kitchen-blockcards:v1`), Zod-validated on load, versioned migrations v1→v5, cross-tab `storage` sync, unreadable data kept aside instead of overwritten | Working |
| Backup | Full or per-workspace JSON export; validated restore; workspace backups can't cross workspaces | Working |
| Menu | 4-week Fall/Winter rotation transcribed from photos, anchored rotation, per-date overrides, versioned master corrections | Working |
| Counting | Append-only event log (slip, item, undo, resolve, correction, complete, reopen); write-your-own tally boxes; unclear slips; modifications; optional units; review & complete with acknowledgements | Working |
| Requests | Room + L/R, unit, one-tap "Diet checked", flag-for-review (blocks Ready/Served), daily regulars | Working |
| Prep | Today / Tomorrow / Two days ahead, menu-based suggestions (never auto-completed), templates, recipe links | Working |
| Recipes | Search, scaling, kitchen/as-written/metric units, revisions, starter recipes marked not facility-approved | Working |
| Converter | All US + metric units; ingredient density table + user conversions for weight↔volume, marked approximate | Working |
| Profiles | Per-workspace view presets (Night cook / Day cook / Everything; Owner / Line cook; Me) | Working |
| Stop N Chop | Ticket builder, line board, item counts, menu with food cost %, stock with par, restock list, daily sales | Basic |
| Home | Recipes, weekly meal plan, grocery list from plan, pantry | Basic |
| Deployment | GitHub Actions → static export → GitHub Pages under `/blockcardsv2/`; Node server build also supported | Working |
| Tests | 80 Vitest unit tests, 4 Playwright e2e (iPhone 13 emulation, Chromium) | All passing at audit time |

## Findings

### Confirmed bugs

| # | Severity | Finding | Evidence | Status |
|---|---|---|---|---|
| B1 | **High** | **localStorage will fill up in about a year.** A simulated year of dinner counts (48 slips/day, one undo, four modifications) grows saved data from 23 KB to **2.84 MB**. Safari's per-site storage is ≈5 MB (counted in UTF-16), so saves start failing ("Not saved!") within roughly a year of normal use. | `tests` simulation, see `TEST_RESULTS.md` | Fixed (archiving of old tap logs + storage meter) |
| B2 | Medium | Destructive ghost buttons ("Delete all", "Reset demo data", "Delete recipe", "Remove this box") render black instead of red: the `ghost` variant's `text-ink` comes after `text-danger` in the built CSS and wins. | Production CSS: `.text-danger` at offset 19800, `.text-ink` at 19833 | Fixed |
| B3 | Medium | iPhone home-screen icon is an SVG. iOS ignores SVG `apple-touch-icon`, so "Add to Home Screen" shows a page screenshot instead of the app icon. | `src/app/layout.tsx` `icons.apple: icon.svg` | Fixed (PNG icons) |
| B4 | Medium | No duplicate-tap protection on count panels: a bounced or double tap on one box records two slips. | `CountScreen.tsx` `tap()` appends every click | Fixed (short same-box guard, never across boxes) |
| B5 | Low | Date header truncates to "Mon, Nov 16, 20…" whenever the **Today** button is visible on a 390 px phone. | Screenshot review | Fixed |
| B6 | Low | Opening a page offline that hasn't been visited before falls back to the workspace picker, because the service worker only caches pages after they're visited. | `public/sw.js` | Fixed (precache all app pages) |

### UX deficiencies

| # | Severity | Finding | Status |
|---|---|---|---|
| U1 | **High** | St. Ann's flow stops at the count. Nothing turns "31 Chicken Pot Pie" into "how much pot pie, how many biscuits, how much raw chicken". The cook still does the math on paper. | Fixed (Production screen) |
| U2 | High | Today screen is three equal day cards; it doesn't say what to do next for *your* service, and readiness/temperatures don't exist. | Fixed (service command center) |
| U3 | Medium | On a phone, the two tally boxes are partly hidden under the sticky Undo bar until you scroll; there's no compact counting layout. | Fixed (compact mode) |
| U4 | Medium | The sticky Undo / Review bar stays on screen when the keyboard is open (notes, requests), covering the field on iPhone. | Fixed |
| U5 | Medium | Bottom sheets don't lock background scrolling and don't keep keyboard focus inside the sheet. | Fixed |
| U6 | Low | Haptic feedback is always on and silently does nothing on iPhone (Safari has no Vibration API). | Fixed (setting, documented limitation) |
| U7 | Low | Recipe badge on a prep task doesn't open the recipe directly (you have to open the task first). | Fixed |

### Accessibility

| # | Severity | Finding | Status |
|---|---|---|---|
| A1 | Medium | Contrast failures (WCAG AA 4.5:1): white on Stop N Chop orange **3.75:1**, white on Home gold **3.54:1** (buttons such as "Send ticket"). St. Ann passes everywhere. | Fixed (darker accents, rechecked) |
| A2 | Medium | No `prefers-reduced-motion` handling for press/scale transitions. | Fixed |
| A3 | Low | Sheets: focus can tab out behind the dialog (see U5). | Fixed |
| A4 | Info | Status is never color-only: badges carry text ("Diet checked", "Count complete", "low"). Kept as a rule for new work. | — |

### Missing functionality (from the brief)

| # | Priority | Item | Status |
|---|---|---|---|
| M1 | High | Production calculator: servings × portion, buffer, cooked-yield → raw quantity, recipe scaling and batches, overrides with reasons | Phase 2 — done |
| M2 | High | Service readiness checklist and temperature log with facility-configured limits | Phase 2 — done |
| M3 | Medium | Prep tasks generated from production quantities | Phase 2 — done |
| M4 | Medium | Stop N Chop: order timers, modifications, supplier package pricing, waste log, explicit inventory deduction | Phase 3 |
| M5 | Medium | Home: favorites, pantry expiry/location, servings in plan, pantry-aware quantities, leftovers, cost per meal | Phase 3 |

### Technical debt

| # | Severity | Finding |
|---|---|---|
| T1 | Medium | Every change re-serializes the whole state to `localStorage` synchronously. Fine at today's size (tens of KB per tap); becomes noticeable only if B1 weren't addressed. Revisit with IndexedDB if data keeps growing (Phase 4). |
| T2 | Low | Several screens subscribe to the whole state (`useAppState(s => s)`), so any change re-renders them. Not measurably slow on a phone at current sizes; narrow selectors when touching those files. |
| T3 | Low | `CountScreen.tsx` is 745 lines; production and readiness live in their own modules rather than growing it further. |
| T4 | Low | Playwright runs Chromium with iPhone emulation only — no real WebKit engine is installed in this environment (see Blockers). |

### Security & privacy

| # | Severity | Finding | Status |
|---|---|---|---|
| S1 | Info | Demo data lives unencrypted in browser storage on one device. Acceptable **only** because the demo uses fictional rooms; the UI says so on the picker and the request form. | Documented |
| S2 | Medium | GitHub Pages can't send security headers; the static site had no Content-Security-Policy. | Fixed (meta CSP: same-origin only, no third-party scripts or connections) |
| S3 | Info | Profiles are not authentication. Anyone with the phone can switch profiles. Real staff accounts require the server architecture in `SECURITY_CHECKLIST.md` / `ARCHITECTURE.md`. | Documented |
| S4 | Info | `npm audit`: 0 known vulnerabilities. No secrets in the repo or bundle; no third-party network calls. | — |
| S5 | Info | Multiple tabs: other tabs pick up changes through the `storage` event before their next write, so taps aren't lost between tabs in normal use. A true simultaneous write (same millisecond) is last-writer-wins; acceptable for one cook per phone. | Documented |

### Recommended enhancements (not yet scheduled)

- IndexedDB storage if the app grows beyond counts/recipes (photos, long histories) — Phase 4.
- Real WebKit (Safari) test runs on a Mac or CI runner with WebKit installed.
- Server version for multi-device sync and real logins — design only, see `ARCHITECTURE.md`.

## Blockers

- **Safari/WebKit testing:** only Chromium is installed here, so iPhone behavior is tested with Chromium's iPhone 13 emulation, not the real Safari engine. Haptics, PWA install and keyboard behavior need a check on a real iPhone.
