import { test, expect } from "@playwright/test";
test("notes persist and conversion uses the shared private editor", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("Losse gedachte", { exact: true })
    .fill("Paspoort nakijken");
  await page
    .getByRole("button", { name: "Bewaar in mijn inbox", exact: true })
    .click();
  await page.reload();
  const entry = page
    .locator(".inbox-entry")
    .filter({ hasText: "Paspoort nakijken" });
  await expect(entry).toBeVisible();
  await entry.getByRole("button", { name: "Maak taak", exact: true }).click();
  await expect(page.getByLabel("Titel", { exact: true })).toHaveValue(
    "Paspoort nakijken",
  );
  await page.getByRole("button", { name: "Opslaan", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /^Paspoort nakijken/ }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Jouw persoonlijke inbox" })
      .getByText("Paspoort nakijken", { exact: true }),
  ).toHaveCount(0);
});
test("delete asks confirmation, undo restores, and trash survives reload", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Taak toevoegen", exact: true })
    .click();
  await page.getByLabel("Titel", { exact: true }).fill("Te herstellen");
  await page.getByRole("button", { name: "Opslaan", exact: true }).click();
  await page.getByRole("button", { name: /^Te herstellen/ }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Verwijderen", exact: true }).click();
  await page
    .getByRole("button", { name: "Ongedaan maken", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /^Te herstellen/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Te herstellen/ }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Verwijderen", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Instellingen", exact: true }).click();
  await page.getByText(/Mijn prullenbak/).click();
  await page
    .getByRole("button", { name: "Herstel Te herstellen", exact: true })
    .click();
  await page.getByRole("button", { name: /Alle taken/ }).click();
  await expect(
    page.getByRole("button", { name: /^Te herstellen/ }),
  ).toBeVisible();
});
test("calendar plus uses the selected day and birthdays default to an annual whole day", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Agenda", exact: true }).click();
  const day = page.locator(".month-day:not(.other-month)").first();
  await day.click();
  await page
    .getByRole("button", { name: "Afspraak toevoegen", exact: true })
    .click();
  const selected = await page
    .getByLabel("Begintijd", { exact: true })
    .inputValue();
  await page.getByLabel("Titel", { exact: true }).fill("Verjaardag");
  await page
    .getByRole("combobox", { name: "Soort", exact: true })
    .selectOption("birthday");
  await expect(page.getByLabel("Hele dag", { exact: true })).toBeChecked();
  await expect(page.getByLabel("Eerste dag", { exact: true })).toHaveValue(
    selected.slice(0, 10),
  );
  await expect(
    page.getByRole("combobox", { name: "Herhalen op de agenda", exact: true }),
  ).toHaveValue("yearly");
  await page.getByRole("button", { name: "Opslaan", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Verjaardag/ })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `/tmp/todo-agenda-${test.info().project.name}.png`,
    fullPage: true,
  });
});
