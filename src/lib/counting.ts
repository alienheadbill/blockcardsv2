/**
 * Meal counting — an append-only event log that mirrors the paper workflow:
 * one tap = one slip moved from the uncounted stack to the completed stack.
 *
 * Nothing is ever deleted. Undo appends an `undo` event; corrections append a
 * `correction` event with a reason. Totals are always derived from the log, so
 * a completed count can be audited tap by tap.
 *
 * Key invariant: only `slip` events (and slip corrections) change the number of
 * resident meals. Add-on items (fruit, dessert, soup, sides…) are tracked as
 * production quantities and never inflate the meal total.
 */
import type { ISODate } from "./dates";
import { newId, nowISO } from "./ids";
import { isEntree, type MealService, type MenuItem, type MenuItemKind } from "./menu/types";
import { DRINKS_TARGET, parseTextureKey, textureKey, textureLabel } from "./iddsi";

export const CUSTOM_CHOICE = "custom";
export const UNRESOLVED_CHOICE = "unresolved";

export type CountMode = "quick" | "detailed";

export interface CountOption {
  key: string;
  label: string;
  /** "main" | "alt" for menu entrées; "custom" / "unresolved" for the special panels. */
  role: "main" | "alt" | "custom" | "unresolved";
  /** Full printed menu line this box came from, if any (used for suggestions). */
  menuText?: string;
}

export interface ExtraItem {
  key: string;
  label: string;
  kind: MenuItemKind | "drink" | "other" | "texture";
}

interface BaseEvent {
  id: string;
  seq: number;
  at: string;
}
export type CountEvent =
  | (BaseEvent & { type: "slip"; choice: string; unit?: string; note?: string })
  | (BaseEvent & { type: "item"; itemKey: string; slipId?: string })
  | (BaseEvent & { type: "undo"; targetId: string })
  | (BaseEvent & { type: "resolve"; slipId: string; choice: string })
  | (BaseEvent & {
      type: "correction";
      target: { kind: "slip"; choice: string } | { kind: "item"; itemKey: string };
      delta: number;
      reason: string;
    })
  | (BaseEvent & { type: "complete"; acknowledgements: string[] })
  | (BaseEvent & { type: "reopen"; reason: string });

export type CountStatus = "counting" | "complete";

export interface CountSession {
  id: string;
  date: ISODate;
  meal: MealService;
  mode: CountMode;
  options: CountOption[];
  extras: ExtraItem[];
  /** Number of physical slips in the stack, if the cook knows it. */
  expectedSlips: number | null;
  /** Units whose slip stacks are counted separately (e.g. Granite, Lilac, Birch). */
  units: string[];
  /** The unit stack currently being counted; new slips are tagged with it. */
  activeUnit: string | null;
  /** Free-form notes for this meal — the cook's scratch space. */
  notes?: string;
  /**
   * Set when an old, completed count has been slimmed down to save storage:
   * the tap-by-tap events are dropped but totals, corrections and their
   * reasons, and completion are kept.
   */
  archived?: ArchivedCount;
  events: CountEvent[];
  status: CountStatus;
  createdAt: string;
}

export interface ArchivedCount {
  summary: CountSummary;
  corrections: { at: string; label: string; delta: number; reason: string }[];
  reopens: { at: string; reason: string }[];
  completedAt: string | null;
  tapCount: number;
  compactedAt: string;
}

/**
 * Slim a completed count down to its totals and correction history.
 * Returns the session unchanged if it isn't complete or is already archived.
 */
export function archiveSession(session: CountSession, now = nowISO()): CountSession {
  if (session.status !== "complete" || session.archived) return session;
  const corrections = session.events.flatMap((e) =>
    e.type === "correction" && !undoneIds(session).has(e.id)
      ? [{ at: e.at, label: labelFor(session, e.target.kind === "slip" ? e.target.choice : e.target.itemKey), delta: e.delta, reason: e.reason }]
      : [],
  );
  const reopens = session.events.flatMap((e) => (e.type === "reopen" ? [{ at: e.at, reason: e.reason }] : []));
  const completed = [...session.events].reverse().find((e) => e.type === "complete");
  return {
    ...session,
    events: [],
    archived: {
      summary: summarize(session),
      corrections,
      reopens,
      completedAt: completed?.at ?? null,
      tapCount: session.events.length,
      compactedAt: now,
    },
  };
}

