/**
 * Pure state transitions. UI calls these through `dispatch`, tests call them directly.
 */
import * as C from "../counting";
import { addDays, type ISODate } from "../dates";
import { newId, nowISO } from "../ids";
import { FALL_WINTER, SEASONS } from "../menu/fallWinter";
import { overrideKey, resolveMeal, type ResolvedMeal } from "../menu/rotation";
import type { MealService, MenuItem, MenuItemKind } from "../menu/types";
import * as P from "../prep";
import { reviseRecipe, type Recipe } from "../recipes/recipes";
import { convert, dimensionOf } from "../recipes/units";
import * as R from "../requests";
import * as PR from "../production";
import * as RD from "../readiness";
import type { WorkspaceId } from "../workspaces";
import { EVERYTHING, validateProfile, type Profile } from "../profiles";
import { updateWorkspace, type AppState, type InventoryItem, type ShoppingItem, type Ticket, type TicketStatus, type TruckMenuItem } from "./model";

// ───────────────────────── workspace ─────────────────────────

export function setActiveWorkspace(state: AppState, ws: WorkspaceId): AppState {
  return state.activeWorkspace === ws ? state : { ...state, activeWorkspace: ws };
}

// ───────────────────────── St. Ann menu ─────────────────────────

export function seasonFor(state: AppState) {
  return SEASONS.find((s) => s.id === state.workspaces.stann.rotation.seasonId) ?? FALL_WINTER;
}

export function mealFor(state: AppState, date: ISODate, meal: MealService): ResolvedMeal {
  const d = state.workspaces.stann;
  return resolveMeal({ season: seasonFor(state), rotation: d.rotation, corrections: d.corrections, overrides: d.overrides, date, meal });
}

export function setRotationAnchor(state: AppState, week1Start: ISODate, confirmed: boolean, note: string): AppState {
  return updateWorkspace(
    state,
    "stann",
    (d) => ({ ...d, rotation: { ...d.rotation, week1Start, confirmed, note: note.trim() } }),
    { action: "rotation.anchor", detail: `Week 1 Sunday set to ${week1Start}${confirmed ? " (confirmed)" : " (unconfirmed)"}` },
  );
}

export function correctMenuItem(
  state: AppState,
  item: MenuItem,
  change: { text: string; kind: MenuItemKind; reviewed: boolean },
  note: string,
): AppState {
  const text = change.text.trim();
  if (!text) throw new Error("Menu text can't be empty");
  return updateWorkspace(
    state,
    "stann",
    (d) => ({
      ...d,
      corrections: { ...d.corrections, [item.id]: { text, kind: change.kind, reviewed: change.reviewed } },
      menuHistory: [
        {
          id: newId("mh"),
          at: nowISO(),
          itemId: item.id,
          before: { text: item.text, kind: item.kind },
          after: { text, kind: change.kind },
          reviewed: change.reviewed,
          note: note.trim(),
        },
        ...d.menuHistory,
      ],
    }),
    { action: "menu.correct", detail: `${item.id}: "${item.text}" → "${text}"${change.reviewed ? " (reviewed)" : ""}` },
  );
}

export function setOverride(state: AppState, date: ISODate, meal: MealService, items: { kind: MenuItemKind; text: string }[], reason: string): AppState {
  if (!reason.trim()) throw new Error("Give a reason for the change (e.g. delivery shortage)");
  const clean = items.filter((i) => i.text.trim());
  if (!clean.some((i) => i.kind === "main" || i.kind === "alt")) throw new Error("Include at least one entrée");
  const menuItems: MenuItem[] = clean.map((i, n) => ({
    id: `ovr-${date}-${meal}-${n}`,
    kind: i.kind,
    printedLabel: { alt: "A", dessert: "D", fruit: "F", salad: "S" }[i.kind as string] ?? "",
    text: i.text.trim(),
  }));
  return updateWorkspace(
    state,
    "stann",
    (d) => ({ ...d, overrides: { ...d.overrides, [overrideKey(date, meal)]: { items: menuItems, reason: reason.trim(), at: nowISO() } } }),
    { action: "menu.override", detail: `${date} ${meal}: ${reason.trim()}` },
  );
}

export function clearOverride(state: AppState, date: ISODate, meal: MealService): AppState {
  return updateWorkspace(
    state,
    "stann",
    (d) => {
      const { [overrideKey(date, meal)]: _drop, ...rest } = d.overrides;
      return { ...d, overrides: rest };
    },
    { action: "menu.override.clear", detail: `${date} ${meal}` },
  );
}

// ───────────────────────── counts ─────────────────────────

export function getSession(state: AppState, date: ISODate, meal: MealService) {
  return state.workspaces.stann.counts[C.sessionKey(date, meal)];
}

