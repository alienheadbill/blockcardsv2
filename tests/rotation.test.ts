import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { FALL_WINTER } from "@/lib/menu/fallWinter";
import { flaggedItems, resolveMeal, rotationPosition } from "@/lib/menu/rotation";
import { MEAL_SERVICES } from "@/lib/menu/types";

const rotation = { seasonId: "fall-winter", week1Start: "2026-11-08", confirmed: true, note: "" };

describe("menu transcription", () => {
  it("has 4 weeks × 7 days × 3 meals, each with at least one entrée", () => {
    expect(FALL_WINTER.weeks).toHaveLength(4);
    for (const w of FALL_WINTER.weeks) {
      expect(w.days).toHaveLength(7);
      for (const day of w.days)
        for (const meal of MEAL_SERVICES) {
          expect(day[meal].some((i) => i.kind === "main" || i.kind === "alt")).toBe(true);
        }
    }
  });

  it("keeps ids unique", () => {
    const ids = FALL_WINTER.weeks.flatMap((w) => w.days.flatMap((d) => MEAL_SERVICES.flatMap((m) => d[m].map((i) => i.id))));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("preserves main / alternate / dessert / fruit distinctions", () => {
    const monDinner = FALL_WINTER.weeks[1]!.days[1]!.dinner;
    expect(monDinner.map((i) => [i.kind, i.text])).toEqual([
      ["main", "Vegetable Frittata, Hash Pattie"],
      ["alt", "Chicken Pot Pie with Biscuit"],
      ["fruit", "Pears"],
      ["dessert", "Cookie"],
    ]);
  });

  it("flags uncertain entries for review", () => {
    const flagged = flaggedItems(FALL_WINTER, {});
    expect(flagged.length).toBeGreaterThan(5);
    expect(flagged.some((f) => f.week === 3 && f.item.text.startsWith("Seafood Salad"))).toBe(true);
    // a reviewed correction clears the flag
    const target = flagged[0]!.item;
    const after = flaggedItems(FALL_WINTER, { [target.id]: { text: target.text, kind: target.kind, reviewed: true } });
    expect(after.length).toBe(flagged.length - 1);
  });
});

describe("rotation", () => {
  it("returns null with no anchor (never guesses)", () => {
    expect(rotationPosition("2026-11-16", { week1Start: null }, 4)).toBeNull();
  });

  it("requires Week 1 to start on Sunday", () => {
    expect(() => rotationPosition("2026-11-16", { week1Start: "2026-11-09" }, 4)).toThrow();
  });

  it("maps the photographed slip date (Mon 16th) to Week 2 Monday", () => {
    expect(rotationPosition("2026-11-16", rotation, 4)).toEqual({ week: 2, dayIndex: 1, dayName: "Monday" });
  });

  it("cycles every 28 days, including dates before the anchor", () => {
    expect(rotationPosition("2026-11-08", rotation, 4)!.week).toBe(1);
    expect(rotationPosition("2026-12-05", rotation, 4)).toMatchObject({ week: 4, dayName: "Saturday" });
    expect(rotationPosition("2026-12-06", rotation, 4)).toMatchObject({ week: 1, dayName: "Sunday" });
    expect(rotationPosition("2026-11-07", rotation, 4)).toMatchObject({ week: 4, dayName: "Saturday" });
    for (let i = 0; i < 200; i++) {
      const d = addDays("2026-01-01", i);
      expect(rotationPosition(d, rotation, 4)).toEqual(rotationPosition(addDays(d, 28), rotation, 4));
    }
  });

  it("is not shifted by daylight saving time changes", () => {
    // US DST ended 2026-11-01; 2027-03-14 it starts
    expect(rotationPosition("2027-03-14", rotation, 4)!.dayName).toBe("Sunday");
    expect(rotationPosition("2027-03-15", rotation, 4)!.dayName).toBe("Monday");
  });

  it("applies overrides without touching the master rotation", () => {
    const base = { season: FALL_WINTER, rotation, corrections: {}, date: "2026-11-16", meal: "dinner" as const };
    const overridden = resolveMeal({
      ...base,
      overrides: { "2026-11-16|dinner": { items: [{ id: "o", kind: "main", printedLabel: "", text: "Beef Stew" }], reason: "delivery", at: "" } },
    });
    expect(overridden.source).toBe("override");
    expect(overridden.items[0]!.text).toBe("Beef Stew");
    const normal = resolveMeal({ ...base, overrides: {} });
    expect(normal.items[0]!.text).toBe("Vegetable Frittata, Hash Pattie");
    const nextCycle = resolveMeal({ ...base, date: "2026-12-14", overrides: overridden ? {} : {} });
    expect(nextCycle.items[0]!.text).toBe("Vegetable Frittata, Hash Pattie");
  });
});