/**
 * True when a tap on the same box comes so soon after the last one that it's
 * almost certainly a bounce or double tap (a cook reads one slip per tap).
 * Taps on different boxes are never blocked.
 */
export function isDuplicateTap(last: { key: string; at: number } | null, key: string, at: number, windowMs: number): boolean {
  return !!last && windowMs > 0 && last.key === key && at - last.at >= 0 && at - last.at < windowMs;
}

export const sessionKey = (date: ISODate, meal: MealService) => `${date}|${meal}`;

/** Build counting panels from the menu: every entrée gets its own panel. */
export function optionsFromMenu(items: MenuItem[]): { options: CountOption[]; extras: ExtraItem[] } {
  const options: CountOption[] = items
    .filter(isEntree)
    .map((i) => ({ key: i.id, label: i.text, role: i.kind === "main" ? "main" : "alt" }));
  options.push({ key: CUSTOM_CHOICE, label: "Custom / Other", role: "custom" });
  options.push({ key: UNRESOLVED_CHOICE, label: "Unclear slip", role: "unresolved" });
  const extras: ExtraItem[] = items.filter((i) => !isEntree(i)).map((i) => ({ key: i.id, label: i.text, kind: i.kind }));
  return { options, extras };
}

export function createSession(args: {
  date: ISODate;
  meal: MealService;
  menuItems: MenuItem[];
  mode?: CountMode;
  expectedSlips?: number | null;
  units?: string[];
  /** Tally box names the cook wrote. Defaults to the menu's entrées. */
  entrees?: string[];
}): CountSession {
  const fromMenu = optionsFromMenu(args.menuItems);
  const extras = fromMenu.extras;
  let options = fromMenu.options;
  if (args.entrees) {
    const names = args.entrees.map((n) => n.trim()).filter(Boolean);
    if (!names.length) throw new Error("Write at least one tally box name");
    const menuEntrees = fromMenu.options.filter((o) => o.role === "main" || o.role === "alt");
    options = [
      ...names.map((label, i): CountOption => {
        const m = menuEntrees[i];
        return m ? { key: m.key, label, role: i === 0 ? "main" : "alt", menuText: m.label } : { key: newId("w"), label, role: i === 0 ? "main" : "alt" };
      }),
      ...fromMenu.options.filter((o) => o.role === "custom" || o.role === "unresolved"),
    ];
  }
  return {
    id: newId("cnt"),
    date: args.date,
    meal: args.meal,
    mode: args.mode ?? "quick",
    options,
    extras,
    expectedSlips: args.expectedSlips ?? null,
    units: args.units ?? [],
    activeUnit: args.units?.[0] ?? null,
    events: [],
    status: "counting",
    createdAt: nowISO(),
  };
}

type NewEvent = CountEvent extends infer E ? (E extends CountEvent ? Omit<E, "id" | "seq" | "at"> : never) : never;

function append(session: CountSession, event: NewEvent): CountSession {
  const seq = session.events.length ? session.events[session.events.length - 1]!.seq + 1 : 1;
  const full = { ...event, id: newId("ev"), seq, at: nowISO() } as CountEvent;
  return { ...session, events: [...session.events, full] };
}

function assertOpen(session: CountSession) {
  if (session.archived) throw new Error("This count was archived to save space — totals are kept but it can't be changed.");
  if (session.status === "complete") throw new Error("This count is marked complete. Reopen it to make changes.");
}

function assertChoice(session: CountSession, choice: string) {
  if (!session.options.some((o) => o.key === choice)) throw new Error(`Unknown meal choice: ${choice}`);
}

