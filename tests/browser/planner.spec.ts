import { test, expect } from "@playwright/test";
test("Canva icons load and checklist survives saving and reload", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("region", { name: "Jouw dagbrief" }),
  ).toBeVisible();
  const icon = page.locator(".nav .app-icon").first();
  await expect(icon).toBeVisible();
  expect(await icon.evaluate((el) => getComputedStyle(el).maskImage)).toContain(
    "/icons/ui/home.png",
  );
  const source = await page.request.get("/icons/ui/home.png");
  expect(source.ok()).toBe(true);
  expect(source.headers()["content-type"]).toContain("image/png");
  await page
    .getByRole("button", { name: "Taak toevoegen", exact: true })
    .click();
  await page.getByLabel("Titel", { exact: true }).fill("Tas klaarleggen");
  await page
    .getByRole("button", { name: "Stap toevoegen", exact: true })
    .click();
  await page.getByLabel("Stap 1", { exact: true }).fill("Sleutels");
  await page.getByLabel("Stap 1 afgerond", { exact: true }).check();
  await page.getByRole("button", { name: "Opslaan", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: /^Tas klaarleggen/ }).click();
  await expect(page.getByLabel("Stap 1", { exact: true })).toHaveValue(
    "Sleutels",
  );
  await expect(
    page.getByLabel("Stap 1 afgerond", { exact: true }),
  ).toBeChecked();
});
test("briefing time, content and weather place persist without automatic geolocation", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-22T10:00:00Z") });
  let forecasts = 0;
  await page.route("https://geocoding-api.open-meteo.com/**", (r) =>
    r.fulfill({
      json: {
        results: [
          {
            name: "Utrecht",
            country: "Nederland",
            admin1: "Utrecht",
            latitude: 52.09,
            longitude: 5.12,
          },
        ],
      },
    }),
  );
  await page.route("https://api.open-meteo.com/**", (r) => {
    forecasts++;
    return r.fulfill({
      json: {
        hourly: {
          time: Array.from(
            { length: 24 },
            (_, h) => `2026-10-22T${String(h).padStart(2, "0")}:00`,
          ),
          temperature_2m: Array(24).fill(12),
          precipitation_probability: Array(24).fill(40),
          wind_speed_10m: Array(24).fill(15),
        },
      },
    });
  });
  await page.goto("/");
  expect(forecasts).toBe(0);
  await page.getByRole("button", { name: "Instellingen", exact: true }).click();
  await page
    .getByLabel("Tijd van je ochtendseintje", { exact: true })
    .fill("07:15");
  await page.getByLabel("Weer bij mijn dag", { exact: true }).check();
  await page.getByLabel("Weerplaats zoeken", { exact: true }).fill("Utrecht");
  await page
    .getByRole("button", { name: "Plaats zoeken", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Utrecht, Utrecht Nederland", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Briefing bewaren", exact: true })
    .click();
  await page
    .getByRole("button", { name: /Vandaag/ })
    .first()
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Het weer · Utrecht, Nederland",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Vandaag 12 tot 12 °C", { exact: true }),
  ).toBeVisible();
  expect(forecasts).toBeGreaterThan(0);
  await page.reload();
  await page.getByRole("button", { name: "Instellingen", exact: true }).click();
  await expect(
    page.getByLabel("Tijd van je ochtendseintje", { exact: true }),
  ).toHaveValue("07:15");
  await expect(
    page.getByLabel("Weer bij mijn dag", { exact: true }),
  ).toBeChecked();
});
test("weekly routine continues once with a fresh checklist after completion", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-23T12:00:00Z") });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Taak toevoegen", exact: true })
    .click();
  await page
    .getByLabel("Titel", { exact: true })
    .fill("Wekelijkse administratie");
  await page
    .getByLabel("Streefdatum", { exact: true })
    .fill("2026-10-23T10:00");
  await page
    .getByRole("combobox", { name: "Herhalen na afronden", exact: true })
    .selectOption("weekly");
  await page
    .getByRole("button", { name: "Stap toevoegen", exact: true })
    .click();
  await page.getByLabel("Stap 1", { exact: true }).fill("Bonnen");
  await page.getByLabel("Stap 1 afgerond", { exact: true }).check();
  await page.getByRole("button", { name: "Opslaan", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Voltooi Wekelijkse administratie",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: /Alle taken/ }).click();
  await expect(
    page.getByRole("button", {
      name: "Voltooi Wekelijkse administratie",
      exact: true,
    }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: /^Wekelijkse administratie/ }).click();
  await expect(page.getByLabel("Streefdatum", { exact: true })).toHaveValue(
    "2026-10-30T10:00",
  );
  await expect(
    page.getByLabel("Stap 1 afgerond", { exact: true }),
  ).not.toBeChecked();
  await page
    .getByRole("button", { name: "Sluiten", exact: true })
    .last()
    .click();
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: "Voltooi Wekelijkse administratie",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /Alle taken/ }).click();
  await expect(
    page.getByRole("button", {
      name: "Voltooi Wekelijkse administratie",
      exact: true,
    }),
  ).toHaveCount(1);
});
test("calendar file requires preview confirmation and a second import stays duplicate-free", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Instellingen", exact: true }).click();
  const content =
    "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:todo-import-fixture\r\nDTSTART:20991225T100000Z\r\nDTEND:20991225T110000Z\r\nSUMMARY:Geimporteerde afspraak\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
  const upload = () =>
    page.getByLabel("Agendabestand kiezen", { exact: true }).setInputFiles({
      name: "agenda.ics",
      mimeType: "text/calendar",
      buffer: Buffer.from(content),
    });
  await upload();
  const importButton = page.getByRole("button", {
    name: "Geselecteerde afspraken privé importeren",
    exact: true,
  });
  await expect(importButton).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("todo-device-v1") || "[]").length,
    ),
  ).toBe(0);
  await importButton.click();
  await expect(
    page.getByText(
      "1 afspraak privé geïmporteerd. Bestaande afspraken zijn overgeslagen.",
      { exact: true },
    ),
  ).toBeVisible();
  await upload();
  await expect(
    page.getByText("0 nieuwe afspraken · 1 al aanwezig · 0 overgeslagen.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(importButton).toBeDisabled();
});
