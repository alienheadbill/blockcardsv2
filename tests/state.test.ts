import { describe, expect, it } from "vitest";
import * as C from "@/lib/counting";
import { exportFull, exportWorkspace, restore } from "@/lib/state/backup";
import { initialState } from "@/lib/state/model";
import * as ops from "@/lib/state/ops";

const DATE = "2026-11-16";

describe("app state", () => {
  it("starts with an unconfirmed (suggested) rotation anchor", () => {
    const s = initialState();
    expect(s.workspaces.stann.rotation.confirmed).toBe(false);
    expect(ops.mealFor(s, DATE, "dinner").position).toMatchObject({ week: 2, dayName: "Monday" });
  });

  it("runs a full count through ops, with audit entries", () => {
    let s = ops.startSession(initialState(), DATE, "dinner");
    const session = ops.getSession(s, DATE, "dinner")!;
    const [main, alt] = session.options;
    for (let i = 0; i < 15; i++) s = ops.updateSession(s, DATE, "dinner", (x) => C.tapSlip(x, main!.key));
    for (let i = 0; i < 31; i++) s = ops.updateSession(s, DATE, "dinner", (x) => C.tapSlip(x, alt!.key));
    s = ops.updateSession(s, DATE, "dinner", C.undo);
    const sum = C.summarize(ops.getSession(s, DATE, "dinner")!);
    expect(sum.totalMeals).toBe(45);
    expect(s.workspaces.stann.audit.some((a) => a.action === "count.start")).toBe(true);
  });

  it("does not start a count without a menu", () => {
    const s0 = initialState();
    const s = { ...s0, workspaces: { ...s0.workspaces, stann: { ...s0.workspaces.stann, rotation: { ...s0.workspaces.stann.rotation, week1Start: null } } } };
    expect(() => ops.startSession(s, DATE, "dinner")).toThrow(/rotation/);
  });

  it("keeps workspaces isolated", () => {
    let s = initialState();
    s = ops.addPrepTask(s, "stann", { date: DATE, title: "Make Jello" });
    s = ops.addPrepTask(s, "truck", { date: DATE, title: "Ball burgers" });
    s = ops.addRequest(s, { date: DATE, meal: "dinner", identifier: "Demo 104", item: "Grilled cheese" });
    expect(s.workspaces.stann.prep.map((t) => t.title)).toEqual(["Make Jello"]);
    expect(s.workspaces.truck.prep.map((t) => t.title)).toEqual(["Ball burgers"]);
    expect(s.workspaces.home.prep).toEqual([]);
    expect(JSON.stringify(s.workspaces.truck)).not.toContain("Demo 104");
    expect(JSON.stringify(s.workspaces.home)).not.toContain("Demo 104");
  });

  it("round-trips a full backup", () => {
    let s = ops.startSession(initialState(), DATE, "lunch");
    s = ops.addRequest(s, { date: DATE, meal: "lunch", identifier: "Demo 207", item: "Chef salad" });
    const raw = JSON.stringify(exportFull(s));
    const res = restore(initialState(), raw);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.state).toEqual(s);
  });

  it("restores a workspace backup only into its own workspace", () => {
    let s = ops.addPrepTask(initialState(), "truck", { date: DATE, title: "Cut lemons" });
    const raw = JSON.stringify(exportWorkspace(s, "truck"));
    expect(restore(initialState(), raw, "home").ok).toBe(false);
    const res = restore(initialState(), raw, "truck");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.state.workspaces.truck.prep[0]!.title).toBe("Cut lemons");
      expect(res.state.workspaces.stann.prep).toEqual([]);
    }
  });

  it("rejects garbage and tampered backups", () => {
    expect(restore(initialState(), "not json").ok).toBe(false);
    expect(restore(initialState(), JSON.stringify({ hello: 1 })).ok).toBe(false);
    const bad = exportFull(initialState()) as { data: { workspaces: { stann: { counts: unknown } } } };
    bad.data.workspaces.stann.counts = { x: { id: 1 } };
    expect(restore(initialState(), JSON.stringify(bad)).ok).toBe(false);
  });

  it("menu overrides need a reason and an entrée, and can be cleared", () => {
    const s0 = initialState();
    expect(() => ops.setOverride(s0, DATE, "dinner", [{ kind: "main", text: "Stew" }], "")).toThrow();
    expect(() => ops.setOverride(s0, DATE, "dinner", [{ kind: "dessert", text: "Cake" }], "x")).toThrow();
    let s = ops.setOverride(s0, DATE, "dinner", [{ kind: "main", text: "Beef Stew" }], "Short on eggs");
    expect(ops.mealFor(s, DATE, "dinner").items[0]!.text).toBe("Beef Stew");
    s = ops.clearOverride(s, DATE, "dinner");
    expect(ops.mealFor(s, DATE, "dinner").items[0]!.text).toBe("Vegetable Frittata, Hash Pattie");
  });

  it("menu corrections are versioned", () => {
    const s0 = initialState();
    const item = ops.mealFor(s0, DATE, "dinner").items[0]!;
    const s = ops.correctMenuItem(s0, item, { text: "Vegetable Frittata, Hash Brown Patty", kind: "main", reviewed: true }, "spelling");
    expect(ops.mealFor(s, DATE, "dinner").items[0]!.text).toBe("Vegetable Frittata, Hash Brown Patty");
    expect(s.workspaces.stann.menuHistory[0]).toMatchObject({ before: { text: item.text }, note: "spelling" });
  });

  it("builds a restock list from par levels", () => {
    const s = ops.restockFromInventory(initialState(), "truck");
    const names = s.workspaces.truck.shopping.map((x) => x.name);
    expect(names).toContain("Potato buns");
    expect(names).not.toContain("American cheese"); // above par
    // idempotent
    expect(ops.restockFromInventory(s, "truck").workspaces.truck.shopping).toHaveLength(names.length);
  });

  it("summarizes food-truck sales with portion cost", () => {
    let s = initialState();
    const burger = s.workspaces.truck.menu[0]!;
    const fries = s.workspaces.truck.menu[2]!;
    s = ops.addTicket(s, DATE, [{ menuItemId: burger.id, qty: 2 }, { menuItemId: fries.id, qty: 1 }]);
    s = ops.addTicket(s, DATE, [{ menuItemId: burger.id, qty: 1 }]);
    expect(s.workspaces.truck.tickets.map((t) => t.number)).toEqual([1, 2]);
    const sum = ops.truckDaySummary(s, DATE);
    expect(sum).toMatchObject({ tickets: 2, items: 4, revenue: 33 });
    expect(sum.rows[0]).toMatchObject({ name: "Smash Burger", qty: 3 });
    expect(sum.rows[0]!.cost).toBeCloseTo(7.05);
  });
});
