import { test, expect } from "@playwright/test";
test("configured app gates personal data and writes behind account login", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Welkom thuis." }),
  ).toBeVisible();
  await expect(page.getByLabel("E-mailadres", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Taak toevoegen", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("Deze versie bewaart gegevens alleen in deze browser.", {
      exact: false,
    }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});
test("shared capture waits for login and does not expose an editable item first", async ({
  page,
}) => {
  await page.goto("/?capture=1&text=Testconcept");
  await expect(
    page.getByRole("heading", { name: "Welkom thuis." }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(page.url()).not.toContain("Testconcept");
  expect(
    await page.evaluate(() => localStorage.getItem("todo-device-v1")),
  ).toBeNull();
});
