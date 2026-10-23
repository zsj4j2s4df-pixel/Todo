import { test, expect } from "@playwright/test";
import { installCloudAccount } from "./fixtures";
test("assistant creates only after explicit typed or transcribed confirmation", async ({
  page,
}) => {
  const fixture = await installCloudAccount(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Assistent", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Jouw vraag", exact: true })
    .fill("Voeg sleutels klaarleggen toe");
  await page
    .getByRole("button", { name: "Vraag stellen", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Voorstel uitvoeren", exact: true }),
  ).toBeVisible();
  expect(fixture.writes).toBe(0);
  await page
    .getByRole("textbox", { name: "Jouw vraag", exact: true })
    .fill("ja, opslaan");
  await page
    .getByRole("button", { name: "Vraag stellen", exact: true })
    .click();
  await expect(
    page.getByText("Uitgevoerd. Je overzicht is bijgewerkt.", { exact: true }),
  ).toBeVisible();
  expect(fixture.writes).toBe(1);
  await page.getByRole("button", { name: /Alle taken/ }).click();
  await expect(
    page.getByRole("button", { name: /^Sleutels klaarleggen/ }),
  ).toBeVisible();
});
