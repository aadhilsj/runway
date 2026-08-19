import { expect, test } from "@playwright/test";

test("unauthenticated financial routes are protected", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto("/overview");
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send sign-in email" })).toBeVisible();
  await expect(page.getByLabel("Password")).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});
