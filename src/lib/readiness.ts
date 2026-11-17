/**
 * Service readiness: a checklist and a temperature log for each meal service.
 *
 * Temperature limits are whatever the facility configures. The app ships with
 * NO limits switched on. It can fill in commonly cited FDA Food Code reference
 * values, but only after a person confirms they match the facility's approved
 * procedures. The app never declares food "safe" — it only reports whether a
 * reading is inside or outside the configured limits.
 */
import type { ISODate } from "./dates";
import { newId, nowISO } from "./ids";
import type { MealService } from "./menu/types";

export const TEMP_KINDS = ["cook", "reheat", "hot-hold", "cold-hold", "cooling"] as const;
export type TempKind = (typeof TEMP_KINDS)[number];
export const TEMP_KIND_LABELS: Record<TempKind, string> = {
  cook: "Final cook",
  reheat: "Reheat",
  "hot-hold": "Hot holding",
  "cold-hold": "Cold holding",
  cooling: "Cooling check",
};

export interface TempRule {
  /** Reading must be at or above (°F). */
  min: number | null;
  /** Reading must be at or below (°F). */
  max: number | null;
}

export type TempRules = Record<TempKind, TempRule>;

export const NO_RULES: TempRules = {
  cook: { min: null, max: null },
  reheat: { min: null, max: null },
  "hot-hold": { min: null, max: null },
  "cold-hold": { min: null, max: null },
  cooling: { min: null, max: null },
};

/**
 * Commonly cited FDA Food Code (2022) values, offered only as a starting point.
 * Final cook temperature depends on the food (poultry 165 °F, ground meat 155 °F,
 * whole cuts/fish 145 °F…), so 165 °F is used as the strictest common value.
 * Cooling is a two-stage process (135→70 °F in 2 h, then to 41 °F within 4 more);
 * a single "cooling check" limit can't capture that, so it is left blank.
 */
export const FOOD_CODE_REFERENCE: TempRules = {
  cook: { min: 165, max: null },
  reheat: { min: 165, max: null },
  "hot-hold": { min: 135, max: null },
  "cold-hold": { min: null, max: 41 },
  cooling: { min: null, max: null },
};

export interface TempEntry {
  id: string;
  date: ISODate;
  meal: MealService;
  item: string;
  kind: TempKind;
  tempF: number;
  at: string;
  note: string;
  /** What was done about an out-of-limit reading. */
  action: string;
  /** Entries are never deleted; a mistaken one is voided with a reason. */
  voided?: { reason: string; at: string };
}

export type TempStatus = { kind: "no-rule" } | { kind: "within"; text: string } | { kind: "below"; text: string } | { kind: "above"; text: string };

export function evaluateTemp(tempF: number, rule: TempRule | undefined): TempStatus {
  if (!rule || (rule.min == null && rule.max == null)) return { kind: "no-rule" };
  if (rule.min != null && tempF < rule.min) return { kind: "below", text: `Below your minimum of ${rule.min} °F` };
  if (rule.max != null && tempF > rule.max) return { kind: "above", text: `Above your maximum of ${rule.max} °F` };
  const limits = [rule.min != null ? `≥ ${rule.min} °F` : "", rule.max != null ? `≤ ${rule.max} °F` : ""].filter(Boolean).join(", ");
  return { kind: "within", text: `Within your limit (${limits})` };
}

export function createTempEntry(input: { date: ISODate; meal: MealService; item: string; kind: TempKind; tempF: number; note?: string; action?: string }): TempEntry {
  const item = input.item.trim();
  if (!item) throw new Error("What food was checked?");
  if (!Number.isFinite(input.tempF) || input.tempF < -40 || input.tempF > 500) throw new Error("Enter a temperature in °F between -40 and 500");
  return {
    id: newId("tmp"),
    date: input.date,
    meal: input.meal,
    item,
    kind: input.kind,
    tempF: Math.round(input.tempF * 10) / 10,
    at: nowISO(),
    note: (input.note ?? "").trim(),
    action: (input.action ?? "").trim(),
  };
}

export const fToC = (f: number) => Math.round(((f - 32) * 5) / 9);
export const cToF = (c: number) => Math.round(((c * 9) / 5 + 32) * 10) / 10;

export interface ChecklistItem {
  id: string;
  label: string;
}

export const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { id: "steam", label: "Steam table on and wells filled" },
  { id: "cold", label: "Cold well / ice set for salads & desserts" },
  { id: "therm", label: "Thermometer cleaned and sanitized" },
  { id: "utensils", label: "Serving utensils and scoops out" },
  { id: "tickets", label: "Tray tickets / slips sorted" },
  { id: "requests", label: "Special requests made and labeled" },
  { id: "plates", label: "Plates, lids and trays stocked" },
];

export interface ReadinessRecord {
  /** item id → time checked */
  checked: Record<string, string>;
}

export function readinessProgress(list: ChecklistItem[], rec: ReadinessRecord | undefined) {
  const done = list.filter((i) => rec?.checked[i.id]).length;
  return { done, total: list.length };
}
