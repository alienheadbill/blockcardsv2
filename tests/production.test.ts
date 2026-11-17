import { describe, expect, it } from "vitest";
import * as C from "@/lib/counting";
import * as PR from "@/lib/production";
import * as RD from "@/lib/readiness";
import { starterRecipes } from "@/lib/recipes/recipes";
import { initialState } from "@/lib/state/model";
import * as ops from "@/lib/state/ops";

const ctx = (byChoice: Record<string, number>, extra: Partial<PR.LineContext> = {}): PR.LineContext => ({ byChoice, items: {}, requests: [], recipes: [], ...extra });
const line = (over: Partial<PR.ProductionLine> = {}): PR.ProductionLine => ({ ...PR.newLine("Chicken", { kind: "box", key: "k" }), ...over });

describe("production math", () => {
  it("25 servings × 4 oz = 100 oz = 6.25 lb finished", () => {
    const r = PR.computeLine(line({ portion: { qty: 4, unit: "oz" } }), ctx({ k: 25 }));
    expect(r.servings).toBe(25);
    expect(r.finished).toMatchObject({ qty: 6.25, unit: "lb", exact: "6.25 lb", kitchen: "6 1/4 lb", roundedUp: false });
  });

  it("separates raw from cooked: 6.25 lb cooked at 75% yield needs 8.33 lb raw", () => {
    const r = PR.computeLine(line({ portion: { qty: 4, unit: "oz" }, yieldPct: 75 }), ctx({ k: 25 }));
    expect(r.raw!.exact).toBe("8.33 lb");
    expect(r.raw!.kitchen).toBe("8 3/8 lb"); // rounded UP, never down
    expect(r.raw!.roundedUp).toBe(true);
  });

  it("never rounds a production amount down", () => {
    for (let n = 1; n <= 60; n++) {
      const r = PR.computeLine(line({ portion: { qty: 3.3, unit: "oz" }, yieldPct: 71, bufferPct: 5 }), ctx({ k: n }));
      const exactOz = n * 3.3 * 1.05;
      const kitchenOz = Number(r.finished!.kitchen.split(" ")[0]!.split(" ").reduce((a, p) => a + (p.includes("/") ? Number(p.split("/")[0]) / Number(p.split("/")[1]) : Number(p)), 0));
      // parse "6 1/4 lb" properly
      const parts = r.finished!.kitchen.split(" ");
      const unit = parts.pop()!;
      const value = parts.reduce((a, p) => a + (p.includes("/") ? Number(p.split("/")[0]) / Number(p.split("/")[1]) : Number(p)), 0);
      const inOz = unit === "lb" ? value * 16 : value;
      expect(inOz).toBeGreaterThanOrEqual(exactOz - 1e-9);
      expect(kitchenOz).toBeGreaterThan(0);
    }
  });

  it("applies the buffer and different portion sizes per line", () => {
    const soup = PR.computeLine(line({ portion: { qty: 8, unit: "fl oz" }, bufferPct: 10 }), ctx({ k: 40 }));
    expect(soup.finished).toMatchObject({ exact: "2.75 gal", kitchen: "2 3/4 gal" }); // 40 × 8 fl oz × 1.1 = 352 fl oz = 11 qt
    const rolls = PR.computeLine(line({ portion: { qty: 1, unit: "each" }, bufferPct: 5 }), ctx({ k: 41 }));
    expect(rolls.finished).toMatchObject({ exact: "43.05 each", kitchen: "44 each", roundedUp: true });
  });

  it("subtracts modifications (no biscuit) and flags impossible numbers", () => {
    const r = PR.computeLine(line({ portion: { qty: 1, unit: "each" }, subtractKeys: ["nb"] }), ctx({ k: 31 }, { items: { nb: 3 } }));
    expect(r).toMatchObject({ counted: 31, subtracted: 3, servings: 28 });
    const bad = PR.computeLine(line({ subtractKeys: ["nb"] }), ctx({ k: 1 }, { items: { nb: 3 } }));
    expect(bad.servings).toBe(0);
    expect(bad.warnings.join()).toMatch(/more than the count/);
  });

  it("portion sizes are optional: without one the line just shows servings, no warning", () => {
    const r = PR.computeLine(line(), ctx({ k: 12 }));
    expect(r.servings).toBe(12);
    expect(r.finished).toBeNull();
    expect(r.warnings).toEqual([]);
  });

  it("carries IDDSI texture counts from the count into the line and prep summary", () => {
    const l = line({ portion: { qty: 1, unit: "cup" } });
    const r = PR.computeLine(l, ctx({ k: 31 }, { textures: { k: [{ levelId: "f4", count: 3 }, { levelId: "f5", count: 2 }] } }));
    expect(r.textures.map((t) => [t.label, t.count])).toEqual([["Puréed (L4)", 3], ["Minced & Moist (L5)", 2]]);
    expect(PR.lineSummary(l, r)).toMatch(/3 Puréed \(L4\), 2 Minced & Moist \(L5\)$/);
    const tooMany = PR.computeLine(l, ctx({ k: 1 }, { textures: { k: [{ levelId: "f4", count: 3 }] } }));
    expect(tooMany.warnings.join()).toMatch(/Texture counts/);
  });

  it("scales a linked recipe and rounds portions/batches up", () => {
    const potPie = starterRecipes().find((x) => x.name.startsWith("Chicken Pot Pie"))!;
    const r = PR.computeLine(line({ recipeId: potPie.id, bufferPct: 5 }), ctx({ k: 31 }, { recipes: [potPie] }));
    expect(r.recipe).toMatchObject({ portionsExact: 32.550000000000004, portions: 33, batches: 4, batchPortions: 40 });
    const chicken = r.recipe!.ingredients.find((i) => i.name.startsWith("cooked chicken"))!;
    expect(chicken.qty).toBeCloseTo(2.5 * 3.3); // 33/10 of the base recipe
  });

  it("overrides win but are kept separate from the calculation", () => {
    const l = line({ portion: { qty: 4, unit: "oz" }, servingsOverride: { value: 30, reason: "late admits", at: "" }, amountOverride: { qty: 9, unit: "lb", reason: "batch size", at: "" } });
    const r = PR.computeLine(l, ctx({ k: 25 }));
    expect(r.servings).toBe(30);
    expect(r.finished!.exact).toBe("7.5 lb");
    expect(r.makeAmount!.exact).toBe("9 lb");
    expect(PR.lineSummary(l, r)).toMatch(/make 9 lb \(adjusted\)/);
  });

  it("computes cooked yield from a test batch", () => {
    expect(PR.yieldFromTest({ qty: 10, unit: "lb" }, { qty: 7.2, unit: "lb" })).toBe(72);
    expect(PR.yieldFromTest({ qty: 1, unit: "kg" }, { qty: 24, unit: "oz" })).toBe(68);
    expect(() => PR.yieldFromTest({ qty: 1, unit: "cup" }, { qty: 1, unit: "oz" })).toThrow(/Weigh/);
  });
});