/** One tap on a meal panel = exactly one slip counted. */
export function tapSlip(session: CountSession, choice: string, note?: string): CountSession {
  assertOpen(session);
  assertChoice(session, choice);
  const unit = session.activeUnit ?? undefined;
  return append(session, { type: "slip", choice, ...(unit ? { unit } : {}), ...(note ? { note } : {}) });
}

/** Count an add-on item. Never changes the resident meal total. */
export function tapItem(session: CountSession, itemKey: string, slipId?: string): CountSession {
  assertOpen(session);
  if (!session.extras.some((e) => e.key === itemKey)) throw new Error(`Unknown item: ${itemKey}`);
  return append(session, slipId ? { type: "item", itemKey, slipId } : { type: "item", itemKey });
}

/**
 * Count one IDDSI texture-modified plate (or thickened drink) as printed on the slip.
 * Like other add-ons, it never changes the meal total — it says how many of an
 * entrée's servings need that texture.
 */
export function tapTexture(session: CountSession, levelId: string, target: string, slipId?: string): CountSession {
  assertOpen(session);
  const key = textureKey(levelId, target);
  let s = session;
  if (!s.extras.some((e) => e.key === key)) {
    let label: string;
    if (target === DRINKS_TARGET) label = textureLabel(levelId);
    else {
      const box = s.options.find((o) => o.key === target);
      if (!box) throw new Error("Unknown tally box");
      label = textureLabel(levelId, box.label);
    }
    s = { ...s, extras: [...s.extras, { key, label, kind: "texture" }] };
  }
  return tapItem(s, key, slipId);
}

/** Texture counts per tally box (and for drinks), for the count screen and production. */
export function textureCounts(session: CountSession, items: Record<string, number>): Record<string, { levelId: string; count: number }[]> {
  const out: Record<string, { levelId: string; count: number }[]> = {};
  for (const x of session.extras) {
    const p = parseTextureKey(x.key);
    if (!p) continue;
    const count = items[x.key] ?? 0;
    if (count <= 0) continue;
    (out[p.target] ??= []).push({ levelId: p.levelId, count });
  }
  return out;
}

/** Short, notebook-style name for an entrée: "Chicken Pot Pie with Biscuit" → "Chicken Pot Pie". */
export function shortEntreeName(text: string): string {
  return text.split(/,|\/| w\/ | with /i)[0]!.trim() || text.trim();
}

/** Write a new name on a tally box. Counts stay with the box. */
export function renameOption(session: CountSession, key: string, label: string): CountSession {
  const clean = label.trim();
  if (!clean) throw new Error("Name can't be empty");
  if (!session.options.some((o) => o.key === key)) throw new Error("Box not found");
  return {
    ...session,
    options: session.options.map((o) => {
      if (o.key !== key) return o;
      const { menuText: _old, ...rest } = o; // a rewritten box is no longer the printed menu item
      return { ...rest, label: clean };
    }),
    // texture counters for this box follow the new name
    extras: session.extras.map((x) => {
      const p = parseTextureKey(x.key);
      return p && p.target === key ? { ...x, label: textureLabel(p.levelId, clean) } : x;
    }),
  };
}

/** Add another tally box (e.g. a third entrée you wrote in). */
export function addOption(session: CountSession, label: string): CountSession {
  assertOpen(session);
  const clean = label.trim();
  if (!clean) throw new Error("Write a name for the box");
  const entrees = session.options.filter((o) => o.role === "main" || o.role === "alt");
  const rest = session.options.filter((o) => o.role !== "main" && o.role !== "alt");
  const opt: CountOption = { key: newId("w"), label: clean, role: entrees.length ? "alt" : "main" };
  return { ...session, options: [...entrees, opt, ...rest] };
}

