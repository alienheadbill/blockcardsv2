/**
 * Production calculator: turns finished meal counts into how much food to make.
 *
 *   servings × portion × (1 + buffer)  = finished amount to have ready
 *   finished ÷ cooked yield            = raw amount to start with
 *   servings × (1 + buffer) ÷ recipe   = recipe portions / full batches
 *
 * Rules:
 *  - Nothing is assumed. A line without a portion size says so instead of guessing.
 *  - Exact values are always shown. "Kitchen" values are rounded UP (never down)
 *    to the nearest 1/8 of a readable unit, and the rounding is shown.
 *  - Overrides (servings or final amount) need a reason and are kept in the plan history.
 */
import { newId, nowISO } from "./ids";
import { scaleRecipe, type Recipe } from "./recipes/recipes";
import { convert, dimensionOf, formatQty, friendly, METRIC_UNITS } from "./recipes/units";
import type { RequestGroup } from "./requests";
import { iddsi } from "./iddsi";

export interface PortionSpec {
  qty: number;
  unit: string;
}

export type LineSource = { kind: "box"; key: string } | { kind: "request"; item: string } | { kind: "manual" };

export interface ProductionLine {
  id: string;
  label: string;
  /** True once the cook renamed the line; then it no longer follows the tally box name. */
  labelEdited?: boolean;
  source: LineSource;
  /** Modification counters to subtract, e.g. "No biscuit – Chicken Pot Pie" from a Biscuits line. */
  subtractKeys: string[];
  /** Servings for a manual line. */
  manualServings: number | null;
  servingsOverride: { value: number; reason: string; at: string } | null;
  /** Finished (as served) amount per serving. null = not set yet. */
  portion: PortionSpec | null;
  /** Cooked yield as % of raw weight (finished ÷ raw × 100). null = not used. */
  yieldPct: number | null;
  /** Extra to make on top of the count, in %. */
  bufferPct: number;
  recipeId?: string;
  amountOverride: { qty: number; unit: string; reason: string; at: string } | null;
}

export interface ProductionPlan {
  lines: ProductionLine[];
  /** Sources the cook removed, so they aren't re-added automatically. */
  dismissed: string[];
  history: { at: string; text: string }[];
  createdAt: string;
  updatedAt: string;
}

/** What the kitchen last used for a dish, keyed by normalized name. */
export interface ProductionDefault {
  portion: PortionSpec | null;
  yieldPct: number | null;
  bufferPct: number;
  recipeId?: string;
}

export const normName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
export const sourceId = (s: LineSource) => (s.kind === "box" ? `box:${s.key}` : s.kind === "request" ? `req:${normName(s.item)}` : "");

export interface Qty {
  /** Exact amount in `unit`. */
  qty: number;
  unit: string;
  /** Exact, e.g. "6.25 lb". */
  exact: string;
  /** Rounded UP to a measurable amount, e.g. "6 1/4 lb". */
  kitchen: string;
  /** True when `kitchen` is more than `exact`. */
  roundedUp: boolean;
}

function decimals(n: number) {
  return String(Math.round(n * 100) / 100);
}

/** Express an amount readably, with the exact value and a never-rounded-down kitchen value. */
export function toQty(qty: number, unit: string): Qty {
  const f = METRIC_UNITS.has(unit) || dimensionOf(unit) === "count" ? { qty, unit } : friendly(qty, unit);
  const isCount = dimensionOf(unit) === "count";
  const metric = METRIC_UNITS.has(f.unit);
  // round up: whole items for counts, 1 unit for metric, 1/8 otherwise
  const step = isCount ? 1 : metric ? 1 : 1 / 8;
  const up = Math.ceil(f.qty / step - 1e-9) * step;
  return {
    qty: f.qty,
    unit: f.unit,
    exact: `${decimals(f.qty)} ${f.unit}`,
    kitchen: isCount || metric ? `${up} ${f.unit}` : `${formatQty(up)} ${f.unit}`,
    roundedUp: up - f.qty > 1e-9,
  };
}

