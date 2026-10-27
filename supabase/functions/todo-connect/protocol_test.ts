import { googleSync } from "./google-sync.ts";
import {
  allowedProviderUrl,
  guardedFetch,
  ProviderError,
  challenge,
} from "./policy.ts";
import {
  calendarSnapshot,
  googleEvent,
  outlookEvent,
  cloudEvents,
  gmailMessage,
  configuration,
} from "./providers.ts";
import {
  recurrenceKey,
  changeSourceEvent,
  eventInput,
  createSourceEvent,
} from "./write.ts";
import { connectorAction, performSync, performWrite } from "./service.ts";
const assert = (value: unknown, message = "Assertion failed") => {
  if (!value) throw Error(message);
};
const env = { get: (_key: string) => undefined };
const c: any = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "22222222-2222-4222-8222-222222222222",
  provider: "google_calendar",
  calendar_ids: ["primary"],
  write_enabled: true,
  write_calendar_ids: ["primary"],
  account_label: "fixture@example.test",
  enabled: true,
};
const cred = {
  access_token: "fixture-not-a-real-token",
  expires_at: Date.now() + 3600000,
  scope: "https://www.googleapis.com/auth/calendar.events",
};
const item = {
  title: "Afspraak",
  description: "",
  location: "",
  due_at: "2026-10-26T10:00:00Z",
  end_at: "2026-10-26T11:00:00Z",
  timezone: "Europe/Amsterdam",
  all_day: false,
  start_date: null,
  end_date: null,
  schedule_kind: "none",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
Deno.test(
  "Outlook writes use the original local timezone and preserve free-time status",
  async () => {
    let posted: any;
    await createSourceEvent(
      { ...c, provider: "outlook_calendar" },
      cred,
      "calendar",
      { ...item, busy: false, schedule_kind: "weekly" },
      "33333333-3333-4333-8333-333333333333",
      async (_url, init) => {
        posted = JSON.parse(String(init?.body));
        return json({
          id: "fixture",
          showAs: "free",
          originalStartTimeZone: "W. Europe Standard Time",
          start: { dateTime: item.due_at, timeZone: "UTC" },
          end: { dateTime: item.end_at, timeZone: "UTC" },
        });
      },
    );
    assert(posted.start.dateTime === "2026-10-26T11:00:00");
    assert(posted.start.timeZone === "W. Europe Standard Time");
    assert(
      posted.recurrence.range.recurrenceTimeZone === posted.start.timeZone,
    );
    assert(posted.showAs === "free");
    assert(
      googleEvent("primary", {
        id: "free",
        transparency: "transparent",
        start: { dateTime: item.due_at },
        end: { dateTime: item.end_at },
      })?.item.busy === false,
    );
  },
);
Deno.test(
  "provider URL policy rejects private networks, credentials and escaped redirects",
  async () => {
    for (const value of [
      "http://graph.microsoft.com/v1.0/me",
      "https://127.0.0.1/x",
      "https://graph.microsoft.com.evil.test/x",
      "https://secret@graph.microsoft.com/x",
      "https://caldav.icloud.com:123/x",
    ]) {
      assert(!allowedProviderUrl("outlook_calendar", value));
      assert(!allowedProviderUrl("icloud_calendar", value));
    }
    let calls = 0;
    const f = guardedFetch("google_calendar", async () => {
      calls++;
      return new Response(null, {
        status: 302,
        headers: { location: "https://evil.test/token" },
      });
    });
    try {
      await f("https://www.googleapis.com/calendar/v3/x", {
        headers: { Authorization: "Bearer fixture" },
      });
      throw Error("redirect accepted");
    } catch (e) {
      assert(e instanceof ProviderError);
      assert(calls === 1);
    }
  },
);
Deno.test(
  "OAuth read-only start uses owner-bound state, PKCE, fixed callback and no exposed verifier",
  async () => {
    let saved: any;
    const admin = {
      rpc: async (name: string, args: any) => {
        assert(name === "integration_oauth_state");
        saved = args;
        return { data: null };
      },
    };
    const config = {
      get: (key: string) =>
        key === "GOOGLE_CLIENT_ID"
          ? "public-client"
          : key === "GOOGLE_CLIENT_SECRET"
            ? "fixture-private"
            : undefined,
    };
    const result: any = await connectorAction(
      admin,
      null,
      c.user_id,
      { action: "start", provider: "google_calendar" },
      config,
    );
    const u = new URL(result.url);
    assert(
      u.searchParams.get("redirect_uri") ===
        "https://todo.zsj4j2s4df.workers.dev/",
    );
    assert(u.searchParams.get("scope")?.includes("calendar.events.readonly"));
    assert(!u.searchParams.get("scope")?.includes("calendar.events "));
    assert(
      u.searchParams.get("code_challenge") ===
        (await challenge(saved.details.verifier)),
    );
    assert(saved.owner_id === c.user_id);
    assert(!JSON.stringify(result).includes(saved.details.verifier));
    assert(configuration(env).google_calendar === false);
  },
);
Deno.test(
  "provider mapping preserves all-day exclusive dates and Outlook's original timezone",
  () => {
    const google = googleEvent("primary", {
      id: "g1",
      etag: '"v1"',
      summary: "Vakantie",
      start: { date: "2027-03-28", timeZone: "Europe/Amsterdam" },
      end: { date: "2027-03-29" },
    })!;
    assert(google.item.all_day);
    assert(
      Date.parse(google.item.end_at!) - Date.parse(google.item.due_at) ===
        23 * 3600000,
    );
    const outlook = outlookEvent("calendar", {
      id: "o1",
      isAllDay: true,
      originalStartTimeZone: "W. Europe Standard Time",
      start: { dateTime: "2027-03-27T23:00:00", timeZone: "UTC" },
      end: { dateTime: "2027-03-28T22:00:00", timeZone: "UTC" },
    })!;
    assert(outlook.item.start_date === "2027-03-28");
    assert(outlook.item.end_date === "2027-03-29");
  },
);
Deno.test(
  "incomplete provider snapshot never reaches atomic sync commit",
  async () => {
    const names: string[] = [];
    const admin = {
      rpc: async (name: string) => {
        names.push(name);
        return {
          data:
            name === "integration_claim"
              ? { connection: c, credentials: cred, lease: "fixture-lease" }
              : null,
        };
      },
    };
    let page = 0;
    const fake = async () => {
      page++;
      return page === 1
        ? json({
            items: [
              {
                id: "g1",
                summary: "Eén",
                start: { dateTime: item.due_at },
                end: { dateTime: item.end_at },
              },
            ],
            nextPageToken: "next",
          })
        : new Response(null, { status: 503 });
    };
    try {
      await performSync(admin, c.user_id, c.id, env, fake);
      throw Error("failure accepted");
    } catch (e) {
      assert(e instanceof ProviderError);
    }
    assert(!names.includes("integration_sync"));
    assert(names.includes("integration_finish"));
  },
);
Deno.test(
  "stale Google ETag prevents a write and external effects require user confirmation",
  async () => {
    const calls: { method: string; url: string }[] = [];
    const fake = async (url: any, init: any) => {
      calls.push({ method: init?.method || "GET", url: String(url) });
      return json({ id: "g1", etag: '"new"' });
    };
    try {
      await changeSourceEvent(
        c,
        cred,
        "primary",
        { id: "g1" },
        '"old"',
        item,
        false,
        fake,
      );
      throw Error("write accepted");
    } catch (e) {
      assert(e instanceof ProviderError && e.code === "conflict");
    }
    assert(calls.length === 1 && calls[0].method === "GET");
    try {
      await performWrite(
        {},
        null,
        c.user_id,
        { action: "delete", id: c.id },
        env,
        fake,
      );
      throw Error("missing confirmation accepted");
    } catch (e) {
      assert(e instanceof ProviderError && e.code === "unsupported");
    }
  },
);
Deno.test(
  "repeated Google creates use the same deterministic id and verify ownership of conflicts",
  async () => {
    const request = "33333333-3333-4333-8333-333333333333";
    let posts = 0,
      postBody: any;
    const upstream = {
      id: "todo" + request.replaceAll("-", ""),
      etag: '"version"',
      summary: item.title,
      start: { dateTime: item.due_at },
      end: { dateTime: item.end_at },
      extendedProperties: { private: { todo_request: request } },
    };
    const fake = async (_url: any, init: any) => {
      if (init?.method === "POST") {
        postBody = JSON.parse(init.body);
        posts++;
        return posts === 1 ? json(upstream) : json({ error: "exists" }, 409);
      }
      return json(upstream);
    };
    const first = await createSourceEvent(
        c,
        cred,
        "primary",
        item,
        request,
        fake,
      ),
      retry = await createSourceEvent(c, cred, "primary", item, request, fake);
    assert(first.event_id === retry.event_id);
    assert(postBody.id === upstream.id);
    assert(!postBody.attendees);
  },
);
Deno.test(
  "CalDAV accepts expanded instances, refuses unexpanded rules and never fetches attachments",
  async () => {
    const data =
      "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:uid\r\nDTSTART;VALUE=DATE:20261026\r\nDTEND;VALUE=DATE:20261027\r\nSUMMARY:Verjaardag\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
    const event = cloudEvents("calendar", {
      url: "https://p01-caldav.icloud.com/calendar/event.ics",
      etag: '"etag"',
      data,
    })[0];
    assert(event.item.start_date === "2026-10-26");
    let rejected = false;
    try {
      cloudEvents("calendar", {
        data: data.replace("SUMMARY:", "RRULE:FREQ=YEARLY\r\nSUMMARY:"),
      });
    } catch {
      rejected = true;
    }
    assert(rejected);
    const requests: string[] = [];
    const message = await gmailMessage(cred, "abc123", async (url: any) => {
      requests.push(String(url));
      return json({
        snippet: "Fallback",
        payload: {
          headers: [{ name: "Subject", value: "School" }],
          mimeType: "multipart/mixed",
          parts: [
            {
              mimeType: "text/plain",
              body: { data: btoa("Formulier invullen") },
            },
            { mimeType: "application/pdf", body: { attachmentId: "private" } },
          ],
        },
      });
    });
    assert(message.body.includes("Formulier invullen"));
    assert(requests.length === 1 && !requests[0].includes("attachments"));
  },
);
Deno.test(
  "unsupported Outlook recurrence is rejected before any provider request",
  async () => {
    let called = false;
    try {
      await createSourceEvent(
        { ...c, provider: "outlook_calendar" },
        cred,
        "calendar",
        { ...item, schedule_kind: "hourly" },
        "33333333-3333-4333-8333-333333333333",
        async () => {
          called = true;
          return json({});
        },
      );
      throw Error("unsupported recurrence accepted");
    } catch (e) {
      assert(e instanceof ProviderError && e.code === "unsupported");
    }
    assert(!called);
    let rejected = false;
    try {
      eventInput({ ...item, schedule_count: 3, schedule_until: "2027-01-01" });
    } catch {
      rejected = true;
    }
    assert(rejected);
  },
);
Deno.test(
  "Google incremental sync applies deletions and recovers expired cursors with a bounded full refresh",
  async () => {
    const from = "2026-10-20T00:00:00Z",
      to = "2026-11-20T00:00:00Z";
    const raw = (id: string, title: string) => ({
      id,
      summary: title,
      start: { dateTime: item.due_at },
      end: { dateTime: item.end_at },
    });
    const initial = await googleSync(c, cred, from, to, [], async () =>
      json({
        items: [raw("one", "Oud"), raw("two", "Weg")],
        nextSyncToken: "cursor1",
      }),
    );
    assert(initial.events.length === 2);
    const requests: URL[] = [];
    const changed = await googleSync(
      c,
      cred,
      from,
      to,
      initial.states,
      async (url) => {
        const u = new URL(String(url));
        requests.push(u);
        return json({
          items: [raw("one", "Nieuw"), { id: "two", status: "cancelled" }],
          nextSyncToken: "cursor2",
        });
      },
    );
    assert(
      changed.events.length === 1 && changed.events[0].item.title === "Nieuw",
    );
    assert(requests[0].searchParams.get("syncToken") === "cursor1");
    assert(!requests[0].searchParams.has("timeMin"));
    let calls = 0;
    const recovered = await googleSync(
      c,
      cred,
      from,
      to,
      changed.states,
      async (url) => {
        calls++;
        const u = new URL(String(url));
        if (calls === 1) return new Response(null, { status: 410 });
        assert(
          !u.searchParams.has("syncToken") &&
            u.searchParams.get("timeMin") === from,
        );
        return json({
          items: [raw("three", "Volledige nieuwe versie")],
          nextSyncToken: "cursor3",
        });
      },
    );
    assert(calls === 2 && recovered.events[0].event_id === "three");
  },
);

Deno.test(
  "CalDAV UTC and local recurrence IDs match without creating duplicate exceptions",
  () => {
    assert(
      recurrenceKey("2027-03-28T09:00:00", "Europe/Amsterdam") ===
        recurrenceKey("2027-03-28T07:00:00Z"),
    );
    assert(
      recurrenceKey(
        "2027-10-31T09:00:00",
        "/freeassociation.sourceforge.net/Tzfile/Europe/Amsterdam",
      ) === recurrenceKey("2027-10-31T08:00:00Z"),
    );
    assert(recurrenceKey("2027-03-28") === "date:2027-03-28");
  },
);
