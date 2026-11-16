/**
 * Fall/Winter 4-week rotating menu, transcribed from the four photographed
 * sheets supplied by the cook (IMG_2229–IMG_2232).
 *
 * Transcription rules
 *  - Text is kept as printed, including the sheet's own spellings
 *    ("Lemmon", "Banans", "Ruben", "Cordon Blue", "Marsh mellows").
 *    Cooks can correct any line from the Menu screen; corrections are versioned.
 *  - Anything partially hidden by glare, unlabeled, or ambiguous carries a
 *    `!!` note and shows a ⚠ review flag in the app until a person marks it reviewed.
 *  - Nothing unreadable has been filled in from guesswork.
 *  - Confirmed with the cook (11/16/2026): the first-listed entrée is always the main,
 *    "Fish Sticks, Tater Tots" (W3 Mon dinner) is the alternate, and the W3 Wed dinner
 *    "F: Ice Cream Sandwich" is a dessert (printed F by mistake). Breakfast/lunch glare
 *    notes were dropped because the cook works dinner.
 *
 * Line syntax:  "<prefix>:<text> !! <review note>"
 *   prefixes: main | soup | side | A (alt) | D (dessert) | F (fruit) | S (salad)
 */
import type { DayMenu, MenuItem, MenuItemKind, MenuSeason, MenuWeek, MealService } from "./types";

type Lines = string[];
type RawDay = [breakfast: Lines, lunch: Lines, dinner: Lines];

const PREFIX: Record<string, { kind: MenuItemKind; printed: string }> = {
  main: { kind: "main", printed: "" },
  soup: { kind: "soup", printed: "" },
  side: { kind: "side", printed: "" },
  A: { kind: "alt", printed: "A" },
  D: { kind: "dessert", printed: "D" },
  F: { kind: "fruit", printed: "F" },
  S: { kind: "salad", printed: "S" },
};

// Standing breakfast alternate printed on every day of every week.
const BKF_ALT = ["A:Scrambled Eggs", "side:Danish - Doughnut - Yogurt"];

function parse(line: string, id: string): MenuItem {
  const idx = line.indexOf(":");
  const prefix = line.slice(0, idx);
  const spec = PREFIX[prefix];
  if (!spec) throw new Error(`Unknown menu prefix "${prefix}" in ${id}`);
  const [text, flag] = line.slice(idx + 1).split(" !! ");
  const item: MenuItem = { id, kind: spec.kind, printedLabel: spec.printed, text: text!.trim() };
  if (flag) item.flag = flag.trim();
  return item;
}

function buildWeek(week: number, raw: RawDay[], source: string, flag?: string): MenuWeek {
  const meals: MealService[] = ["breakfast", "lunch", "dinner"];
  const days: DayMenu[] = raw.map((day, d) => {
    const out = {} as DayMenu;
    meals.forEach((meal, m) => {
      const items = day[m]!.map((line, i) => parse(line, `fw-w${week}-d${d}-${meal}-${i}`));
      // The first-listed entrée is always the main (sheets sometimes label it "A:" by mistake).
      const first = items.find((it) => it.kind === "main" || it.kind === "alt");
      if (first && !items.some((it) => it.kind === "main")) {
        first.kind = "main";
        first.printedLabel = "";
      }
      out[meal] = items;
    });
    return out;
  });
  if (days.length !== 7) throw new Error(`Week ${week} must have 7 days`);
  return { week, days, source, ...(flag ? { flag } : {}) };
}