export interface LineContext {
  byChoice: Record<string, number>;
  items: Record<string, number>;
  requests: RequestGroup[];
  recipes: Recipe[];
  /** IDDSI texture counts per tally box key (from the count). */
  textures?: Record<string, { levelId: string; count: number }[]>;
}

export interface LineResult {
  /** Servings straight from the count / requests. */
  counted: number;
  /** Subtracted for modifications. */
  subtracted: number;
  servings: number;
  overridden: boolean;
  finished: Qty | null;
  raw: Qty | null;
  recipe: {
    recipe: Recipe;
    portionsExact: number;
    portions: number;
    batches: number;
    batchPortions: number;
    ingredients: ReturnType<typeof scaleRecipe>["ingredients"];
  } | null;
  /** The amount to actually make (override wins over the calculation). */
  makeAmount: Qty | null;
  /** How many of the servings need an IDDSI texture modification, from the slips. */
  textures: { levelId: string; label: string; count: number }[];
  warnings: string[];
}

export function countedServings(line: ProductionLine, ctx: LineContext): number {
  switch (line.source.kind) {
    case "box":
      return ctx.byChoice[line.source.key] ?? 0;
    case "request": {
      const item = normName(line.source.item);
      return ctx.requests.find((g) => normName(g.item) === item)?.totalQuantity ?? 0;
    }
    case "manual":
      return line.manualServings ?? 0;
  }
}

export function computeLine(line: ProductionLine, ctx: LineContext): LineResult {
  const warnings: string[] = [];
  const counted = countedServings(line, ctx);
  const subtracted = line.subtractKeys.reduce((n, k) => n + (ctx.items[k] ?? 0), 0);
  const calcServings = Math.max(0, counted - subtracted);
  if (subtracted > counted) warnings.push(`Modifications (${subtracted}) are more than the count (${counted}) — check them.`);
  const servings = line.servingsOverride ? line.servingsOverride.value : calcServings;
  const factor = 1 + (line.bufferPct || 0) / 100;

  let finished: Qty | null = null;
  let raw: Qty | null = null;
  if (line.portion && line.portion.qty > 0) {
    const total = servings * line.portion.qty * factor;
    finished = toQty(total, line.portion.unit);
    if (line.yieldPct != null) {
      if (line.yieldPct <= 0 || line.yieldPct > 100) warnings.push("Cooked yield must be between 1 and 100%.");
      else if (dimensionOf(line.portion.unit) === "count") warnings.push("Cooked yield applies to weights or volumes, not counted items.");
      else raw = toQty(total / (line.yieldPct / 100), line.portion.unit);
    }
  }
  // No portion size is fine: many items are eyeballed, so the line just shows servings.

  let recipe: LineResult["recipe"] = null;
  const r = line.recipeId ? ctx.recipes.find((x) => x.id === line.recipeId) : undefined;
  if (line.recipeId && !r) warnings.push("The linked recipe was deleted.");
  if (r && servings > 0) {
    const portionsExact = servings * factor;
    const portions = Math.ceil(portionsExact - 1e-9);
    const batches = Math.ceil(portions / r.yieldPortions - 1e-9);
    recipe = { recipe: r, portionsExact, portions, batches, batchPortions: batches * r.yieldPortions, ingredients: scaleRecipe(r, portions).ingredients };
  }

  let makeAmount = finished;
  if (line.amountOverride) makeAmount = toQty(line.amountOverride.qty, line.amountOverride.unit);
  const textures =
    line.source.kind === "box"
      ? (ctx.textures?.[line.source.key] ?? []).map((t) => ({ ...t, label: `${iddsi(t.levelId).name} (L${iddsi(t.levelId).level})` }))
      : [];
  const textured = textures.reduce((n, t) => n + t.count, 0);
  if (textured > counted) warnings.push(`Texture counts (${textured}) are more than the count (${counted}) — check them.`);
  return { counted, subtracted, servings, overridden: !!line.servingsOverride, finished, raw, recipe, makeAmount, textures, warnings };
}

