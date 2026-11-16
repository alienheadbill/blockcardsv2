import { describe, expect, it } from "vitest";
import { FALL_WINTER } from "@/lib/menu/fallWinter";
import * as P from "@/lib/prep";
import * as R from "@/lib/requests";

describe("special requests", () => {
  const base = { date: "2026-11-16", meal: "dinner" as const };

  it("validates required fields", () => {
    expect(() => R.createRequest({ ...base, identifier: "", item: "PB&J" })).toThrow();
    expect(() => R.createRequest({ ...base, identifier: "Demo 101", item: " " })).toThrow();
    expect(() => R.createRequest({ ...base, identifier: "Demo 101", item: "PB&J", quantity: 0 })).toThrow();
  });

  it("starts unverified and not started — the app never verifies on its own", () => {
    const r = R.createRequest({ ...base, identifier: "Demo 101", item: "PB&J" });
    expect(r.verification).toBe("unverified");
    expect(r.status).toBe("not_started");
    expect(R.needsAttention(r)).toBe(true);
    expect(() => R.markVerified(r, "")).toThrow(/initials/);
    const v = R.markVerified(r, "BR");
    expect(v.verification).toBe("verified");
    expect(v.verifiedBy).toBe("BR");
  });

  it("flagged requests cannot be served", () => {
    const r = R.flagForReview(R.createRequest({ ...base, identifier: "Demo 203", item: "Quiche" }), "Slip says no dairy");
    expect(() => R.setStatus(r, "served")).toThrow(/flagged/);
    expect(R.setStatus(r, "preparing").status).toBe("preparing");
  });

  it("groups identical dishes but keeps requests distinguishable", () => {
    const reqs = [
      R.createRequest({ ...base, identifier: "Demo 204", item: "Cheeseburger" }),
      R.createRequest({ ...base, identifier: "Demo 110", item: "cheeseburger ", quantity: 2 }),
      R.createRequest({ ...base, identifier: "Demo 208", item: "Veg salad" }),
      R.setStatus(R.createRequest({ ...base, identifier: "Demo 103", item: "Veg salad" }), "cancelled"),
    ];
    const groups = R.groupRequests(reqs);
    expect(groups[0]).toMatchObject({ item: "Cheeseburger", totalQuantity: 3 });
    expect(groups[0]!.requests.map((r) => r.identifier)).toEqual(["Demo 204", "Demo 110"]);
    expect(groups[1]).toMatchObject({ item: "Veg salad", totalQuantity: 1 });
  });
});

describe("prep", () => {
  it("creates, toggles and un-toggles tasks", () => {
    const t = P.createTask({ date: "2026-11-16", title: "Cup pears", meal: "dinner" });
    expect(t.done).toBe(false);
    const d = P.toggleDone(t);
    expect(d.done).toBe(true);
    expect(d.doneAt).toBeTruthy();
    const u = P.toggleDone(d);
    expect(u.done).toBe(false);
    expect(u.doneAt).toBeUndefined();
    expect(() => P.createTask({ date: "2026-11-16", title: "x", startTime: "7:30pm" })).toThrow();
  });

  it("suggests tasks from the menu — never pre-completed", () => {
    const menu = FALL_WINTER.weeks[1]!.days[1]!.dinner;
    const s = P.suggestForMeal("2026-11-16", "dinner", menu);
    const titles = s.map((x) => x.title);
    expect(titles).toContain("Prep Chicken Pot Pie");
    expect(titles).toContain("Cup Pears");
    expect(titles).toContain("Plate / bag Cookie");
    // chicken is a protein → day-ahead pull
    expect(s.find((x) => x.title.startsWith("Pull to thaw"))?.date).toBe("2026-11-15");
    const tasks = s.map((x) => P.createTask({ ...x, source: "suggested", suggestionKey: x.key }));
    expect(tasks.every((t) => !t.done)).toBe(true);
    expect(P.pendingSuggestions(s, tasks.slice(0, 1), [s[1]!.key])).toHaveLength(s.length - 2);
  });

  it("schedules gelatin the day before", () => {
    const menu = FALL_WINTER.weeks[0]!.days[3]!.dinner; // Orange Mandarin Jello
    const jello = P.suggestForMeal("2026-11-11", "dinner", menu).find((x) => /Jello/.test(x.title));
    expect(jello?.date).toBe("2026-11-10");
  });

  it("skips the standing breakfast extras", () => {
    const menu = FALL_WINTER.weeks[0]!.days[0]!.breakfast;
    expect(P.suggestForMeal("2026-11-08", "breakfast", menu).some((x) => /Danish/.test(x.title))).toBe(false);
  });
});
