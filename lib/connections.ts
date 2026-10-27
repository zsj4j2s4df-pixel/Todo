import { supabase } from "./supabase";
export type Integration = {
  id: string;
  user_id: string;
  provider:
    | "google_calendar"
    | "gmail"
    | "outlook_calendar"
    | "icloud_calendar";
  account_label: string;
  enabled: boolean;
  status: string;
  last_sync: string | null;
  error_code: string | null;
  calendar_ids: string[];
  calendar_names: Record<string, string>;
  write_calendar_ids: string[];
  write_enabled: boolean;
};
export const providerLabels = {
  google_calendar: "Google Agenda",
  gmail: "Gmail",
  outlook_calendar: "Outlook-agenda",
  icloud_calendar: "iCloud-agenda",
};
export async function connectorRequest(body: Record<string, unknown>) {
  if (!supabase) throw Error("Log eerst in.");
  const r = await supabase.functions.invoke("todo-connect", { body });
  if (r.error) {
    try {
      const detail = await r.error.context?.json();
      if (typeof detail?.error === "string") throw Error(detail.error);
    } catch (e) {
      if (e instanceof Error && e.name === "Error") throw e;
    }
    throw Error("Koppelingen zijn tijdelijk niet bereikbaar. Probeer opnieuw.");
  }
  if (r.data?.error) throw Error(r.data.error);
  return r.data;
}
export function openProviderLogin(url: string) {
  const u = new URL(url);
  if (
    u.protocol !== "https:" ||
    !["accounts.google.com", "login.microsoftonline.com"].includes(
      u.hostname,
    ) ||
    u.username ||
    u.password
  )
    throw Error("Onverwacht aanmeldadres geweigerd.");
  window.location.assign(u.href);
}