export function startSession(state: AppState, date: ISODate, meal: MealService, entrees?: string[]): AppState {
  if (getSession(state, date, meal)) return state;
  const resolved = mealFor(state, date, meal);
  if (!resolved.items.length && !entrees?.some((e) => e.trim()))
    throw new Error("No menu for this service yet — write the tally box names, or set the rotation start date.");
  const settings = state.workspaces.stann.settings;
  const session = C.createSession({
    date,
    meal,
    menuItems: resolved.items,
    mode: settings.defaultCountMode,
    units: settings.units ?? [],
    ...(entrees ? { entrees } : {}),
  });
  return updateWorkspace(state, "stann", (d) => ({ ...d, counts: { ...d.counts, [C.sessionKey(date, meal)]: session } }), {
    action: "count.start",
    detail: `${date} ${meal}`,
  });
}

/** Apply a counting operation to the session for a service. */
export function updateSession(
  state: AppState,
  date: ISODate,
  meal: MealService,
  fn: (s: C.CountSession) => C.CountSession,
  log?: { action: string; detail: string },
): AppState {
  const key = C.sessionKey(date, meal);
  const current = state.workspaces.stann.counts[key];
  if (!current) throw new Error("Start the count first");
  const next = fn(current);
  if (next === current) return state;
  return updateWorkspace(state, "stann", (d) => ({ ...d, counts: { ...d.counts, [key]: next } }), log);
}

// ───────────────────────── requests ─────────────────────────

export function addRequest(state: AppState, input: Parameters<typeof R.createRequest>[0]): AppState {
  const req = R.createRequest(input);
  return updateWorkspace(state, "stann", (d) => ({ ...d, requests: [...d.requests, req] }), {
    action: "request.add",
    detail: `${req.date} ${req.meal}: ${req.item} ×${req.quantity} for ${req.identifier}`,
  });
}

export function updateRequest(state: AppState, id: string, fn: (r: R.SpecialRequest) => R.SpecialRequest, action: string): AppState {
  const current = state.workspaces.stann.requests.find((r) => r.id === id);
  if (!current) throw new Error("Request not found");
  const next = fn(current);
  return updateWorkspace(state, "stann", (d) => ({ ...d, requests: d.requests.map((r) => (r.id === id ? next : r)) }), {
    action,
    detail: `${next.item} for ${next.identifier}: ${R.VERIFICATION_LABELS[next.verification]} · ${R.STATUS_LABELS[next.status]}`,
  });
}

export function addStandingRequest(state: AppState, input: Parameters<typeof R.createStanding>[0]): AppState {
  const st = R.createStanding(input);
  return updateWorkspace(state, "stann", (d) => ({ ...d, standingRequests: [...(d.standingRequests ?? []), st] }), {
    action: "request.standing.add",
    detail: `Every ${st.meal}: ${st.item} ×${st.quantity} for ${st.identifier}`,
  });
}

export function setStandingActive(state: AppState, id: string, active: boolean): AppState {
  const cur = state.workspaces.stann.standingRequests.find((x) => x.id === id);
  if (!cur) throw new Error("Daily regular not found");
  return updateWorkspace(
    state,
    "stann",
    (d) => ({ ...d, standingRequests: d.standingRequests.map((x) => (x.id === id ? { ...x, active } : x)) }),
    { action: active ? "request.standing.resume" : "request.standing.stop", detail: `${cur.item} for ${cur.identifier}` },
  );
}

/** Add today's copies of the daily regulars for a service (skips ones already added). */
export function addStandingForService(state: AppState, date: ISODate, meal: MealService, countSessionId?: string): AppState {
  const d = state.workspaces.stann;
  const pending = R.pendingStanding(d.standingRequests ?? [], d.requests, date, meal);
  if (!pending.length) return state;
  const created = pending.map((p) => R.fromStanding(p, date, countSessionId));
  return updateWorkspace(state, "stann", (x) => ({ ...x, requests: [...x.requests, ...created] }), {
    action: "request.standing.apply",
    detail: `${date} ${meal}: ${created.length} daily regular(s)`,
  });
}

// ───────────────────────── prep (any workspace) ─────────────────────────

export function addPrepTask(state: AppState, ws: WorkspaceId, input: Parameters<typeof P.createTask>[0]): AppState {
  const task = P.createTask(input);
  return updateWorkspace(state, ws, (d) => ({ ...d, prep: [...d.prep, task] }), { action: "prep.add", detail: `${task.date}: ${task.title}` });
}

export function updatePrepTask(state: AppState, ws: WorkspaceId, id: string, fn: (t: P.PrepTask) => P.PrepTask, action = "prep.edit"): AppState {
  const cur = state.workspaces[ws].prep.find((t) => t.id === id);
  if (!cur) throw new Error("Task not found");
  const next = fn(cur);
  if (!next.title.trim()) throw new Error("Task name is required");
  return updateWorkspace(state, ws, (d) => ({ ...d, prep: d.prep.map((t) => (t.id === id ? next : t)) }), {
    action,
    detail: `${next.title}${action === "prep.toggle" ? (next.done ? " ✓ done" : " ↺ not done") : ""}`,
  });
}

