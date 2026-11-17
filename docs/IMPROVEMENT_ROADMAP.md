# Improvement roadmap

Status: ✅ done · 🟡 partial · ⬜ planned · ⛔ blocked

## Phase 1 — Audit and stabilize ✅

| Item | Status | Notes / files |
|---|---|---|
| Repository audit (`APP_AUDIT.md`) | ✅ | |
| Storage won't fill up: archive old completed counts (totals, corrections, reasons kept); storage meter; warning at 70% | ✅ | `lib/counting.ts` `archiveSession`, `lib/state/ops.ts` `archiveOldCounts`, `components/Inventory.tsx` |
| Undo for restore / reset | ✅ | `lib/state/store.ts` |
| Same-box double-tap guard, haptics setting, compact counting | ✅ | `CountScreen.tsx`, Reports → Kitchen settings |
| Destructive buttons render red again | ✅ | `components/ui.tsx` |
| AA contrast (Stop N Chop, Home accents) | ✅ | `app/globals.css` |
| Reduced motion; sheet focus trap + scroll lock; sticky bars hide while typing | ✅ | `globals.css`, `ui.tsx`, `AppShell.tsx` |
| iPhone PNG icons, maskable icon | ✅ | `public/*.png`, `layout.tsx`, manifest |
| Static build CSP; precache every page for offline | ✅ | `layout.tsx`, `public/sw.js`, `scripts/write-precache.mjs` |
| Static-export e2e mode + offline/CSP test | ✅ | `playwright.config.ts`, `e2e/offline.spec.ts` |

## Phase 2 — St. Ann's operational workflow ✅

| Item | Status | Notes / files |
|---|---|---|
| Today = command center for *your* service (profile + serving time): menu, Count → Production → Prep → Ready with done/attention/to-do (icon + text), needs-attention list, coming up | ✅ | `stann/TodayDashboard.tsx` |
| Step bar linking Count / Production / Prep / Ready | ✅ | `stann/ServiceFlow.tsx` |
| Production calculator: servings × portion × buffer, cooked-yield → raw, recipe portions & full batches, modifications subtracted, servings/amount overrides with reasons, history, remembered per dish, yield-from-test-batch helper | ✅ | `lib/production.ts`, `stann/ProductionScreen.tsx`, route `/stann/production` |
| Production → prep tasks with quantities and recipe links | ✅ | `ops.planToPrep` |
| Readiness checklist (editable) and temperature log; limits blank until a person confirms them; void-not-delete | ✅ | `lib/readiness.ts`, `stann/ReadyScreen.tsx`, route `/stann/ready` |
| Recipe link directly on prep tasks | ✅ | `PrepBoard.tsx` |

## Phase 3 — Stop N Chop and Home ⬜

| Item | Status |
|---|---|
| Stop N Chop: ticket timestamps and elapsed timers, modifications per ticket line, priority ordering | ⬜ |
| Stop N Chop: supplier package size + price → unit cost; recipe cost from ingredients (estimated vs recorded) | ⬜ |
| Stop N Chop: explicit "deduct stock for today's sales" step; waste log; usage report | ⬜ |
| Home: favorites, recipe notes/technique tips | ⬜ |
| Home: pantry expiry date + storage location, low-stock | ⬜ |
| Home: meal plan with servings → scaled ingredient needs → pantry-aware shopping list | ⬜ |
| Home: leftovers (made on, amount left, user-entered use-by), cost per meal | ⬜ |

## Phase 4 — Reliability and architecture ⬜

| Item | Status |
|---|---|
| IndexedDB storage if data outgrows localStorage (only if needed) | ⬜ |
| Backup reminders; optional automatic archive download | ⬜ |
| Production architecture write-up (auth, roles, API, audit, sync) beyond `SECURITY_CHECKLIST.md` | 🟡 checklist + schema exist |
| Real Safari/WebKit test runs | ⛔ no WebKit here — needs a Mac/CI runner or a manual iPhone check |

## Assumptions made (conservative, reversible)

- Temperature limits ship **blank**. FDA Food Code reference values can be filled in but must be confirmed before saving.
- Production amounts are rounded **up** for the kitchen value; exact values are always shown.
- Default double-tap window 0.3 s (same box only). Configurable, can be turned off.
- Completed counts keep full tap logs for 120 days by default, then totals + corrections only. Configurable, including "forever".
- No shift handover / messaging features, per the brief.
