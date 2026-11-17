/**
 * Walks the brief's "Definition of done for first release" on an iPhone-sized screen.
 */
import { expect, test, type Locator } from "@playwright/test";

/** Tap like a person: just over the 0.3 s same-box double-tap guard. */
async function tapTimes(box: Locator, n: number) {
  for (let i = 0; i < n; i++) {
    await box.click();
    await box.page().waitForTimeout(320);
  }
}
import fs from "node:fs";

const DATE = "2026-11-16"; // Monday — Week 2 with the demo rotation anchor
const COUNTS = `/stann/counts?date=${DATE}&meal=dinner`;

test("first-release checklist", async ({ page }, testInfo) => {
  // 1–2. Open the app and pick St. Ann
  await page.goto("/");
  await page.getByRole("link", { name: /St\. Ann Rehabilitation/ }).click();
  await expect(page).toHaveURL(/\/stann\/?$/);
  await expect(page.getByRole("region", { name: "Today" })).toBeVisible();

  // 3. View a selected date and meal menu
  await page.goto(COUNTS);
  await expect(page.getByText("Week 2 · Monday").first()).toBeVisible();
  await expect(page.getByText("Vegetable Frittata, Hash Pattie")).toBeVisible();
  await expect(page.getByText("Chicken Pot Pie with Biscuit")).toBeVisible();

  // 4. Count a stack of slips: 15 frittata + 31 pot pie (from the notebook photo)
  // Tally box names are pre-written from the menu and can be rewritten like the notebook
  await expect(page.getByRole("textbox", { name: "Tally box 1" })).toHaveValue("Vegetable Frittata");
  await page.getByRole("button", { name: /Start counting dinner/ }).click();
  const main = page.getByRole("button", { name: /^Count one Vegetable Frittata/ });
  const alt = page.getByRole("button", { name: /^Count one Chicken Pot Pie/ });
  await tapTimes(main, 15);
  await tapTimes(alt, 31);
  await expect(page.getByRole("radiogroup", { name: "Unit stack" })).toHaveCount(0); // units off by default
  await expect(page.getByTestId("total-meals")).toHaveText("46");
  await expect(page.getByTestId("count-main")).toHaveText("15");
  await expect(page.getByTestId("count-alt")).toHaveText("31");

  // 5. Undo an incorrect tap
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("total-meals")).toHaveText("45");
  await expect(page.getByTestId("count-alt")).toHaveText("30");

  // Rewrite a box name; the count stays with it
  await page.getByRole("button", { name: "Rename Vegetable Frittata" }).click();
  await page.getByRole("dialog", { name: "Rename tally box" }).getByRole("textbox").fill("Veggfritata");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByTestId("count-main")).toHaveText("15");
  await expect(page.getByRole("button", { name: /^Count one Veggfritata/ })).toBeVisible();

  // Free-form notes
  await page.getByRole("textbox", { name: "Notes for this meal" }).fill("Pull biscuits for tomorrow");
  await page.getByRole("heading", { name: "Notes" }).click();

  // 7 (part). Additional items never change the meal total
  await page.getByRole("button", { name: "+ No biscuit – Chicken Pot Pie" }).click();
  const noBiscuit = page.getByRole("button", { name: /^Add one No biscuit/ });
  await noBiscuit.click();
  await noBiscuit.click();
  await expect(page.getByTestId("total-meals")).toHaveText("45");
  await expect(noBiscuit).toContainText("3");

  // 6. Fictional special request with a room identifier
  await page.getByRole("button", { name: "+ Request" }).click();
  await page.getByRole("textbox", { name: "Room" }).fill("Demo 104");
  await page.getByRole("radio", { name: "Right side" }).click();
  await page.getByLabel("Requested item").fill("Grilled cheese");
  await page.getByRole("button", { name: "Add request" }).click();
  await expect(page.getByText("Grilled cheese — Demo 104R")).toBeVisible();
  await expect(page.getByText("Not yet checked")).toBeVisible();
  await page.getByRole("button", { name: "✓ Diet checked" }).click(); // one tap, no sign-off
  await expect(page.getByText("Diet checked", { exact: true })).toBeVisible();
  await expect(page.getByTestId("total-meals")).toHaveText("45"); // requests are separate

  await page.screenshot({ path: testInfo.outputPath("count-screen.png"), fullPage: true });

  // 7. Count summary/review without double counting
  await page.getByRole("button", { name: "Review & finish" }).click();
  const dialog = page.getByRole("dialog", { name: "Review count" });
  await expect(dialog.getByRole("row", { name: /Total resident meals 45/ })).toBeVisible();
  await expect(dialog.getByRole("row", { name: /\+ No biscuit – Chicken Pot Pie 3/ })).toBeVisible();
  await expect(dialog.getByRole("row", { name: /Special requests \(separate\) 1/ })).toBeVisible();
  await dialog.getByRole("button", { name: "Mark count complete" }).click();
  await expect(page.getByText("Count complete")).toBeVisible();

  // 8. Create and check off prep tasks
  await page.goto(`/stann/prep?date=${DATE}`);
  await page.getByRole("button", { name: "Add task for Today" }).click();
  await page.getByRole("textbox", { name: "Task" }).fill("Make Jello");
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  const check = page.getByRole("checkbox", { name: "Mark done: Make Jello" });
  await check.click();
  await expect(page.getByRole("checkbox", { name: "Mark not done: Make Jello" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("1 of 1 done")).toBeVisible();
  // menu-based suggestions are offered but not added or completed automatically
  await expect(page.getByText("Suggested from the menu").first()).toBeVisible();

  // 9. Tomorrow's menu
  await page.goto(`/stann/menu?date=${DATE}`);
  const nextDay = page.locator("section", { hasText: "Next day" }).first();
  await expect(nextDay.getByText("Week 2 · Tuesday")).toBeVisible();
  await expect(nextDay.getByText("Turkey Dinner Sandwich")).toBeVisible();
  // Night cook profile hides lunch until asked
  await expect(nextDay.getByText("Sage Garlic Boneless Chicken Thigh, Peas, Buttered Orzo")).toHaveCount(0);
  await page.getByRole("button", { name: "Show all meals" }).click();
  await expect(nextDay.getByText("Sage Garlic Boneless Chicken Thigh, Peas, Buttered Orzo")).toBeVisible();

  // 10. Switch workspaces without carrying data over
  await page.getByRole("link", { name: "Switch workspace" }).click();
  await page.getByRole("link", { name: /Home Kitchen/ }).click();
  await page.goto(`/home/plan?date=${DATE}`);
  await expect(page.getByText("Make Jello")).toHaveCount(0);
  await page.goto(`/truck/prep?date=${DATE}`);
  await expect(page.getByText("Make Jello")).toHaveCount(0);
  await expect(page.getByText("Demo 104")).toHaveCount(0);

  // 11. Close and reopen without losing entries
  await page.context().clearCookies();
  await page.goto(COUNTS);
  await page.reload();
  await expect(page.getByTestId("total-meals")).toHaveText("45");
  await expect(page.getByText("Grilled cheese — Demo 104R")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Notes for this meal" })).toHaveValue("Pull biscuits for tomorrow");

  // 12. Export and restore demo data
  await page.goto("/stann/reports");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download all workspaces" }).click();
  const file = testInfo.outputPath("backup.json");
  await (await download).saveAs(file);
  expect(JSON.parse(fs.readFileSync(file, "utf8")).kind).toBe("full");

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Reset demo data" }).click();
  await page.goto(COUNTS);
  await expect(page.getByRole("button", { name: /Start counting dinner/ })).toBeVisible();

  await page.goto("/stann/reports");
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("restore-input").setInputFiles(file);
  await expect(page.getByText("Restored all workspaces.")).toBeVisible();
  await page.goto(COUNTS);
  await expect(page.getByTestId("total-meals")).toHaveText("45");
});

test("a workspace backup can't be restored into another workspace", async ({ page }, testInfo) => {
  await page.goto("/truck/reports");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Stop N Chop" }).click();
  const file = testInfo.outputPath("truck.json");
  await (await download).saveAs(file);
  await page.goto("/home/pantry");
  await page.getByTestId("restore-input").setInputFiles(file);
  await expect(page.getByText(/belongs to the truck workspace/)).toBeVisible();
});

test("profiles change what each cook sees", async ({ page }) => {
  await page.goto("/stann/counts?date=2026-11-16");
  // Night cook: dinner only, other meals one tap away
  await expect(page.getByRole("button", { name: "Profile: Night cook. Change profile" })).toBeVisible();
  const tabs = page.getByRole("tablist", { name: "Meal service" });
  await expect(tabs.getByRole("tab")).toHaveText(["Dinner"]);
  await page.getByRole("button", { name: "Other meals" }).click();
  await expect(tabs.getByRole("tab")).toHaveText(["Breakfast", "Lunch", "Dinner"]);

  // Switch to Day cook
  await page.getByRole("button", { name: /^Profile: / }).click();
  await page.getByRole("radio", { name: /Day cook/ }).click();
  await page.goto("/stann/counts?date=2026-11-16&meal=lunch");
  await expect(tabs.getByRole("tab")).toHaveText(["Breakfast", "Lunch"]);

  // Make a custom profile that hides the Reports tab
  await page.getByRole("button", { name: /^Profile: / }).click();
  await page.getByRole("button", { name: "+ New profile" }).click();
  await page.getByRole("button", { name: /^Night cook/ }).click();
  await page.getByRole("textbox", { name: "Name" }).fill("Bill");
  await page.getByRole("checkbox", { name: "Lunch" }).check();
  await page.getByRole("checkbox", { name: "Reports" }).uncheck();
  await page.getByRole("button", { name: "Create & use" }).click();
  await expect(page.getByRole("button", { name: "Profile: Bill. Change profile" })).toBeVisible();
  const nav = page.getByRole("navigation", { name: /St\. Ann/ });
  await expect(nav.getByRole("link", { name: "Reports" })).toHaveCount(0);
  await page.goto("/stann/counts?date=2026-11-16&meal=dinner");
  await expect(tabs.getByRole("tab")).toHaveText(["Lunch", "Dinner"]);
});

test("shopping list items can be deleted", async ({ page }) => {
  await page.goto("/home/shopping");
  for (const item of ["Milk", "Eggs"]) {
    await page.getByRole("textbox", { name: "Item" }).fill(item);
    await page.getByRole("button", { name: "Add", exact: true }).click();
  }
  await page.getByRole("button", { name: "Delete Milk" }).click();
  await expect(page.getByText("Milk")).toHaveCount(0);
  await expect(page.getByText("Eggs")).toBeVisible();
});

test("a bounced double tap counts once; taps on different boxes always count", async ({ page }) => {
  await page.goto("/stann/counts?date=2026-11-16&meal=dinner");
  await page.getByRole("button", { name: /Start counting dinner/ }).click();
  const main = page.getByRole("button", { name: /^Count one Vegetable Frittata/ });
  const alt = page.getByRole("button", { name: /^Count one Chicken Pot Pie/ });
  await main.dblclick();
  await expect(page.getByTestId("total-meals")).toHaveText("1");
  await expect(page.getByText(/Double tap on the same box ignored/)).toBeVisible();
  await alt.click(); // immediately, different box
  await expect(page.getByTestId("total-meals")).toHaveText("2");
});

test("sheets keep keyboard focus inside and close with Escape", async ({ page }) => {
  await page.goto("/stann/counts?date=2026-11-16&meal=dinner");
  await page.getByRole("button", { name: /Start counting dinner/ }).click();
  await page.getByRole("button", { name: "+ Request" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});
