import { describe, expect, it } from "vitest";
import { equivalents, findDensity, parseAmount } from "@/lib/recipes/convert";
import { scaleRecipe, starterRecipes } from "@/lib/recipes/recipes";
import { convert, metric } from "@/lib/recipes/units";
import { initialState, migrate } from "@/lib/state/model";
import * as ops from "@/lib/state/ops";

const text = (rows: { text: string }[]) => rows.map((r) => r.text);

describe("units", () => {
  it("converts US and metric exactly", () => {
    expect(convert(8, "fl oz", "cup")).toBe(1);
    expect(convert(1, "pt", "cup")).toBe(2);
    expect(convert(1, "cup", "ml")).toBeCloseTo(236.588, 2);
    expect(convert(1, "lb", "g")).toBeCloseTo(453.592, 2);
    expect(convert(1, "kg", "lb")).toBeCloseTo(2.2046, 3);
    expect(metric(2.5, "lb")).toMatchObject({ unit: "kg" });
  });
});

describe("converter", () => {
  it("8 oz (weight) of elbow macaroni ≈ 2 cups, and explains fluid ounces", () => {
    const r = equivalents(8, "oz", "elbow macaroni");
    expect(text(r.exact)).toEqual(["1/2 lb", "227 g"]);
    expect(r.density?.name).toBe("Elbow macaroni (dry)");
    expect(r.approx[0]!.text).toBe("2 cup");
    expect(r.notes.join(" ")).toMatch(/8 fl oz = 1 cup/);
  });

  it("8 fl oz is exactly 1 cup", () => {
    const r = equivalents(8, "fl oz");
    expect(text(r.exact)).toContain("1 cup");
    expect(text(r.exact)).toContain("16 tbsp");
    expect(r.approx).toEqual([]);
  });

  it("cups of a known ingredient → weight", () => {
    const r = equivalents(1, "cup", "cheddar, shredded");
    expect(text(r.approx)).toContain("4 oz");
  });

  it("matches the most specific ingredient and recipe-style names", () => {
    expect(findDensity("buttermilk")!.name).toBe("Buttermilk");
    expect(findDensity("milk")!.name).toBe("Milk");
    expect(findDensity("cooked chicken, diced")!.name).toBe("Cooked chicken, diced");
    expect(findDensity("onion, diced")!.name).toBe("Onion, diced");
    expect(findDensity("lasagna noodles")).toBeNull();
    expect(findDensity("dried thyme")).toBeNull();
  });

  it("never guesses weight↔volume for unknown ingredients", () => {
    const r = equivalents(2, "lb", "mystery mix");
    expect(r.approx).toEqual([]);
    expect(r.notes.join(" ")).toMatch(/No weight↔volume conversion/);
  });

  it("the cook's own conversion wins over the table", () => {
    let s = ops.saveConversion(initialState(), "Elbow macaroni", { qty: 1, unit: "cup" }, { qty: 5, unit: "oz" });
    const r = equivalents(10, "oz", "elbow macaroni", s.conversions);
    expect(r.density?.source).toBe("custom");
    expect(r.approx[0]!.text).toBe("2 cup");
    expect(() => ops.saveConversion(s, "x", { qty: 1, unit: "oz" }, { qty: 1, unit: "oz" })).toThrow();
    s = ops.deleteConversion(s, s.conversions[0]!.id);
    expect(s.conversions).toEqual([]);
  });

  it("counted units are not converted", () => {
    expect(equivalents(3, "each").notes[0]).toMatch(/counted/);
  });

  it("parses kitchen amounts", () => {
    expect(parseAmount("1 1/2")).toBe(1.5);
    expect(parseAmount("3/4")).toBe(0.75);
    expect(parseAmount("1½")).toBe(1.5);
    expect(parseAmount(".5")).toBe(0.5);
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("1/0")).toBeNull();
  });
});

describe("recipe unit modes", () => {
  const potPie = () => starterRecipes().find((r) => r.name.startsWith("Chicken Pot Pie"))!;
  it("shows recipes in kitchen, as-written or metric units", () => {
    const stock = (mode: "kitchen" | "original" | "metric") => scaleRecipe(potPie(), 50, mode).ingredients.find((i) => i.name === "chicken stock")!.display;
    expect(stock("kitchen")).toBe("7 1/2 qt");
    expect(stock("original")).toBe("7 1/2 qt");
    expect(stock("metric")).toBe("7.1 L");
    const chicken = scaleRecipe(potPie(), 10, "metric").ingredients.find((i) => i.name.startsWith("cooked chicken"))!;
    expect(chicken.display).toBe("1.13 kg");
  });
});

it("migrates v3 data by adding an empty conversions list", () => {
  const v3 = JSON.parse(JSON.stringify(initialState()));
  v3.schemaVersion = 3;
  delete v3.conversions;
  expect(migrate(v3)).toMatchObject({ schemaVersion: 4, conversions: [] });
});
