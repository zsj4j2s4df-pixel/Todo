import ICAL from "ical.js";
import { Temporal } from "@js-temporal/polyfill";
import { blankItem, itemSchema, Item } from "./model";
export type CalendarPreview = {
  items: Item[];
  skipped: { title: string; reason: string }[];
  duplicates: number;
};
export async function previewCalendar(
  text: string,
  owner: string,
  household: string | null,
  fallbackZone: string,
  existing: Item[],
): Promise<CalendarPreview> {
  if (new TextEncoder().encode(text).length > 200000)
    throw Error("Agendabestand is te groot (maximaal 200 kB).");
  try {
    new Intl.DateTimeFormat("nl", { timeZone: fallbackZone });
  } catch {
    throw Error("Kies een geldige tijdzone, bijvoorbeeld Europe/Amsterdam.");
  }
  let calendar: ICAL.Component;
  try {
    calendar = new ICAL.Component(ICAL.parse(text));
  } catch {
    throw Error("Dit is geen leesbaar iCalendar-bestand.");
  }
  if (calendar.name !== "vcalendar")
    throw Error("Dit is geen iCalendar-agenda.");
  const events = calendar.getAllSubcomponents("vevent");
  if (events.length > 100)
    throw Error("Importeer maximaal 100 afspraken per bestand.");
  const zones = new Map<string, ICAL.Timezone>();
  const zoneComponents = calendar.getAllSubcomponents("vtimezone");
  if (zoneComponents.length > 8)
    throw Error(
      "Het bestand bevat te veel aangepaste tijdzones. Exporteer de agenda in UTC.",
    );

  for (const component of zoneComponents) {
    const periods = component.getAllSubcomponents();
    if (periods.length > 8)
      throw Error(
        "De aangepaste tijdzone is te complex. Exporteer de agenda in UTC.",
      );
    for (const period of periods) {
      if (
        !["standard", "daylight"].includes(period.name) ||
        period.getAllProperties().length > 50
      )
        throw Error("Ongeldige aangepaste tijdzone.");
      const start = period.getFirstPropertyValue("dtstart") as ICAL.Time | null;
      if (!start || start.year < 1900 || start.year > 2100)
        throw Error("Aangepaste tijdzone valt buiten het ondersteunde bereik.");
      for (const property of period.getAllProperties("rrule")) {
        const rule = property.getFirstValue() as ICAL.Recur;
        if (
          rule.freq !== "YEARLY" ||
          Object.entries(rule.parts).some(
            ([key, values]) =>
              !["BYMONTH", "BYDAY", "BYMONTHDAY", "BYSETPOS"].includes(key) ||
              !Array.isArray(values) ||
              values.length > 2,
          )
        )
          throw Error(
            "De aangepaste tijdzone is te complex. Exporteer de agenda in UTC.",
          );
      }
      if (
        period
          .getAllProperties("rdate")
          .reduce((n, p) => n + p.getValues().length, 0) > 20
      )
        throw Error("Te veel tijdzoneovergangen. Exporteer de agenda in UTC.");
    }
    const id = String(component.getFirstPropertyValue("tzid") || "");
    if (id && id.length < 200)
      zones.set(id, new ICAL.Timezone({ component, tzid: id }));
  }
  function time(property: ICAL.Property) {
    const raw = String(property.toJSON()[3]);
    const dateOnly = property.type === "date";
    const plain = dateOnly
      ? Temporal.PlainDate.from(raw, { overflow: "reject" }).toPlainDateTime(
          "00:00",
        )
      : Temporal.PlainDateTime.from(raw.replace(/Z$/, ""), {
          overflow: "reject",
        });
    const zone = raw.endsWith("Z")
      ? "UTC"
      : String(property.getParameter("tzid") || fallbackZone);
    let known = true;
    try {
      new Intl.DateTimeFormat("nl", { timeZone: zone });
    } catch {
      known = false;
    }
    if (known) {
      return {
        iso: plain
          .toZonedDateTime(zone, { disambiguation: "compatible" })
          .toInstant()
          .toString(),
        zone,
        plain,
        dateOnly,
        known,
      };
    }
    if (plain.year < 1900 || plain.year > new Date().getUTCFullYear() + 10)
      throw Error(
        "Aangepaste tijdzone valt buiten het ondersteunde datumbereik.",
      );
    const custom = zones.get(zone);
    if (!custom) throw Error("Onbekende tijdzone in het bestand.");
    const value = (property.getFirstValue() as ICAL.Time).clone();
    value.zone = custom;
    return {
      iso: value.toJSDate().toISOString(),
      zone: fallbackZone,
      plain,
      dateOnly,
      known,
    };
  }
  const result: CalendarPreview = { items: [], skipped: [], duplicates: 0 };
  const seen = new Set(
    existing
      .filter((i) => i.owner_id === owner && i.import_uid)
      .map((i) => i.import_uid),
  );
  for (const event of events) {
    const title =
      String(event.getFirstPropertyValue("summary") || "Afspraak")
        .trim()
        .slice(0, 200) || "Afspraak";
    try {
      if (
        String(calendar.getFirstPropertyValue("method")).toUpperCase() ===
          "CANCEL" ||
        String(event.getFirstPropertyValue("status")).toUpperCase() ===
          "CANCELLED"
      )
        throw Error(
          "Geannuleerde afspraak; bestaande data wordt niet gewijzigd.",
        );
      if (
        ["rrule", "rdate", "exdate", "recurrence-id"].some((key) =>
          event.hasProperty(key),
        )
      )
        throw Error(
          "Herhalende afspraak: importeer losse afspraken of voeg deze handmatig toe.",
        );
      const uid = String(event.getFirstPropertyValue("uid") || "");
      if (!uid || uid.length > 2000)
        throw Error("De afspraak mist een bruikbaar UID.");
      const hash = Array.from(
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", new TextEncoder().encode(uid)),
        ),
        (n) => n.toString(16).padStart(2, "0"),
      ).join("");
      if (
        seen.has(hash) ||
        (uid.endsWith("@todo") &&
          existing.some(
            (i) => i.id === uid.slice(0, -5) && i.owner_id === owner,
          ))
      ) {
        result.duplicates++;
        continue;
      }
      const startProp = event.getFirstProperty("dtstart");
      if (!startProp) throw Error("Begindatum ontbreekt.");
      const start = time(startProp);
      const endProp = event.getFirstProperty("dtend");
      let end = "";
      if (endProp) end = time(endProp).iso;
      else if (event.hasProperty("duration")) {
        if (!start.known)
          throw Error(
            "Duur met een aangepaste tijdzone wordt nog niet ondersteund.",
          );
        const duration = Temporal.Duration.from(
          String(event.getFirstPropertyValue("duration")),
        );
        if (duration.sign < 0) throw Error("Negatieve duur is ongeldig.");
        end = Temporal.Instant.from(start.iso)
          .toZonedDateTimeISO(start.zone)
          .add(duration)
          .toInstant()
          .toString();
      } else if (start.dateOnly)
        end = start.plain
          .add({ days: 1 })
          .toZonedDateTime(start.zone)
          .toInstant()
          .toString();
      const item = itemSchema.parse({
        ...blankItem(owner, household, "event"),
        title,
        description: String(
          event.getFirstPropertyValue("description") || "",
        ).slice(0, 5000),
        location: String(event.getFirstPropertyValue("location") || "").slice(
          0,
          500,
        ),
        due_at: start.iso,
        end_at: end,
        timezone: start.zone,
        import_uid: hash,
      });
      seen.add(hash);
      result.items.push(item);
    } catch (e) {
      result.skipped.push({
        title,
        reason:
          e instanceof Error && e.name !== "ZodError"
            ? e.message
            : "Ongeldige afspraak of eindtijd.",
      });
    }
  }
  return result;
}
