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

1. **Counts** opens on Dinner. Check the menu and tap **Start counting**.
2. Pick the unit stack you're on: **Granite**, **Lilac** or **Birch**. Each tap is tagged with that unit.
3. One tap on a meal panel = one slip. Only the two entrées are tallied, with a running number and tally marks in fives.
4. **Modifications**: tap a suggestion like "+ No bun – Sloppy Joe" or "+ No biscuit – Chicken Pot Pie"
   (or type your own) to count it. They never change the meal total.
5. **Unclear slip** for anything you can't read — you'll pick the meal before finishing.
6. **Undo** reverses the last tap. **Manual correction** needs a reason. Everything is in the tap log.
7. **Review & finish** shows totals per entrée and per unit, warns if a unit has no slips, and locks the count.
   If you happen to know the stack size you can enter it under Count tools, but you don't have to.

Special requests go under the count, like the notebook. Enter the room number and tap **L** or **R** for the
side of the room, and optionally the unit. Tap **✓ Diet checked** once you (or the nurse / dietary aide)
have looked at the diet order — no initials or sign-off. Tick **Repeat every day** for someone who gets the
same thing daily; the app then offers "Add for today" each day until you stop it.

## First-time setup

- Rotation is set and confirmed: Week 1 started Sunday, Nov 8, 2026 (Mon Nov 16 = Week 2).
- Menu flags from the photos are resolved ([details](docs/MENU_TRANSCRIPTION.md)).
- **Reports → Kitchen settings**: serving times (dinner 4:45), the meal Counts opens on, unit names,
  counting mode, tally marks, and whether to also count menu sides/desserts/fruit (off by default).
- **Reports → Backup & restore**: download a JSON backup and restore it later or on another device.

## Docs

- [Architecture & migration plan](docs/ARCHITECTURE.md)
- [Database schema (PostgreSQL)](db/schema.sql)
- [Menu transcription notes](docs/MENU_TRANSCRIPTION.md)
- [Deployment & security checklist](docs/SECURITY_CHECKLIST.md)

Starter recipes are references, not facility-approved production recipes, and their allergen lists must be
checked against product labels.
