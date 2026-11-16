# Kitchen Blockcards

A phone-first kitchen notebook: meal counts, special requests, prep lists, the 4-week rotating menu and
scalable recipes. It copies the paper workflow (slip stack → tally → requests → prep list) instead of
replacing it with a restaurant system.

Three separately themed workspaces with their own data:

| Workspace | Theme | Screens |
|---|---|---|
| **St. Ann Rehabilitation** | navy & gold | Today · Counts · Prep · Menu · Recipes · Reports |
| **Stop N Chop** (food truck) | charcoal & orange | Orders · Prep · Menu · Stock · Recipes · Reports |
| **Home Kitchen** | sage & cream | Recipes · Meal Plan · Shopping · Pantry |

> **Demo mode only.** Data stays in this browser on this device and uses fictional rooms such as
> "Demo 104". Don't enter real resident names or health information. Facility mode is switched off until
> the items in [`docs/SECURITY_CHECKLIST.md`](docs/SECURITY_CHECKLIST.md) are done.

## Run it

Requires Node 20+.

```bash
npm install
npm run dev          # http://localhost:3000
```

Production build:

```bash
npm run build
npm start            # http://localhost:3000
```

On an iPhone, open the site in Safari → Share → **Add to Home Screen** to install it like an app.

## Tests

```bash
npm test             # unit tests (counting, undo, rotation, requests, prep, scaling, backup, isolation)
npm run typecheck
npm run build && npm run test:e2e   # Playwright: walks the release checklist on an iPhone-sized screen
```

## Counting a stack of slips

1. **Counts** → pick the date and meal. Check the menu, optionally enter how many slips are in the stack, tap **Start counting**.
2. One tap on a meal panel = one slip. Panels show a running number and tally marks in fives.
3. **Unclear slip** for anything you can't read — you'll pick the meal before finishing.
4. **Additional items** (pears, cookie, soup…) are counted separately and never change the meal total.
   *Detailed* mode ties them to the slip you just counted.
5. **Undo** reverses the last tap. **Manual correction** needs a reason. Everything is in the tap log.
6. **Review & finish** shows totals and any problems (stack mismatch, unclear slips) and locks the count.

Special requests go under the count, like the notebook. Each starts "Not yet checked" — record your
initials once you've checked it against the resident's current diet order, or flag it for staff review.

## First-time setup

- **Menu → Rotation start date**: set the Sunday the facility treats as Week 1 and tick "confirmed".
  The demo uses Sun Nov 8, 2026 (worked out from the photographed Monday-16th slip) and marks it unconfirmed.
- **Menu → Transcription review**: 11 lines from the photos need a look against the posted sheets
  ([details](docs/MENU_TRANSCRIPTION.md)).
- **Reports → Kitchen settings**: serving times, default counting mode, tally marks.
- **Reports → Backup & restore**: download a JSON backup and restore it later or on another device.

## Docs

- [Architecture & migration plan](docs/ARCHITECTURE.md)
- [Database schema (PostgreSQL)](db/schema.sql)
- [Menu transcription notes](docs/MENU_TRANSCRIPTION.md)
- [Deployment & security checklist](docs/SECURITY_CHECKLIST.md)

Starter recipes are references, not facility-approved production recipes, and their allergen lists must be
checked against product labels.
