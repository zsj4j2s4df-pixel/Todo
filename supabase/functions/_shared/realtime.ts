// Provider URLs are fixed. Opaque call IDs never become arbitrary request URLs.
export function realtimeCallId(location: string | null): string {
  if (!location) throw Error("OpenAI gaf geen gespreksnummer terug");
  const url = new URL(location, "https://api.openai.com");
  const match = url.pathname.match(
    /^\/v1\/realtime\/calls\/([A-Za-z0-9_-]{8,180})$/,
  );
  if (
    url.origin !== "https://api.openai.com" ||
    !match ||
    url.search ||
    url.hash
  )
    throw Error("OpenAI gaf een ongeldig gespreksnummer terug");
  return match[1];
}
export async function hangupRealtime(
  key: string,
  callId: string,
  apiFetch: typeof fetch = fetch,
): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{8,180}$/.test(callId)) return false;
  try {
    const r = await apiFetch(
      "https://api.openai.com/v1/realtime/calls/" +
        encodeURIComponent(callId) +
        "/hangup",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(8000),
      },
    );
    await r.body?.cancel();
    return r.ok || r.status === 404 || r.status === 410;
  } catch {
    return false;
  }
}
