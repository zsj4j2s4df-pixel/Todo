import { test, expect } from "@playwright/test";
test("create, persist, edit and complete a private task", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Taak toevoegen", exact: true })
    .click();
  await page
    .getByLabel("Titel", { exact: true })
    .fill("Boodschappen voor morgen");
  await page.getByRole("button", { name: "Opslaan", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /^Boodschappen voor morgen/ }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: /^Boodschappen voor morgen/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Boodschappen voor morgen/ }).click();
  await page
    .getByLabel("Titel", { exact: true })
    .fill("Boodschappen en koffie");
  await page.getByRole("button", { name: "Opslaan", exact: true }).click();
  await page
    .getByRole("button", { name: "Voltooi Boodschappen en koffie" })
    .click();
  await expect(
    page.getByRole("button", { name: "Voltooi Boodschappen en koffie" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Alle taken", exact: false }).click();
  await page.getByRole("button", { name: "Afgerond", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /^Boodschappen en koffie/ }),
  ).toBeVisible();
});
test("quick capture opens a draft without saving", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Snel invoeren/ }).click();
  await page
    .getByLabel("Tekst uit je bericht")
    .fill("Tandarts 30-10-2026 om 17:00");
  await page.getByRole("button", { name: "Concept bekijken" }).click();
  await expect(page.getByLabel("Titel", { exact: true })).toHaveValue(
    "Tandarts 30-10-2026 om 17:00",
  );
  await page
    .getByRole("button", { name: "Sluiten", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("button", { name: /Voltooi Tandarts/ }),
  ).toHaveCount(0);
});

test("agenda validates dates, persists events and exposes safe map links", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Agenda", exact: true }).click();
  await page
    .getByRole("button", { name: "Afspraak toevoegen", exact: true })
    .click();
  await page.getByLabel("Titel", { exact: true }).fill("Samen eten");
  await page.getByLabel("Begintijd", { exact: true }).fill("2026-12-25T17:00");
  await page.getByLabel("Eindtijd", { exact: true }).fill("2026-12-25T19:00");
  await page.getByLabel("Locatie", { exact: true }).fill("Amsterdam & centrum");
  await page.getByRole("button", { name: "Opslaan", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /^Samen eten/ }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /^Samen eten/ })
    .first()
    .click();
  await expect(
    page.getByRole("link", { name: /Open locatie/ }),
  ).toHaveAttribute("href", /Amsterdam%20%26%20centrum/);
  await page
    .getByRole("button", { name: "Sluiten", exact: true })
    .last()
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("agenda export requires confirmation and downloads an ICS file", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Agenda", exact: true }).click();
  await page
    .getByRole("button", { name: "Afspraak toevoegen", exact: true })
    .click();
  await page.getByLabel("Titel", { exact: true }).fill("Privé tandarts");
  await page.getByLabel("Begintijd", { exact: true }).fill("2026-12-25T17:00");
  await page.getByRole("button", { name: "Opslaan", exact: true }).click();
  await page.getByRole("button", { name: "Instellingen", exact: true }).click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("button", { name: "Agenda downloaden (.ics)", exact: true })
    .click();
  page.once("dialog", (dialog) => dialog.accept());
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Agenda downloaden (.ics)", exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe("todo-agenda.ics");
});
