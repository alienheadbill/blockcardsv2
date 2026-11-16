/**
 * Prep checklist — the "Prep" box at the bottom of the notebook page.
 * Suggestions are generated from the scheduled menu but are only ever *offered*;
 * the cook decides what to add, and nothing is marked done automatically.
 */
import { addDays, type ISODate } from "./dates";
import { newId, nowISO } from "./ids";
import type { MealService, MenuItem } from "./menu/types";

export interface PrepTask {
  id: string;
  date: ISODate;
  meal: MealService | null;
  title: string;
  notes: string;
  /** Optional "HH:MM" start time. */
  startTime: string;
  /** Storage / holding reminder shown on the task. */
  holdingReminder: string;
  recipeId?: string;
  done: boolean;
  doneAt?: string;
  source: "manual" | "suggested" | "template";
  suggestionKey?: string;
  createdAt: string;
}

export interface PrepTemplate {
  id: string;
  name: string;
  tasks: { title: string; holdingReminder?: string }[];
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function createTask(input: {
  date: ISODate;
  title: string;
  meal?: MealService | null;
  notes?: string;
  startTime?: string;
  holdingReminder?: string;
  recipeId?: string;
  source?: PrepTask["source"];
  suggestionKey?: string;
}): PrepTask {
  const title = input.title.trim();
  if (!title) throw new Error("Task name is required");
  const startTime = (input.startTime ?? "").trim();
  if (startTime && !TIME_RE.test(startTime)) throw new Error("Start time must look like 07:30");
  return {
    id: newId("prep"),
    date: input.date,
    meal: input.meal ?? null,
    title,
    notes: (input.notes ?? "").trim(),
    startTime,
    holdingReminder: (input.holdingReminder ?? "").trim(),
    ...(input.recipeId ? { recipeId: input.recipeId } : {}),
    done: false,
    source: input.source ?? "manual",
    ...(input.suggestionKey ? { suggestionKey: input.suggestionKey } : {}),
    createdAt: nowISO(),
  };
}

export function toggleDone(task: PrepTask): PrepTask {
  if (task.done) {
    const { doneAt: _drop, ...rest } = task;
    return { ...rest, done: false };
  }
  return { ...task, done: true, doneAt: nowISO() };
}

export interface PrepSuggestion {
  key: string;
  date: ISODate;
  meal: MealService;
  title: string;
  holdingReminder: string;
  reason: string;
}

const HOT_HOLD = "Hold hot per facility-approved temperature; log temps.";
const COLD_HOLD = "Keep refrigerated per facility standard; label & date.";
const PROTEIN_RE =
  /\b(turkey|chicken|pork|beef|ham|salmon|cod|haddock|swordfish|shrimp|fish|meatballs?|meat ?loaf|kielbasa|steak|roast|liver|cutlet|tips)\b/i;

function shortName(text: string) {
  return text.split(/[,/]| w\/ | with /i)[0]!.trim();
}

/**
 * Suggest tasks for one meal. `leadDays` > 0 means these are "day ahead" pulls
 * (thaw proteins, set gelatin) for a meal that is `leadDays` away.
 */
export function suggestForMeal(date: ISODate, meal: MealService, items: MenuItem[]): PrepSuggestion[] {
  const out: PrepSuggestion[] = [];
  const add = (item: MenuItem, verb: string, holdingReminder: string, reason: string, taskDate = date, tag = "") => {
    const key = `${date}|${meal}|${item.id}${tag}`;
    out.push({ key, date: taskDate, meal, title: `${verb} ${shortName(item.text)}`.trim(), holdingReminder, reason });
  };
  for (const item of items) {
    const t = item.text.toLowerCase();
    if (item.kind === "side" && /danish|doughnut|yogurt/.test(t)) continue; // standing breakfast extras
    if (/jello|gelatin/.test(t)) {
      add(item, "Make", COLD_HOLD, "Gelatin needs time to set — make the day before.", addDays(date, -1), "|ahead");
      continue;
    }
    switch (item.kind) {
      case "soup":
        add(item, "Make", HOT_HOLD, "Soup on the menu");
        break;
      case "main":
      case "alt":
        if (PROTEIN_RE.test(t)) {
          add(item, "Pull to thaw:", COLD_HOLD, "Protein — pull from freezer the day before (per facility thaw procedure).", addDays(date, -1), "|thaw");
        }
        add(item, "Prep", HOT_HOLD, item.kind === "main" ? "Main entrée" : "Alternate entrée");
        break;
      case "fruit":
        add(item, "Cup", COLD_HOLD, "Fruit — portion into cups");
        break;
      case "dessert":
        add(item, /cookie|brownie|bar\b/.test(t) ? "Plate / bag" : "Prepare", COLD_HOLD, "Dessert");
        break;
      case "salad":
        add(item, "Make", COLD_HOLD, "Salad");
        break;
      default:
        break;
    }
  }
  return out;
}

/** Remove suggestions the cook already added or dismissed. */
export function pendingSuggestions(suggestions: PrepSuggestion[], tasks: PrepTask[], dismissed: string[]): PrepSuggestion[] {
  const used = new Set([...tasks.map((t) => t.suggestionKey).filter(Boolean), ...dismissed]);
  return suggestions.filter((s) => !used.has(s.key));
}

export function applyTemplate(template: PrepTemplate, date: ISODate, meal: MealService | null): PrepTask[] {
  return template.tasks.map((t) =>
    createTask({ date, meal, title: t.title, holdingReminder: t.holdingReminder ?? "", source: "template" }),
  );
}

export function progress(tasks: PrepTask[]) {
  const done = tasks.filter((t) => t.done).length;
  return { done, total: tasks.length, pct: tasks.length ? Math.round((done / tasks.length) * 100) : 0 };
}

export function sortTasks(tasks: PrepTask[]): PrepTask[] {
  const mealOrder = { breakfast: 0, lunch: 1, dinner: 2 } as const;
  return [...tasks].sort(
    (a, b) =>
      Number(a.done) - Number(b.done) ||
      (a.startTime || "99").localeCompare(b.startTime || "99") ||
      (a.meal ? mealOrder[a.meal] : 3) - (b.meal ? mealOrder[b.meal] : 3) ||
      a.createdAt.localeCompare(b.createdAt),
  );
}
