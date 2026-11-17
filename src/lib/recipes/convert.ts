/**
 * Universal measurement converter.
 *
 *  - Volume ↔ volume and weight ↔ weight are exact.
 *  - Weight ↔ volume needs to know the ingredient (8 oz of macaroni is about
 *    2 cups, 8 oz of honey is about 2/3 cup). We only do it when the ingredient
 *    is in the table below or the cook saved their own conversion, and the
 *    result is always marked as approximate.
 *
 * Built-in values are typical grams per level US cup from common US references
 * (USDA FoodData Central household measures and standard baking weight charts).
 * How you scoop, pack, chop or shred changes the real number — weigh when it matters.
 */
import { convert, dimensionOf, formatAmount, METRIC_UNITS } from "./units";

export interface Density {
  /** Display name, e.g. "Elbow macaroni (dry)". */
  name: string;
  /** Words that identify the ingredient in a recipe line. */
  aliases: string[];
  gramsPerCup: number;
}

export interface CustomConversion {
  id: string;
  name: string;
  gramsPerCup: number;
}

const D = (name: string, gramsPerCup: number, ...aliases: string[]): Density => ({ name, gramsPerCup, aliases: [name.toLowerCase(), ...aliases] });

export const DENSITIES: Density[] = [
  // liquids
  D("Water", 237, "ice water"),
  D("Milk", 244, "whole milk", "2% milk", "skim milk"),
  D("Buttermilk", 245),
  D("Heavy cream", 238, "heavy whipping cream", "whipping cream"),
  D("Chicken / beef stock", 240, "stock", "broth", "chicken stock", "beef stock", "ham stock", "chicken broth", "beef broth", "vegetable broth"),
  D("Vegetable oil", 218, "oil", "canola oil", "olive oil"),
  D("Honey", 340, "maple syrup", "corn syrup", "molasses"),
  D("Worcestershire sauce", 275, "worcestershire", "soy sauce"),
  D("Ketchup", 272, "barbecue sauce", "bbq sauce"),
  D("Mayonnaise", 220, "mayo"),
  D("Sour cream", 230),
  D("Yogurt", 245, "greek yogurt"),
  D("Crushed tomatoes (canned)", 242, "crushed tomatoes", "diced tomatoes", "tomato sauce", "marinara", "marinara sauce", "spaghetti sauce"),
  // fats & dairy
  D("Butter", 227, "margarine"),
  D("Peanut butter", 258),
  D("Cheddar, shredded", 113, "cheddar", "shredded cheese", "american cheese, shredded", "mozzarella", "mozzarella, shredded", "swiss, shredded", "colby jack"),
  D("Parmesan, grated", 100, "parmesan", "parmesan, grated"),
  D("Ricotta", 246, "ricotta cheese"),
  D("Cottage cheese", 226),
  D("Cream cheese", 232),
  // baking & dry goods
  D("All-purpose flour", 120, "flour", "all-purpose flour", "ap flour", "bread flour"),
  D("Granulated sugar", 198, "sugar", "white sugar"),
  D("Brown sugar (packed)", 213, "brown sugar"),
  D("Powdered sugar", 113, "confectioners sugar", "icing sugar"),
  D("Cornstarch", 128, "corn starch"),
  D("Cocoa powder", 85, "cocoa", "unsweetened cocoa"),
  D("Rolled oats", 90, "oats", "old-fashioned oats", "oatmeal"),
  D("Breadcrumbs (dry)", 108, "breadcrumbs", "bread crumbs", "dry breadcrumbs"),
  D("Panko", 50, "panko breadcrumbs"),
  D("Table salt", 292, "salt"),
  D("Ground black pepper", 110, "black pepper", "pepper, ground", "ground pepper"),
  // pasta, rice, legumes (dry)
  D("Elbow macaroni (dry)", 112, "elbow macaroni", "macaroni", "elbows", "macaroni elbows", "elbow pasta", "ziti", "penne", "rotini"),
  D("Egg noodles (dry)", 38, "egg noodles", "egg noodle", "wide egg noodles"),
  D("Orzo (dry)", 180, "orzo"),
  D("Long-grain rice (uncooked)", 185, "rice", "white rice", "long grain rice", "long-grain rice"),
  D("Cooked rice", 158),
  D("Dried split peas", 196, "split peas", "dried split peas", "dry split peas"),
  D("Dried beans", 190, "dried beans", "dry beans", "navy beans", "kidney beans, dry"),
  // produce & proteins (chopped / diced)
  D("Onion, diced", 160, "onion", "onions", "diced onion", "chopped onion"),
  D("Carrot, diced", 128, "carrot", "carrots", "diced carrot"),
  D("Celery, diced", 101, "celery"),
  D("Bell pepper, diced", 149, "green pepper", "red pepper", "bell pepper", "peppers"),
  D("Frozen peas", 134, "peas", "green peas"),
  D("Frozen corn", 165, "corn", "corn kernels"),
  D("Potatoes, diced", 150, "potato", "potatoes", "diced potatoes"),
  D("Cooked chicken, diced", 140, "cooked chicken", "chicken, diced", "diced chicken", "chicken, cooked"),
  D("Ham, diced", 140, "ham", "diced ham"),
  D("Ground beef (raw)", 226, "ground beef", "hamburger", "ground turkey"),
  D("Pickles, sliced", 155, "pickles", "pickle slices"),
  D("Blueberries", 148, "blueberries"),
  D("Strawberries, sliced", 166, "strawberries"),
  D("Raisins", 145, "raisins"),
];