const WEEK_1: RawDay[] = [
  // Sunday
  [
    ["main:Vegetable Egg Scramble, Bacon and Raisin Toast", ...BKF_ALT],
    ["main:Tortellini Chicken Broccoli Alfredo", "A:Turkey Vegetable Stew w/ a Biscuit", "D:Tiramisu"],
    ["soup:Split Pea Soup", "main:Tuna w/ Lettuce Sandwich, Pickles & Chips", "A:American Chopped Suey", "F:Fruit Cocktail"],
  ],
  // Monday
  [
    ["main:Western Omelet / Home Fries & Toast", ...BKF_ALT],
    ["main:Roast Turkey, Mashed Potato, Carrots & Beets", "A:Baked Salmon, Mashed Potato, Carrots & Beets", "D:Sweet Potato Pie"],
    ["soup:Chicken Noodle Soup", "main:Lasagna, Tomato Sauce & Cheese w/ Broccoli, Garlic Bread", "A:Grilled Dijon Chicken Sandwich w/ Lettuce & Tomato", "D:Apricot Fluff"],
  ],
  // Tuesday
  [
    ["main:Pancakes and Bacon", ...BKF_ALT],
    ["main:Blackened Salsa Chicken / Sweet Potato, Spinach", "A:Baked Ham with Glaze, Spinach & Sweet Potato", "D:Strawberry Parfait"],
    ["soup:Butternut Squash Soup", "main:Roast Beef & Cheese, Lettuce, Tomato & Pickle", "A:Broccoli Quiche w/ Hash Brown Patty", "D:Harvest Cake"],
  ],
  // Wednesday
  [
    ["main:Egg, Ham and Cheese on a Croissant / with Fruit", ...BKF_ALT],
    ["main:Shrimp Scampi over Pasta, Asparagus", "A:Beef Pepper Steak over Rice", "D:Iced Chocolate Cake"],
    ["main:Sloppy Joe on a Bun, Sweet Potato Puffs", "A:Chili Mac and Cheese", "F:Orange Mandarin Jello"],
  ],
  // Thursday
  [
    ["main:Waffle, Sausage Link", ...BKF_ALT],
    ["main:Meat Loaf, Scalloped Potato, Green Beans", "A:Garlic Crusted Pork Loin w/ Scalloped Potato & Green Beans", "D:Ice Cream"],
    ["soup:Vegetable Soup", "main:Turkey Burger, Lettuce, Tomato, French Fries", "A:Fish Sticks, French Fries, Coleslaw", "D:Cookie"],
  ],
  // Friday
  [
    ["main:Egg Scrambled, Biscuit & Sausage Gravy", ...BKF_ALT],
    ["main:Baked Haddock, Brussels Sprouts, Delmonico Potatoes", "A:Chicken Florentine w/ Spinach", "D:Pie of the Day"],
    ["soup:Tomato Soup", "main:Grilled Cheese, Tomato & Pesto", "A:Egg Salad Sandwich", "S:Cucumber Salad", "D:Baked Apples w/ Cinnamon"],
  ],
  // Saturday
  [
    ["main:French Toast and Bacon", ...BKF_ALT],
    ["main:Fish and Chips, Coleslaw", "A:Stuffed Pepper, Zucchini w/ Tomatoes", "D:Pumpkin Spice Cake"],
    ["main:Pizza w/ Salad", "A:Ham Salad Sandwich, Chips, Pickled Beets", "D:Eclair"],
  ],
];

const WEEK_2: RawDay[] = [
  // Sunday
  [
    ["main:Peach Pancake & Sausage", ...BKF_ALT],
    ["main:Stuffed Chicken Breast, Mashed Potato, Green Beans with Roasted Diced Tomato", "A:Beef Bourguignonne, Mashed Potato, Green Beans", "D:Apple Turn Over"],
    ["soup:Italian Wedding Soup", "main:Chicken Parmesan Sandwich, Chips, Cheese Curls", "A:Cottage Cheese Fruit Plate w/ Crackers", "D:Brownie"],
  ],
  // Monday
  [
    ["main:Blueberry Scone w/ Scrambled Egg", ...BKF_ALT],
    ["main:Pot Roast, Mashed Potato, Zucchini Summer Squash Medley", "A:Baked Cod, Mashed Potato, Zucchini Summer Squash Medley", "D:Peach Parfait"],
    ["main:Vegetable Frittata, Hash Pattie", "A:Chicken Pot Pie with Biscuit", "F:Pears", "D:Cookie"],
  ],
  // Tuesday
  [
    ["main:Hash Brown Bake with Bacon and Toast", ...BKF_ALT],
    ["main:Sage Garlic Boneless Chicken Thigh, Peas, Buttered Orzo", "A:Beef Swiss Steak", "D:Blueberry Cake with Icing"],
    ["soup:Minestrone Soup", "main:Turkey Dinner Sandwich", "A:Ziti Pasta Bake with Garlic Bread & Italian Vegetables", "D:Rosy Apple Slices"],
  ],
  // Wednesday
  [
    ["main:Doughnut / Hard Egg / Fresh Fruit Salad", ...BKF_ALT],
    ["main:Sweet and Sour Meatballs / Rice, Caribbean Blend", "A:Chicken Cordon Blue, Roasted Potato, Caribbean Blend", "D:Ice Cream"],
    ["main:Chicken Tenders w/ Tater Tots", "A:Fried Fish Sandwich with Coleslaw, Tater Tots", "F:Fruited Jello w/ Marsh mellows"],
  ],
  // Thursday
  [
    ["main:Omelet, Bacon, English Muffin", ...BKF_ALT],
    ["main:Pork Pie, California Blend Vegetables", "A:Curry Chicken Bowl, Rice, Cali Blend", "D:Tapioca Pudding"],
    ["main:Mexican Beef Tips, Rice and Zucchini w/ Red Pepper", "A:Egg Salad Sandwich, Chips or Curls", "D:Pineapple w/ Cherries"],
  ],
  // Friday
  [
    ["main:Waffle w/ Fruit Compote, Sausage", ...BKF_ALT],
    ["main:Salmon Teriyaki, Mashed Potato, Broccoli", "A:Spaghetti w/ Meat Sauce, Garlic Bread, Broccoli", "D:Cheesecake"],
    ["soup:Fish Chowder", "main:Pizza w/ Side Salad", "A:Hawaiian BBQ Chicken Sandwich w/ Lettuce, Tomato", "D:Pudding Banana Split Parfait"],
  ],
  // Saturday
  [
    ["main:Quiche / with Fruit", ...BKF_ALT],
    ["main:Hot Dog w/ Chili and Cheese, Tater Tots, Sliced Beets and Carrots", "A:Ham Divan w/ Broccoli", "D:Blueberry Pie"],
    ["soup:Creamy Vegetable Soup", "main:Honey Mustard Chicken Sandwich, LTOP, Chips", "A:Tuna Salad Sandwich, Lettuce, 3 Bean Salad, Chips", "F:Mandarin Oranges"],
  ],
];

