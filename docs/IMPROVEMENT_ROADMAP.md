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

## Cook feedback (2026-11-17) ✅

| Item | Status | Files |
|---|---|---|
| Notes box replaced by a prep list on the Count screen: menu for today/tomorrow/day after, tap to add, type your own, check off | ✅ | `stann/CountPanels.tsx` |
| Portion sizes optional; never flagged as missing | ✅ | `lib/production.ts`, `ops.serviceStatus` |
| IDDSI textures (Puréed L4, Minced & Moist L5, Soft & Bite-Sized L6; Liquidised L3, Easy to Chew L7; drinks L1–L4) with level guide; shown in Production and prep tasks | ✅ | `lib/iddsi.ts`, `lib/counting.ts`, `stann/CountPanels.tsx` |
| Fix: sticky bars could reappear under the finger after typing | ✅ | `AppShell.tsx` |

### Cook feedback (2026-11-19) ✅

| Item | Status | Files |
|---|---|---|
| Texture buttons count the slip (one tap = meal + texture; undo both) | ✅ | `lib/counting.ts` `tapTexturedSlip`, grouped `undo` |
| Made-ahead prep with next-step suggestions; covered tasks hidden | ✅ | `lib/prep.ts` `madeAhead`, `togglePrepInList`, `pendingSuggestions` |
| Kitchen helper checks | ✅ | `lib/helper.ts`, `stann/CountPanels.tsx` `HelperStrip`, Today |

### Optional AI assistant (decision needed)

A chat-style assistant (e.g. Claude) could review a count or prep list in plain language. Trade-offs:
it costs money per use (the owner's API key), needs internet, and sends kitchen data off the phone — so
it must stay off for anything involving real residents. The built-in helper covers the "does this look
right" checks offline and for free; an AI layer would sit on top, clearly labeled, only if the owner wants it.

### Possible integrations (need input from the facility)

- **MealSuite**: if it can export tray tickets / production counts (CSV or PDF), the app could import counts
  per entrée and texture instead of tapping. Needs a sample export; no public API access is assumed.
- **US Foods**: an exported order guide (product, pack size, price) could feed ingredient prices and pack
  sizes for costing (Stop N Chop / Home) or St. Ann's ordering. Needs a sample export.

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