function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9%,\- ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Find the density for an ingredient name. The cook's own conversions win;
 * otherwise the longest matching alias wins ("buttermilk" beats "milk").
 */
export function findDensity(ingredient: string, custom: CustomConversion[] = []): (Density & { source: "custom" | "table" }) | null {
  const n = norm(ingredient);
  if (!n) return null;
  const mine = custom.find((c) => norm(c.name) === n) ?? custom.filter((c) => n.includes(norm(c.name))).sort((a, b) => b.name.length - a.name.length)[0];
  if (mine) return { name: mine.name, aliases: [norm(mine.name)], gramsPerCup: mine.gramsPerCup, source: "custom" };
  let best: { d: Density; len: number } | null = null;
  for (const d of DENSITIES) {
    for (const a of d.aliases) {
      const alias = norm(a);
      const hit = n === alias || new RegExp(`(^|[ ,])${alias.replace(/[-]/g, "\\-")}($|[ ,])`).test(n);
      if (hit && (!best || alias.length > best.len)) best = { d, len: alias.length };
    }
  }
  return best ? { ...best.d, source: "table" } : null;
}

export interface Equivalent {
  qty: number;
  unit: string;
  text: string;
}

const US_VOLUME = ["tsp", "tbsp", "fl oz", "cup", "pt", "qt", "gal"];
const US_WEIGHT = ["oz", "lb"];

/** Amounts a cook would actually measure in each unit (no "97 tsp" or "1/16 gal"). */
const SENSIBLE: Record<string, [number, number]> = {
  tsp: [0.125, 12],
  tbsp: [0.5, 32],
  "fl oz": [1, 128],
  cup: [0.125, 40],
  pt: [0.5, 16],
  qt: [0.25, 40],
  gal: [0.25, Infinity],
  oz: [0.25, 160],
  lb: [0.25, Infinity],
  g: [1, 5000],
  kg: [0.5, Infinity],
  ml: [1, 5000],
  L: [0.5, Infinity],
};

function rows(qty: number, unit: string, units: string[]): Equivalent[] {
  return units
    .map((u) => ({ qty: convert(qty, unit, u), unit: u }))
    .filter((r) => {
      const [lo, hi] = SENSIBLE[r.unit] ?? [0.125, 1000];
      return r.unit !== unit && r.qty >= lo - 1e-9 && r.qty < hi + 1e-9;
    })
    .map((r) => ({ ...r, text: formatAmount(r.qty, r.unit) }));
}

