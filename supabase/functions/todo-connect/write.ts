import { Temporal } from "npm:@js-temporal/polyfill@0.5.1";
import { findWindows } from "npm:windows-iana@5.1.0";
import { timezoneLines } from "../_shared/generated/ical-zone.ts";
import ICAL from "npm:ical.js@2.2.1";
import { createDAVClient } from "npm:tsdav@2.5.0";
import {
  Connection,
  Credentials,
  googleEvent,
  outlookEvent,
  cloudEvents,
  SourceEvent,
} from "./providers.ts";
import { ProviderError, guardedFetch, providerJson } from "./policy.ts";
type EventInput = {
  title: string;
  description: string;
  location: string;
  due_at: string;
  end_at: string | null;
  timezone: string;
  all_day: boolean;
  busy?: boolean;
  start_date: string | null;
  end_date: string | null;
  schedule_kind: string;
  schedule_until: string | null;
  schedule_count: number | null;
};
export function eventInput(value: any): EventInput {
  if (
    !value ||
    typeof value.title !== "string" ||
    !value.title.trim() ||
    value.title.length > 200 ||
    typeof value.description !== "string" ||
    value.description.length > 5000 ||
    typeof value.location !== "string" ||
    value.location.length > 500
  )
    throw new ProviderError(
      "unsupported",
      "Controleer titel, notities en locatie.",
    );
  const timezone = String(value.timezone || "UTC");
  try {
    new Intl.DateTimeFormat("nl", { timeZone: timezone });
  } catch {
    throw new ProviderError("unsupported", "Kies een geldige tijdzone.");
  }
  let due_at = String(value.due_at || ""),
    end_at = value.end_at ? String(value.end_at) : null,
    start_date: string | null = null,
    end_date: string | null = null;
  if (value.all_day) {
    start_date = Temporal.PlainDate.from(value.start_date).toString();
    end_date = Temporal.PlainDate.from(value.end_date).toString();
    if (end_date <= start_date)
      throw new ProviderError("unsupported", "Kies een geldige periode.");
    due_at = Temporal.PlainDate.from(start_date)
      .toZonedDateTime(timezone)
      .toInstant()
      .toString();
    end_at = Temporal.PlainDate.from(end_date)
      .toZonedDateTime(timezone)
      .toInstant()
      .toString();
  }
  Temporal.Instant.from(due_at);
  if (
    end_at &&
    Temporal.Instant.compare(
      Temporal.Instant.from(end_at),
      Temporal.Instant.from(due_at),
    ) < 0
  )
    throw new ProviderError("unsupported", "Eindtijd ligt voor de begintijd.");
  const schedule_kind = String(value.schedule_kind || "none");
  if (
    ![
      "none",
      "hourly",
      "daily",
      "weekly",
      "fortnightly",
      "monthly",
      "yearly",
    ].includes(schedule_kind) ||
    (value.all_day && schedule_kind === "hourly")
  )
    throw new ProviderError("unsupported", "Ongeldige agendaherhaling.");
  const schedule_until = value.schedule_until
      ? Temporal.PlainDate.from(value.schedule_until).toString()
      : null,
    schedule_count =
      value.schedule_count == null ? null : Number(value.schedule_count);
  if (
    (schedule_count !== null &&
      (!Number.isInteger(schedule_count) ||
        schedule_count < 1 ||
        schedule_count > 1000000)) ||
    (schedule_count && schedule_until)
  )
    throw new ProviderError(
      "unsupported",
      "Kies een einddatum óf een aantal momenten.",
    );
  return {
    title: value.title.trim(),
    description: value.description,
    location: value.location,
    due_at,
    end_at,
    timezone,
    all_day: !!value.all_day,
    busy: value.busy !== false,
    start_date,
    end_date,
    schedule_kind,
    schedule_until,
    schedule_count,
  };
}
function rrule(i: EventInput) {
  if (i.schedule_kind === "none") return null;
  const day = Temporal.Instant.from(i.due_at)
    .toZonedDateTimeISO(i.timezone)
    .toPlainDate();
  let rule = `FREQ=${i.schedule_kind === "fortnightly" ? "WEEKLY;INTERVAL=2" : i.schedule_kind.toUpperCase()}`;
  if (i.schedule_kind === "monthly" && day.day > 28)
    rule += `;BYMONTHDAY=${Array.from({ length: day.day - 27 }, (_, n) => 28 + n).join(",")};BYSETPOS=-1`;
  if (i.schedule_kind === "yearly" && day.month === 2 && day.day === 29)
    rule += ";BYMONTH=2;BYMONTHDAY=28,29;BYSETPOS=-1";
  if (i.schedule_count) rule += `;COUNT=${i.schedule_count}`;
  if (i.schedule_until) {
    const until = Temporal.PlainDate.from(i.schedule_until)
      .toPlainDateTime("23:59:59")
      .toZonedDateTime(i.timezone, { disambiguation: "later" })
      .toInstant()
      .toString()
      .replaceAll(/[-:]/g, "");
    rule += `;UNTIL=${i.all_day ? i.schedule_until.replaceAll("-", "") : until}`;
  }
  return rule;
}
function googleBody(i: EventInput, creation = false, requestId = "") {
  const result: any = {
    transparency: i.busy === false ? "transparent" : "opaque",
    summary: i.title,
    description: i.description,
    location: i.location,
    start: i.all_day
      ? { date: i.start_date, timeZone: i.timezone }
      : { dateTime: i.due_at, timeZone: i.timezone },
    end: i.all_day
      ? { date: i.end_date, timeZone: i.timezone }
      : { dateTime: i.end_at || i.due_at, timeZone: i.timezone },
  };
  if (creation && i.schedule_kind === "hourly") {
    result.start.timeZone = "UTC";
    result.end.timeZone = "UTC";
  }
  if (creation) {
    result.id = "todo" + requestId.replaceAll("-", "");
    result.extendedProperties = { private: { todo_request: requestId } };
    const rule = rrule(i);
    if (rule) result.recurrence = ["RRULE:" + rule];
  }
  return result;
}
function outlookBody(i: EventInput, creation = false, requestId = "") {
  const graphZone =
    findWindows(i.timezone)[0] || (i.timezone === "UTC" ? "UTC" : i.timezone);
  const local = (iso: string) =>
    Temporal.Instant.from(iso)
      .toZonedDateTimeISO(i.timezone)
      .toPlainDateTime()
      .toString();
  const result: any = {
    showAs: i.busy === false ? "free" : "busy",
    subject: i.title,
    body: { contentType: "text", content: i.description },
    location: { displayName: i.location },
    isAllDay: i.all_day,
    start: {
      dateTime: i.all_day ? i.start_date + "T00:00:00" : local(i.due_at),
      timeZone: graphZone,
    },
    end: {
      dateTime: i.all_day
        ? i.end_date + "T00:00:00"
        : local(i.end_at || i.due_at),
      timeZone: graphZone,
    },
  };
  if (creation) {
    result.transactionId = requestId;
    if (i.schedule_kind !== "none") {
      const date = Temporal.Instant.from(i.due_at)
        .toZonedDateTimeISO(i.timezone)
        .toPlainDate();
      if (
        i.schedule_kind === "hourly" ||
        (i.schedule_kind === "monthly" && date.day > 28) ||
        (i.schedule_kind === "yearly" && date.month === 2 && date.day === 29)
      )
        throw new ProviderError(
          "unsupported",
          "Outlook ondersteunt deze herhaling niet met hetzelfde datumgedrag. Kies hiervoor Todo als agenda of stel de reeks in Outlook in.",
        );
      const weekly = ["weekly", "fortnightly"].includes(i.schedule_kind),
        monthly = i.schedule_kind === "monthly",
        yearly = i.schedule_kind === "yearly";
      result.recurrence = {
        pattern: {
          type: weekly
            ? "weekly"
            : monthly
              ? "absoluteMonthly"
              : yearly
                ? "absoluteYearly"
                : "daily",
          interval: i.schedule_kind === "fortnightly" ? 2 : 1,
          ...(weekly
            ? {
                daysOfWeek: [
                  [
                    "monday",
                    "tuesday",
                    "wednesday",
                    "thursday",
                    "friday",
                    "saturday",
                    "sunday",
                  ][date.dayOfWeek - 1],
                ],
                firstDayOfWeek: "monday",
              }
            : {}),
          ...(monthly || yearly ? { dayOfMonth: date.day } : {}),
          ...(yearly ? { month: date.month } : {}),
        },
        range: {
          type: i.schedule_count
            ? "numbered"
            : i.schedule_until
              ? "endDate"
              : "noEnd",
          startDate: date.toString(),
          recurrenceTimeZone: graphZone,
          ...(i.schedule_count
            ? { numberOfOccurrences: i.schedule_count }
            : {}),
          ...(i.schedule_until ? { endDate: i.schedule_until } : {}),
        },
      };
    }
  }
  return result;
}
function icalTime(iso: string, date: string | null, allDay: boolean) {
  return ICAL.Time.fromString(
    allDay ? date! : Temporal.Instant.from(iso).toString(),
    null,
  );
}
function setIcalFields(event: ICAL.Component, i: EventInput) {
  for (const field of ["dtstart", "dtend"])
    event.getFirstProperty(field)?.removeParameter("tzid");
  event.updatePropertyWithValue(
    "transp",
    i.busy === false ? "TRANSPARENT" : "OPAQUE",
  );
  event.updatePropertyWithValue("summary", i.title);
  event.updatePropertyWithValue("description", i.description);
  event.updatePropertyWithValue("location", i.location);
  event.updatePropertyWithValue(
    "dtstart",
    icalTime(i.due_at, i.start_date, i.all_day),
  );
  event.updatePropertyWithValue(
    "dtend",
    icalTime(i.end_at || i.due_at, i.end_date, i.all_day),
  );
  event.updatePropertyWithValue(
    "dtstamp",
    ICAL.Time.fromJSDate(new Date(), true),
  );
  event.updatePropertyWithValue(
    "sequence",
    Number(event.getFirstPropertyValue("sequence") || 0) + 1,
  );
}
async function cloudClient(cred: Credentials, guarded: typeof fetch) {
  return createDAVClient({
    serverUrl: "https://caldav.icloud.com",
    credentials: { username: cred.username!, password: cred.password! },
    authMethod: "Basic",
    defaultAccountType: "caldav",
    fetch: guarded,
  });
}
export async function createSourceEvent(
  c: Connection,
  cred: Credentials,
  calendar: string,
  raw: unknown,
  requestId: string,
  fetcher: typeof fetch = fetch,
): Promise<SourceEvent> {
  const i = eventInput(raw);
  if (!/^[0-9a-f-]{36}$/i.test(requestId))
    throw new ProviderError("unsupported", "Ongeldig verzoekkenmerk.");
  const guarded = guardedFetch(c.provider, fetcher),
    headers = {
      Authorization: `Bearer ${cred.access_token}`,
      "Content-Type": "application/json",
    };
  if (c.provider === "google_calendar") {
    const body = googleBody(i, true, requestId),
      url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar)}/events`;
    let data;
    try {
      data = await providerJson(guarded, url + "?sendUpdates=none", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
    } catch (e) {
      if (!(e instanceof ProviderError) || e.code !== "conflict") throw e;
      data = await providerJson(guarded, url + "/" + body.id, { headers });
      if (data.extendedProperties?.private?.todo_request !== requestId) throw e;
    }
    return googleEvent(calendar, data)!;
  }
  if (c.provider === "outlook_calendar") {
    const data = await providerJson(
      guarded,
      `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calendar)}/events`,
      {
        method: "POST",
        headers: {
          ...headers,
          Prefer: 'outlook.timezone="UTC", IdType="ImmutableId"',
        },
        body: JSON.stringify(outlookBody(i, true, requestId)),
      },
    );
    return outlookEvent(calendar, data)!;
  }
  if (c.provider !== "icloud_calendar")
    throw new ProviderError("unsupported", "Kies een agenda.");
  const client = await cloudClient(cred, guarded),
    list = await client.fetchCalendars({ fetch: guarded }),
    target = list.find((x) => x.url === calendar);
  if (!target)
    throw new ProviderError("authorization", "Agenda niet beschikbaar.");
  const comp = new ICAL.Component(["vcalendar", [], []]);
  comp.updatePropertyWithValue("version", "2.0");
  comp.updatePropertyWithValue("prodid", "-//Todo//NL");
  const ev = new ICAL.Component("vevent");
  ev.updatePropertyWithValue("uid", requestId + "@todo");
  setIcalFields(ev, i);
  const rule = rrule(i);
  if (rule) {
    ev.updatePropertyWithValue("rrule", ICAL.Recur.fromString(rule));
    if (!i.all_day && i.schedule_kind !== "hourly") {
      for (const [name, value] of [
        ["dtstart", i.due_at],
        ["dtend", i.end_at || i.due_at],
      ]) {
        const local = Temporal.Instant.from(value)
          .toZonedDateTimeISO(i.timezone)
          .toPlainDateTime()
          .toString();
        ev.updatePropertyWithValue(name, ICAL.Time.fromString(local, null));
        ev.getFirstProperty(name)!.setParameter("tzid", i.timezone);
      }
      const timezone = new ICAL.Component(
        ICAL.parse(
          timezoneLines(
            i.timezone,
            Temporal.Instant.from(i.due_at).toZonedDateTimeISO(i.timezone).year,
          ).join("\r\n") + "\r\n",
        ),
      );
      comp.addSubcomponent(timezone);
    }
  }
  comp.addSubcomponent(ev);
  const url = new URL(
    requestId + ".ics",
    calendar.endsWith("/") ? calendar : calendar + "/",
  ).href;
  try {
    const response = await client.createCalendarObject({
      calendar: target,
      filename: requestId + ".ics",
      iCalString: comp.toString(),
      headers: { "If-None-Match": "*" },
      fetch: guarded,
    });
    if (!response.ok)
      throw new ProviderError("network", "Opslaan in iCloud is niet gelukt.");
  } catch (e) {
    if (!(e instanceof ProviderError) || e.code !== "conflict") throw e;
    const existing = await client.fetchCalendarObjects({
      calendar: target,
      objectUrls: [url],
      fetch: guarded,
    });
    if (!existing.some((x) => String(x.data).includes(requestId + "@todo")))
      throw e;
  }
  return {
    calendar_id: calendar,
    event_id: requestId + "@todo#",
    version: "",
    item: i,
    resource: {
      url,
      uid: requestId + "@todo",
      recurrence_id: "",
      recurring: i.schedule_kind !== "none",
      has_attendees: false,
      kind: "icloud",
    },
  };
}
export async function changeSourceEvent(
  c: Connection,
  cred: Credentials,
  calendar: string,
  resource: any,
  version: string,
  raw: unknown,
  remove: boolean,
  fetcher: typeof fetch = fetch,
): Promise<SourceEvent | null> {
  const guarded = guardedFetch(c.provider, fetcher),
    headers = {
      Authorization: `Bearer ${cred.access_token}`,
      "Content-Type": "application/json",
      "If-Match": version,
    };
  if (!version)
    throw new ProviderError(
      "conflict",
      "Vernieuw deze afspraak eerst om de bronversie te controleren.",
    );
  if (c.provider === "google_calendar") {
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar)}/events/${encodeURIComponent(resource.id)}`;
    const current = await providerJson(guarded, url, { headers });
    if (current.etag !== version)
      throw new ProviderError(
        "conflict",
        "De bronafspraak is gewijzigd. Synchroniseer opnieuw.",
      );
    if (remove) {
      const r = await guarded(url + "?sendUpdates=all", {
        method: "DELETE",
        headers,
      });
      if (!r.ok)
        throw new ProviderError(
          "network",
          "Verwijderen in Google is niet gelukt.",
        );
      return null;
    }
    const data = await providerJson(guarded, url + "?sendUpdates=all", {
      method: "PATCH",
      headers,
      body: JSON.stringify(googleBody(eventInput(raw))),
    });
    return googleEvent(calendar, data);
  }
  if (c.provider === "outlook_calendar") {
    const url = `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(resource.id)}`,
      graphHeaders = {
        ...headers,
        Prefer: 'outlook.timezone="UTC", IdType="ImmutableId"',
      };
    const current = await providerJson(guarded, url, { headers: graphHeaders });
    if (String(current["@odata.etag"] || current.changeKey) !== version)
      throw new ProviderError(
        "conflict",
        "De bronafspraak is gewijzigd. Synchroniseer opnieuw.",
      );
    if (remove) {
      const r = await guarded(url, { method: "DELETE", headers: graphHeaders });
      if (!r.ok)
        throw new ProviderError(
          "network",
          "Verwijderen in Outlook is niet gelukt.",
        );
      return null;
    }
    const data = await providerJson(guarded, url, {
      method: "PATCH",
      headers: graphHeaders,
      body: JSON.stringify(outlookBody(eventInput(raw))),
    });
    return outlookEvent(calendar, data);
  }
  if (c.provider !== "icloud_calendar")
    throw new ProviderError("unsupported", "Kies een agenda.");
  const client = await cloudClient(cred, guarded),
    list = await client.fetchCalendars({ fetch: guarded }),
    target = list.find((x) => x.url === calendar);
  if (!target)
    throw new ProviderError("authorization", "Agenda niet beschikbaar.");
  const objects = await client.fetchCalendarObjects({
      calendar: target,
      objectUrls: [resource.url],
      fetch: guarded,
    }),
    object = objects[0];
  if (!object || object.etag !== version)
    throw new ProviderError(
      "conflict",
      "De iCloud-afspraak is gewijzigd. Synchroniseer opnieuw.",
    );
  const original = new ICAL.Component(ICAL.parse(String(object.data)));
  const reallyRecurring = original
    .getAllSubcomponents("vevent")
    .some((e) => e.hasProperty("rrule") || e.hasProperty("recurrence-id"));
  if (reallyRecurring && !resource.recurrence_id) {
    if (!resource.original_start)
      throw new ProviderError(
        "unsupported",
        "Het herhalingsmoment ontbreekt. Gebruik de bronagenda.",
      );
    resource = {
      ...resource,
      recurring: true,
      recurrence_id: resource.original_start,
    };
  }
  if (remove && !reallyRecurring && !resource.recurring) {
    const r = await client.deleteCalendarObject({
      calendarObject: object,
      fetch: guarded,
    });
    if (!r.ok)
      throw new ProviderError(
        "network",
        "Verwijderen in iCloud is niet gelukt.",
      );
    return null;
  }
  if (String(object.data).length > 500000)
    throw new ProviderError(
      "limit",
      "iCloud-reeks te groot om veilig te wijzigen.",
    );
  const component = new ICAL.Component(ICAL.parse(String(object.data))),
    events = component.getAllSubcomponents("vevent"),
    master = events.find(
      (x) =>
        String(x.getFirstPropertyValue("uid")) === resource.uid &&
        !x.hasProperty("recurrence-id"),
    );
  let event = events.find(
    (x) =>
      String(x.getFirstPropertyValue("uid")) === resource.uid &&
      String(x.getFirstPropertyValue("recurrence-id") || "") ===
        String(resource.recurrence_id || ""),
  );
  if (!event && resource.recurrence_id && master) {
    event = new ICAL.Component(JSON.parse(JSON.stringify(master.toJSON())));
    for (const field of ["rrule", "rdate", "exdate", "duration"])
      event.removeAllProperties(field);
    const tz = master.getFirstProperty("dtstart")?.getParameter("tzid");
    let recurrence = resource.recurrence_id;
    if (tz && typeof tz === "string" && recurrence.endsWith("Z")) {
      recurrence = Temporal.Instant.from(recurrence)
        .toZonedDateTimeISO(tz)
        .toPlainDateTime()
        .toString();
    }
    event.updatePropertyWithValue(
      "recurrence-id",
      ICAL.Time.fromString(recurrence, null),
    );
    if (tz && typeof tz === "string" && recurrence.length > 10)
      event.getFirstProperty("recurrence-id")!.setParameter("tzid", tz);
    component.addSubcomponent(event);
  }
  if (!event)
    throw new ProviderError(
      "unsupported",
      "Dit herhalingsmoment is niet veilig terug te schrijven. Gebruik de bronagenda.",
    );
  if (remove) {
    event.updatePropertyWithValue("status", "CANCELLED");
    event.updatePropertyWithValue(
      "sequence",
      Number(event.getFirstPropertyValue("sequence") || 0) + 1,
    );
    event.updatePropertyWithValue(
      "dtstamp",
      ICAL.Time.fromJSDate(new Date(), true),
    );
  } else setIcalFields(event, eventInput(raw));
  const r = await client.updateCalendarObject({
    calendarObject: { ...object, data: component.toString() },
    headers: { "If-Match": version },
    fetch: guarded,
  });
  if (!r.ok)
    throw new ProviderError("network", "iCloud kon de wijziging niet opslaan.");
  if (remove) return null;
  const i = eventInput(raw);
  return {
    calendar_id: calendar,
    event_id: String(resource.uid) + "#" + String(resource.recurrence_id || ""),
    version: r.headers.get("etag") || "",
    item: i,
    resource,
  };
}
