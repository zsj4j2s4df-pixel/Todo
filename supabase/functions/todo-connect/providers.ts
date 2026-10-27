import { Temporal } from "npm:@js-temporal/polyfill@0.5.1";
import { findIana } from "npm:windows-iana@5.1.0";
import { createDAVClient } from "npm:tsdav@2.5.0";
import ICAL from "npm:ical.js@2.2.1";
import {
  Provider,
  ProviderError,
  guardedFetch,
  providerJson,
  safeText,
} from "./policy.ts";
export type Credentials = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  username?: string;
  password?: string;
  [key: string]: unknown;
};
export type Connection = {
  id: string;
  user_id: string;
  provider: Provider;
  calendar_ids: string[];
  write_enabled: boolean;
  account_label: string;
  enabled: boolean;
};
export type SourceEvent = {
  calendar_id: string;
  event_id: string;
  version: string;
  item: {
    title: string;
    description: string;
    due_at: string;
    end_at: string | null;
    timezone: string;
    location: string;
    all_day: boolean;
    busy?: boolean;
    start_date: string | null;
    end_date: string | null;
  };
  resource: Record<string, unknown>;
};
export type Calendar = { id: string; name: string; writable: boolean };
export type Env = { get: (name: string) => string | undefined };
export const APP_ORIGIN = "https://todo.zsj4j2s4df.workers.dev";
export function configuration(env: Env) {
  return {
    google_calendar:
      !!env.get("GOOGLE_CLIENT_ID") && !!env.get("GOOGLE_CLIENT_SECRET"),
    gmail: !!env.get("GOOGLE_CLIENT_ID") && !!env.get("GOOGLE_CLIENT_SECRET"),
    outlook_calendar:
      !!env.get("MICROSOFT_CLIENT_ID") && !!env.get("MICROSOFT_CLIENT_SECRET"),
    icloud_calendar: true,
  };
}
export function oauthConfig(provider: Provider, env: Env) {
  if (provider === "icloud_calendar")
    throw new ProviderError(
      "unsupported",
      "Gebruik de beveiligde iCloud-aanmelding.",
    );
  const google = provider !== "outlook_calendar";
  const client = env.get(google ? "GOOGLE_CLIENT_ID" : "MICROSOFT_CLIENT_ID"),
    secret = env.get(
      google ? "GOOGLE_CLIENT_SECRET" : "MICROSOFT_CLIENT_SECRET",
    );
  if (!client || !secret)
    throw new ProviderError(
      "configuration",
      "De beheerder moet deze koppeling nog activeren.",
    );
  return {
    client,
    secret,
    authorize: google
      ? "https://accounts.google.com/o/oauth2/v2/auth"
      : "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize",
    token: google
      ? "https://oauth2.googleapis.com/token"
      : "https://login.microsoftonline.com/consumers/oauth2/v2.0/token",
    scope: google
      ? `openid email ${provider === "gmail" ? "https://www.googleapis.com/auth/gmail.readonly" : "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly"}`
      : "openid email offline_access User.Read Calendars.ReadWrite",
    redirect_uri: APP_ORIGIN + "/",
  };
}
export async function exchange(
  provider: Provider,
  env: Env,
  fields: Record<string, string>,
  fetcher: typeof fetch = fetch,
): Promise<Credentials> {
  const config = oauthConfig(provider, env),
    data = await providerJson(guardedFetch(provider, fetcher), config.token, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.client,
        client_secret: config.secret,
        ...fields,
      }),
    });
  if (typeof data.access_token !== "string")
    throw new ProviderError(
      "authorization",
      "De provider gaf geen toegangstoken.",
    );
  return {
    ...data,
    expires_at:
      Date.now() + Math.max(1, Number(data.expires_in) || 3600) * 1000,
  };
}
export async function readyCredentials(
  c: Connection,
  cred: Credentials,
  env: Env,
  fetcher: typeof fetch = fetch,
): Promise<Credentials> {
  if (c.provider === "icloud_calendar") return cred;
  if ((cred.expires_at || 0) > Date.now() + 60000 && cred.access_token)
    return cred;
  if (!cred.refresh_token)
    throw new ProviderError("authorization", "Verbind dit account opnieuw.");
  return {
    ...cred,
    ...(await exchange(
      c.provider,
      env,
      { grant_type: "refresh_token", refresh_token: cred.refresh_token },
      fetcher,
    )),
  };
}
const auth = (cred: Credentials) => ({
  Authorization: `Bearer ${cred.access_token}`,
});
export async function accountLabel(
  provider: Provider,
  cred: Credentials,
  fetcher: typeof fetch = fetch,
) {
  if (provider === "icloud_calendar") return safeText(cred.username, 200);
  const url =
    provider === "outlook_calendar"
      ? "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName"
      : "https://openidconnect.googleapis.com/v1/userinfo";
  const data = await providerJson(guardedFetch(provider, fetcher), url, {
    headers: auth(cred),
  });
  const label = data.email || data.mail || data.userPrincipalName;
  if (typeof label !== "string" || !label.includes("@"))
    throw new ProviderError(
      "authorization",
      "De provider kon het account niet eenduidig vaststellen.",
    );
  return safeText(label, 200);
}
async function dav(cred: Credentials, fetcher: typeof fetch) {
  if (typeof cred.username !== "string" || typeof cred.password !== "string")
    throw new ProviderError("authorization", "Verbind iCloud opnieuw.");
  const guarded = guardedFetch("icloud_calendar", fetcher);
  const client = await createDAVClient({
    serverUrl: "https://caldav.icloud.com",
    credentials: { username: cred.username, password: cred.password },
    authMethod: "Basic",
    defaultAccountType: "caldav",
    fetchOptions: { redirect: "manual" },
    fetch: guarded,
  });
  return { client, guarded };
}
export async function calendars(
  c: Connection,
  cred: Credentials,
  fetcher: typeof fetch = fetch,
): Promise<Calendar[]> {
  if (c.provider === "gmail") return [];
  if (c.provider === "icloud_calendar") {
    const { client, guarded } = await dav(cred, fetcher);
    const list = await client.fetchCalendars({ fetch: guarded });
    if (list.length > 50)
      throw new ProviderError("limit", "Te veel agenda’s in dit account.");
    return list.map((x) => ({
      id: x.url,
      name: safeText(x.displayName || "iCloud-agenda", 200),
      writable: true,
    }));
  }
  const google = c.provider === "google_calendar",
    url = google
      ? "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=100"
      : "https://graph.microsoft.com/v1.0/me/calendars?$top=100";
  const data = await providerJson(guardedFetch(c.provider, fetcher), url, {
    headers: auth(cred),
  });
  if (data.nextPageToken || data["@odata.nextLink"])
    throw new ProviderError(
      "limit",
      "Meer dan 100 agenda’s. Gebruik een account met minder agenda’s.",
    );
  return (data.items || data.value || []).map((x: any) => ({
    id: String(x.id),
    name: safeText(x.summary || x.name || "Agenda", 200),
    writable: google
      ? ["owner", "writer"].includes(x.accessRole)
      : x.canEdit === true,
  }));
}
function zone(name: string) {
  try {
    new Intl.DateTimeFormat("nl", { timeZone: name });
    return name;
  } catch {
    const converted = findIana(name);
    if (!converted.length)
      throw new ProviderError(
        "unsupported",
        "De tijdzone van een bronafspraak wordt nog niet ondersteund.",
      );
    return converted[0];
  }
}
function stamp(value: string, tz: string) {
  if (/Z$|[+-]\d\d:\d\d$/.test(value))
    return Temporal.Instant.from(value).toString();
  return Temporal.PlainDateTime.from(value)
    .toZonedDateTime(tz, { disambiguation: "later" })
    .toInstant()
    .toString();
}
function eventItem(
  title: unknown,
  description: unknown,
  location: unknown,
  start: string,
  end: string | null,
  tz: string,
  allDay = false,
  dates?: [string, string],
): SourceEvent["item"] {
  return {
    title: safeText(title || "Afspraak", 200),
    description: safeText(description, 5000),
    location: safeText(location, 500),
    due_at: start,
    end_at: end,
    timezone: tz,
    all_day: allDay,
    start_date: dates?.[0] || null,
    end_date: dates?.[1] || null,
  };
}
export function googleEvent(calendar: string, event: any): SourceEvent | null {
  if (event.status === "cancelled" || !event.id || !event.start) return null;
  const allDay = !!event.start.date,
    tz = zone(event.start.timeZone || "UTC");
  const dates: [string, string] | undefined = allDay
    ? [
        event.start.date,
        event.end?.date ||
          Temporal.PlainDate.from(event.start.date).add({ days: 1 }).toString(),
      ]
    : undefined;
  const start = dates
    ? Temporal.PlainDate.from(dates[0])
        .toZonedDateTime(tz)
        .toInstant()
        .toString()
    : stamp(event.start.dateTime, tz);
  const end = dates
    ? Temporal.PlainDate.from(dates[1])
        .toZonedDateTime(tz)
        .toInstant()
        .toString()
    : event.end?.dateTime
      ? stamp(event.end.dateTime, tz)
      : null;
  return {
    calendar_id: calendar,
    event_id: String(event.id),
    version: String(event.etag || ""),
    item: {
      ...eventItem(
        event.summary,
        event.description,
        event.location,
        start,
        end,
        tz,
        allDay,
        dates,
      ),
      busy: event.transparency !== "transparent",
    },
    resource: {
      id: event.id,
      parent_id: event.recurringEventId || null,
      has_attendees: !!event.attendees?.length,
      recurring: !!event.recurringEventId,
      kind: "google",
    },
  };
}
export function outlookEvent(calendar: string, event: any): SourceEvent | null {
  if (event.isCancelled || !event.id || !event.start) return null;
  const tz = zone(event.originalStartTimeZone || event.start.timeZone || "UTC"),
    allDay = !!event.isAllDay;
  const start = stamp(
      event.start.dateTime,
      zone(event.start.timeZone || "UTC"),
    ),
    end = stamp(event.end.dateTime, zone(event.end.timeZone || "UTC"));
  const dates: [string, string] | undefined = allDay
    ? [
        Temporal.Instant.from(start)
          .toZonedDateTimeISO(tz)
          .toPlainDate()
          .toString(),
        Temporal.Instant.from(end)
          .toZonedDateTimeISO(tz)
          .toPlainDate()
          .toString(),
      ]
    : undefined;
  return {
    calendar_id: calendar,
    event_id: String(event.id),
    version: String(event["@odata.etag"] || event.changeKey || ""),
    item: {
      ...eventItem(
        event.subject,
        event.bodyPreview || event.body?.content,
        event.location?.displayName,
        start,
        end,
        tz,
        allDay,
        dates,
      ),
      busy: event.showAs !== "free",
    },
    resource: {
      id: event.id,
      has_attendees: !!event.attendees?.length,
      recurring: event.type !== "singleInstance",
      kind: "outlook",
    },
  };
}
function icalZone(time: any, property: any) {
  const id = String(property?.getParameter("tzid") || time.zone?.tzid || "UTC");
  if (id === "floating") return "Europe/Amsterdam";
  try {
    return zone(id);
  } catch {
    const suffix = id.match(
      /(Africa|America|Antarctica|Asia|Atlantic|Australia|Europe|Indian|Pacific)\/.+$/,
    )?.[0];
    if (suffix) return zone(suffix);
    throw new ProviderError("unsupported", "Onbekende iCloud-tijdzone.");
  }
}
export function cloudEvents(calendar: string, object: any): SourceEvent[] {
  const text = String(object.data || "");
  if (text.length > 500000 || /<!DOCTYPE|<!ENTITY/.test(text))
    throw new ProviderError("limit", "iCloud-afspraak te groot of ongeldig.");
  const component = new ICAL.Component(ICAL.parse(text)),
    events = component.getAllSubcomponents("vevent");
  if (events.length > 1000)
    throw new ProviderError(
      "limit",
      "Te veel iCloud-herhalingen in dit venster.",
    );
  return events.flatMap((e) => {
    if (e.getFirstPropertyValue("status") === "CANCELLED") return [];
    if (e.hasProperty("rrule") || e.hasProperty("rdate"))
      throw new ProviderError(
        "unsupported",
        "iCloud heeft deze reeks niet uitgeklapt. Synchronisatie is gestopt om onjuiste afspraken te voorkomen.",
      );
    const start: any = e.getFirstPropertyValue("dtstart"),
      end: any = e.getFirstPropertyValue("dtend");
    if (!start) return [];
    const tz = icalZone(start, e.getFirstProperty("dtstart")),
      allDay = !!start.isDate;
    const dates: [string, string] | undefined = allDay
      ? [
          start.toString(),
          end?.toString() ||
            Temporal.PlainDate.from(start.toString())
              .add({ days: 1 })
              .toString(),
        ]
      : undefined;
    const begins = dates
      ? Temporal.PlainDate.from(dates[0])
          .toZonedDateTime(tz)
          .toInstant()
          .toString()
      : stamp(start.toString(), tz);
    const ends = dates
      ? Temporal.PlainDate.from(dates[1])
          .toZonedDateTime(tz)
          .toInstant()
          .toString()
      : end
        ? stamp(end.toString(), icalZone(end, e.getFirstProperty("dtend")))
        : null;
    const uid = String(e.getFirstPropertyValue("uid") || "");
    if (!uid)
      throw new ProviderError("unsupported", "iCloud-afspraak mist een UID.");
    const recurrence = String(e.getFirstPropertyValue("recurrence-id") || "");
    return [
      {
        calendar_id: calendar,
        event_id: uid + "#" + recurrence,
        version: String(object.etag || ""),
        item: {
          ...eventItem(
            e.getFirstPropertyValue("summary"),
            e.getFirstPropertyValue("description"),
            e.getFirstPropertyValue("location"),
            begins,
            ends,
            tz,
            allDay,
            dates,
          ),
          busy: e.getFirstPropertyValue("transp") !== "TRANSPARENT",
        },
        resource: {
          url: object.url,
          uid,
          recurrence_id: recurrence,
          has_attendees: e.hasProperty("attendee"),
          recurring: !!recurrence,
          original_start: allDay ? dates![0] : begins,
          kind: "icloud",
        },
      },
    ];
  });
}
export async function calendarSnapshot(
  c: Connection,
  cred: Credentials,
  from: string,
  to: string,
  fetcher: typeof fetch = fetch,
): Promise<SourceEvent[]> {
  const events: SourceEvent[] = [];
  const guarded = guardedFetch(c.provider, fetcher);
  if (c.provider === "icloud_calendar") {
    const { client, guarded: davFetch } = await dav(cred, fetcher),
      list = await client.fetchCalendars({ fetch: davFetch });
    for (const id of c.calendar_ids) {
      const calendar = list.find((x) => x.url === id);
      if (!calendar)
        throw new ProviderError(
          "authorization",
          "Een gekozen iCloud-agenda is niet meer beschikbaar.",
        );
      const objects = await client.fetchCalendarObjects({
        calendar,
        timeRange: { start: from, end: to },
        expand: true,
        fetch: davFetch,
      });
      if (objects.length > 1000)
        throw new ProviderError(
          "limit",
          "Te veel afspraken in de gekozen agenda’s.",
        );
      for (const object of objects) events.push(...cloudEvents(id, object));
    }
  } else
    for (const id of c.calendar_ids) {
      const google = c.provider === "google_calendar";
      let url = google
        ? `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(id)}/events?${new URLSearchParams({ singleEvents: "true", showDeleted: "false", maxResults: "250", timeMin: from, timeMax: to })}`
        : `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(id)}/calendarView?${new URLSearchParams({ startDateTime: from, endDateTime: to, $top: "250" })}`;
      let page = 0;
      while (url) {
        if (++page > 8)
          throw new ProviderError(
            "limit",
            "Te veel pagina’s. Kies minder agenda’s.",
          );
        const data = await providerJson(guarded, url, {
          headers: {
            ...auth(cred),
            ...(google
              ? {}
              : { Prefer: 'outlook.timezone="UTC", IdType="ImmutableId"' }),
          },
        });
        for (const event of data.items || data.value || []) {
          const normalized = google
            ? googleEvent(id, event)
            : outlookEvent(id, event);
          if (normalized) events.push(normalized);
        }
        if (events.length > 1000)
          throw new ProviderError(
            "limit",
            "Meer dan 1000 afspraken. Kies minder agenda’s.",
          );
        url = google
          ? data.nextPageToken
            ? `${url.split("&pageToken=")[0]}&pageToken=${encodeURIComponent(data.nextPageToken)}`
            : ""
          : data["@odata.nextLink"] || "";
      }
    }
  if (events.length > 1000)
    throw new ProviderError(
      "limit",
      "Meer dan 1000 afspraken in het syncvenster.",
    );
  return events;
}
export async function gmailSearch(
  cred: Credentials,
  query: string,
  fetcher: typeof fetch = fetch,
) {
  const guarded = guardedFetch("gmail", fetcher),
    headers = auth(cred);
  const data = await providerJson(
    guarded,
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${new URLSearchParams({ q: query.slice(0, 200), maxResults: "10" })}`,
    { headers },
  );
  const result = [];
  for (const message of data.messages || []) {
    const item = await providerJson(
      guarded,
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(message.id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
      { headers },
    );
    const get = (key: string) =>
      safeText(
        item.payload?.headers?.find((h: any) => h.name.toLowerCase() === key)
          ?.value,
        500,
      );
    result.push({
      id: String(item.id),
      subject: get("subject"),
      from: get("from"),
      date: get("date"),
      snippet: safeText(item.snippet, 1000),
    });
  }
  return result;
}
export async function gmailMessage(
  cred: Credentials,
  id: string,
  fetcher: typeof fetch = fetch,
) {
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(id))
    throw new ProviderError("unsupported", "Ongeldig mailkenmerk.");
  const data = await providerJson(
    guardedFetch("gmail", fetcher),
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
    { headers: auth(cred) },
  );
  const subject = safeText(
    data.payload?.headers?.find((h: any) => h.name.toLowerCase() === "subject")
      ?.value || "Mail",
    200,
  );
  let text = "",
    parts = 0;
  const walk = (part: any) => {
    if (++parts > 100) return;
    if (
      part.mimeType === "text/plain" &&
      typeof part.body?.data === "string" &&
      part.body.data.length < 100000
    ) {
      const raw = atob(part.body.data.replace(/-/g, "+").replace(/_/g, "/"));
      text += new TextDecoder().decode(
        Uint8Array.from(raw, (c) => c.charCodeAt(0)),
      );
    }
    for (const child of part.parts || []) walk(child);
  };
  walk(data.payload || {});
  return {
    body: `${subject}\n\n${safeText(text || data.snippet, 4700)}`,
    source_key: id,
    source_url: `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(id)}`,
  };
}
