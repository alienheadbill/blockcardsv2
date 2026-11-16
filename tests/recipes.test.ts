import { describe, expect, it } from "vitest";
import { scaleRecipe, searchRecipes, starterRecipes, reviseRecipe } from "@/lib/recipes/recipes";
import { convert, formatQty, friendly } from "@/lib/recipes/units";

describe("units", () => {
  it("converts within a dimension", () => {
    expect(convert(1, "gal", "cup")).toBe(16);
    expect(convert(3, "tsp", "tbsp")).toBe(1);
    expect(convert(2, "lb", "oz")).toBe(32);
  });
  it("never converts between weight and volume", () => {
    expect(() => convert(1, "lb", "cup")).toThrow(/ingredient-specific/);
    expect(() => convert(1, "each", "cup")).toThrow();
  });
  it("picks readable units", () => {
    expect(friendly(24, "cup")).toEqual({ qty: 6, unit: "qt" });
    expect(friendly(48, "cup")).toEqual({ qty: 3, unit: "gal" });
    expect(friendly(6, "tsp")).toEqual({ qty: 2, unit: "tbsp" });
    expect(friendly(40, "oz")).toEqual({ qty: 2.5, unit: "lb" });
  });
  it("formats kitchen fractions", () => {
    expect(formatQty(2.5)).toBe("2 1/2");
    expect(formatQty(0.333)).toBe("1/3");
    expect(formatQty(3)).toBe("3");
    expect(formatQty(1.99)).toBe("2");
    expect(formatQty(25.04)).toBe("25");
  });
});

describe("recipes", () => {
  const potPie = () => starterRecipes().find((r) => r.name.startsWith("Chicken Pot Pie"))!;

  it("scales 10 → 50 portions", () => {
    const s = scaleRecipe(potPie(), 50);
    expect(s.factor).toBe(5);
    const chicken = s.ingredients.find((i) => i.name.startsWith("cooked chicken"))!;
    expect(chicken).toMatchObject({ qty: 12.5, unit: "lb" });
    const stock = s.ingredients.find((i) => i.name === "chicken stock")!;
    expect(stock.display).toBe("7 1/2 qt");
    const biscuits = s.ingredients.find((i) => i.name === "biscuits")!;
    expect(biscuits.display).toBe("50 each");
  });

  it("can keep the original units", () => {
    const s = scaleRecipe(potPie(), 50, true);
    expect(s.ingredients.find((i) => i.name === "chicken stock")).toMatchObject({ qty: 7.5, unit: "qt" });
  });

  it("rejects bad portion counts", () => {
    expect(() => scaleRecipe(potPie(), 0)).toThrow();
  });

  it("starter recipes are never marked facility-approved or allergen-verified", () => {
    for (const r of starterRecipes()) {
      expect(r.facilityApproved).toBe(false);
      expect(r.allergensVerified).toBe(false);
    }
  });

  it("searches by name and ingredient", () => {
    const all = starterRecipes();
    expect(searchRecipes(all, "soup").map((r) => r.name)).toEqual(["Chicken Noodle Soup", "Split Pea Soup"]);
    expect(searchRecipes(all, "ricotta").map((r) => r.name)).toEqual(["Lasagna"]);
  });

  it("keeps version history on revision", () => {
    const r = potPie();
    const r2 = reviseRecipe(r, { yieldPortions: 12 }, "Bigger pans");
    expect(r2.versions).toHaveLength(1);
    expect(r2.versions[0]!.snapshot.yieldPortions).toBe(10);
  });
});
