/**
 * Prep checklist — the "Prep" box at the bottom of the notebook page.
 * Suggestions are generated from the scheduled menu but are only ever *offered*;
 * the cook decides what to add, and nothing is marked done automatically.
 */
import { addDays, type ISODate } from "./dates";
import { newId, nowISO } from "./ids";
import { dayName } from "./dates";
import type { MealService, MenuItem, MenuItemKind } from "./menu/types";

/** Where a task sits in getting one menu item ready: thaw → make → finish/serve. */
export type PrepStage = "thaw" | "make" | "finish";

/** The menu item (on a given day's meal) a task is for. */
export interface PrepTarget {
  itemId: string;
  label: string;
  date: ISODate;
  meal: MealService;
  stage: PrepStage;
  kind?: MenuItemKind;
}

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
  /** Which menu item / day this task gets ready (lets "made ahead" work). */
  target?: PrepTarget;
  /** Hidden because another task already made this item ahead (id of that task). */
  coveredBy?: string;
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
  target?: PrepTarget;
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
    ...(input.target ? { target: input.target } : {}),
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
  target?: PrepTarget;
}

const HOT_HOLD = "Hold hot per facility-approved temperature; log temps.";
const COLD_HOLD = "Keep refrigerated per facility standard; label & date.";
const PROTEIN_RE =
  /\b(turkey|chicken|pork|beef|ham|salmon|cod|haddock|swordfish|shrimp|fish|meatballs?|meat ?loaf|kielbasa|steak|roast|liver|cutlet|tips)\b/i;

export function shortName(text: string) {
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
    const target: PrepTarget = { itemId: item.id, label: shortName(item.text), date, meal, stage: tag === "|thaw" ? "thaw" : "make", kind: item.kind };
    out.push({ key, date: taskDate, meal, title: `${verb} ${shortName(item.text)}`.trim(), holdingReminder, reason, target });
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

/** The finished task that made this menu item ahead of its day, if any. */
export function madeAhead(tasks: PrepTask[], itemId: string, date: ISODate): PrepTask | undefined {
  return tasks.find((t) => t.done && t.target?.stage === "make" && t.target.itemId === itemId && t.target.date === date && t.date < date);
}

/** What's left to do on the day for something made ahead. */
export function nextStepVerb(kind: MenuItemKind | undefined, label: string): string {
  if (kind === "soup" || /soup|chowder|stew|chili/i.test(label)) return "Reheat";
  if (kind === "fruit" || kind === "dessert" || kind === "salad" || /jello|gelatin|salad|parfait/i.test(label)) return "Portion & serve";
  return "Cook / finish";
}

/**
 * Suggestions the cook hasn't added or dismissed. If an item was already made ahead,
 * its "make" suggestion is replaced with the next step ("Cook / finish Pizza — made ahead Tue").
 */
export function pendingSuggestions(suggestions: PrepSuggestion[], tasks: PrepTask[], dismissed: string[]): PrepSuggestion[] {
  const used = new Set([...tasks.map((t) => t.suggestionKey).filter(Boolean), ...dismissed]);
  const out: PrepSuggestion[] = [];
  for (const s of suggestions) {
    const ahead = s.target?.stage === "make" ? madeAhead(tasks, s.target.itemId, s.target.date) : undefined;
    if (ahead && s.target) {
      const key = `${s.key}|finish`;
      if (used.has(key) || used.has(s.key)) continue;
      out.push({
        ...s,
        key,
        date: s.target.date,
        title: `${nextStepVerb(s.target.kind, s.target.label)} ${s.target.label} — made ahead ${dayName(ahead.date).slice(0, 3)}`,
        reason: "Already made ahead",
        target: { ...s.target, stage: "finish" },
      });
      continue;
    }
    if (!used.has(s.key)) out.push(s);
  }
  return out;
}

/**
 * Tick a task done (or undo it). Finishing a "make" task for a later day hides any
 * other open "make" task for the same item/day (it's covered); unticking brings them back.
 */
export function togglePrepInList(tasks: PrepTask[], id: string): PrepTask[] {
  const task = tasks.find((t) => t.id === id);
  if (!task) throw new Error("Task not found");
  const next = toggleDone(task);
  const tgt = next.target;
  return tasks.map((t) => {
    if (t.id === id) return next;
    if (!tgt || tgt.stage !== "make") return t;
    const same = t.target?.stage === "make" && t.target.itemId === tgt.itemId && t.target.date === tgt.date;
    if (next.done && same && !t.done && !t.coveredBy) return { ...t, coveredBy: id };
    if (!next.done && t.coveredBy === id) {
      const { coveredBy: _c, ...rest } = t;
      return rest;
    }
    return t;
  });
}

export const visible = (t: PrepTask) => !t.coveredBy;

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
