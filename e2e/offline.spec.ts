/** Static (GitHub Pages) build only: offline use and the Content-Security-Policy. */
import { expect, test } from "@playwright/test";

test.skip(!process.env.E2E_STATIC, "offline/CSP checks run against the static export (npm run test:e2e:static)");

test("after one visit, every screen opens offline and nothing violates the CSP", async ({ page, context }) => {
  const cspErrors: string[] = [];
  page.on("console", (m) => /Content Security Policy|Refused to/.test(m.text()) && cspErrors.push(m.text()));

  await page.goto("/");
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    // wait until the worker controls the page and finished precaching
    if (!navigator.serviceWorker.controller) await new Promise((r) => navigator.serviceWorker.addEventListener("controllerchange", r, { once: true }));
    return reg.active?.state;
  });
  await page.waitForFunction(async () => {
    const keys = await caches.keys();
    for (const k of keys) if ((await (await caches.open(k)).keys()).length > 30) return true;
    return false;
  });

  await context.setOffline(true);
  // pages never visited before
  for (const [path, text] of [
    ["/stann/prep/", "Prep templates"],
    ["/truck/inventory/", "Truck stock"],
    ["/home/pantry/", "Pantry"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByText(text).first()).toBeVisible();
  }
  // data entry still works and is saved offline
  await page.goto("/home/shopping/");
  await page.getByRole("textbox", { name: "Item" }).fill("Butter");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.reload();
  await expect(page.getByText("Butter")).toBeVisible();
  await context.setOffline(false);
  expect(cspErrors).toEqual([]);
});
