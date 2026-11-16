import { describe, expect, it } from "vitest";
import * as C from "@/lib/counting";
import { FALL_WINTER } from "@/lib/menu/fallWinter";

const menu = FALL_WINTER.weeks[1]!.days[1]!.dinner; // frittata / pot pie / pears / cookie
const fresh = () => C.createSession({ date: "2026-11-16", meal: "dinner", menuItems: menu });
const MAIN = menu[0]!.id;
const ALT = menu[1]!.id;
const PEARS = menu[2]!.id;
const COOKIE = menu[3]!.id;

function tap(s: C.CountSession, key: string, n: number) {
  for (let i = 0; i < n; i++) s = C.tapSlip(s, key);
  return s;
}

describe("counting", () => {
  it("builds one panel per entrée plus custom and unclear", () => {
    const s = fresh();
    expect(s.options.map((o) => o.role)).toEqual(["main", "alt", "custom", "unresolved"]);
    expect(s.extras.map((e) => e.label)).toEqual(["Pears", "Cookie"]);
  });

  it("one tap = exactly one slip", () => {
    let s = fresh();
    s = tap(s, MAIN, 15);
    s = tap(s, ALT, 31);
    const sum = C.summarize(s);
    expect(sum.byChoice[MAIN]).toBe(15);
    expect(sum.byChoice[ALT]).toBe(31);
    expect(sum.totalMeals).toBe(46);
    expect(sum.slipsProcessed).toBe(46);
  });

  it("undo reverses the most recent tap and is recorded as an event", () => {
    let s = tap(fresh(), MAIN, 3);
    s = C.tapSlip(s, ALT);
    s = C.undo(s);
    expect(C.summarize(s).byChoice[ALT]).toBe(0);
    expect(C.summarize(s).totalMeals).toBe(3);
    s = C.undo(s);
    expect(C.summarize(s).byChoice[MAIN]).toBe(2);
    expect(s.events.filter((e) => e.type === "undo")).toHaveLength(2);
    expect(s.events).toHaveLength(6); // nothing deleted
  });

  it("undo on an empty count is a no-op", () => {
    const s = fresh();
    expect(C.undo(s)).toBe(s);
  });

  it("add-on items never inflate the meal total", () => {
    let s = tap(fresh(), MAIN, 10);
    for (let i = 0; i < 8; i++) s = C.tapItem(s, PEARS);
    for (let i = 0; i < 9; i++) s = C.tapItem(s, COOKIE);
    const sum = C.summarize(s);
    expect(sum.totalMeals).toBe(10);
    expect(sum.items[PEARS]).toBe(8);
    expect(sum.items[COOKIE]).toBe(9);
  });

  it("detailed mode links add-ons to the slip, and undo unwinds them in order", () => {
    let s = C.setMode(fresh(), "detailed");
    s = C.tapSlip(s, ALT);
    const slipId = C.summarize(s).lastSlipId!;
    s = C.tapItem(s, PEARS, slipId);
    s = C.undo(s); // undoes pears first
    expect(C.summarize(s).items[PEARS]).toBe(0);
    expect(C.summarize(s).totalMeals).toBe(1);
  });

  it("unclear slips count as meals but block completion until resolved", () => {
    let s = tap(fresh(), MAIN, 2);
    s = C.tapSlip(s, C.UNRESOLVED_CHOICE);
    expect(C.summarize(s).totalMeals).toBe(3);
    expect(() => C.complete(s, [])).toThrow(/unclear/);
    const id = C.summarize(s).unresolvedSlipIds[0]!;
    s = C.resolveSlip(s, id, ALT);
    const sum = C.summarize(s);
    expect(sum.unresolved).toBe(0);
    expect(sum.byChoice[ALT]).toBe(1);
    expect(sum.totalMeals).toBe(3);
  });

  it("corrections need a reason, are audited, and can't go negative", () => {
    let s = tap(fresh(), MAIN, 2);
    expect(() => C.correct(s, { kind: "slip", choice: MAIN }, 1, "  ")).toThrow(/reason/);
    expect(() => C.correct(s, { kind: "slip", choice: MAIN }, -3, "oops")).toThrow(/negative/);
    s = C.correct(s, { kind: "slip", choice: MAIN }, 2, "Two slips found under the tray");
    const sum = C.summarize(s);
    expect(sum.byChoice[MAIN]).toBe(4);
    expect(sum.totalMeals).toBe(4);
    expect(sum.slipsProcessed).toBe(2);
    expect(sum.corrections).toBe(1);
  });

  it("flags discrepancies against the physical stack and requires acknowledgement", () => {
    let s = C.setExpected(fresh(), 5);
    s = tap(s, MAIN, 4);
    const issues = C.reviewIssues(s);
    expect(issues.find((i) => i.id === "discrepancy")?.message).toMatch(/1 slip missing/);
    expect(() => C.complete(s, [])).toThrow(/acknowledge/);
    s = C.complete(s, ["discrepancy"]);
    expect(s.status).toBe("complete");
  });

  it("locks a completed count until it is reopened with a reason", () => {
    let s = C.complete(tap(fresh(), MAIN, 3), []);
    expect(() => C.tapSlip(s, MAIN)).toThrow(/complete/);
    expect(() => C.undo(s)).toThrow();
    expect(() => C.reopen(s, "")).toThrow();
    s = C.reopen(s, "Late slip from 2nd floor");
    s = C.tapSlip(s, MAIN);
    expect(C.summarize(s).totalMeals).toBe(4);
    // undo never crosses the review boundary
    s = C.undo(s);
    expect(C.lastUndoable(s)).toBeUndefined();
  });

  it("refuses unknown choices", () => {
    expect(() => C.tapSlip(fresh(), "nope")).toThrow();
    expect(() => C.tapItem(fresh(), "nope")).toThrow();
  });

  it("tags slips with the unit stack and subtotals each unit", () => {
    let s = C.createSession({ date: "2026-11-16", meal: "dinner", menuItems: menu, units: ["Granite", "Lilac", "Birch"] });
    expect(s.activeUnit).toBe("Granite");
    s = tap(s, MAIN, 3);
    s = C.setActiveUnit(s, "Lilac");
    s = tap(s, ALT, 4);
    s = C.setActiveUnit(s, "Birch");
    s = tap(s, MAIN, 2);
    const sum = C.summarize(s);
    expect(sum.totalMeals).toBe(9);
    expect(sum.byUnit.Granite).toEqual({ total: 3, byChoice: { [MAIN]: 3 } });
    expect(sum.byUnit.Lilac!.total).toBe(4);
    expect(sum.byUnit.Birch!.total).toBe(2);
    expect(() => C.setActiveUnit(s, "Oak")).toThrow();
  });

  it("warns (without blocking) when a unit has no slips", () => {
    let s = C.createSession({ date: "2026-11-16", meal: "dinner", menuItems: menu, units: ["Granite", "Lilac"] });
    s = tap(s, MAIN, 2);
    const issue = C.reviewIssues(s).find((i) => i.id === "units");
    expect(issue).toMatchObject({ blocking: false });
    expect(issue!.message).toMatch(/Lilac/);
    expect(C.complete(s, ["units"]).status).toBe("complete");
  });

  it("suggests no-bun / no-biscuit modifications that don't change the meal total", () => {
    const wed = FALL_WINTER.weeks[0]!.days[3]!.dinner; // Sloppy Joe on a bun / Chili Mac
    let s = C.createSession({ date: "2026-11-11", meal: "dinner", menuItems: wed });
    expect(C.modificationSuggestions(s)).toContain("No bun – Sloppy Joe on a Bun");
    const potPie = C.createSession({ date: "2026-11-16", meal: "dinner", menuItems: menu });
    expect(C.modificationSuggestions(potPie)).toContain("No biscuit – Chicken Pot Pie");
    s = tap(s, s.options[0]!.key, 5);
    s = C.addExtra(s, "No bun – Sloppy Joe on a Bun");
    s = C.tapItem(s, s.extras[s.extras.length - 1]!.key);
    expect(C.summarize(s).totalMeals).toBe(5);
    expect(C.modificationSuggestions(s)).not.toContain("No bun – Sloppy Joe on a Bun");
  });

  it("uses the cook's written box names, keeping menu keys for the first boxes", () => {
    const s = C.createSession({ date: "2026-11-16", meal: "dinner", menuItems: menu, entrees: ["Veggfritata", "Chicken pot", "Grilled cheese"] });
    expect(s.options.map((o) => [o.label, o.role])).toEqual([
      ["Veggfritata", "main"],
      ["Chicken pot", "alt"],
      ["Grilled cheese", "alt"],
      ["Custom / Other", "custom"],
      ["Unclear slip", "unresolved"],
    ]);
    expect(s.options[0]!.key).toBe(MAIN);
    expect(C.shortEntreeName("Chicken Pot Pie with Biscuit")).toBe("Chicken Pot Pie");
    expect(C.shortEntreeName("Vegetable Frittata, Hash Pattie")).toBe("Vegetable Frittata");
  });

  it("renames boxes without losing counts; adds and removes unused boxes", () => {
    let s = tap(fresh(), MAIN, 4);
    s = C.renameOption(s, MAIN, "Veggfritata");
    expect(C.summarize(s).byChoice[MAIN]).toBe(4);
    expect(C.labelFor(s, MAIN)).toBe("Veggfritata");
    expect(() => C.renameOption(s, MAIN, " ")).toThrow();
    s = C.addOption(s, "Beef stew");
    const stew = s.options.find((o) => o.label === "Beef stew")!;
    expect(s.options.indexOf(stew)).toBe(2); // before Custom / Unclear
    s = C.tapSlip(s, stew.key);
    expect(C.summarize(s).totalMeals).toBe(5);
    expect(() => C.removeOption(s, stew.key)).toThrow(/counts/);
    s = C.undo(s);
    expect(() => C.removeOption(s, stew.key)).toThrow(/counts/); // undone taps still in the log
    s = C.addOption(s, "Oops");
    s = C.removeOption(s, s.options.find((o) => o.label === "Oops")!.key);
    expect(s.options.some((o) => o.label === "Oops")).toBe(false);
  });

  it("keeps free-form notes on the count", () => {
    const s = C.setNotes(fresh(), "Pull biscuits\nRm 104R wants extra gravy");
    expect(s.notes).toContain("gravy");
  });

  it("groups tallies in fives", () => {
    expect(C.tallyGroups(0)).toEqual([]);
    expect(C.tallyGroups(12)).toEqual([5, 5, 2]);
  });
});
