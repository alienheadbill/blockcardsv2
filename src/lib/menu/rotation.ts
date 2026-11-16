import { dayOfWeek, daysBetween, DAY_NAMES, type DayName, type ISODate } from "../dates";
import type { MealService, MenuItem, MenuItemKind, MenuSeason } from "./types";

export interface RotationConfig {
  seasonId: string;
  /** Calendar date that is Week 1, Sunday. Must be confirmed with the facility. */
  week1Start: ISODate | null;
  /** True only once a person has confirmed the anchor against the facility's schedule. */
  confirmed: boolean;
  /** Where the anchor came from (e.g. "Confirmed with dietary manager 11/16"). */
  note: string;
}

export interface RotationPosition {
  week: number; // 1-based
  dayIndex: number; // 0 = Sunday
  dayName: DayName;
}

/**
 * Week/day of the rotation for a calendar date.
 * Returns null when no anchor has been configured — the app must never guess one.
 */
export function rotationPosition(date: ISODate, config: Pick<RotationConfig, "week1Start">, cycleWeeks: number): RotationPosition | null {
  if (!config.week1Start) return null;
  if (dayOfWeek(config.week1Start) !== 0) throw new Error("Week 1 must start on a Sunday");
  const cycleDays = cycleWeeks * 7;
  const offset = ((daysBetween(config.week1Start, date) % cycleDays) + cycleDays) % cycleDays;
  const dayIndex = offset % 7;
  return { week: Math.floor(offset / 7) + 1, dayIndex, dayName: DAY_NAMES[dayIndex]! };
}

export interface MenuCorrection {
  text: string;
  kind: MenuItemKind;
  /** A person has looked at this line against the source sheet. */
  reviewed: boolean;
}

export interface MenuHistoryEntry {
  id: string;
  at: string;
  itemId: string;
  before: { text: string; kind: MenuItemKind };
  after: { text: string; kind: MenuItemKind };
  reviewed: boolean;
  note: string;
}

export interface MenuOverride {
  items: MenuItem[];
  reason: string;
  at: string;
}

export const overrideKey = (date: ISODate, meal: MealService) => `${date}|${meal}`;

export function applyCorrections(items: MenuItem[], corrections: Record<string, MenuCorrection>): MenuItem[] {
  return items.map((item) => {
    const c = corrections[item.id];
    if (!c) return item;
    const next: MenuItem = { ...item, text: c.text, kind: c.kind };
    if (c.reviewed) delete next.flag;
    return next;
  });
}

export interface ResolvedMeal {
  date: ISODate;
  meal: MealService;
  position: RotationPosition | null;
  source: "rotation" | "override" | "unanchored";
  items: MenuItem[];
  overrideReason?: string;
}

export function resolveMeal(args: {
  season: MenuSeason;
  rotation: RotationConfig;
  corrections: Record<string, MenuCorrection>;
  overrides: Record<string, MenuOverride>;
  date: ISODate;
  meal: MealService;
}): ResolvedMeal {
  const { season, rotation, corrections, overrides, date, meal } = args;
  const position = rotationPosition(date, rotation, season.cycleWeeks);
  const override = overrides[overrideKey(date, meal)];
  if (override) {
    return { date, meal, position, source: "override", items: override.items, overrideReason: override.reason };
  }
  if (!position) return { date, meal, position, source: "unanchored", items: [] };
  const week = season.weeks.find((w) => w.week === position.week);
  const items = week?.days[position.dayIndex]?.[meal] ?? [];
  return { date, meal, position, source: "rotation", items: applyCorrections(items, corrections) };
}

/** All master-menu items that still carry an unreviewed transcription flag. */
export function flaggedItems(season: MenuSeason, corrections: Record<string, MenuCorrection>) {
  const out: { week: number; dayIndex: number; meal: MealService; item: MenuItem }[] = [];
  for (const w of season.weeks) {
    w.days.forEach((day, dayIndex) => {
      (Object.keys(day) as MealService[]).forEach((meal) => {
        for (const item of applyCorrections(day[meal], corrections)) {
          if (item.flag) out.push({ week: w.week, dayIndex, meal, item });
        }
      });
    });
  }
  return out;
}
