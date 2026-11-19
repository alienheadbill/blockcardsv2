# Test results

All runs below were executed in this repository's cloud dev container (Linux, Node 22, Chromium 1243 with
Playwright's iPhone 13 profile). **No WebKit (Safari) engine is available here**, so nothing below is a real
Safari run — see "Not tested".

## 2026-11-19 — Texture taps count, made-ahead prep, kitchen helper

| Suite | Result |
|---|---|
| Unit tests | ✅ **118 passed** (new: textured slips + grouped undo, made-ahead cover/uncover and next-step suggestions, helper checks) |
| E2E server build | ✅ 8 passed, 1 skipped (static-only) |
| E2E static build | ✅ **9 passed** |

## 2026-11-17 — Editing counts after the fact

| Suite | Result |
|---|---|
| Unit tests | ✅ **110 passed** (new: add/remove/switch on finished counts with textures; invalid changes rejected atomically; archived counts read-only) |
| E2E server build | ✅ 7 passed, 1 skipped (static-only) — St. Ann flow now includes a late admission after finishing the count and checks Production updates |
| E2E static build | ✅ 8 passed |

## 2026-11-17 — Cook feedback round (prep while counting, optional portions, IDDSI textures)

| Suite | Result |
|---|---|
| Type check | ✅ |
| Unit tests | ✅ **108 passed** (new: texture counting, rename carries to textures, optional portions, textures in production) |
| E2E server build | ✅ 7 passed, 1 skipped (static-only offline test) |
| E2E static build | ✅ **8 passed** |

Found and fixed by the e2e run: when the keyboard closed, the sticky Undo / Review bar reappeared instantly
under the finger, so a tap on a nearby "Add" button could land on **Undo**. Bars now return 0.4 s after typing ends.

## 2026-11-17 — Phase 1 + Phase 2 (commit after `39005c6`)

| Suite | Command | Result |
|---|---|---|
| Type check | `npm run typecheck` | ✅ no errors |
| Unit tests (Vitest) | `npm test` | ✅ **106 passed** in 9 files |
| E2E, server build | `npm run build && npm run test:e2e` | ✅ **7 passed**, 1 skipped (offline test is static-only by design) |
| E2E, GitHub Pages static build | `GITHUB_PAGES=true PAGES_BASE= next build && node scripts/write-precache.mjs out && npm run test:e2e:static` | ✅ **8 passed** |
| Dependencies | `npm audit` | ✅ 0 vulnerabilities |
| Contrast (computed, WCAG AA 4.5:1) | script in audit | ✅ all text/background token pairs pass after the accent fix (Stop N Chop 5.18:1, Home 5.02:1) |

### What the tests cover

| Area | Unit tests | E2E |
|---|---|---|
| Meal count creation, rapid taps (500 taps → exactly 500, unique ids, ordered seq), undo to zero | `counting.test.ts`, `reliability.test.ts` | `definition-of-done` |
| Same-box double-tap guard (blocks bounces, never blocks other boxes) | `reliability.test.ts` | "a bounced double tap counts once" |
| Corrections with reasons, unclear slips, review & completion, reopen | `counting.test.ts` | first-release checklist |
| Archiving old counts keeps totals + corrections + reasons; idempotent; survives backup | `reliability.test.ts` | — |
| Storage growth: 1 year of dinner counts with default policy < half of a 5 MB quota | `reliability.test.ts` | — |
| Production math: 25 × 4 oz = 6.25 lb; raw vs cooked yield; buffer; modifications subtracted; never rounds down (60 cases); recipe portions/batches; overrides | `production.test.ts` | `stann-flow` |
| Production plan: lines from count & requests, remembered defaults, reasons required, removed lines stay removed, prep tasks created once and updated without touching "done" | `production.test.ts` | `stann-flow` |
| Readiness: no limits by default, limits need confirmation, out-of-limit detection, void-not-delete, per-service checklist | `production.test.ts` | `stann-flow` |
| Recipe scaling, unit conversion, weight↔volume only with ingredient data | `recipes.test.ts`, `convert.test.ts` | — |
| Backup/restore: round trip, workspace isolation, truncated/tampered/future-version files rejected | `state.test.ts`, `reliability.test.ts` | restore + cross-workspace refusal |
| Schema migrations v1→v6 | `state.test.ts`, `convert.test.ts`, `profiles.test.ts` | — |
| Offline: every screen opens offline after one visit; data entry saved offline | — | `offline.spec.ts` (static) |
| Content-Security-Policy: no violations across the app | — | `offline.spec.ts` (static) |
| Keyboard: focus stays inside sheets; Escape closes | — | "sheets keep keyboard focus inside" |
| Workspace isolation, profiles, shopping delete | `state.test.ts`, `profiles.test.ts` | yes |

### Not tested / blockers

- **Safari on iPhone**: no WebKit engine in this environment. Needs a manual check on a real iPhone
  (install to home screen, keyboard + sticky bars, offline after install). Vibration is unsupported on iOS by design.
- Screen readers (VoiceOver/TalkBack): labels and roles are checked by the e2e selectors, but no screen-reader session was run.
- Real storage quota behavior on a full device.

## Earlier runs

| Date | Unit | E2E | Notes |
|---|---|---|---|
| 2026-11-17 (audit baseline, `29bbb4d`) | 80 passed | 4 passed | before Phase 1 |
