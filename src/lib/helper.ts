/**
 * Kitchen helper — a second set of eyes on the count, like glancing back over the
 * notebook page. Plain rules that run on the phone: no AI, no network, nothing leaves
 * the device. It only points things out; it never changes data.
 */
import * as C from "./counting";
import { addDays, type ISODate } from "./dates";
import { isEntree, MEAL_LABELS, type MealService } from "./menu/types";
import * as P from "./prep";
import type { AppState } from "./state/model";
import * as ops from "./state/ops";

export interface HelperNote {
  id: string;
  level: "warn" | "info";
  text: string;
  href?: string;
}

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Typical total for this meal from up to the last 4 finished counts before `date`. */
export function usualCount(state: AppState, date: ISODate, meal: MealService): { avg: number; n: number } | null {
  const past = Object.values(state.workspaces.stann.counts)
    .filter((s) => s.meal === meal && s.date < date && s.status === "complete")
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 4)
    .map((s) => C.summarize(s).totalMeals)
    .filter((n) => n > 0);
  if (past.length < 2) return null;
  return { avg: Math.round(past.reduce((a, b) => a + b, 0) / past.length), n: past.length };
}

export function checkService(state: AppState, date: ISODate, meal: MealService, now: Date = new Date(), today?: ISODate): HelperNote[] {
  const d = state.workspaces.stann;
  const notes: HelperNote[] = [];
  const q = `?date=${date}&meal=${meal}`;
  const session = d.counts[C.sessionKey(date, meal)];
  const sum = session ? C.summarize(session) : null;
  const menu = ops.mealFor(state, date, meal);
  const isToday = today ? date === today : true;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const serveMin = minutesOf(d.settings.servingTimes[meal]);
  const label = MEAL_LABELS[meal].toLowerCase();

  if (session && sum) {
    // a menu entrée with no tally box
    for (const item of menu.items.filter(isEntree)) {
      const hasBox = session.options.some((o) => o.key === item.id || C.shortEntreeName(item.text).toLowerCase() === o.label.toLowerCase());
      if (!hasBox)
        notes.push({ id: `nobox-${item.id}`, level: "info", text: `The menu has “${C.shortEntreeName(item.text)}” but there's no tally box for it.`, href: `/stann/counts${q}` });
    }
    if (sum.unresolved > 0) notes.push({ id: "unclear", level: "warn", text: `${sum.unresolved} unclear slip(s) still need a meal.`, href: `/stann/counts${q}` });

    // unusual total, once the count is finished
    const usual = usualCount(state, date, meal);
    if (session.status === "complete" && usual && usual.avg >= 10) {
      const diff = sum.totalMeals - usual.avg;
      if (Math.abs(diff) / usual.avg > 0.25)
        notes.push({
          id: "unusual",
          level: "warn",
          text: `${sum.totalMeals} ${label} meals — usually about ${usual.avg} (last ${usual.n}). ${diff < 0 ? "Missing a stack or some slips?" : "Any slips counted twice?"}`,
          href: `/stann/counts${q}`,
        });
    }
    // expected slips mismatch
    if (sum.discrepancy !== null && sum.discrepancy !== 0)
      notes.push({ id: "stack", level: "warn", text: `Counted ${sum.totalMeals}, but the stack was ${session.expectedSlips}.`, href: `/stann/counts${q}` });

    // modifications / textures can't be more than the entrée they belong to
    const tex = C.textureCounts(session, sum.items);
    for (const [box, list] of Object.entries(tex)) {
      const n = list.reduce((a, t) => a + t.count, 0);
      const boxCount = sum.byChoice[box] ?? 0;
      if (n > boxCount) notes.push({ id: `tex-${box}`, level: "warn", text: `${n} texture plates for ${C.labelFor(session, box)}, but only ${boxCount} counted.`, href: `/stann/counts${q}` });
    }
    for (const x of session.extras) {
      if (!x.key.startsWith("x_")) continue;
      const box = session.options.find((o) => (o.role === "main" || o.role === "alt") && x.label.toLowerCase().endsWith(o.label.toLowerCase()));
      const n = sum.items[x.key] ?? 0;
      if (box && n > (sum.byChoice[box.key] ?? 0))
        notes.push({ id: `mod-${x.key}`, level: "warn", text: `${n} “${x.label.split(" – ")[0]}” but only ${sum.byChoice[box.key] ?? 0} ${box.label}.`, href: `/stann/counts${q}` });
    }
  }

  // requests
  const reqs = d.requests.filter((r) => r.date === date && r.meal === meal && r.status !== "cancelled");
  const unchecked = reqs.filter((r) => r.verification === "unverified").length;
  if (unchecked && d.settings.requestDietCheck) notes.push({ id: "req-unchecked", level: "info", text: `${unchecked} request(s) not diet-checked yet.`, href: `/stann/counts${q}` });
  const flagged = reqs.filter((r) => r.verification === "flagged").length;
  if (flagged) notes.push({ id: "req-flagged", level: "warn", text: `${flagged} request(s) flagged for staff review.`, href: `/stann/counts${q}` });

  if (isToday) {
    // getting close to service
    if (nowMin >= serveMin - 60 && nowMin < serveMin + 30 && (!session || session.status !== "complete"))
      notes.push({ id: "late-count", level: "warn", text: `${MEAL_LABELS[meal]} serves at ${d.settings.servingTimes[meal]} — the count isn't finished.`, href: `/stann/counts${q}` });
    const open = d.prep.filter((t) => P.visible(t) && t.date === date && !t.done && (!t.meal || t.meal === meal));
    if (nowMin >= serveMin - 30 && nowMin < serveMin + 30 && open.length)
      notes.push({ id: "late-prep", level: "info", text: `${open.length} prep task(s) still open before ${label}.`, href: `/stann/prep${q}` });
    if (nowMin >= serveMin && reqs.some((r) => r.status === "not_started"))
      notes.push({ id: "req-not-started", level: "warn", text: `Some requests haven't been started and ${label} has been served.`, href: `/stann/counts${q}` });

    // nothing pulled for tomorrow yet (afternoon onward)
    if (nowMin >= 13 * 60) {
      const pulls = P.pendingSuggestions(
        P.suggestForMeal(addDays(date, 1), meal, ops.mealFor(state, addDays(date, 1), meal).items),
        d.prep,
        d.dismissedSuggestions,
      ).filter((s) => s.date === date && s.target?.stage === "thaw");
      if (pulls.length) notes.push({ id: "pulls", level: "info", text: `For tomorrow: ${pulls.map((p) => p.target!.label).join(", ")} may need pulling to thaw.`, href: `/stann/prep${q}` });
    }

    // temps after service, if the facility set limits
    const rules = d.settings.tempRules;
    const anyRules = Object.values(rules).some((r) => r.min != null || r.max != null);
    const temps = (d.temps ?? []).filter((t) => t.date === date && t.meal === meal && !t.voided);
    if (anyRules && nowMin >= serveMin && temps.length === 0)
      notes.push({ id: "no-temps", level: "info", text: `No temperatures logged for ${label} yet.`, href: `/stann/ready${q}` });
  }
  return notes;
}
