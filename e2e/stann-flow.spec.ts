/** St. Ann's: Menu → Count → Production → Prep → Ready, connected end to end. */
import { expect, test } from "@playwright/test";

const D = "2026-11-16";
const Q = `?date=${D}&meal=dinner`;

test("count flows into production, prep and service readiness", async ({ page }) => {
  // Count
  await page.goto(`/stann/counts${Q}`);
  await page.getByRole("button", { name: /Start counting dinner/ }).click();
  const main = page.getByRole("button", { name: /^Count one Vegetable Frittata\. Now/ });
  const alt = page.getByRole("button", { name: /^Count one Chicken Pot Pie\. Now/ });
  for (let i = 0; i < 4; i++) {
    await main.click();
    await page.waitForTimeout(320);
  }
  for (let i = 0; i < 6; i++) {
    await alt.click();
    await page.waitForTimeout(320);
  }
  await page.getByRole("button", { name: "+ No biscuit – Chicken Pot Pie" }).click();
  // IDDSI textures from the slips
  // IDDSI texture taps count the slip in the tally too
  await page.getByRole("button", { name: /^Count one Chicken Pot Pie, Puréed level 4/ }).click();
  await page.getByRole("button", { name: /^Count one Chicken Pot Pie, Minced & Moist level 5/ }).click();
  await expect(page.getByTestId("total-meals")).toHaveText("12");
  await expect(page.getByTestId("count-alt")).toHaveText("8");
  // Drinks aren't counted — they're reference-only in the level guide
  await expect(page.getByRole("button", { name: /drink, level/ })).toHaveCount(0);
  await page.getByRole("region", { name: "Textures (IDDSI)" }).getByRole("button", { name: "Level guide" }).click();
  await page.getByRole("dialog", { name: "IDDSI levels" }).getByRole("tab", { name: "Drinks" }).click();
  await expect(page.getByRole("dialog", { name: "IDDSI levels" }).getByText("Level 2 · Mildly Thick")).toBeVisible();
  await page.keyboard.press("Escape");
  // Prep while counting: tomorrow's menu → today's prep list
  const prepCard = page.getByRole("region", { name: /^Prep list/ });
  await prepCard.getByRole("tab", { name: "Tomorrow" }).click();
  await prepCard.getByRole("button", { name: "Add Rosy Apple Slices — for tomorrow dinner to prep" }).click();
  await prepCard.getByRole("textbox", { name: "New prep task" }).fill("Pull biscuits");
  await prepCard.getByRole("button", { name: "Add", exact: true }).click();
  await expect(prepCard.getByRole("list", { name: "Today's prep list" }).getByRole("listitem")).toHaveCount(2);
  await page.getByRole("button", { name: "Review & finish" }).click();
  await page.getByRole("button", { name: "Mark count complete" }).click();
  await expect(page.getByRole("navigation", { name: "Service steps" }).getByRole("link", { name: /Count: 12 done/ })).toBeVisible();

  // Production
  await page.getByRole("link", { name: "Production →" }).click();
  await expect(page.getByTestId("servings-Chicken Pot Pie")).toHaveText("8");
  await expect(page.getByText("1 Puréed (L4) · 1 Minced & Moist (L5)")).toBeVisible();
  const potPie = page.getByRole("region", { name: "Chicken Pot Pie" });
  await expect(potPie.getByText("Eyeballed — no portion size")).toBeVisible();
  await potPie.getByRole("button", { name: "Add portion / recipe (optional)" }).click();
  await page.getByLabel("Portion amount").fill("8");
  await page.getByLabel("Portion unit").selectOption("oz");
  await page.getByLabel("Cooked yield percent").fill("80");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  // 8 × 8 oz = 64 oz = 4 lb cooked; ÷ 0.8 = 5 lb raw
  await expect(potPie.getByText("4 lb", { exact: true })).toBeVisible();
  await expect(potPie.getByText("5 lb", { exact: true })).toBeVisible();

  // Biscuits: one per pot pie, minus "no biscuit"
  await page.getByRole("button", { name: /Add an item/ }).click();
  await page.getByRole("textbox", { name: "What" }).fill("Biscuits");
  await page.getByRole("combobox", { name: "How many" }).selectOption({ label: "One per Chicken Pot Pie served" });
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const biscuits = page.getByRole("region", { name: "Biscuits" });
  await biscuits.getByRole("button", { name: "Add portion / recipe (optional)" }).click();
  await page.getByLabel("Portion amount").fill("1");
  await page.getByLabel("Portion unit").selectOption("each");
  await page.getByRole("checkbox", { name: "No biscuit – Chicken Pot Pie" }).check();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("servings-Biscuits")).toHaveText("7");

  // Late admission after the count was finished
  await page.goto(`/stann/counts${Q}`);
  await page.getByRole("button", { name: "+ Late admit / change" }).click();
  const sheet = page.getByRole("dialog", { name: "Late admit / change" });
  await sheet.getByRole("radio", { name: /^Chicken Pot Pie/ }).click();
  await sheet.getByRole("combobox").selectOption({ label: "Puréed (L4)" });
  await sheet.getByRole("radio", { name: "Late admission" }).click();
  await sheet.getByRole("button", { name: "Save change" }).click();
  await expect(page.getByTestId("total-meals")).toHaveText("13");
  await expect(page.getByText("Count complete")).toBeVisible(); // still finished
  await expect(page.getByRole("list", { name: "Changes to this count" })).toContainText("+1 Chicken Pot Pie");
  await expect(page.getByRole("list", { name: "Changes to this count" })).toContainText("Late admission");
  await page.goto(`/stann/production${Q}`);
  await expect(page.getByTestId("servings-Chicken Pot Pie")).toHaveText("9");
  await expect(page.getByTestId("servings-Biscuits")).toHaveText("8");
  await expect(page.getByText("2 Puréed (L4) · 1 Minced & Moist (L5)")).toBeVisible();

  // Override with a reason
  await potPie.getByRole("button", { name: "Change servings" }).click();
  await page.getByRole("textbox", { name: "Servings to make" }).fill("8");
  await page.getByRole("textbox", { name: "Reason (required)" }).fill("Two late admits");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("servings-Chicken Pot Pie")).toHaveText("8");
  await expect(potPie.getByText("Two late admits")).toBeVisible();

  // → Prep
  await page.getByRole("button", { name: "Send to prep list →" }).click();
  await expect(page.getByText(/Prep list: \d+ added/)).toBeVisible();
  await page.goto(`/stann/prep${Q}`);
  await expect(page.getByText(/^8 × Chicken Pot Pie · make 4 lb · start with 5 lb raw · 2 Puréed \(L4\), 1 Minced & Moist \(L5\)$/)).toBeVisible();
  await page.getByRole("checkbox", { name: /^Mark done: 8 × Chicken Pot Pie · make 4 lb/ }).click();

  // → Ready
  await page.goto(`/stann/ready${Q}`);
  await expect(page.getByText(/No temperature limits are set/)).toBeVisible();
  await page.getByRole("button", { name: "Limits" }).first().click();
  await page.getByRole("button", { name: "Fill in FDA Food Code reference values" }).click();
  await page.getByRole("button", { name: "Save limits" }).click();
  await expect(page.getByText(/Confirm these limits/)).toBeVisible(); // confirmation is required
  await page.getByRole("textbox", { name: "Confirm" }).fill("Matches our policy (demo)");
  await page.getByRole("button", { name: "Save limits" }).click();
  await page.getByRole("checkbox", { name: /Steam table on/ }).click();
  await page.getByRole("combobox", { name: "Food" }).fill("Chicken Pot Pie");
  await page.getByRole("combobox", { name: "Check" }).selectOption("hot-hold");
  await page.getByRole("textbox", { name: /Temperature in degrees F/ }).fill("128");
  await expect(page.getByText("⚠ Below your minimum of 135 °F")).toBeVisible();
  await page.getByRole("button", { name: "Log reading" }).click();

  // → Today shows where things stand (freeze the page clock at 2 PM on the counted day)
  await page.clock.setFixedTime(new Date(2026, 10, 16, 14, 0));
  await page.goto("/stann");
  const service = page.getByRole("region", { name: "Dinner service" });
  await expect(service.getByRole("link", { name: "Count: Done" })).toBeVisible();
  await expect(service.getByText("1 temperature reading(s) outside your limits")).toBeVisible();
  await expect(service.getByRole("link", { name: "Ready: Needs attention" })).toBeVisible();
});

test("prep made ahead drops off its day and shows the next step", async ({ page }) => {
  // Tue 11/17 dinner has Rosy Apple Slices; make them ahead on Mon 11/16
  await page.goto(`/stann/counts?date=2026-11-16&meal=dinner`);
  await page.getByRole("button", { name: /Start counting dinner/ }).click();
  const prep = page.getByRole("region", { name: /^Prep list/ });
  await prep.getByRole("tab", { name: "Tomorrow" }).click();
  await prep.getByRole("button", { name: "Add Rosy Apple Slices — for tomorrow dinner to prep" }).click();
  await prep.getByRole("checkbox", { name: "Mark done: Rosy Apple Slices — for tomorrow dinner" }).click();

  // Tuesday: no "Prepare Rosy Apple Slices"; the next step is offered instead
  await page.goto(`/stann/prep?date=2026-11-17&meal=dinner`);
  const today = page.getByRole("region", { name: /^Today/ });
  await expect(today.getByText("Prepare Rosy Apple Slices", { exact: true })).toHaveCount(0);
  await expect(today.getByText("Portion & serve Rosy Apple Slices — made ahead Mon")).toBeVisible();
});
