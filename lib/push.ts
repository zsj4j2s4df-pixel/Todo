import { supabase } from "./supabase";
export function vapidBytes(key: string): Uint8Array<ArrayBuffer> {
  const raw = atob(
    key
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(key.length / 4) * 4, "="),
  );
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
export async function detachDevicePush(userId: string) {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const sub = await registration?.pushManager?.getSubscription();
  if (!sub) return;
  // Stop the browser first, even if a network failure prevents server cleanup.
  if (!(await sub.unsubscribe()))
    throw Error("Push kon niet worden uitgezet. Probeer opnieuw.");
  await supabase
    ?.from("push_subscriptions")
    .delete()
    .eq("user_id", userId)
    .eq("endpoint", sub.endpoint);
}