/** Remove a tally box that has never been used. */
export function removeOption(session: CountSession, key: string): CountSession {
  assertOpen(session);
  const opt = session.options.find((o) => o.key === key);
  if (!opt || (opt.role !== "main" && opt.role !== "alt")) throw new Error("Only tally boxes you wrote can be removed");
  const used = session.events.some((e) => (e.type === "slip" || e.type === "resolve" ? e.choice === key : e.type === "correction" && e.target.kind === "slip" && e.target.choice === key));
  if (used) throw new Error("This box has counts on it — undo or correct them first, or just rename it");
  const remaining = session.options.filter((o) => o.key !== key);
  if (!remaining.some((o) => o.role === "main" || o.role === "alt")) throw new Error("Keep at least one tally box");
  return { ...session, options: remaining };
}

export function setNotes(session: CountSession, notes: string): CountSession {
  if (notes.length > 5000) throw new Error("Notes are too long");
  return { ...session, notes };
}

/** Switch to another unit's slip stack. */
export function setActiveUnit(session: CountSession, unit: string | null): CountSession {
  if (unit !== null && !(session.units ?? []).includes(unit)) throw new Error(`Unknown unit: ${unit}`);
  return { ...session, activeUnit: unit };
}

/**
 * One-tap modification counters suggested from the entrées, e.g. "No bun" for a
 * sandwich or "No biscuit" for pot pie. These are tracked like add-on items, so
 * they never change the meal total.
 */
export function modificationSuggestions(session: CountSession): string[] {
  const out: string[] = [];
  const rules: [RegExp, string][] = [
    [/\b(bun|sandwich|burger|sub|roll|wrap|hot dog|sloppy joe)\b/i, "No bun"],
    [/\bbiscuit\b/i, "No biscuit"],
    [/\b(garlic bread|toast|brown bread)\b/i, "No bread"],
    [/\b(gravy)\b/i, "No gravy"],
    [/\b(cheese)\b/i, "No cheese"],
  ];
  for (const o of session.options) {
    if (o.role !== "main" && o.role !== "alt") continue;
    const short = o.label.split(/[,/]| w\/ | with /i)[0]!.trim();
    const text = `${o.label} ${o.menuText ?? ""}`;
    for (const [re, mod] of rules) if (re.test(text)) out.push(`${mod} – ${short}`);
  }
  const existing = new Set(session.extras.map((e) => e.label.toLowerCase()));
  return [...new Set(out)].filter((l) => !existing.has(l.toLowerCase()));
}

export function addExtra(session: CountSession, label: string, kind: ExtraItem["kind"] = "other"): CountSession {
  const clean = label.trim();
  if (!clean) throw new Error("Item name is required");
  return { ...session, extras: [...session.extras, { key: newId("x"), label: clean, kind }] };
}

const UNDOABLE = new Set<CountEvent["type"]>(["slip", "item", "correction", "resolve"]);

export function undoneIds(session: CountSession): Set<string> {
  return new Set(session.events.filter((e) => e.type === "undo").map((e) => (e as { targetId: string }).targetId));
}

/** The most recent tap/correction that has not already been undone. */
export function lastUndoable(session: CountSession): CountEvent | undefined {
  const undone = undoneIds(session);
  for (let i = session.events.length - 1; i >= 0; i--) {
    const e = session.events[i]!;
    if (e.type === "complete" || e.type === "reopen") return undefined; // never undo across a review boundary
    if (UNDOABLE.has(e.type) && !undone.has(e.id)) return e;
  }
  return undefined;
}

export function undo(session: CountSession): CountSession {
  assertOpen(session);
  const target = lastUndoable(session);
  if (!target) return session;
  return append(session, { type: "undo", targetId: target.id });
}

/** Assign a choice to a slip that was first counted as "unclear". */
export function resolveSlip(session: CountSession, slipId: string, choice: string): CountSession {
  assertOpen(session);
  assertChoice(session, choice);
  if (choice === UNRESOLVED_CHOICE) throw new Error("Pick a meal to resolve the slip");
  const slip = session.events.find((e) => e.id === slipId);
  if (!slip || slip.type !== "slip") throw new Error("Slip not found");
  return append(session, { type: "resolve", slipId, choice });
}