export function deletePrepTask(state: AppState, ws: WorkspaceId, id: string): AppState {
  const cur = state.workspaces[ws].prep.find((t) => t.id === id);
  return updateWorkspace(state, ws, (d) => ({ ...d, prep: d.prep.filter((t) => t.id !== id) }), { action: "prep.delete", detail: cur?.title ?? id });
}

export function acceptSuggestion(state: AppState, ws: WorkspaceId, s: P.PrepSuggestion): AppState {
  return addPrepTask(state, ws, { date: s.date, meal: s.meal, title: s.title, holdingReminder: s.holdingReminder, source: "suggested", suggestionKey: s.key });
}

export function dismissSuggestion(state: AppState, ws: WorkspaceId, key: string): AppState {
  return updateWorkspace(state, ws, (d) => ({ ...d, dismissedSuggestions: [...d.dismissedSuggestions, key] }));
}

export function applyPrepTemplate(state: AppState, ws: WorkspaceId, templateId: string, date: ISODate, meal: MealService | null): AppState {
  const tpl = state.workspaces[ws].templates.find((t) => t.id === templateId);
  if (!tpl) throw new Error("Template not found");
  const tasks = P.applyTemplate(tpl, date, meal);
  return updateWorkspace(state, ws, (d) => ({ ...d, prep: [...d.prep, ...tasks] }), { action: "prep.template", detail: `${tpl.name} → ${date}` });
}

export function saveTemplate(state: AppState, ws: WorkspaceId, name: string, titles: string[]): AppState {
  const clean = titles.map((t) => t.trim()).filter(Boolean);
  if (!name.trim() || !clean.length) throw new Error("Template needs a name and at least one task");
  return updateWorkspace(state, ws, (d) => ({ ...d, templates: [...d.templates, { id: newId("tpl"), name: name.trim(), tasks: clean.map((title) => ({ title })) }] }), {
    action: "prep.template.save",
    detail: name.trim(),
  });
}

// ───────────────────────── recipes (any workspace) ─────────────────────────

export function saveRecipe(state: AppState, ws: WorkspaceId, recipe: Recipe, note: string): AppState {
  const exists = state.workspaces[ws].recipes.find((r) => r.id === recipe.id);
  return updateWorkspace(
    state,
    ws,
    (d) => ({
      ...d,
      recipes: exists ? d.recipes.map((r) => (r.id === recipe.id ? reviseRecipe(exists, { ...recipe, source: exists.source }, note) : r)) : [...d.recipes, recipe],
    }),
    { action: exists ? "recipe.revise" : "recipe.add", detail: recipe.name },
  );
}

export function deleteRecipe(state: AppState, ws: WorkspaceId, id: string): AppState {
  const r = state.workspaces[ws].recipes.find((x) => x.id === id);
  return updateWorkspace(state, ws, (d) => ({ ...d, recipes: d.recipes.filter((x) => x.id !== id) }), { action: "recipe.delete", detail: r?.name ?? id });
}

// ───────────────────────── inventory & shopping (any workspace) ─────────────────────────

export function upsertInventory(state: AppState, ws: WorkspaceId, item: Omit<InventoryItem, "id" | "updatedAt"> & { id?: string }): AppState {
  if (!item.name.trim()) throw new Error("Item name is required");
  if (![item.qty, item.par].every((n) => Number.isFinite(n) && n >= 0)) throw new Error("Quantities must be zero or more");
  const full: InventoryItem = { ...item, name: item.name.trim(), id: item.id ?? newId("inv"), updatedAt: nowISO() };
  return updateWorkspace(
    state,
    ws,
    (d) => ({ ...d, inventory: d.inventory.some((i) => i.id === full.id) ? d.inventory.map((i) => (i.id === full.id ? full : i)) : [...d.inventory, full] }),
    { action: "inventory.save", detail: `${full.name}: ${full.qty} ${full.unit} (par ${full.par})` },
  );
}

export function deleteInventory(state: AppState, ws: WorkspaceId, id: string): AppState {
  return updateWorkspace(state, ws, (d) => ({ ...d, inventory: d.inventory.filter((i) => i.id !== id) }));
}

export function belowPar(items: InventoryItem[]) {
  return items.filter((i) => i.qty < i.par).map((i) => ({ item: i, need: Math.round((i.par - i.qty) * 100) / 100 }));
}

