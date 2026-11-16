/**
 * Units and scaling. Conversions only happen *within* a dimension
 * (volume↔volume, weight↔weight). Weight↔volume is never attempted because it
 * depends on the ingredient.
 */
export const VOLUME_UNITS = { tsp: 1, tbsp: 3, cup: 48, qt: 192, gal: 768 } as const;
export const WEIGHT_UNITS = { oz: 1, lb: 16 } as const;
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

export function scaleQuantity(qty: number, unit: string, factor: number, keepUnit = false) {
  const scaled = qty * factor;
  return keepUnit ? { qty: scaled, unit } : friendly(scaled, unit);
}
