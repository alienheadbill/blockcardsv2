import { describe, expect, it } from "vitest";
import * as C from "@/lib/counting";
import { addDays } from "@/lib/dates";
import { checkService } from "@/lib/helper";
import { FALL_WINTER } from "@/lib/menu/fallWinter";
import * as P from "@/lib/prep";
import { initialState } from "@/lib/state/model";
import * as ops from "@/lib/state/ops";

const menu = FALL_WINTER.weeks[1]!.days[1]!.dinner;
const fresh = () => C.createSession({ date: "2026-11-16", meal: "dinner", menuItems: menu });
const ALT = menu[1]!.id;

describe("texture taps count in the tally", () => {
  it("one tap = one slip for the entrée + its texture; undo takes both back", () => {
    let s = C.tapSlip(fresh(), ALT);
    s = C.tapTexturedSlip(s, "f4", ALT);
    s = C.tapTexturedSlip(s, "f5", ALT);
    let sum = C.summarize(s);
    expect(sum.totalMeals).toBe(3);
    expect(sum.byChoice[ALT]).toBe(3);
    expect(C.textureCounts(s, sum.items)[ALT]).toEqual([
      { levelId: "f4", count: 1 },
      { levelId: "f5", count: 1 },
    ]);
    s = C.undo(s);
    sum = C.summarize(s);
    expect(sum.totalMeals).toBe(2);
    expect(C.textureCounts(s, sum.items)[ALT]).toEqual([{ levelId: "f4", count: 1 }]);
    s = C.undo(s);
    s = C.undo(s);
    expect(C.summarize(s).totalMeals).toBe(0);
    expect(() => C.tapTexturedSlip(s, "f4", C.UNRESOLVED_CHOICE)).toThrow();
  });
});

describe("made-ahead prep", () => {
  const D = "2026-11-19";
  const T = addDays(D, 1);
  const target = (stage: P.PrepStage = "make"): P.PrepTarget => ({ itemId: "pizza-1", label: "Pizza", date: T, meal: "dinner", stage, kind: "main" });

  it("finishing it ahead hides the other day's task and suggests the next step instead", () => {
    const ahead = P.createTask({ date: D, title: "Pizza — for tomorrow dinner", target: target() });
    const tomorrows = P.createTask({ date: T, title: "Prep Pizza", target: target(), source: "suggested", suggestionKey: `${T}|dinner|pizza-1` });
    let tasks = P.togglePrepInList([ahead, tomorrows], ahead.id);
    expect(tasks[1]!.coveredBy).toBe(ahead.id);
    expect(tasks.filter(P.visible).map((t) => t.title)).toEqual(["Pizza — for tomorrow dinner"]);

    const sugg: P.PrepSuggestion[] = [{ key: `${T}|dinner|pizza-1`, date: T, meal: "dinner", title: "Prep Pizza", holdingReminder: "", reason: "", target: target() }];
    const pending = P.pendingSuggestions(sugg, [{ ...ahead, done: true }], []);
    expect(pending.map((p) => p.title)).toEqual(["Cook / finish Pizza — made ahead Thu"]);
    expect(pending[0]!.target!.stage).toBe("finish");

    // un-ticking brings the other task back
    tasks = P.togglePrepInList(tasks, ahead.id);
    expect(tasks.every(P.visible)).toBe(true);
  });

  it("uses the right next step for soups and cold items; same-day work isn't 'ahead'", () => {
    expect(P.nextStepVerb("soup", "Clam Chowder")).toBe("Reheat");
    expect(P.nextStepVerb("dessert", "Jello")).toBe("Portion & serve");
    expect(P.nextStepVerb("main", "Pizza")).toBe("Cook / finish");
    const sameDay = { ...P.createTask({ date: T, title: "Pizza", target: target() }), done: true };
    expect(P.madeAhead([sameDay], "pizza-1", T)).toBeUndefined();
  });

  it("works through state ops with an audit entry", () => {
    let s = ops.addPrepTask(initialState(), "stann", { date: D, title: "Jello — for tomorrow", target: { ...target(), itemId: "j" } });
    s = ops.addPrepTask(s, "stann", { date: T, title: "Make Jello", target: { ...target(), itemId: "j" } });
    s = ops.togglePrep(s, "stann", s.workspaces.stann.prep[0]!.id);
    expect(s.workspaces.stann.prep.filter(P.visible)).toHaveLength(1);
    expect(s.workspaces.stann.audit[0]!.detail).toMatch(/covers 1 other/);
  });
});

describe("kitchen helper", () => {
  const D = "2026-11-16";
  const at = (h: number, m = 0) => new Date(2026, 10, 16, h, m);
  function counted(n: number, date = D) {
    let s = ops.startSession(initialState(), date, "dinner");
    s = ops.updateSession(s, date, "dinner", (x) => {
      for (let i = 0; i < n; i++) x = C.tapSlip(x, x.options[0]!.key);
      return C.complete(x, []);
    });
    return s;
  }

  it("is quiet when everything looks right", () => {
    expect(checkService(counted(40), D, "dinner", at(10), D)).toEqual([]);
  });

  it("warns when the count isn't finished close to service", () => {
    const s = ops.startSession(initialState(), D, "dinner");
    expect(checkService(s, D, "dinner", at(16, 0), D).map((n) => n.id)).toContain("late-count");
    expect(checkService(s, D, "dinner", at(12, 0), D).map((n) => n.id)).not.toContain("late-count");
  });

  it("notices an unusually low count compared with recent dinners", () => {
    let s = initialState();
    for (const [i, n] of [44, 46, 45, 47].entries()) {
      const date = addDays(D, -(i + 1) * 7);
      s = ops.startSession(s, date, "dinner");
      s = ops.updateSession(s, date, "dinner", (x) => {
        for (let k = 0; k < n; k++) x = C.tapSlip(x, x.options[0]!.key);
        return C.complete(x, []);
      });
    }
    s = ops.startSession(s, D, "dinner");
    s = ops.updateSession(s, D, "dinner", (x) => {
      for (let k = 0; k < 30; k++) x = C.tapSlip(x, x.options[0]!.key);
      return C.complete(x, []);
    });
    const note = checkService(s, D, "dinner", at(10), D).find((n) => n.id === "unusual");
    expect(note?.text).toMatch(/30 dinner meals — usually about 46/);
  });

  it("spots a menu entrée with no tally box and impossible texture counts", () => {
    let s = ops.startSession(initialState(), D, "dinner", ["Veggfritata"]); // no box for the pot pie
    const ids = checkService(s, D, "dinner", at(10), D).map((n) => n.text);
    expect(ids.join()).toMatch(/“Chicken Pot Pie” but there's no tally box/);
    s = ops.updateSession(s, D, "dinner", (x) => {
      const box = x.options[0]!.key;
      x = C.tapTexturedSlip(x, "f4", box);
      return C.adjustCount(x, { kind: "remove", box, qty: 1 }, "Slip was wrong"); // removes the meal, not the texture
    });
    expect(checkService(s, D, "dinner", at(10), D).map((n) => n.id)).toContain(`tex-${ops.getSession(s, D, "dinner")!.options[0]!.key}`);
  });
});
