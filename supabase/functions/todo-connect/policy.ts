export type Provider =
  | "google_calendar"
  | "gmail"
  | "outlook_calendar"
  | "icloud_calendar";
export const providers: Provider[] = [
  "google_calendar",
  "gmail",
  "outlook_calendar",
  "icloud_calendar",
];
export class ProviderError extends Error {
  constructor(
    public code:
      | "authorization"
      | "network"
      | "limit"
      | "configuration"
      | "conflict"
      | "unsupported",
    message: string,
  ) {
    super(message);
  }
}
export function allowedProviderUrl(provider: Provider, value: string) {
  try {
    const u = new URL(value);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.hash ||
      (u.port && u.port !== "443")
    )
      return false;
    return provider === "icloud_calendar"
      ? /^(caldav|p\d+-caldav)\.icloud\.com$/.test(u.hostname)
      : provider === "outlook_calendar"
        ? ["graph.microsoft.com", "login.microsoftonline.com"].includes(
            u.hostname,
          )
        : [
            "www.googleapis.com",
            "gmail.googleapis.com",
            "oauth2.googleapis.com",
            "openidconnect.googleapis.com",
          ].includes(u.hostname);
  } catch {
    return false;
  }
}
export function guardedFetch(
  provider: Provider,
  fetcher: typeof fetch = fetch,
) {
  let calls = 0;
  return async (
    input: RequestInfo | URL,
    init: RequestInit = {},
  ): Promise<Response> => {
    if (++calls > 40)
      throw new ProviderError(
        "limit",
        "Te veel providerverzoeken. Kies minder agenda’s.",
      );
    let url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    for (let redirect = 0; redirect < 4; redirect++) {
      if (!allowedProviderUrl(provider, url))
        throw new ProviderError(
          "unsupported",
          "Onverwacht provideradres geweigerd.",
        );
      let response: Response;
      try {
        response = await fetcher(url, {
          ...init,
          redirect: "manual",
          signal: AbortSignal.any([
            AbortSignal.timeout(12000),
            ...(init.signal ? [init.signal] : []),
          ]),
        });
      } catch {
        throw new ProviderError(
          "network",
          "Provider tijdelijk niet bereikbaar.",
        );
      }
      if ([301, 302, 307, 308].includes(response.status)) {
        const next = response.headers.get("location");
        await response.body?.cancel();
        if (!next)
          throw new ProviderError("network", "Onvolledige providerredirect.");
        url = new URL(next, url).href;
        continue;
      }
      if ([401, 403].includes(response.status)) {
        await response.body?.cancel();
        throw new ProviderError(
          "authorization",
          "Meld dit account opnieuw aan of controleer de verleende rechten.",
        );
      }
      if (response.status === 429) {
        await response.body?.cancel();
        throw new ProviderError(
          "limit",
          "De provider vraagt om later opnieuw te proberen.",
        );
      }
      if ([409, 412].includes(response.status)) {
        await response.body?.cancel();
        throw new ProviderError(
          "conflict",
          "De bronafspraak is gewijzigd. Vernieuw eerst.",
        );
      }
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (reader)
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 3000000) {
            await reader.cancel();
            throw new ProviderError(
              "limit",
              "Providerantwoord te groot. Kies minder agenda’s.",
            );
          }
          chunks.push(value);
        }
      const bytes = new Uint8Array(size);
      let at = 0;
      for (const c of chunks) {
        bytes.set(c, at);
        at += c.length;
      }
      const type = response.headers.get("content-type") || "";
      if (
        /xml/i.test(type) &&
        /<!DOCTYPE|<!ENTITY/i.test(new TextDecoder().decode(bytes))
      )
        throw new ProviderError(
          "unsupported",
          "Onveilige XML-inhoud geweigerd.",
        );
      return new Response(response.status === 204 ? null : bytes, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }
    throw new ProviderError("network", "Te veel providerredirects.");
  };
}
export async function providerJson(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit = {},
) {
  const r = await fetcher(url, init);
  if (!r.ok)
    throw new ProviderError(
      "network",
      "Providerverzoek kon niet worden afgerond.",
    );
  try {
    return await r.json();
  } catch {
    throw new ProviderError("network", "Provider gaf geen geldig antwoord.");
  }
}
export const safeText = (value: unknown, max: number) =>
  String(value ?? "").slice(0, max);
export const randomToken = () => {
  const a = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...a))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};
export const digest = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
export const challenge = async (value: string) =>
  btoa(
    String.fromCharCode(
      ...new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
      ),
    ),
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
