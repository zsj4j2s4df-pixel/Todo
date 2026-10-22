import { test, expect } from "@playwright/test";
test("assistant creates only after explicit typed or transcribed confirmation", async ({
  page,
}) => {
  const uid = "11111111-1111-4111-8111-111111111111";
  let rows: any[] = [];
  let writes = 0;
  await page.route(
    "https://pyqvxwxpsngbndkrlajz.supabase.co/**",
    async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      if (req.method() === "OPTIONS")
        return route.fulfill({
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "*",
            "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
          },
        });
      let body: unknown = [];
      if (url.pathname === "/functions/v1/todo-ai")
        body =
          req.postDataJSON().action === "status"
            ? { ready: true }
            : {
                answer:
                  "Er staat een voorstel klaar. Zeg ja opslaan om te bevestigen.",
                proposal: {
                  action: "create",
                  item: {
                    title: "Sleutels klaarleggen",
                    kind: "task",
                    description: "Voor morgen",
                    due_at: "",
                  },
                },
              };
      else if (url.pathname === "/rest/v1/items") {
        if (req.method() === "POST") {
          writes++;
          const item = req.postDataJSON();
          expect(item.owner_id).toBe(uid);
          expect(item.visibility).toBe("private");
          rows = [item];
          body = { id: item.id };
        } else body = rows;
      } else if (url.pathname === "/auth/v1/user")
        body = {
          id: uid,
          email: "fixture@example.test",
          aud: "authenticated",
          role: "authenticated",
        };
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(body),
      });
    },
  );
  await page.addInitScript(
    ({ uid }) => {
      const now = Math.floor(Date.now() / 1000);
      const enc = (o: unknown) =>
        btoa(JSON.stringify(o))
          .replace(/=/g, "")
          .replace(/\+/g, "-")
          .replace(/\//g, "_");
      const token =
        enc({ alg: "HS256", typ: "JWT" }) +
        "." +
        enc({
          sub: uid,
          role: "authenticated",
          aud: "authenticated",
          exp: now + 3600,
          iat: now,
        }) +
        ".fixture";
      localStorage.setItem(
        "sb-pyqvxwxpsngbndkrlajz-auth-token",
        JSON.stringify({
          access_token: token,
          refresh_token: "fixture-not-real",
          expires_at: now + 3600,
          expires_in: 3600,
          token_type: "bearer",
          user: {
            id: uid,
            email: "fixture@example.test",
            aud: "authenticated",
            role: "authenticated",
          },
        }),
      );
    },
    { uid },
  );
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
  expect(writes).toBe(0);
  await page.getByRole("textbox", { name: "Jouw vraag", exact: true }).fill("ja, opslaan");
  await page
    .getByRole("button", { name: "Vraag stellen", exact: true })
    .click();
  await expect(
    page.getByText("Uitgevoerd. Je overzicht is bijgewerkt.", { exact: true }),
  ).toBeVisible();
  expect(writes).toBe(1);
  await page.getByRole("button", { name: /Alle taken/ }).click();
  await expect(
    page.getByRole("button", { name: /^Sleutels klaarleggen/ }),
  ).toBeVisible();
});
