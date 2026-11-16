/**
 * Walks the brief's "Definition of done for first release" on an iPhone-sized screen.
 */
import { expect, test } from "@playwright/test";
import fs from "node:fs";

const DATE = "2026-11-16"; // Monday — Week 2 with the demo rotation anchor
const COUNTS = `/stann/counts?date=${DATE}&meal=dinner`;

test("first-release checklist", async ({ page }, testInfo) => {
  // 1–2. Open the app and pick St. Ann
  await page.goto("/");
  await page.getByRole("link", { name: /St\. Ann Rehabilitation/ }).click();
  await expect(page).toHaveURL(/\/stann$/);
  await expect(page.getByRole("region", { name: "Today" })).toBeVisible();

  // 3. View a selected date and meal menu
  await page.goto(COUNTS);
  await expect(page.getByText("Week 2 · Monday").first()).toBeVisible();
  await expect(page.getByText("Vegetable Frittata, Hash Pattie")).toBeVisible();
  await expect(page.getByText("Chicken Pot Pie with Biscuit")).toBeVisible();

  // 4. Count a stack of slips: 15 frittata + 31 pot pie (from the notebook photo)
  await page.getByRole("button", { name: /Start counting dinner/ }).click();
  const main = page.getByRole("button", { name: /^Count one Vegetable Frittata/ });
  const alt = page.getByRole("button", { name: /^Count one Chicken Pot Pie/ });
  // Granite stack, then Lilac
  for (let i = 0; i < 15; i++) await main.click();
  await page.getByRole("radio", { name: /^Lilac/ }).click();
  for (let i = 0; i < 31; i++) await alt.click();
  await expect(page.getByRole("radio", { name: /^Granite/ })).toContainText("15 slips");
  await expect(page.getByRole("radio", { name: /^Lilac/ })).toContainText("31 slips");
  await expect(page.getByTestId("total-meals")).toHaveText("46");
  await expect(page.getByTestId("count-main")).toHaveText("15");
  await expect(page.getByTestId("count-alt")).toHaveText("31");

  // 5. Undo an incorrect tap
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("total-meals")).toHaveText("45");
  await expect(page.getByTestId("count-alt")).toHaveText("30");

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
  await expect(dialog.getByRole("row", { name: /^Lilac 30$/ })).toBeVisible();
  await dialog.getByRole("checkbox").check(); // acknowledge "No slips counted for Birch"
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