export function addShopping(state: AppState, ws: WorkspaceId, name: string, qty = "", source: ShoppingItem["source"] = "manual"): AppState {
  if (!name.trim()) throw new Error("Item name is required");
  return updateWorkspace(state, ws, (d) => {
    if (d.shopping.some((s) => !s.done && s.name.toLowerCase() === name.trim().toLowerCase())) return d;
    return { ...d, shopping: [...d.shopping, { id: newId("shop"), name: name.trim(), qty, done: false, source }] };
  });
}

export function restockFromInventory(state: AppState, ws: WorkspaceId): AppState {
  let next = state;
  for (const { item, need } of belowPar(state.workspaces[ws].inventory)) next = addShopping(next, ws, item.name, `${need} ${item.unit}`, "inventory");
  return next;
}

export function toggleShopping(state: AppState, ws: WorkspaceId, id: string): AppState {
  return updateWorkspace(state, ws, (d) => ({ ...d, shopping: d.shopping.map((s) => (s.id === id ? { ...s, done: !s.done } : s)) }));
}

export function deleteShopping(state: AppState, ws: WorkspaceId, id: string): AppState {
  return updateWorkspace(state, ws, (d) => ({ ...d, shopping: d.shopping.filter((s) => s.id !== id) }));
}

export function clearAllShopping(state: AppState, ws: WorkspaceId): AppState {
  return updateWorkspace(state, ws, (d) => ({ ...d, shopping: [] }));
}

export function clearDoneShopping(state: AppState, ws: WorkspaceId): AppState {
  return updateWorkspace(state, ws, (d) => ({ ...d, shopping: d.shopping.filter((s) => !s.done) }));
}

// ───────────────────────── Stop N Chop ─────────────────────────

export function saveTruckMenuItem(state: AppState, item: Omit<TruckMenuItem, "id"> & { id?: string }): AppState {
  if (!item.name.trim()) throw new Error("Name is required");
  if (!Number.isFinite(item.price) || item.price < 0) throw new Error("Price must be zero or more");
  const full = { ...item, name: item.name.trim(), id: item.id ?? newId("tm") } as TruckMenuItem;
  return updateWorkspace(state, "truck", (d) => ({
    ...d,
    menu: d.menu.some((m) => m.id === full.id) ? d.menu.map((m) => (m.id === full.id ? full : m)) : [...d.menu, full],
  }), { action: "truck.menu.save", detail: `${full.name} $${full.price.toFixed(2)}` });
}

export function addTicket(state: AppState, date: ISODate, lines: Ticket["lines"], note = ""): AppState {
  const clean = lines.filter((l) => l.qty > 0);
  if (!clean.length) throw new Error("Add at least one item to the ticket");
  return updateWorkspace(state, "truck", (d) => {
    const number = d.tickets.filter((t) => t.date === date).reduce((m, t) => Math.max(m, t.number), 0) + 1;
    const ticket: Ticket = { id: newId("tk"), number, date, lines: clean, note: note.trim(), status: "open", createdAt: nowISO() };
    return { ...d, tickets: [...d.tickets, ticket] };
  }, { action: "truck.ticket.add", detail: `${date}: ${clean.reduce((n, l) => n + l.qty, 0)} item(s)` });
}

export function setTicketStatus(state: AppState, id: string, status: TicketStatus): AppState {
  return updateWorkspace(state, "truck", (d) => ({ ...d, tickets: d.tickets.map((t) => (t.id === id ? { ...t, status } : t)) }), {
    action: "truck.ticket.status",
    detail: `${id} → ${status}`,
  });
}

export function truckDaySummary(state: AppState, date: ISODate) {
  const d = state.workspaces.truck;
  const tickets = d.tickets.filter((t) => t.date === date && t.status !== "cancelled");
  const byItem = new Map<string, { name: string; qty: number; revenue: number; cost: number | null }>();
  for (const t of tickets) {
    for (const l of t.lines) {
      const m = d.menu.find((x) => x.id === l.menuItemId);
      if (!m) continue;
      const recipe = m.recipeId ? d.recipes.find((r) => r.id === m.recipeId) : undefined;
      const unitCost = recipe?.costPerBatch != null ? recipe.costPerBatch / recipe.yieldPortions : null;
      const row = byItem.get(m.id) ?? { name: m.name, qty: 0, revenue: 0, cost: unitCost === null ? null : 0 };
      row.qty += l.qty;
      row.revenue += l.qty * m.price;
      if (row.cost !== null && unitCost !== null) row.cost += l.qty * unitCost;
      byItem.set(m.id, row);
    }
  }
  const rows = [...byItem.values()].sort((a, b) => b.qty - a.qty);
  return {
    tickets: tickets.length,
    items: rows.reduce((n, r) => n + r.qty, 0),
    revenue: rows.reduce((n, r) => n + r.revenue, 0),
    rows,
    open: tickets.filter((t) => t.status === "open" || t.status === "preparing").length,
  };
}

// ───────────────────────── Home ─────────────────────────