export function correct(
  session: CountSession,
  target: { kind: "slip"; choice: string } | { kind: "item"; itemKey: string },
  delta: number,
  reason: string,
): CountSession {
  assertOpen(session);
  if (!Number.isInteger(delta) || delta === 0) throw new Error("Correction must be a whole, non-zero number");
  if (!reason.trim()) throw new Error("A reason is required for manual corrections");
  const summary = summarize(session);
  if (target.kind === "slip") {
    assertChoice(session, target.choice);
    if ((summary.byChoice[target.choice] ?? 0) + delta < 0) throw new Error("Correction would make the count negative");
  } else {
    if (!session.extras.some((e) => e.key === target.itemKey)) throw new Error("Unknown item");
    if ((summary.items[target.itemKey] ?? 0) + delta < 0) throw new Error("Correction would make the count negative");
  }
  return append(session, { type: "correction", target, delta, reason: reason.trim() });
}

export interface CountSummary {
  /** Physical slips tapped (net of undo). */
  slipsProcessed: number;
  /** Resident meals = slips + slip corrections. Add-on items never change this. */
  totalMeals: number;
  byChoice: Record<string, number>;
  items: Record<string, number>;
  unresolved: number;
  unresolvedSlipIds: string[];
  corrections: number;
  /** Slips per unit stack ("" = no unit chosen). Corrections are not attributed to a unit. */
  byUnit: Record<string, { total: number; byChoice: Record<string, number> }>;
  /** expected − counted (null when no expected number was entered). */
  discrepancy: number | null;
  lastSlipId: string | null;
}

export function summarize(session: CountSession): CountSummary {
  if (session.archived) return session.archived.summary;
  const undone = undoneIds(session);
  const slipChoice = new Map<string, string>();
  const byChoice: Record<string, number> = Object.fromEntries(session.options.map((o) => [o.key, 0]));
  const items: Record<string, number> = Object.fromEntries(session.extras.map((e) => [e.key, 0]));
  let slipsProcessed = 0;
  let correctionMeals = 0;
  let corrections = 0;
  let lastSlipId: string | null = null;

  for (const e of session.events) {
    if (undone.has(e.id)) continue;
    switch (e.type) {
      case "slip":
        slipChoice.set(e.id, e.choice);
        slipsProcessed++;
        lastSlipId = e.id;
        break;
      case "resolve":
        if (slipChoice.has(e.slipId) && !undone.has(e.slipId)) slipChoice.set(e.slipId, e.choice);
        break;
      case "item":
        items[e.itemKey] = (items[e.itemKey] ?? 0) + 1;
        break;
      case "correction":
        corrections++;
        if (e.target.kind === "slip") {
          byChoice[e.target.choice] = (byChoice[e.target.choice] ?? 0) + e.delta;
          correctionMeals += e.delta;
        } else {
          items[e.target.itemKey] = (items[e.target.itemKey] ?? 0) + e.delta;
        }
        break;
      default:
        break;
    }
  }
  const unresolvedSlipIds: string[] = [];
  const slipUnit = new Map(session.events.flatMap((e) => (e.type === "slip" ? [[e.id, e.unit ?? ""] as const] : [])));
  const byUnit: CountSummary["byUnit"] = Object.fromEntries((session.units ?? []).map((u) => [u, { total: 0, byChoice: {} }]));
  for (const [id, choice] of slipChoice) {
    byChoice[choice] = (byChoice[choice] ?? 0) + 1;
    if (choice === UNRESOLVED_CHOICE) unresolvedSlipIds.push(id);
    const u = slipUnit.get(id) ?? "";
    const bucket = (byUnit[u] ??= { total: 0, byChoice: {} });
    bucket.total++;
    bucket.byChoice[choice] = (bucket.byChoice[choice] ?? 0) + 1;
  }
  const totalMeals = slipsProcessed + correctionMeals;
  return {
    slipsProcessed,
    totalMeals,
    byChoice,
    items,
    unresolved: byChoice[UNRESOLVED_CHOICE] ?? 0,
    unresolvedSlipIds,
    corrections,
    byUnit,
    discrepancy: session.expectedSlips == null ? null : session.expectedSlips - totalMeals,
    lastSlipId,
  };
}

