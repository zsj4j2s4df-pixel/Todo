import {
  type Connection,
  type Credentials,
  type SourceEvent,
  googleEvent,
} from "./providers.ts";
import { guardedFetch, providerJson, ProviderError } from "./policy.ts";
type State = { calendar_id: string; cursor: string; events: SourceEvent[] };
/** Cursors belong to a fixed date window. A new UTC day or expired cursor performs a full bounded refresh. */
export async function googleSync(
  c: Connection,
  cred: Credentials,
  from: string,
  to: string,
  cache: State[],
  fetcher: typeof fetch = fetch,
) {
  const guarded = guardedFetch("google_calendar", fetcher),
    states: State[] = [];
  for (const calendar_id of c.calendar_ids) {
    const previous = cache.find(
      (s) =>
        s.calendar_id === calendar_id && s.cursor && Array.isArray(s.events),
    );
    async function load(previous?: State): Promise<State> {
      const events = new Map<string, SourceEvent>(
        (previous?.events || []).map((e) => [e.event_id, e]),
      );
      const params = new URLSearchParams({
        singleEvents: "true",
        showDeleted: "true",
        maxResults: "250",
        ...(previous
          ? { syncToken: previous.cursor }
          : { timeMin: from, timeMax: to }),
      });
      const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar_id)}/events`;
      let cursor = "",
        page = 0;
      for (;;) {
        if (++page > 8) {
          if (previous) return load();
          throw new ProviderError(
            "limit",
            "Te veel agendapagina’s. Kies minder agenda’s.",
          );
        }
        const response = await guarded(base + "?" + params, {
          headers: { Authorization: `Bearer ${cred.access_token}` },
        });
        if (response.status === 410 && previous) {
          await response.body?.cancel();
          return load();
        }
        const data = await providerJson(async () => response, base);
        if (!Array.isArray(data.items))
          throw new ProviderError(
            "network",
            "Google gaf geen volledige agenda terug.",
          );
        for (const raw of data.items) {
          if (raw.status === "cancelled") {
            events.delete(String(raw.id));
            for (const [id, e] of events)
              if (e.resource.parent_id === raw.id) events.delete(id);
            continue;
          }
          const event = googleEvent(calendar_id, raw);
          if (!event) continue;
          const start = Date.parse(event.item.due_at),
            end = Date.parse(event.item.end_at || event.item.due_at);
          if (start < Date.parse(to) && end >= Date.parse(from))
            events.set(event.event_id, event);
          else events.delete(event.event_id);
          if (events.size > 1000) {
            if (previous) return load();
            throw new ProviderError(
              "limit",
              "Meer dan 1000 afspraken. Kies minder agenda’s.",
            );
          }
        }
        if (!data.nextPageToken) {
          cursor =
            typeof data.nextSyncToken === "string" ? data.nextSyncToken : "";
          break;
        }
        params.set("pageToken", String(data.nextPageToken));
      }
      return { calendar_id, cursor, events: [...events.values()] };
    }
    states.push(await load(previous));
  }
  const events = states.flatMap((s) => s.events);
  if (events.length > 1000)
    throw new ProviderError(
      "limit",
      "Meer dan 1000 afspraken in het syncvenster.",
    );
  return { events, states };
}