/** Cooked yield % from a test batch: cooked weight ÷ raw weight. */
export function yieldFromTest(raw: { qty: number; unit: string }, cooked: { qty: number; unit: string }): number {
  if (dimensionOf(raw.unit) !== "weight" || dimensionOf(cooked.unit) !== "weight") throw new Error("Weigh both raw and cooked (oz, lb, g or kg)");
  const r = convert(raw.qty, raw.unit, "g");
  const c = convert(cooked.qty, cooked.unit, "g");
  if (!(r > 0) || !(c > 0)) throw new Error("Both weights must be more than zero");
  if (c > r * 1.5) throw new Error("Cooked weight is much more than raw — check the numbers");
  return Math.round((c / r) * 1000) / 10;
}

export function newLine(label: string, source: LineSource, defaults?: ProductionDefault): ProductionLine {
  return {
    id: newId("pl"),
    label: label.trim(),
    source,
    subtractKeys: [],
    manualServings: source.kind === "manual" ? 0 : null,
    servingsOverride: null,
    portion: defaults?.portion ?? null,
    yieldPct: defaults?.yieldPct ?? null,
    bufferPct: defaults?.bufferPct ?? 0,
    ...(defaults?.recipeId ? { recipeId: defaults.recipeId } : {}),
    amountOverride: null,
  };
}

export function emptyPlan(): ProductionPlan {
  const at = nowISO();
  return { lines: [], dismissed: [], history: [], createdAt: at, updatedAt: at };
}

/** Add lines for any entrée boxes / requests that don't have one yet (and weren't removed). */
export function syncPlan(
  plan: ProductionPlan,
  boxes: { key: string; label: string }[],
  requests: RequestGroup[],
  defaults: Record<string, ProductionDefault>,
): ProductionPlan {
  const have = new Set(plan.lines.map((l) => sourceId(l.source)).filter(Boolean));
  const add: ProductionLine[] = [];
  for (const b of boxes) {
    const src: LineSource = { kind: "box", key: b.key };
    if (!have.has(sourceId(src)) && !plan.dismissed.includes(sourceId(src))) add.push(newLine(b.label, src, defaults[normName(b.label)]));
  }
  for (const g of requests) {
    const src: LineSource = { kind: "request", item: g.item };
    if (!have.has(sourceId(src)) && !plan.dismissed.includes(sourceId(src))) add.push(newLine(`${g.item} (requests)`, src, defaults[normName(g.item)]));
  }
  // keep box labels in step with renamed tally boxes
  const lines = plan.lines.map((l) => {
    if (l.source.kind !== "box") return l;
    const key = l.source.key;
    const box = boxes.find((b) => b.key === key);
    return box && !l.labelEdited && l.label !== box.label ? { ...l, label: box.label } : l;
  });
  if (!add.length && lines.every((l, i) => l === plan.lines[i])) return plan;
  return { ...plan, lines: [...lines, ...add], updatedAt: nowISO() };
}

/** One-line summary for prep tasks and the dashboard. */
export function lineSummary(line: ProductionLine, res: LineResult): string {
  const parts = [`${res.servings} × ${line.label}`];
  if (res.makeAmount) parts.push(`make ${res.makeAmount.kitchen}${line.amountOverride ? " (adjusted)" : ""}`);
  if (res.raw && !line.amountOverride) parts.push(`start with ${res.raw.kitchen} raw`);
  if (res.recipe) parts.push(`${res.recipe.batches} batch${res.recipe.batches === 1 ? "" : "es"} of ${res.recipe.recipe.name}`);
  if (res.textures.length) parts.push(res.textures.map((t) => `${t.count} ${t.label}`).join(", "));
  return parts.join(" · ");
}