export function setMealPlan(state: AppState, date: ISODate, meal: MealService, value: string): AppState {
  return updateWorkspace(state, "home", (d) => {
    const day = { ...(d.mealPlan[date] ?? {}) };
    if (value.trim()) day[meal] = value.trim();
    else delete day[meal];
    return { ...d, mealPlan: { ...d.mealPlan, [date]: day } };
  });
}

/** Add ingredients of planned recipes (matched by name) to the grocery list, skipping items stocked in the pantry. */
export function groceryFromPlan(state: AppState, dates: ISODate[]): AppState {
  const d = state.workspaces.home;
  let next = state;
  const stocked = new Set(d.inventory.filter((i) => i.qty > 0).map((i) => i.name.toLowerCase()));
  for (const date of dates) {
    for (const value of Object.values(d.mealPlan[date] ?? {})) {
      const recipe = d.recipes.find((r) => r.name.toLowerCase() === value?.toLowerCase());
      if (!recipe) continue;
      for (const ing of recipe.ingredients) {
        const base = ing.name.split(",")[0]!.trim();
        if (stocked.has(base.toLowerCase())) continue;
        next = addShopping(next, "home", base, "", "meal-plan");
      }
    }
  }
  return next;
}

// ───────────────────────── measurement conversions (app-wide) ─────────────────────────

/** Save "1 <volume> of <ingredient> weighs <weight>" as the cook's own conversion. */
export function saveConversion(state: AppState, name: string, volume: { qty: number; unit: string }, weight: { qty: number; unit: string }): AppState {
  const clean = name.trim();
  if (!clean) throw new Error("Name the ingredient");
  if (dimensionOf(volume.unit) !== "volume" || dimensionOf(weight.unit) !== "weight") throw new Error("Use a volume (cups, tbsp…) and a weight (oz, lb, g…)");
  if (!(volume.qty > 0) || !(weight.qty > 0)) throw new Error("Amounts must be greater than zero");
  const gramsPerCup = convert(weight.qty, weight.unit, "g") / convert(volume.qty, volume.unit, "cup");
  if (gramsPerCup > 5000) throw new Error("That doesn't look right — check the amounts");
  const others = state.conversions.filter((c) => c.name.toLowerCase() !== clean.toLowerCase());
  return { ...state, conversions: [...others, { id: newId("cv"), name: clean, gramsPerCup }] };
}

export function deleteConversion(state: AppState, id: string): AppState {
  return { ...state, conversions: state.conversions.filter((c) => c.id !== id) };
}

// ───────────────────────── profiles (any workspace) ─────────────────────────

export function activeProfile(state: AppState, ws: WorkspaceId): Profile {
  const d = state.workspaces[ws];
  return d.profiles?.find((p) => p.id === d.activeProfileId) ?? d.profiles?.[0] ?? EVERYTHING;
}

export function setActiveProfile(state: AppState, ws: WorkspaceId, id: string): AppState {
  if (!state.workspaces[ws].profiles.some((p) => p.id === id)) throw new Error("Profile not found");
  return updateWorkspace(state, ws, (d) => ({ ...d, activeProfileId: id }));
}

export function saveProfile(state: AppState, ws: WorkspaceId, profile: Profile): AppState {
  const clean = validateProfile(profile);
  return updateWorkspace(state, ws, (d) => {
    const exists = d.profiles.some((p) => p.id === clean.id);
    return { ...d, profiles: exists ? d.profiles.map((p) => (p.id === clean.id ? clean : p)) : [...d.profiles, clean] };
  });
}

export function deleteProfile(state: AppState, ws: WorkspaceId, id: string): AppState {
  const d = state.workspaces[ws];
  if (d.profiles.length <= 1) throw new Error("Keep at least one profile");
  const profiles = d.profiles.filter((p) => p.id !== id);
  return updateWorkspace(state, ws, (x) => ({ ...x, profiles, activeProfileId: x.activeProfileId === id ? profiles[0]!.id : x.activeProfileId }));
}

// ───────────────────────── storage housekeeping ─────────────────────────

/**
 * Archive completed St. Ann counts older than `keepDays` (totals, corrections and
 * reasons are kept; individual taps are dropped). Returns the same state object
 * when there's nothing to do.
 */
export function archiveOldCounts(state: AppState, today: ISODate, keepDays: number): AppState {
  if (!(keepDays > 0)) return state;
  const cutoff = addDays(today, -keepDays);
  const counts = state.workspaces.stann.counts;
  let changed = 0;
  const next: typeof counts = {};
  for (const [k, s] of Object.entries(counts)) {
    const a = s.date < cutoff ? C.archiveSession(s) : s;
    if (a !== s) changed++;
    next[k] = a;
  }
  if (!changed) return state;
  return updateWorkspace(state, "stann", (d) => ({ ...d, counts: next }), {
    action: "count.archive",
    detail: `${changed} completed count(s) older than ${keepDays} days slimmed to totals + corrections`,
  });
}

