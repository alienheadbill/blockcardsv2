import { newId, nowISO } from "../ids";
import { formatQty, scaleQuantity } from "./units";

export interface Ingredient {
  id: string;
  qty: number;
  unit: string;
  name: string;
  note?: string;
}

export interface RecipeVersion {
  at: string;
  note: string;
  snapshot: Omit<Recipe, "versions">;
}

export interface Recipe {
  id: string;
  name: string;
  category: string;
  yieldPortions: number;
  portionSize: string;
  ingredients: Ingredient[];
  steps: string[];
  equipment: string[];
  activeMinutes: number;
  totalMinutes: number;
  aheadNotes: string;
  safetyCheckpoints: string[];
  /** Allergens listed by the author. Must be verified against product labels. */
  allergens: string[];
  allergensVerified: boolean;
  /** Starter recipes are references only; facilities must use their approved versions. */
  source: "starter" | "user";
  facilityApproved: boolean;
  /** Optional cost per portion pieces used by the food-truck workspace. */
  costPerBatch?: number;
  versions: RecipeVersion[];
  updatedAt: string;
}

export function scaleRecipe(recipe: Recipe, portions: number, keepUnits = false) {
  if (!Number.isFinite(portions) || portions <= 0) throw new Error("Portions must be greater than zero");
  const factor = portions / recipe.yieldPortions;
  return {
    factor,
    ingredients: recipe.ingredients.map((ing) => {
      const s = scaleQuantity(ing.qty, ing.unit, factor, keepUnits);
      return { ...ing, qty: s.qty, unit: s.unit, display: `${formatQty(s.qty)} ${s.unit}` };
    }),
  };
}

export function reviseRecipe(recipe: Recipe, changes: Partial<Omit<Recipe, "id" | "versions">>, note: string): Recipe {
  const { versions, ...snapshot } = recipe;
  return {
    ...recipe,
    ...changes,
    source: recipe.source,
    versions: [...versions, { at: nowISO(), note: note.trim() || "Edited", snapshot }],
    updatedAt: nowISO(),
  };
}