export interface ReviewIssue {
  id: "unresolved" | "discrepancy" | "empty" | "corrections" | "units";
  message: string;
  /** Blocking issues cannot be acknowledged away. */
  blocking: boolean;
}

export function reviewIssues(session: CountSession): ReviewIssue[] {
  const s = summarize(session);
  const issues: ReviewIssue[] = [];
  if (s.totalMeals === 0) issues.push({ id: "empty", message: "No slips have been counted.", blocking: true });
  if (s.unresolved > 0)
    issues.push({
      id: "unresolved",
      message: `${s.unresolved} unclear slip${s.unresolved === 1 ? "" : "s"} still need a meal choice.`,
      blocking: true,
    });
  if (s.discrepancy !== null && s.discrepancy !== 0)
    issues.push({
      id: "discrepancy",
      message:
        s.discrepancy > 0
          ? `Counted ${s.totalMeals} but the stack had ${session.expectedSlips} — ${s.discrepancy} slip${s.discrepancy === 1 ? "" : "s"} missing.`
          : `Counted ${s.totalMeals} but the stack had ${session.expectedSlips} — ${-s.discrepancy} too many.`,
      blocking: false,
    });
  const emptyUnits = (session.units ?? []).filter((u) => (s.byUnit[u]?.total ?? 0) === 0);
  if (s.totalMeals > 0 && emptyUnits.length)
    issues.push({ id: "units", message: `No slips counted for ${emptyUnits.join(", ")}.`, blocking: false });
  if (s.corrections > 0)
    issues.push({ id: "corrections", message: `${s.corrections} manual correction(s) were made — check the audit log.`, blocking: false });
  return issues;
}

/**
 * Mark the count complete. Every non-blocking issue must be explicitly acknowledged;
 * blocking issues must be fixed first.
 */
export function complete(session: CountSession, acknowledged: string[]): CountSession {
  assertOpen(session);
  const issues = reviewIssues(session);
  const blocking = issues.filter((i) => i.blocking);
  if (blocking.length) throw new Error(blocking.map((b) => b.message).join(" "));
  const missing = issues.filter((i) => !acknowledged.includes(i.id));
  if (missing.length) throw new Error(`Please acknowledge: ${missing.map((m) => m.message).join(" ")}`);
  return { ...append(session, { type: "complete", acknowledgements: issues.map((i) => i.id) }), status: "complete" };
}

export function reopen(session: CountSession, reason: string): CountSession {
  if (session.status !== "complete") return session;
  if (session.archived) throw new Error("This count was archived to save space and can't be reopened.");
  if (!reason.trim()) throw new Error("A reason is required to reopen a completed count");
  return { ...append(session, { type: "reopen", reason: reason.trim() }), status: "counting" };
}

export function setMode(session: CountSession, mode: CountMode): CountSession {
  return { ...session, mode };
}

export function setExpected(session: CountSession, expected: number | null): CountSession {
  if (expected !== null && (!Number.isInteger(expected) || expected < 0)) throw new Error("Expected slips must be a whole number");
  return { ...session, expectedSlips: expected };
}

/** Human-readable label for any choice/item key in this session. */
export function labelFor(session: CountSession, key: string): string {
  return session.options.find((o) => o.key === key)?.label ?? session.extras.find((e) => e.key === key)?.label ?? key;
}

/** Group a count into tally marks of five, like the notebook. */
export function tallyGroups(n: number): number[] {
  const groups: number[] = [];
  let left = Math.max(0, n);
  while (left > 0) {
    groups.push(Math.min(5, left));
    left -= 5;
  }
  return groups;
}
