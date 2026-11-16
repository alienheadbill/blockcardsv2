# Architecture

## Layout

```
src/
  app/                    Next.js App Router pages (one folder per workspace)
    stann/  truck/  home/   each has its own layout → AppShell with that workspace's theme & nav
  components/             UI (client components)
    stann/                St. Ann screens: Today, Counts, Menu, Reports
    truck/  home/         Stop N Chop and Home screens
    PrepBoard, RecipeLibrary, Inventory   shared by all workspaces
  lib/                    framework-free domain logic (unit tested)
    counting.ts           event-sourced meal counts, undo, corrections, review
    requests.ts           special requests + verification rules
    prep.ts               prep tasks, menu-based suggestions, templates
    menu/                 types, Fall/Winter transcription, rotation math
    recipes/              units, scaling, starter recipes
    state/                app state model, pure ops, backup/restore, browser store
db/schema.sql             PostgreSQL schema for the server phase
e2e/                      Playwright: the brief's definition-of-done walk-through
tests/                    Vitest unit tests
```

## Key decisions

- **Counting is an append-only event log.** A tap appends a `slip` event; undo appends an `undo`
  event pointing at the last tap; corrections need a reason. Totals are always derived, so a count can be
  audited tap by tap and nothing is ever lost. Only `slip` events (and slip corrections) change the resident
  meal total — add-on items (fruit, dessert, soup…) are tracked separately and can't double count.
- **Review before complete.** Unclear slips block completion; a mismatch with the physical stack or
  manual corrections must be acknowledged. Completed counts lock until reopened with a reason.
- **Workspaces are separate trees** in state (`workspaces.stann / truck / home`) and separate rows by
  `workspace_id` in the database. No shared records.
- **The rotation is anchored, never guessed.** No anchor → no menu, plus a banner.
- **Domain logic is pure TypeScript** with no React or storage dependencies, so the same functions
  run in the browser today and in the API later.

## Migration plan (demo → server)

1. **0001_initial** — `db/schema.sql` (validated against PostgreSQL 16). Seed `menu_*` from `fallWinter.ts`
   with a one-off script that writes one `menu_items` row per line, `version = 1`, carrying `review_flag`.
2. Add a server API (Next.js route handlers) with zod validation reusing `lib/state/backup.ts` schemas;
   each request runs in a transaction with `SET LOCAL app.user_id` so row-level security applies.
3. Count taps: the client keeps an outbox of events, each with a `client_event_id` UUID. The server inserts
   with `ON CONFLICT (session_id, client_event_id) DO NOTHING`, so retries never duplicate a tap; `seq` is
   assigned server-side inside the transaction. Totals are recomputed with the same `summarize()` function.
4. Import path for existing demo users: the JSON backup format (`kind: "full" | "workspace"`) maps
   directly onto the tables; resident-free demo data only.
5. Later migrations add columns rather than editing history; menu and recipe edits insert new version rows.
