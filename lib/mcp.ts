import { supabase } from "./supabase";
export const mcpUrl = "https://todo.zsj4j2s4df.workers.dev/mcp";
export async function mcpRequest(
  action: string,
  params: Record<string, unknown> = {},
) {
  if (!supabase) throw Error("Log eerst in om een assistent te verbinden.");
  const r = await supabase.functions.invoke("todo-mcp", {
    body: { action, ...params },
  });
  if (r.error) {
    try {
      const detail = await r.error.context?.json();
      if (typeof detail?.error === "string") throw Error(detail.error);
    } catch (e) {
      if (e instanceof Error && e.name === "Error") throw e;
    }
    throw Error("De assistentverbinding is niet bereikbaar. Probeer opnieuw.");
  }
  if (r.data?.error) throw Error(r.data.error);
  return r.data;
}
export function clientRedirect(value: string) {
  const u = new URL(value);
  if (u.protocol !== "https:" || u.username || u.password)
    throw Error("Onveilig terugkeeradres geweigerd.");
  window.location.assign(u.href);
}
