"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
export default function DeviceStatus() {
  const [push, setPush] = useState("Nog niet gecontroleerd"),
    [mic, setMic] = useState("Onbekend"),
    [ai, setAi] = useState("Nog niet gecontroleerd"),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setAi("Controleren…");
    void (async () => {
      let pushState = "Deze browser ondersteunt geen push";
      if ("Notification" in window && "serviceWorker" in navigator) {
        pushState =
          Notification.permission === "denied"
            ? "Toestemming geweigerd"
            : Notification.permission === "default"
              ? "Nog geen toestemming"
              : "Toestemming gegeven";
        try {
          const reg = await navigator.serviceWorker.getRegistration("/");
          const subscription = await reg?.pushManager?.getSubscription();
          pushState += subscription
            ? " · apparaat aangemeld"
            : " · apparaat niet aangemeld";
        } catch {
          pushState += " · apparaatstatus onbekend";
        }
      }
      if (active) setPush(pushState);
      let micState = "Deze browser kan niet opnemen";
      if (typeof navigator.mediaDevices?.getUserMedia === "function") {
        micState = "Ondersteund · nog niet getest";
        try {
          const permission = await navigator.permissions.query({
            name: "microphone" as PermissionName,
          });
          micState =
            permission.state === "granted"
              ? "Toestemming gegeven · audio nog niet getest"
              : permission.state === "denied"
                ? "Toestemming geweigerd"
                : "Nog geen toestemming gevraagd";
        } catch {
          /* Safari may not expose this permission. */
        }
      }
      if (active) setMic(micState);
      if (!supabase) {
        if (active) setAi("Vereist een ingelogd account");
        return;
      }
      const r = await supabase.functions.invoke("todo-ai", {
        body: { action: "status" },
      });
      if (active)
        setAi(
          r.error
            ? "Niet bereikbaar"
            : r.data?.ready
              ? "Server geactiveerd · echt gesprek nog te testen"
              : "Nog niet geactiveerd",
        );
    })().catch(() => {
      if (active) setAi("Status onbekend; probeer opnieuw.");
    });
    return () => {
      active = false;
    };
  }, [refresh]);
  return (
    <section aria-label="Apparaatstatus">
      <h3>Werkt alles op dit apparaat?</h3>
      <dl>
        <dt>Pushmeldingen</dt>
        <dd>{push}</dd>
        <dt>Microfoon</dt>
        <dd>{mic}</dd>
        <dt>Spraakassistent</dt>
        <dd>{ai}</dd>
      </dl>
      <button className="text-button" onClick={() => setRefresh(refresh + 1)}>
        Status opnieuw controleren
      </button>
      <p className="hint">
        Deze controle zet geen microfoon aan en verstuurt niets. Toestemming of
        serveractivatie bewijst geen bezorging of goed geluid.
      </p>
    </section>
  );
}