// ───────────────────────── production (St. Ann) ─────────────────────────

/** Everything the production calculator needs for one service. */
export function productionContext(state: AppState, date: ISODate, meal: MealService) {
  const d = state.workspaces.stann;
  const session = d.counts[C.sessionKey(date, meal)];
  const summary = session ? C.summarize(session) : null;
  const requests = R.groupRequests(d.requests.filter((r) => r.date === date && r.meal === meal));
  const boxes = session ? session.options.filter((o) => o.role === "main" || o.role === "alt").map((o) => ({ key: o.key, label: o.label })) : [];
  const ctx: PR.LineContext = { byChoice: summary?.byChoice ?? {}, items: summary?.items ?? {}, requests, recipes: d.recipes };
  const plan = d.production?.[C.sessionKey(date, meal)];
  return { session, summary, requests, boxes, ctx, plan };
}

/** Create or refresh the plan so every tally box and request group has a line. */
export function ensurePlan(state: AppState, date: ISODate, meal: MealService): AppState {
  const { session, requests, boxes, plan } = productionContext(state, date, meal);
  if (!session) return state;
  const key = C.sessionKey(date, meal);
  const synced = PR.syncPlan(plan ?? PR.emptyPlan(), boxes, requests, state.workspaces.stann.productionDefaults ?? {});
  if (synced === plan) return state;
  return updateWorkspace(state, "stann", (d) => ({ ...d, production: { ...(d.production ?? {}), [key]: synced } }));
}

function updatePlan(state: AppState, date: ISODate, meal: MealService, fn: (p: PR.ProductionPlan) => PR.ProductionPlan, history: string): AppState {
  const key = C.sessionKey(date, meal);
  const cur = state.workspaces.stann.production?.[key];
  if (!cur) throw new Error("Open the production plan first");
  const at = nowISO();
  const next = { ...fn(cur), updatedAt: at };
  next.history = [{ at, text: history }, ...cur.history].slice(0, 200);
  return updateWorkspace(state, "stann", (d) => ({ ...d, production: { ...d.production, [key]: next } }), { action: "production.edit", detail: `${date} ${meal}: ${history}` });
}

/** Change portion / yield / buffer / recipe on a line. Remembered for the dish next time. */
export function setLineSpec(
  state: AppState,
  date: ISODate,
  meal: MealService,
  lineId: string,
  spec: { portion: PR.PortionSpec | null; yieldPct: number | null; bufferPct: number; recipeId?: string; label?: string; subtractKeys?: string[] },
): AppState {
  if (spec.portion && !(spec.portion.qty > 0)) throw new Error("Portion must be more than zero");
  if (spec.yieldPct != null && !(spec.yieldPct > 0 && spec.yieldPct <= 100)) throw new Error("Cooked yield must be between 1 and 100%");
  if (!(spec.bufferPct >= 0 && spec.bufferPct <= 100)) throw new Error("Extra must be between 0 and 100%");
  const line = state.workspaces.stann.production?.[C.sessionKey(date, meal)]?.lines.find((l) => l.id === lineId);
  if (!line) throw new Error("Line not found");
  const label = (spec.label ?? line.label).trim();
  if (!label) throw new Error("Name the line");
  let next = updatePlan(
    state,
    date,
    meal,
    (p) => ({
      ...p,
      lines: p.lines.map((l) => {
        if (l.id !== lineId) return l;
        const { recipeId: _r, ...rest } = l;
        return {
          ...rest,
          label,
          labelEdited: l.labelEdited || label !== l.label,
          portion: spec.portion,
          yieldPct: spec.yieldPct,
          bufferPct: spec.bufferPct,
          subtractKeys: spec.subtractKeys ?? l.subtractKeys,
          ...(spec.recipeId ? { recipeId: spec.recipeId } : {}),
        };
      }),
    }),
    `${label}: portion ${spec.portion ? `${spec.portion.qty} ${spec.portion.unit}` : "—"}, yield ${spec.yieldPct ?? "—"}%, extra ${spec.bufferPct}%`,
  );
  const remember: PR.ProductionDefault = { portion: spec.portion, yieldPct: spec.yieldPct, bufferPct: spec.bufferPct, ...(spec.recipeId ? { recipeId: spec.recipeId } : {}) };
  next = updateWorkspace(next, "stann", (d) => ({ ...d, productionDefaults: { ...(d.productionDefaults ?? {}), [PR.normName(label.replace(/ \(requests\)$/, ""))]: remember } }));
  return next;
}

