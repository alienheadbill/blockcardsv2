/**
 * IDDSI — International Dysphagia Diet Standardisation Initiative framework levels.
 *
 * Summaries paraphrased from the IDDSI Framework (iddsi.org, CC BY-SA 4.0).
 * These counters record what is PRINTED ON THE SLIP / diet order (e.g. MealSuite's
 * "IDDSI Level 5: Minced & Moist"). The app never assigns or changes a texture.
 * Always follow the resident's order and the facility's procedures; use the
 * official IDDSI testing methods (fork pressure, spoon tilt, flow test).
 */

export type IddsiKind = "food" | "drink";

export interface IddsiLevel {
  id: string;
  kind: IddsiKind;
  level: number;
  name: string;
  short: string;
  /** IDDSI color band, for a small swatch next to the name (never the only cue). */
  color: string;
  summary: string;
  test: string;
}

export const IDDSI_LEVELS: IddsiLevel[] = [
  // foods
  {
    id: "f7r",
    kind: "food",
    level: 7,
    name: "Regular",
    short: "Regular",
    color: "#111111",
    summary: "Normal, everyday foods of any texture.",
    test: "No testing required.",
  },
  {
    id: "f7ec",
    kind: "food",
    level: 7,
    name: "Easy to Chew",
    short: "Easy to Chew",
    color: "#111111",
    summary: "Everyday foods that are soft and tender. No size limit, but avoid hard, tough, chewy, fibrous, stringy, crunchy or crumbly bits, pips, seeds and husks.",
    test: "Fork/spoon pressure: a piece squashes and doesn't return to shape when pressed with the side of a fork until the thumbnail blanches.",
  },
  {
    id: "f6",
    kind: "food",
    level: 6,
    name: "Soft & Bite-Sized",
    short: "Soft & Bite-Sized",
    color: "#2563eb",
    summary: "Soft, tender and moist throughout, no thin liquid leaking. Pieces no bigger than 1.5 cm (about ½ inch) for adults. Chewing is needed; no hard, tough, chewy or crunchy bits.",
    test: "Fork pressure: squashes and doesn't return to shape. Pieces fit within a fork width (1.5 cm).",
  },
  {
    id: "f5",
    kind: "food",
    level: 5,
    name: "Minced & Moist",
    short: "Minced & Moist",
    color: "#ea580c",
    summary: "Soft and moist, with small lumps no bigger than 4 mm for adults that are easily squashed with the tongue. No separate thin liquid; minimal chewing.",
    test: "Fork test: lumps fit between the prongs of a fork (≈4 mm) and are easily mashed with light fork pressure.",
  },
  {
    id: "f4",
    kind: "food",
    level: 4,
    name: "Puréed",
    short: "Puréed",
    color: "#16a34a",
    summary: "Smooth with no lumps, not sticky. Holds its shape on a spoon; no chewing. Can't be drunk from a cup or sucked through a straw.",
    test: "Spoon tilt: holds shape on the spoon and slides off fully with little food left when the spoon is tilted.",
  },
  {
    id: "f3",
    kind: "food",
    level: 3,
    name: "Liquidised",
    short: "Liquidised",
    color: "#eab308",
    summary: "Smooth, no lumps, pourable — can be eaten with a spoon or drunk from a cup. No chewing.",
    test: "Fork drip: drips slowly in dollops through the prongs of a fork.",
  },
  // drinks
  { id: "d0", kind: "drink", level: 0, name: "Thin", short: "Thin", color: "#ffffff", summary: "Flows like water.", test: "Flow test: 10 mL syringe, less than 1 mL left after 10 seconds." },
  { id: "d1", kind: "drink", level: 1, name: "Slightly Thick", short: "Slightly Thick", color: "#9ca3af", summary: "Thicker than water; flows through a standard straw with a little effort.", test: "Flow test: 1–4 mL left after 10 seconds." },
  { id: "d2", kind: "drink", level: 2, name: "Mildly Thick", short: "Mildly Thick", color: "#ec4899", summary: "Flows off a spoon; sippable; takes effort through a standard straw.", test: "Flow test: 4–8 mL left after 10 seconds." },
  { id: "d3", kind: "drink", level: 3, name: "Moderately Thick", short: "Moderately Thick", color: "#eab308", summary: "Can be drunk from a cup; hard to suck through a straw; no chewing.", test: "Flow test: more than 8 mL left after 10 seconds." },
  { id: "d4", kind: "drink", level: 4, name: "Extremely Thick", short: "Extremely Thick", color: "#16a34a", summary: "Holds its shape on a spoon; usually eaten with a spoon, can't be drunk from a cup.", test: "Same as Level 4 Puréed (spoon tilt)." },
];

/** Texture levels offered for each entrée, most-used first. */
export const ENTREE_TEXTURES = ["f4", "f5", "f6"] as const;
export const MORE_ENTREE_TEXTURES = ["f3", "f7ec"] as const;
/** Thickened-drink levels counted once per service. */
export const DRINK_TEXTURES = ["d1", "d2", "d3", "d4"] as const;

export const iddsi = (id: string) => IDDSI_LEVELS.find((l) => l.id === id)!;

export function textureLabel(levelId: string, targetLabel?: string) {
  const l = iddsi(levelId);
  const base = `${l.name} (L${l.level})`;
  return targetLabel ? `${base} – ${targetLabel}` : `${base} drinks`;
}

/** Deterministic key for a texture counter, so taps on the same level/entrée add up. */
export const textureKey = (levelId: string, target: string) => `t_${levelId}_${target}`;
export const DRINKS_TARGET = "drinks";

export function parseTextureKey(key: string): { levelId: string; target: string } | null {
  const m = key.match(/^t_([a-z0-9]+)_(.+)$/);
  return m ? { levelId: m[1]!, target: m[2]! } : null;
}