describe("production plan workflow", () => {
  const D = "2026-11-16";
  function counted() {
    let s = ops.startSession(initialState(), D, "dinner", ["Veggfritata", "Chicken pot"]);
    s = ops.updateSession(s, D, "dinner", (x) => {
      for (let i = 0; i < 46; i++) x = C.tapSlip(x, x.options[i < 15 ? 0 : 1]!.key);
      return C.complete(x, []);
    });
    return ops.addRequest(s, { date: D, meal: "dinner", identifier: "Demo 104R", item: "Grilled cheese" });
  }

  it("creates a line per tally box and request group, live from the count", () => {
    const s = ops.ensurePlan(counted(), D, "dinner");
    const { plan, ctx } = ops.productionContext(s, D, "dinner");
    expect(plan!.lines.map((l) => l.label)).toEqual(["Veggfritata", "Chicken pot", "Grilled cheese (requests)"]);
    expect(plan!.lines.map((l) => PR.computeLine(l, ctx).servings)).toEqual([15, 31, 1]);
    expect(ops.ensurePlan(s, D, "dinner")).toBe(s); // idempotent
  });

  it("remembers portion/yield for the dish next time and keeps a history", () => {
    let s = ops.ensurePlan(counted(), D, "dinner");
    const id = ops.productionContext(s, D, "dinner").plan!.lines[1]!.id;
    s = ops.setLineSpec(s, D, "dinner", id, { portion: { qty: 1, unit: "cup" }, yieldPct: null, bufferPct: 5 });
    expect(s.workspaces.stann.productionDefaults["chicken pot"]).toMatchObject({ portion: { qty: 1, unit: "cup" }, bufferPct: 5 });
    expect(ops.productionContext(s, D, "dinner").plan!.history[0]!.text).toMatch(/portion 1 cup/);
    // next week, same box name → defaults applied
    let t = ops.startSession(s, "2026-11-23", "dinner", ["Chicken pot"]);
    t = ops.ensurePlan(t, "2026-11-23", "dinner");
    expect(ops.productionContext(t, "2026-11-23", "dinner").plan!.lines[0]!.portion).toEqual({ qty: 1, unit: "cup" });
  });

  it("requires reasons for overrides and validates specs", () => {
    let s = ops.ensurePlan(counted(), D, "dinner");
    const id = ops.productionContext(s, D, "dinner").plan!.lines[0]!.id;
    expect(() => ops.setServingsOverride(s, D, "dinner", id, 20, " ")).toThrow(/why/);
    expect(() => ops.setAmountOverride(s, D, "dinner", id, { qty: 5, unit: "lb" }, "")).toThrow(/why/);
    expect(() => ops.setLineSpec(s, D, "dinner", id, { portion: null, yieldPct: 140, bufferPct: 0 })).toThrow(/yield/);
    s = ops.setServingsOverride(s, D, "dinner", id, 20, "two trays for the 2nd floor");
    expect(ops.productionContext(s, D, "dinner").plan!.history[0]!.text).toMatch(/two trays/);
  });

  it("removed lines stay removed; manual lines can be added", () => {
    let s = ops.ensurePlan(counted(), D, "dinner");
    const req = ops.productionContext(s, D, "dinner").plan!.lines[2]!;
    s = ops.removePlanLine(s, D, "dinner", req.id);
    s = ops.ensurePlan(s, D, "dinner");
    expect(ops.productionContext(s, D, "dinner").plan!.lines).toHaveLength(2);
    s = ops.addPlanLine(s, D, "dinner", "Biscuits", { kind: "box", key: ops.productionContext(s, D, "dinner").boxes[1]!.key });
    const { plan, ctx } = ops.productionContext(s, D, "dinner");
    expect(PR.computeLine(plan!.lines[2]!, ctx).servings).toBe(31);
  });

  it("turns the plan into prep tasks once, updating quantities without touching done", () => {
    let s = ops.ensurePlan(counted(), D, "dinner");
    const id = ops.productionContext(s, D, "dinner").plan!.lines[1]!.id;
    s = ops.setLineSpec(s, D, "dinner", id, { portion: { qty: 1, unit: "cup" }, yieldPct: null, bufferPct: 0 });
    let r = ops.planToPrep(s, D, "dinner");
    expect(r.added).toBe(3);
    s = r.state;
    const task = s.workspaces.stann.prep.find((t) => t.title.includes("Chicken pot"))!;
    expect(task.title).toBe("31 × Chicken pot · make 7 3/4 qt");
    expect(task.done).toBe(false);
    r = ops.planToPrep(s, D, "dinner");
    expect(r).toMatchObject({ added: 0, updated: 0 });
  });
});

