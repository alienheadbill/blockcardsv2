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

### GitHub Pages (free hosting)

The workflow in `.github/workflows/pages.yml` builds a static copy of the app and publishes it to
**https://alienheadbill.github.io/blockcardsv2/** on every push.

One-time setup: on GitHub, open the repository → **Settings → Pages** → under *Build and deployment*,
set **Source** to **GitHub Actions**. Then re-run the latest "Publish to GitHub Pages" run from the
**Actions** tab (or push any change).

To build the static site yourself: `GITHUB_PAGES=true npm run build` → files in `out/`.

## Tests

```bash
npm test             # unit tests (counting, undo, rotation, requests, prep, scaling, backup, isolation)
npm run typecheck
npm run build && npm run test:e2e   # Playwright: walks the release checklist on an iPhone-sized screen
```

## Profiles (who's cooking)

Tap the name badge under the workspace title (e.g. **👤 Night cook ▾**) to switch profiles or edit them.
Profiles only change what you see on this phone; the kitchen's data is shared.

| Workspace | Starting profiles |
|---|---|
| St. Ann | **Night cook** (11 AM – 7 PM, dinner only — active by default), **Day cook** (6 AM – 2 PM, breakfast & lunch), **Everything** |
| Stop N Chop | **Owner** (all tabs), **Line cook** (orders, prep, recipes) |
| Home | **Me** |

Each profile sets the meals you work, which meal Counts opens on, and which bottom tabs show. Meals you
don't work are hidden on Today, Counts, Prep, Menu and Reports, but always one tap away
("Other meals" / "Show all meals") — e.g. for trayed sausage or a lunch dessert.

These are not password-protected logins; real staff accounts need the server version (see the security checklist).

## St. Ann's: from menu to service

**Today** shows your current service (from your profile and the serving times in Reports → Kitchen settings)
as four steps — **Count → Production → Prep → Ready** — each marked done / needs attention / to do, plus a
"needs attention" list and what's coming up. The same step bar sits on top of each of those screens.

- **Production** shows servings per item straight from the count (including texture counts). Portion sizes
  are optional — add one only when you want amounts: servings × portion size (+ optional extra %), the raw
  amount to start with if you enter a cooked yield %, and how far to scale a linked recipe (portions and full
  batches). Bold amounts are rounded **up** to something measurable; the exact number is shown beside them.
  Portion sizes are remembered per dish. Changing servings or the final amount needs a reason and is logged.
  **Send to prep list** adds one prep task per item with its quantities.
- **Ready** has an editable service checklist and a temperature log. Temperature limits are blank until you
  enter your facility's approved limits (FDA Food Code reference values can be filled in, but you must confirm
  them). The app reports whether a reading is inside your limits; it never declares food safe.

## Counting a stack of slips

1. **Counts** opens on Dinner. The tally boxes are pre-written from the menu ("Vegetable Frittata",
   "Chicken Pot Pie"). Write over them however you like ("Veggfritata", "Chicken pot"), add another box, or
   start with no printed menu at all. Tap **Start counting**.
2. One tap on a box = one slip, with a running number and tally marks in fives. Tap ✎ on a box to rename it
   any time (the count stays), or **+ Add a tally box** mid-count.
3. Build today's prep list right there: the **Prep list** card shows the menu for today, tomorrow and the day
   after — tap an item to add it to today's list, type your own, and check things off.
4. **Textures (IDDSI)**: tap Puréed (L4), Minced & Moist (L5) or Soft & Bite-Sized (L6) under each entrée as
   the slips say (more levels and thickened drinks L1–L4 are there too; "Level guide" explains each). These
   don't change the meal total and show up on Production and prep tasks.
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

## Converting measurements

- Tap **Convert** at the top of any page: type an amount, pick a unit, and (optionally) the ingredient.
  You'll see it in tsp, tbsp, fl oz, cups, pints, quarts, gallons, oz, lb, g, kg, ml and L.
- On a recipe, tap any ingredient amount to convert it, or switch the whole list between
  **Kitchen**, **As written** and **Metric**.
- **oz** always means weight and **fl oz** means volume. 8 fl oz = 1 cup exactly, but 8 oz *by weight*
  of dry elbow macaroni is about 2 cups.
- Cups ↔ weight uses typical values for ~60 common ingredients (USDA / standard kitchen charts), marked "≈".
  Weigh something once and use **Save my own conversion** — your numbers then win over the built-in ones.

## First-time setup

- Rotation is set and confirmed: Week 1 started Sunday, Nov 8, 2026 (Mon Nov 16 = Week 2).
- Menu flags from the photos are resolved ([details](docs/MENU_TRANSCRIPTION.md)).
- **Reports → Kitchen settings**: serving times (dinner 4:45), the meal Counts opens on, unit names,
  counting mode, tally marks, optional unit tabs (off by default), and whether to also count menu sides/desserts/fruit (off by default).
- **Reports → Backup & restore**: download a JSON backup and restore it later or on another device.

## Docs

- [Architecture & migration plan](docs/ARCHITECTURE.md)
- [Database schema (PostgreSQL)](db/schema.sql)
- [Menu transcription notes](docs/MENU_TRANSCRIPTION.md)
- [Deployment & security checklist](docs/SECURITY_CHECKLIST.md)

Starter recipes are references, not facility-approved production recipes, and their allergen lists must be
checked against product labels.
