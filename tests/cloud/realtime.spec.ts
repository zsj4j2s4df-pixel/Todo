import { test, expect } from "@playwright/test";
import { installCloudAccount } from "./fixtures";
async function fakeMedia(page: any, delayed = false) {
  await page.addInitScript(
    ({ delayed }: { delayed: boolean }) => {
      const state: any = window;
      state.__stops = 0;
      state.__closed = 0;
      state.__sent = [];
      const stream = { getTracks: () => [{ stop: () => state.__stops++ }] };
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        configurable: true,
        value: () =>
          delayed
            ? new Promise((resolve) => {
                state.__grant = () => resolve(stream);
              })
            : Promise.resolve(stream),
      });
      class Peer {
        localDescription: any;
        connectionState = "new";
        onconnectionstatechange: any;
        ontrack: any;
        createDataChannel() {
          const channel = {
            readyState: "open",
            onmessage: null as any,
            send: (value: string) => state.__sent.push(JSON.parse(value)),
            close() {
              this.readyState = "closed";
            },
          };
          state.__channel = channel;
          return channel;
        }
        addTrack() {}
        async createOffer() {
          return { type: "offer", sdp: "v=0\r\nmock-offer" };
        }
        async setLocalDescription(value: any) {
          this.localDescription = value;
        }
        async setRemoteDescription() {
          this.connectionState = "connected";
          this.onconnectionstatechange?.();
        }
        close() {
          this.connectionState = "closed";
          state.__closed++;
          this.onconnectionstatechange?.();
        }
      }
      Object.defineProperty(window, "RTCPeerConnection", {
        configurable: true,
        value: Peer,
      });
    },
    { delayed },
  );
}
test("live tool bridge preserves confirmation and stops microphone on stop and navigation", async ({
  page,
}) => {
  let starts = 0,
    stops = 0,
    tools = 0;
  const proposal = {
    action: "create",
    item: { title: "Live taak", kind: "task", description: "", due_at: "" },
  };
  const fixture = await installCloudAccount(page, (req) => {
    if (!req.url().endsWith("/functions/v1/todo-ai")) return;
    const b = req.postDataJSON();
    if (b.action === "realtime_start") {
      starts++;
      return {
        session_id: "11111111-1111-4111-8111-111111111111",
        sdp: "v=0\r\nmock-answer",
        duration_seconds: 90,
      };
    }
    if (b.action === "realtime_stop") {
      stops++;
      return { stopped: true };
    }
    if (b.action === "realtime_tool") {
      tools++;
      return {
        proposal,
        value: { proposal, saved: false, requires_confirmation: true },
      };
    }
  });
  await fakeMedia(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Assistent", exact: true }).click();
  await page
    .getByRole("button", { name: "Livegesprek starten", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Jouw vraag", exact: true }),
  ).toBeDisabled();
  expect(starts).toBe(1);
  await page.evaluate(() => {
    const w = window as any;
    w.__channel.onmessage({
      data: JSON.stringify({
        type: "response.done",
        response: {
          output: [
            {
              type: "function_call",
              call_id: "tool1",
              name: "prepare_item",
              arguments: '{"title":"Live taak"}',
            },
          ],
        },
      }),
    });
  });
  await expect(
    page.getByRole("button", { name: "Voorstel uitvoeren", exact: true }),
  ).toBeVisible();
  expect(fixture.writes).toBe(0);
  await page.evaluate(() => {
    (window as any).__channel.onmessage({
      data: JSON.stringify({
        type: "response.output_audio_transcript.done",
        transcript: "ja opslaan",
      }),
    });
  });
  await expect(page.getByText("Assistent:", { exact: true })).toBeVisible();
  expect(fixture.writes).toBe(0);
  expect(tools).toBe(1);
  await page.evaluate(() => {
    (window as any).__channel.onmessage({
      data: JSON.stringify({
        type: "conversation.item.input_audio_transcription.completed",
        transcript: "ja, opslaan",
      }),
    });
  });
  await expect(
    page.getByText("Uitgevoerd. Je overzicht is bijgewerkt.", { exact: true }),
  ).toBeVisible();
  expect(fixture.writes).toBe(1);
  await page
    .getByRole("button", { name: "Livegesprek stoppen", exact: true })
    .click();
  await expect.poll(() => page.evaluate(() => (window as any).__stops)).toBe(1);
  await expect.poll(() => stops).toBe(1);
  expect(await page.evaluate(() => (window as any).__closed)).toBe(1);
  await page
    .getByRole("button", { name: "Livegesprek starten", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Livegesprek stoppen", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Alle taken/ }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__stops)).toBe(2);
  await expect.poll(() => stops).toBe(2);
});
test("cancelling during microphone permission never opens a remote session", async ({
  page,
}) => {
  let starts = 0;
  await installCloudAccount(page, (req) => {
    if (
      req.url().endsWith("/functions/v1/todo-ai") &&
      req.postDataJSON().action === "realtime_start"
    ) {
      starts++;
      return { error: "Should not start" };
    }
  });
  await fakeMedia(page, true);
  await page.goto("/");
  await page.getByRole("button", { name: "Assistent", exact: true }).click();
  await page
    .getByRole("button", { name: "Livegesprek starten", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Livegesprek stoppen", exact: true })
    .click();
  await page.evaluate(() => (window as any).__grant());
  await expect.poll(() => page.evaluate(() => (window as any).__stops)).toBe(1);
  expect(starts).toBe(0);
});