export function searchRecipes(recipes: Recipe[], q: string): Recipe[] {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [...recipes].sort((a, b) => a.name.localeCompare(b.name));
  return recipes
    .filter((r) => {
      const hay = `${r.name} ${r.category} ${r.ingredients.map((i) => i.name).join(" ")}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

type Ing = [qty: number, unit: string, name: string, note?: string];

export function makeRecipe(r: Omit<Recipe, "id" | "ingredients" | "versions" | "updatedAt" | "allergensVerified" | "facilityApproved"> & { ingredients: Ing[] }): Recipe {
  return {
    ...r,
    id: newId("rec"),
    ingredients: r.ingredients.map(([qty, unit, name, note]) => ({ id: newId("ing"), qty, unit, name, ...(note ? { note } : {}) })),
    allergensVerified: false,
    facilityApproved: false,
    versions: [],
    updatedAt: nowISO(),
  };
}

const TEMP_NOTE = "Verify internal temperature meets the facility-approved standard and log it.";

/** Reference recipes for common menu items. Not facility-approved production recipes. */
export function starterRecipes(): Recipe[] {
  return [
    makeRecipe({
      name: "Chicken Pot Pie with Biscuit",
      category: "Entrée",
      yieldPortions: 10,
      portionSize: "1 cup filling + 1 biscuit",
      source: "starter",
      ingredients: [
        [2.5, "lb", "cooked chicken, diced"],
        [0.5, "cup", "butter"],
        [0.67, "cup", "all-purpose flour"],
        [1.5, "qt", "chicken stock"],
        [1, "cup", "milk"],
        [2, "cup", "onion, diced"],
        [1.5, "cup", "carrot, diced"],
        [1.5, "cup", "celery, diced"],
        [2, "cup", "frozen peas"],
        [1, "tsp", "dried thyme"],
        [1, "tsp", "salt"],
        [0.5, "tsp", "black pepper"],
        [10, "each", "biscuits", "baked or bake-off"],
      ],
      steps: [
        "Melt butter in a brazier or large pot. Sweat onion, carrot and celery until soft, 8–10 min.",
        "Sprinkle in flour and stir 2 minutes to cook the roux.",
        "Whisk in stock and milk gradually. Simmer, stirring, until thickened, about 10 min.",
        "Add chicken, peas, thyme, salt and pepper. Return to a simmer.",
        "Pan into a greased hotel pan. Top with biscuits, or serve filling with a biscuit on the side.",
        "Bake at 375 °F until biscuits are golden and filling bubbles, 20–25 min.",
      ],
      equipment: ["Brazier or stock pot", "Whisk", "Hotel pan", "Convection oven"],
      activeMinutes: 35,
      totalMinutes: 70,
      aheadNotes: "Filling can be made the day before, cooled per facility cooling procedure, and reheated.",
      safetyCheckpoints: [TEMP_NOTE + " (Poultry is commonly 165 °F.)", "Cool leftovers per facility two-stage cooling procedure."],
      allergens: ["Milk", "Wheat/Gluten"],
    }),
    makeRecipe({
      name: "American Chop Suey (Beef & Macaroni)",
      category: "Entrée",
      yieldPortions: 10,
      portionSize: "1 1/2 cups",
      source: "starter",
      ingredients: [
        [1, "lb", "elbow macaroni, dry"],
        [2.5, "lb", "ground beef"],
        [2, "cup", "onion, diced"],
        [1.5, "cup", "green pepper, diced"],
        [2, "qt", "crushed tomatoes"],
        [1, "tsp", "garlic powder"],
        [2, "tsp", "Italian seasoning"],
        [1, "tsp", "salt"],
        [0.5, "tsp", "black pepper"],
      ],
      steps: [
        "Cook macaroni until just tender; drain.",
        "Brown ground beef with onion and pepper; drain fat.",
        "Add tomatoes and seasonings; simmer 15 minutes.",
        "Fold in macaroni and heat through.",
      ],
      equipment: ["Stock pot", "Brazier", "Colander", "Hotel pan"],
      activeMinutes: 30,
      totalMinutes: 45,
      aheadNotes: "Sauce can be made a day ahead; cook pasta day of service.",
      safetyCheckpoints: [TEMP_NOTE + " (Ground beef is commonly 155–160 °F.)"],
      allergens: ["Wheat/Gluten"],
    }),
    makeRecipe({
      name: "Split Pea Soup",
      category: "Soup",
      yieldPortions: 10,
      portionSize: "8 fl oz",
      source: "starter",
      ingredients: [
        [1, "lb", "dried split peas, rinsed"],
        [2, "qt", "chicken or ham stock"],
        [2, "cup", "water"],
        [1.5, "cup", "onion, diced"],
        [1, "cup", "carrot, diced"],
        [1, "cup", "celery, diced"],
        [8, "oz", "ham, diced"],
        [2, "tbsp", "vegetable oil"],
        [1, "each", "bay leaf"],
        [0.5, "tsp", "black pepper"],
      ],
      steps: [
        "Sweat onion, carrot and celery in oil until soft.",
        "Add peas, stock, water and bay leaf. Simmer, stirring often, until peas break down, 60–75 min.",
        "Remove bay leaf. Add ham and pepper; season to taste. Thin with stock if needed.",
      ],
      equipment: ["Stock pot", "Ladle", "Immersion blender (optional)"],
      activeMinutes: 20,
      totalMinutes: 90,
      aheadNotes: "Excellent made a day ahead; thickens when chilled — thin when reheating.",
      safetyCheckpoints: [TEMP_NOTE, "Stir often — thick soups scorch and cool unevenly."],
      allergens: [],
    }),
    makeRecipe({
      name: "Macaroni and Cheese",
      category: "Entrée",
      yieldPortions: 10,
      portionSize: "1 cup",
      source: "starter",
      ingredients: [
        [1.25, "lb", "elbow macaroni, dry"],
        [0.5, "cup", "butter"],
        [0.5, "cup", "all-purpose flour"],
        [1.5, "qt", "milk"],
        [1.5, "lb", "cheddar, shredded"],
        [1, "tsp", "salt"],
        [0.5, "tsp", "dry mustard"],
      ],
      steps: [
        "Cook macaroni until just tender; drain.",
        "Make a roux with butter and flour, 2 min. Whisk in milk; simmer until thickened.",
        "Off heat, stir in cheese, salt and mustard until smooth.",
        "Fold in macaroni. Pan and bake at 350 °F for 20 min, or serve from the stove.",
      ],
      equipment: ["Stock pot", "Sauce pot", "Whisk", "Hotel pan"],
      activeMinutes: 30,
      totalMinutes: 50,
      aheadNotes: "Cheese sauce can be made ahead and held cold; combine and bake day of service.",
      safetyCheckpoints: [TEMP_NOTE],
      allergens: ["Milk", "Wheat/Gluten"],
    }),
    makeRecipe({
      name: "Meatloaf",
      category: "Entrée",
      yieldPortions: 10,
      portionSize: "4 oz cooked slice",
      source: "starter",
      ingredients: [
        [3, "lb", "ground beef"],
        [1.5, "cup", "breadcrumbs"],
        [0.75, "cup", "milk"],
        [3, "each", "eggs"],
        [1, "cup", "onion, finely diced"],
        [2, "tbsp", "Worcestershire sauce"],
        [1.5, "tsp", "salt"],
        [0.5, "tsp", "black pepper"],
        [0.75, "cup", "ketchup", "for glaze"],
      ],
      steps: [
        "Soak breadcrumbs in milk 5 min. Mix with eggs, onion, Worcestershire, salt and pepper.",
        "Add beef and mix just until combined.",
        "Shape into loaves in a sheet or loaf pan. Spread ketchup on top.",
        "Bake at 350 °F about 60 min. Rest 10 min before slicing.",
      ],
      equipment: ["Mixing bowl", "Loaf or sheet pan", "Oven", "Probe thermometer"],
      activeMinutes: 20,
      totalMinutes: 85,
      aheadNotes: "Mix and shape the day before; keep refrigerated until baking.",
      safetyCheckpoints: [TEMP_NOTE + " (Ground beef is commonly 155–160 °F.)"],
      allergens: ["Egg", "Milk", "Wheat/Gluten", "Fish (some Worcestershire)"],
    }),
    makeRecipe({
      name: "Lasagna",
      category: "Entrée",
      yieldPortions: 12,
      portionSize: "1 square (1/12 hotel pan)",
      source: "starter",
      ingredients: [
        [1, "lb", "lasagna noodles"],
        [2, "lb", "ground beef"],
        [2, "qt", "marinara sauce"],
        [2, "lb", "ricotta"],
        [1, "lb", "mozzarella, shredded"],
        [0.5, "cup", "parmesan, grated"],
        [2, "each", "eggs"],
        [1, "tsp", "Italian seasoning"],
      ],
      steps: [
        "Cook noodles until just tender; drain and lay flat.",
        "Brown beef; drain and combine with marinara.",
        "Mix ricotta, eggs, half the parmesan and the seasoning.",
        "Layer sauce, noodles, ricotta, mozzarella in a hotel pan — 3 layers, ending with sauce and cheese.",
        "Cover and bake at 375 °F for 45 min; uncover 15 min. Rest 15 min before cutting.",
      ],
      equipment: ["Stock pot", "Brazier", "Full hotel pan", "Foil"],
      activeMinutes: 45,
      totalMinutes: 120,
      aheadNotes: "Assemble the day before and refrigerate; add 15 min to bake time.",
      safetyCheckpoints: [TEMP_NOTE],
      allergens: ["Milk", "Egg", "Wheat/Gluten"],
    }),
    makeRecipe({
      name: "Chicken Noodle Soup",
      category: "Soup",
      yieldPortions: 10,
      portionSize: "8 fl oz",
      source: "starter",
      ingredients: [
        [2.5, "qt", "chicken stock"],
        [1.5, "lb", "cooked chicken, diced"],
        [1, "cup", "onion, diced"],
        [1, "cup", "carrot, diced"],
        [1, "cup", "celery, diced"],
        [6, "oz", "egg noodles, dry"],
        [1, "tbsp", "vegetable oil"],
        [1, "tsp", "dried thyme"],
        [0.5, "tsp", "black pepper"],
      ],
      steps: [
        "Sweat onion, carrot and celery in oil until soft.",
        "Add stock and thyme; simmer 15 min.",
        "Add noodles; cook until just tender.",
        "Add chicken and pepper; season to taste and heat through.",
      ],
      equipment: ["Stock pot", "Ladle"],
      activeMinutes: 20,
      totalMinutes: 45,
      aheadNotes: "Make the broth and vegetables ahead; add noodles close to service so they don't bloat.",
      safetyCheckpoints: [TEMP_NOTE + " (Poultry is commonly 165 °F.)"],
      allergens: ["Egg", "Wheat/Gluten"],
    }),
  ];
}
