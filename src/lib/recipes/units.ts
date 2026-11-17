/**
 * Units and scaling. These conversions stay *within* a dimension
 * (volume↔volume, weight↔weight). Weight↔volume needs an ingredient-specific
 * density — see `convert.ts`.
 *
 * Volume is measured in teaspoons, weight in (avoirdupois) ounces.
 * "oz" is always WEIGHT; "fl oz" is always VOLUME.
 */
const ML_PER_TSP = 4.92892159375;
const G_PER_OZ = 28.349523125;
export const VOLUME_UNITS = { tsp: 1, tbsp: 3, "fl oz": 6, cup: 48, pt: 96, qt: 192, gal: 768, ml: 1 / ML_PER_TSP, L: 1000 / ML_PER_TSP } as const;
export const WEIGHT_UNITS = { oz: 1, lb: 16, g: 1 / G_PER_OZ, kg: 1000 / G_PER_OZ } as const;
export const METRIC_UNITS = new Set(["ml", "L", "g", "kg"]);
export type VolumeUnit = keyof typeof VOLUME_UNITS;
export type WeightUnit = keyof typeof WEIGHT_UNITS;
export const COUNT_UNITS = ["each", "can", "#10 can", "clove", "bunch", "pinch", "slice", "pkg"] as const;
export const ALL_UNITS = [...Object.keys(VOLUME_UNITS), ...Object.keys(WEIGHT_UNITS), ...COUNT_UNITS] as string[];

export type Dimension = "volume" | "weight" | "count";

export function dimensionOf(unit: string): Dimension {
  if (unit in VOLUME_UNITS) return "volume";
  if (unit in WEIGHT_UNITS) return "weight";
  return "count";
}

export function convert(qty: number, from: string, to: string): number {
  const df = dimensionOf(from);
  const dt = dimensionOf(to);
  if (df !== dt || df === "count") {
    if (from === to) return qty;
    throw new Error(`Cannot convert ${from} to ${to} without an ingredient-specific conversion`);
  }
  const table = (df === "volume" ? VOLUME_UNITS : WEIGHT_UNITS) as Record<string, number>;
  return (qty * table[from]!) / table[to]!;
}

/** Pick the most readable unit for a quantity in the same dimension. */
export function friendly(qty: number, unit: string): { qty: number; unit: string } {
  const dim = dimensionOf(unit);
  if (dim === "count") return { qty, unit };
  if (dim === "weight") {
    const oz = convert(qty, unit, "oz");
    return oz >= 16 ? { qty: oz / 16, unit: "lb" } : { qty: oz, unit: "oz" };
  }
  const tsp = convert(qty, unit, "tsp");
  // Cooks read "7 1/2 qt" more easily than "1 7/8 gal", so gallons start at 2.
  if (tsp >= VOLUME_UNITS.gal * 2) return { qty: tsp / VOLUME_UNITS.gal, unit: "gal" };
  if (tsp >= VOLUME_UNITS.qt) return { qty: tsp / VOLUME_UNITS.qt, unit: "qt" };
  if (tsp >= VOLUME_UNITS.cup / 4) return { qty: tsp / VOLUME_UNITS.cup, unit: "cup" };
  if (tsp >= VOLUME_UNITS.tbsp) return { qty: tsp / VOLUME_UNITS.tbsp, unit: "tbsp" };
  return { qty: tsp, unit: "tsp" };
}

const FRACTIONS: [number, string][] = [
  [0, ""],
  [1 / 8, "1/8"],
  [1 / 4, "1/4"],
  [1 / 3, "1/3"],
  [3 / 8, "3/8"],
  [1 / 2, "1/2"],
  [5 / 8, "5/8"],
  [2 / 3, "2/3"],
  [3 / 4, "3/4"],
  [7 / 8, "7/8"],
  [1, ""],
];

/** Kitchen-friendly number: 2.5 → "2 1/2", 0.333 → "1/3", 12.3 → "12.3". */
export function formatQty(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 20) return String(Math.round(n * 10) / 10);
  let whole = Math.floor(n);
  const frac = n - whole;
  let best = FRACTIONS[0]!;
  for (const f of FRACTIONS) if (Math.abs(frac - f[0]) < Math.abs(frac - best[0])) best = f;
  if (best[0] === 1) whole += 1;
  const fracStr = best[0] === 1 ? "" : best[1];
  if (whole === 0) return fracStr || "pinch";
  return fracStr ? `${whole} ${fracStr}` : String(whole);
}

/** Metric version of a quantity: ml / L for volume, g / kg for weight. */
export function metric(qty: number, unit: string): { qty: number; unit: string } {
  const dim = dimensionOf(unit);
  if (dim === "count") return { qty, unit };
  if (dim === "weight") {
    const g = convert(qty, unit, "g");
    return g >= 1000 ? { qty: g / 1000, unit: "kg" } : { qty: g, unit: "g" };
  }
  const ml = convert(qty, unit, "ml");
  return ml >= 1000 ? { qty: ml / 1000, unit: "L" } : { qty: ml, unit: "ml" };
}

/** Metric amounts read as decimals, not fractions: 227 g, 1.4 kg, 15 ml. */
export function formatMetric(n: number): string {
  if (n >= 100) return String(Math.round(n));
  if (n >= 10) return String(Math.round(n * 10) / 10);
  return String(Math.round(n * 100) / 100);
}

/** Format a quantity the way a cook would read it for that unit. */
export function formatAmount(qty: number, unit: string): string {
  return `${METRIC_UNITS.has(unit) ? formatMetric(qty) : formatQty(qty)} ${unit}`;
}

/** "kitchen" picks readable US units, "original" keeps the recipe's unit, "metric" uses g/kg/ml/L. */
export type UnitMode = "kitchen" | "original" | "metric";

export function scaleQuantity(qty: number, unit: string, factor: number, mode: UnitMode | boolean = "kitchen") {
  const scaled = qty * factor;
  const m: UnitMode = mode === true ? "original" : mode === false ? "kitchen" : mode;
  if (m === "original") return { qty: scaled, unit };
  if (m === "metric") return metric(scaled, unit);
  return METRIC_UNITS.has(unit) ? { qty: scaled, unit } : friendly(scaled, unit);
}