const WEEK_3: RawDay[] = [
  // Sunday
  [
    ["main:Cinnamon Roll, Fruit Cup", ...BKF_ALT],
    ["main:Roast Turkey, Stuffing, Mashed Potato, Butternut Squash", "A:Beef Chopped Steak w/ Gravy, 5 Way Mixed Veg, Mashed Potato", "D:Cranberry Crunch Bar"],
    ["soup:Broccoli Cheddar Soup", "main:Pulled Pork on a Bun, Coleslaw", "A:Steak and Cheese Sub, Chips & Mandarin Oranges", "D:Cookie"],
  ],
  // Monday
  [
    ["main:Muffin / Hard Boiled Egg / Fresh Fruit", ...BKF_ALT],
    ["main:Glazed Ham, Roasted Potato, Spinach", "A:Chicken Fricassee, Roasted Potato, Spinach", "D:Butter Scotch & Chocolate Pudding Cup"],
    ["soup:Chicken Noodle Soup", "main:Chicken Tenders, Tater Tots", "A:Fish Sticks, Tater Tots", "D:Fruited Jello w/ Whipped Topping"],
  ],
  // Tuesday
  [
    ["main:Biscuits and Sausage Gravy, Eggs over Easy", ...BKF_ALT],
    ["main:Country Pork Loin w/ Gravy, Mashed Potato, Zucchini Vegetable Medley", "A:Liver and Onions, Mashed", "D:Carrot Cake"],
    ["main:Turkey Burger, Lettuce, Tomato, Sweet Potato Puffs", "A:Cheese Ravioli w/ Tomato Sauce / Tossed Salad, Garlic Bread", "D:Tapioca Pudding"],
  ],
  // Wednesday
  [
    ["main:Cheese Blintz w/ Strawberry and Scrambled Egg", ...BKF_ALT],
    ["main:Grilled Swordfish, Risotto, Asparagus w/ Diced Tomato", "A:Chicken Parmesan Pasta, Broccoli", "D:Strawberries with Banana"],
    ["soup:Corn Chowder", "main:Vegetable Quiche w/ Oven Baked Breakfast Potatoes", "A:Sloppy Joe on a Bun", "D:Ice Cream Sandwich"],
  ],
  // Thursday
  [
    ["main:Roasted Red Pepper and Pesto Frittata with Bacon / Toast", ...BKF_ALT],
    ["main:Tortellini w/ Meat Sauce, Garlic Bread, Green Beans", "A:Orange Chicken, Rice / Broccoli", "D:Lemmon Pudding Pie / Shell"],
    ["soup:Tomato Soup", "main:Egg Salad Sandwich w/ Lettuce", "A:Chicken Stew w/ Biscuit, Beets", "F:Pears"],
  ],
  // Friday
  [
    ["main:French Toast and Sausage, Fruit Salad", ...BKF_ALT],
    ["main:Shrimp Newburg, Egg Noodles, Broccoli", "A:BBQ Meatloaf, Egg Noodle, Broccoli", "D:Eclair"],
    ["soup:Clam Chowder", "main:Pizza / Cucumber Tomato Salad", "A:Roast Beef Lettuce/Tomato Sandwich, Chips or Curls", "D:Chocolate Chip Cake"],
  ],
  // Saturday
  [
    ["main:Fried Eggs, Corned Beef Hash / Toast", ...BKF_ALT],
    ["main:Pork Cutlet Smothered in Onion Gravy, Mashed Potato, Braised Cabbage / Green Beans", "A:Hot Dog, Baked Beans, Pasta Salad", "D:Chocolate Mousse"],
    [
      "soup:Tomato Soup",
      "main:Seafood Salad on a Roll, Coleslaw",
      "A:Mac & Cheese, 5 Way Veg Blend",
      "D:Sherbet Cup",
    ],
  ],
];

