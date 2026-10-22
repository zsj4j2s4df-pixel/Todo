/** Read supported share/Shortcut fields as untrusted plain text, never as actions. */
export function captureFromUrl(
  url: URL,
): { text: string; truncated: boolean } | null {
  const fields = ["title", "text", "url"];
  if (
    url.searchParams.get("capture") !== "1" &&
    !fields.some((field) => url.searchParams.has(field))
  )
    return null;
  const combined = [
    ...new Set(
      fields
        .map((field) => url.searchParams.get(field)?.trim())
        .filter((v): v is string => !!v),
    ),
  ].join("\n");
  return { text: combined.slice(0, 5000), truncated: combined.length > 5000 };
}
