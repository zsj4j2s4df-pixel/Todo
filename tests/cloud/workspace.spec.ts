import { test, expect } from "@playwright/test";
import { installCloudAccount } from "./fixtures";
test("changing account clears a typed private note and closes an old item draft", async ({
  page,
}) => {
  await installCloudAccount(page);
  await page.goto("/");
  await page
    .getByLabel("Losse gedachte", { exact: true })
    .fill("Privé concept van account A");
  await page
    .getByRole("button", { name: "Taak toevoegen", exact: true })
    .click();
  await page.getByLabel("Titel", { exact: true }).fill("Alleen voor A");
  await page.evaluate(() => {
    const key = "sb-pyqvxwxpsngbndkrlajz-auth-token",
      session = JSON.parse(localStorage.getItem(key)!);
    const uid = "22222222-2222-4222-8222-222222222222";
    session.user = {
      ...session.user,
      id: uid,
      email: "account-b@example.test",
    };
    const parts = session.access_token.split(".");
    const payload = JSON.parse(
      atob(parts[1].replaceAll("-", "+").replaceAll("_", "/")),
    );
    payload.sub = uid;
    parts[1] = btoa(JSON.stringify(payload))
      .replaceAll("=", "")
      .replaceAll("+", "-")
      .replaceAll("/", "_");
    session.access_token = parts.join(".");
    localStorage.setItem(key, JSON.stringify(session));
    const channel = new BroadcastChannel(key);
    channel.postMessage({ event: "SIGNED_IN", session });
    channel.close();
  });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByLabel("Losse gedachte", { exact: true })).toHaveValue(
    "",
  );
  await expect(page.getByText("Alleen voor A", { exact: true })).toHaveCount(0);
});
test("provider setup is honest and a note AI proposal only writes after user confirmation", async ({
  page,
}) => {
  let writes = 0;
  await installCloudAccount(page, (req) => {
    const path = new URL(req.url()).pathname;
    if (path === "/functions/v1/todo-connect")
      return {
        configured: {
          google_calendar: false,
          gmail: false,
          outlook_calendar: false,
          icloud_calendar: true,
        },
      };
    if (path === "/functions/v1/todo-ai") {
      if (req.postDataJSON().action === "status") return { ready: true };
      return {
        answer: "Er staat een persoonlijke notitie klaar.",
        proposal: { action: "note_create", body: "Onthouden voor morgen" },
      };
    }
    if (path === "/rest/v1/inbox_notes" && req.method() === "POST") {
      writes++;
      expect(req.postDataJSON().user_id).toBe(
        "11111111-1111-4111-8111-111111111111",
      );
      return [];
    }
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Instellingen", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Google Agenda verbinden", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: /iCloud.*verbinden/ }).first(),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: /Assistent/, exact: false })
    .first()
    .click();
  await page
    .getByLabel("Jouw vraag", { exact: true })
    .fill("Bewaar een losse gedachte");
  await page
    .getByRole("button", { name: "Vraag stellen", exact: true })
    .click();
  await expect(
    page.getByText("Onthouden voor morgen", { exact: true }),
  ).toBeVisible();
  expect(writes).toBe(0);
  await page
    .getByRole("button", { name: "Voorstel uitvoeren", exact: true })
    .click();
  await expect.poll(() => writes).toBe(1);
});