describe("readiness & temperatures", () => {
  it("ships with no limits; only reports against configured limits", () => {
    const s = initialState();
    expect(RD.evaluateTemp(120, s.workspaces.stann.settings.tempRules["hot-hold"])).toEqual({ kind: "no-rule" });
    expect(RD.evaluateTemp(120, { min: 135, max: null })).toMatchObject({ kind: "below" });
    expect(RD.evaluateTemp(140, { min: 135, max: null })).toMatchObject({ kind: "within" });
    expect(RD.evaluateTemp(45, { min: null, max: 41 })).toMatchObject({ kind: "above" });
  });

  it("limits need an explicit confirmation", () => {
    const s = initialState();
    expect(() => ops.setTempRules(s, RD.FOOD_CODE_REFERENCE, null)).toThrow(/Confirm/);
    const t = ops.setTempRules(s, RD.FOOD_CODE_REFERENCE, "Matches our HACCP plan, checked by dietary manager");
    expect(t.workspaces.stann.settings.tempRulesConfirmed?.note).toMatch(/HACCP/);
    expect(() => ops.setTempRules(s, { ...RD.NO_RULES, "cold-hold": { min: 50, max: 41 } }, "x")).toThrow(/above maximum/);
  });

  it("logs readings, never deletes them, and counts unresolved out-of-limit readings", () => {
    let s = ops.setTempRules(initialState(), RD.FOOD_CODE_REFERENCE, "approved");
    s = ops.addTemp(s, { date: "2026-11-16", meal: "dinner", item: "Pot pie", kind: "hot-hold", tempF: 128 });
    s = ops.addTemp(s, { date: "2026-11-16", meal: "dinner", item: "Pears", kind: "cold-hold", tempF: 38 });
    expect(ops.serviceStatus(s, "2026-11-16", "dinner").temps).toEqual({ logged: 2, outOfRange: 1 });
    expect(() => ops.voidTemp(s, s.workspaces.stann.temps[0]!.id, "")).toThrow();
    s = ops.voidTemp(s, s.workspaces.stann.temps[0]!.id, "wrong pan");
    expect(s.workspaces.stann.temps).toHaveLength(2);
    expect(ops.serviceStatus(s, "2026-11-16", "dinner").temps).toEqual({ logged: 1, outOfRange: 0 });
    expect(() => ops.addTemp(s, { date: "2026-11-16", meal: "dinner", item: "x", kind: "cook", tempF: 9999 })).toThrow();
  });

  it("checklist toggles per service", () => {
    let s = ops.toggleChecklist(initialState(), "2026-11-16", "dinner", "steam");
    expect(ops.serviceStatus(s, "2026-11-16", "dinner").ready.done).toBe(1);
    expect(ops.serviceStatus(s, "2026-11-17", "dinner").ready.done).toBe(0);
    s = ops.toggleChecklist(s, "2026-11-16", "dinner", "steam");
    expect(ops.serviceStatus(s, "2026-11-16", "dinner").ready.done).toBe(0);
  });
});