const WEEK_4: RawDay[] = [
  // Sunday
  [
    ["main:Egg, Ham and Cheese on a Croissant, Fruit Cup", ...BKF_ALT],
    ["main:Roast Pork, Roast Potato, Honey Mustard Brussel Sprouts", "A:Maple Glazed Salmon", "D:Blueberry Cake with Icing"],
    ["main:3 Cheese Pasta Bake, Green Beans, Garlic Bread", "A:Hamburger, Sweet Potato Puffs", "D:Apple Betty"],
  ],
  // Monday
  [
    ["main:Blueberry Pancake w/ Sausage", ...BKF_ALT],
    ["main:Pot Roast, Mashed Potato, Malibu Blend Vegetable", "A:BBQ Chicken, Mashed Potato, Malibu Blend Vegetable", "D:Fruited Gelatin Parfait"],
    ["soup:Turkey Rice Soup", "main:Chicken Tenders w/ Tater Tots", "A:Ruben w/ Tater Tots", "D:Peaches and Pears"],
  ],
  // Tuesday
  [
    ["main:Eggs Over Easy / Bacon / Home Fries", ...BKF_ALT],
    ["main:BBQ Meatballs with Rice & 5 Way Blend Vegetables", "A:Roast Pork Loin with Stuffing, 5 Way Blend Vegetables", "D:Boston Cream Pie"],
    ["soup:French Onion Soup", "main:Deli Sandwich, Chips", "A:Shepherd's Pie, Green Beans", "D:Blueberries and Banans"],
  ],
  // Wednesday
  [
    ["main:French Toast / Sausage", ...BKF_ALT],
    ["main:Caribbean Shrimp over Rotini, Caribbean Blend Vegetables", "A:Beef Tater Tot Casserole", "D:Boston Cream Pie"],
    ["main:Vegetable Lasagna, Garlic Bread", "A:Grilled Cuban", "F:Pineapple", "D:Ice Cream Sandwich"],
  ],
  // Thursday
  [
    ["main:Coffee Cake, Scrambled Egg, Fruit Cup", ...BKF_ALT],
    ["main:Beef Vegetable Stir-fry, Fried Rice, Asian Vegetable Blend", "A:Stuffed Chicken", "D:Apple Crisp"],
    ["main:Steak and Cheese Sub with French Fries", "A:Chicken Salad Sandwich, Chips or Curls", "D:Strawberries w/ Whipped Topping"],
  ],
  // Friday
  [
    ["main:Egg Hash Brown Bake, Fruit Muffin", ...BKF_ALT],
    ["main:Beef Tips Provencale over Egg Noodles, Zucchini", "A:Baked Haddock, Roasted Potato, Zucchini", "D:Pumpkin Pie"],
    ["soup:Fish Chowder", "main:Chicken Tenders, Tater Tots", "A:Grilled Ham and Swiss Sandwich, Chips or Curls", "F:Pears"],
  ],
  // Saturday
  [
    ["main:Egg Sausage English Muffin Sandwich, Fruit Cup", ...BKF_ALT],
    ["main:Kielbasa, Baked Beans, Brown Bread, Carrots and Cauliflower", "A:Stuffed Pepper, Rice, Cauliflower, Carrots", "D:Lemmon Cake"],
    ["soup:Tomato Basil Soup", "main:Chicken Caesar Wrap", "A:Pizza w/ Pickled Beet Salad", "D:Brownie"],
  ],
];

export const FALL_WINTER: MenuSeason = {
  id: "fall-winter",
  name: "Fall / Winter",
  cycleWeeks: 4,
  transcribedFrom: "Photographs of the posted Fall/Winter Week 1–4 sheets (supplied by the cook).",
  weeks: [
    buildWeek(1, WEEK_1, "IMG_2229 — Fall/Winter WEEK 1"),
    buildWeek(2, WEEK_2, "IMG_2230 — Fall/Winter WEEK 2"),
    buildWeek(
      3,
      WEEK_3,
      "IMG_2231 — Fall/Winter (header cropped)",
      "The sheet's title is cropped in the photo; it is filed as Week 3 because the other three sheets are clearly Weeks 1, 2 and 4.",
    ),
    buildWeek(4, WEEK_4, "IMG_2232 — Fall/Winter WEEK 4"),
  ],
};

export const SEASONS: MenuSeason[] = [FALL_WINTER];