export function setServingsOverride(state: AppState, date: ISODate, meal: MealService, lineId: string, value: number | null, reason: string): AppState {
  if (value !== null) {
    if (!Number.isInteger(value) || value < 0) throw new Error("Servings must be a whole number");
    if (!reason.trim()) throw new Error("Say why you're changing the servings");
  }
  return updatePlan(
    state,
    date,
    meal,
    (p) => ({ ...p, lines: p.lines.map((l) => (l.id === lineId ? { ...l, servingsOverride: value === null ? null : { value, reason: reason.trim(), at: nowISO() } } : l)) }),
    value === null ? "Servings back to the count" : `Servings set to ${value}: ${reason.trim()}`,
  );
}

export function setAmountOverride(state: AppState, date: ISODate, meal: MealService, lineId: string, amount: { qty: number; unit: string } | null, reason: string): AppState {
  if (amount) {
    if (!(amount.qty > 0)) throw new Error("Amount must be more than zero");
    if (!reason.trim()) throw new Error("Say why you're changing the amount");
  }
  return updatePlan(
    state,
    date,
    meal,
    (p) => ({
      ...p,
      lines: p.lines.map((l) => (l.id === lineId ? { ...l, amountOverride: amount ? { ...amount, reason: reason.trim(), at: nowISO() } : null } : l)),
    }),
    amount ? `Amount set to ${amount.qty} ${amount.unit}: ${reason.trim()}` : "Amount back to the calculation",
  );
}

export function setManualServings(state: AppState, date: ISODate, meal: MealService, lineId: string, servings: number): AppState {
  if (!Number.isInteger(servings) || servings < 0) throw new Error("Servings must be a whole number");
  return updatePlan(state, date, meal, (p) => ({ ...p, lines: p.lines.map((l) => (l.id === lineId ? { ...l, manualServings: servings } : l)) }), `Manual servings ${servings}`);
}

export function addPlanLine(state: AppState, date: ISODate, meal: MealService, label: string, source: PR.LineSource): AppState {
  if (!label.trim()) throw new Error("Name the line");
  const defaults = state.workspaces.stann.productionDefaults ?? {};
  const line = { ...PR.newLine(label, source, defaults[PR.normName(label)]), labelEdited: true };
  return updatePlan(state, date, meal, (p) => ({ ...p, lines: [...p.lines, line] }), `Added ${label.trim()}`);
}

export function removePlanLine(state: AppState, date: ISODate, meal: MealService, lineId: string): AppState {
  return updatePlan(
    state,
    date,
    meal,
    (p) => {
      const line = p.lines.find((l) => l.id === lineId);
      const sid = line ? PR.sourceId(line.source) : "";
      return { ...p, lines: p.lines.filter((l) => l.id !== lineId), dismissed: sid && line?.source.kind !== "manual" ? [...p.dismissed, sid] : p.dismissed };
    },
    "Removed a line",
  );
}

/** Add (or refresh) one prep task per production line, with quantities. Done state is never touched. */
export function planToPrep(state: AppState, date: ISODate, meal: MealService): { state: AppState; added: number; updated: number } {
  const { plan, ctx } = productionContext(state, date, meal);
  if (!plan) throw new Error("No production plan yet");
  let next = state;
  let added = 0;
  let updated = 0;
  for (const line of plan.lines) {
    const res = PR.computeLine(line, ctx);
    if (res.servings === 0) continue;
    const key = `prod|${date}|${meal}|${line.id}`;
    const title = PR.lineSummary(line, res);
    const existing = next.workspaces.stann.prep.find((t) => t.suggestionKey === key);
    if (existing) {
      if (existing.title !== title) {
        next = updatePrepTask(next, "stann", existing.id, (t) => ({ ...t, title }));
        updated++;
      }
    } else {
      next = addPrepTask(next, "stann", {
        date,
        meal,
        title,
        source: "suggested",
        suggestionKey: key,
        holdingReminder: "Use your facility's approved hot/cold holding procedure; log temperatures on the Ready screen.",
        ...(line.recipeId ? { recipeId: line.recipeId } : {}),
      });
      added++;
    }
  }
  return { state: next, added, updated };
}

// ───────────────────────── readiness & temperatures (St. Ann) ─────────────────────────

export function toggleChecklist(state: AppState, date: ISODate, meal: MealService, itemId: string): AppState {
  const key = C.sessionKey(date, meal);
  const label = state.workspaces.stann.settings.checklist.find((i) => i.id === itemId)?.label ?? itemId;
  return updateWorkspace(
    state,
    "stann",
    (d) => {
      const rec = d.readiness?.[key] ?? { checked: {} };
      const checked = { ...rec.checked };
      if (checked[itemId]) delete checked[itemId];
      else checked[itemId] = nowISO();
      return { ...d, readiness: { ...(d.readiness ?? {}), [key]: { checked } } };
    },
    { action: "ready.check", detail: `${date} ${meal}: ${label}` },
  );
}

