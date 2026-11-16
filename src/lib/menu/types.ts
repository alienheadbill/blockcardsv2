export const MEAL_SERVICES = ["breakfast", "lunch", "dinner"] as const;
export type MealService = (typeof MEAL_SERVICES)[number];

export const MEAL_LABELS: Record<MealService, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

/**
 * Kinds preserve the distinctions printed on the paper menu:
 *  main    – the first-listed entrée (no prefix)
 *  alt     – "A:" alternative entrée
 *  soup    – soup course
 *  side    – accompaniments / standing breakfast extras
 *  salad   – "S:" salad
 *  dessert – "D:"
 *  fruit   – "F:"
 */
export const MENU_ITEM_KINDS = ["main", "alt", "soup", "side", "salad", "dessert", "fruit"] as const;
export type MenuItemKind = (typeof MENU_ITEM_KINDS)[number];

export const KIND_LABELS: Record<MenuItemKind, string> = {
  main: "Main",
  alt: "Alternate",
  soup: "Soup",
  side: "Side",
  salad: "Salad",
  dessert: "Dessert",
  fruit: "Fruit",
};

export interface MenuItem {
  /** Stable id, e.g. "fw-w2-d1-dinner-0" — used to key corrections & history. */
  id: string;
  kind: MenuItemKind;
  /** The prefix printed on the source sheet ("A", "D", "F", "S" or ""). */
  printedLabel: string;
  text: string;
  /** Transcription uncertainty that a person should review. */
  flag?: string;
}

export type DayMenu = Record<MealService, MenuItem[]>;

export interface MenuWeek {
  week: number;
  /** 0 = Sunday … 6 = Saturday */
  days: DayMenu[];
  flag?: string;
  source: string;
}

export interface MenuSeason {
  id: string;
  name: string;
  cycleWeeks: number;
  weeks: MenuWeek[];
  transcribedFrom: string;
}

export const isEntree = (item: MenuItem) => item.kind === "main" || item.kind === "alt";