function metricRow(qty: number, unit: string): Equivalent {
  const dim = dimensionOf(unit);
  const [small, big] = dim === "weight" ? ["g", "kg"] : ["ml", "L"];
  const v = convert(qty, unit, small!);
  const r = v >= 1000 ? { qty: v / 1000, unit: big! } : { qty: v, unit: small! };
  return { ...r, text: formatAmount(r.qty, r.unit) };
}

export interface ConversionResult {
  dimension: "volume" | "weight" | "count";
  /** Exact conversions in the same dimension (US units, then metric). */
  exact: Equivalent[];
  /** Approximate conversions to the other dimension, when the ingredient is known. */
  approx: Equivalent[];
  density: (Density & { source: "custom" | "table" }) | null;
  notes: string[];
}

/** Every useful way to measure `qty unit` of an ingredient. */
export function equivalents(qty: number, unit: string, ingredient = "", custom: CustomConversion[] = []): ConversionResult {
  const dimension = dimensionOf(unit);
  const notes: string[] = [];
  if (!(qty > 0)) return { dimension, exact: [], approx: [], density: null, notes: ["Enter an amount greater than zero."] };
  if (dimension === "count") {
    return { dimension, exact: [], approx: [], density: null, notes: [`“${unit}” is counted, not measured — there's nothing to convert.`] };
  }
  const exact = [...rows(qty, unit, dimension === "volume" ? US_VOLUME : US_WEIGHT)];
  if (!METRIC_UNITS.has(unit)) exact.push(metricRow(qty, unit));
  else exact.push(...rows(qty, unit, METRIC_UNITS.has(unit) && dimension === "weight" ? ["g", "kg"] : ["ml", "L"]).filter((r) => r.unit !== unit));

  const density = ingredient.trim() ? findDensity(ingredient, custom) : null;
  let approx: Equivalent[] = [];
  if (density) {
    if (dimension === "weight") {
      const cups = convert(qty, unit, "g") / density.gramsPerCup;
      approx = rows(cups, "cup", US_VOLUME);
      const asCup = { qty: cups, unit: "cup", text: formatAmount(cups, "cup") };
      approx = [asCup, ...approx.filter((r) => r.unit !== "cup")];
      approx.push(metricRow(cups, "cup"));
    } else {
      const grams = convert(qty, unit, "cup") * density.gramsPerCup;
      approx = [...rows(grams, "g", US_WEIGHT), metricRow(grams, "g")];
    }
  } else if (ingredient.trim()) {
    notes.push(`No weight↔volume conversion saved for “${ingredient.trim()}”. You can add your own below.`);
  }

  if (unit === "oz") {
    const cupsIfFluid = convert(qty, "fl oz", "cup");
    notes.push(`“oz” here means ounces by weight. If you meant fluid ounces, ${formatAmount(qty, "fl oz")} = ${formatAmount(cupsIfFluid, "cup")}.`);
  }
  if (unit === "fl oz") notes.push("Fluid ounces measure volume, not weight.");
  return { dimension, exact, approx, density, notes };
}

/** Parse "1 1/2", "3/4", "2.5", "1½". Returns null if it isn't a number. */
export function parseAmount(input: string): number | null {
  const s = input
    .trim()
    .replace(/½/g, " 1/2")
    .replace(/¼/g, " 1/4")
    .replace(/¾/g, " 3/4")
    .replace(/⅓/g, " 1/3")
    .replace(/⅔/g, " 2/3")
    .replace(/⅛/g, " 1/8")
    .trim();
  if (!s) return null;
  let total = 0;
  for (const part of s.split(/\s+/)) {
    if (/^\d+(\.\d+)?$/.test(part)) total += Number(part);
    else if (/^\d+\/\d+$/.test(part)) {
      const [a, b] = part.split("/").map(Number);
      if (!b) return null;
      total += a! / b;
    } else if (/^\.\d+$/.test(part)) total += Number(part);
    else return null;
  }
  return total;
}

export const UNIT_GROUPS: { label: string; units: string[] }[] = [
  { label: "Volume (US)", units: US_VOLUME },
  { label: "Weight (US)", units: US_WEIGHT },
  { label: "Metric", units: ["ml", "L", "g", "kg"] },
];

export const KNOWN_INGREDIENTS = DENSITIES.map((d) => d.name).sort();