export function setChecklist(state: AppState, labels: string[]): AppState {
  const clean = labels.map((l) => l.trim()).filter(Boolean);
  if (!clean.length) throw new Error("Keep at least one checklist item");
  return updateWorkspace(state, "stann", (d) => {
    const existing = d.settings.checklist;
    const items = clean.map((label) => existing.find((i) => i.label === label) ?? { id: newId("ck"), label });
    return { ...d, settings: { ...d.settings, checklist: items } };
  }, { action: "ready.checklist", detail: `${clean.length} items` });
}

export function addTemp(state: AppState, input: Parameters<typeof RD.createTempEntry>[0]): AppState {
  const entry = RD.createTempEntry(input);
  const status = RD.evaluateTemp(entry.tempF, state.workspaces.stann.settings.tempRules[entry.kind]);
  return updateWorkspace(state, "stann", (d) => ({ ...d, temps: [...(d.temps ?? []), entry] }), {
    action: "temp.log",
    detail: `${entry.date} ${entry.meal}: ${entry.item} ${RD.TEMP_KIND_LABELS[entry.kind]} ${entry.tempF} °F${status.kind === "below" || status.kind === "above" ? ` — ${status.text}` : ""}`,
  });
}

export function voidTemp(state: AppState, id: string, reason: string): AppState {
  if (!reason.trim()) throw new Error("Say why this reading is being voided");
  const e = state.workspaces.stann.temps.find((t) => t.id === id);
  if (!e) throw new Error("Reading not found");
  return updateWorkspace(state, "stann", (d) => ({ ...d, temps: d.temps.map((t) => (t.id === id ? { ...t, voided: { reason: reason.trim(), at: nowISO() } } : t)) }), {
    action: "temp.void",
    detail: `${e.item} ${e.tempF} °F voided: ${reason.trim()}`,
  });
}

export function setTempRules(state: AppState, rules: RD.TempRules, confirmNote: string | null): AppState {
  for (const k of RD.TEMP_KINDS) {
    const r = rules[k];
    for (const v of [r.min, r.max]) if (v != null && !(Number.isFinite(v) && v > -40 && v < 500)) throw new Error("Limits must be temperatures in °F");
    if (r.min != null && r.max != null && r.min > r.max) throw new Error(`${RD.TEMP_KIND_LABELS[k]}: minimum is above maximum`);
  }
  const any = RD.TEMP_KINDS.some((k) => rules[k].min != null || rules[k].max != null);
  if (any && !confirmNote?.trim()) throw new Error("Confirm these limits match your facility's approved procedures");
  return updateWorkspace(
    state,
    "stann",
    (d) => ({ ...d, settings: { ...d.settings, tempRules: rules, tempRulesConfirmed: any ? { at: nowISO(), note: confirmNote!.trim() } : null } }),
    { action: "temp.rules", detail: any ? `Limits set; confirmed: ${confirmNote}` : "Limits cleared" },
  );
}

/** Where a service stands, for the Today screen and the flow bar. */
export function serviceStatus(state: AppState, date: ISODate, meal: MealService) {
  const d = state.workspaces.stann;
  const key = C.sessionKey(date, meal);
  const menu = mealFor(state, date, meal);
  const { session, summary, plan, ctx } = productionContext(state, date, meal);
  const results = plan ? plan.lines.map((l) => ({ line: l, res: PR.computeLine(l, ctx) })) : [];
  const needsPortion = results.filter((r) => r.res.servings > 0 && !r.line.portion && !r.line.recipeId && !r.line.amountOverride).length;
  const prep = d.prep.filter((t) => t.date === date && (t.meal === meal || t.meal === null));
  const prepDone = prep.filter((t) => t.done).length;
  const ready = RD.readinessProgress(d.settings.checklist, d.readiness?.[key]);
  const temps = (d.temps ?? []).filter((t) => t.date === date && t.meal === meal && !t.voided);
  const outOfRange = temps.filter((t) => {
    const s = RD.evaluateTemp(t.tempF, d.settings.tempRules[t.kind]);
    return (s.kind === "below" || s.kind === "above") && !t.action;
  });
  const requests = d.requests.filter((r) => r.date === date && r.meal === meal && r.status !== "cancelled");
  return {
    menu,
    count: session ? { status: session.status, total: summary!.totalMeals, unresolved: summary!.unresolved } : null,
    production: plan ? { lines: results.length, needsPortion, results } : null,
    prep: { done: prepDone, total: prep.length },
    ready,
    temps: { logged: temps.length, outOfRange: outOfRange.length },
    requests: {
      total: requests.length,
      unchecked: requests.filter((r) => r.verification === "unverified").length,
      flagged: requests.filter((r) => r.verification === "flagged").length,
      open: requests.filter((r) => r.status !== "served").length,
    },
  };
}
