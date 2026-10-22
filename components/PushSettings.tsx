"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { vapidBytes, detachDevicePush } from "@/lib/push";
const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_KEY;
type Device = {
  id: string;
  reminders_enabled: boolean;
  morning_enabled: boolean;
};
export default function PushSettings({
  user,
  deliveryTime,
}: {
  user: string;
  deliveryTime: string;
}) {
  const [device, setDevice] = useState<Device | null>(null),
    [supported, setSupported] = useState(false),
    [busy, setBusy] = useState(true),
    [message, setMessage] = useState(""),
    [denied, setDenied] = useState(false);
  useEffect(() => {
    let active = true;
    const can =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setSupported(can);
    setDenied(can && Notification.permission === "denied");
    async function inspect() {
      try {
        if (can && supabase) {
          const reg = await navigator.serviceWorker.getRegistration("/");
          const sub = await reg?.pushManager.getSubscription();
          if (sub) {
            const r = await supabase
              .from("push_subscriptions")
              .select("id,reminders_enabled,morning_enabled")
              .eq("user_id", user)
              .eq("endpoint", sub.endpoint)
              .maybeSingle();
            if (r.error) throw r.error;
            if (active) setDevice(r.data);
          }
        }
      } catch {
        if (active)
          setMessage("De pushstatus kon niet worden geladen. Probeer opnieuw.");
      } finally {
        if (active) setBusy(false);
      }
    }
    void inspect();
    return () => {
      active = false;
    };
  }, [user]);
  async function enable() {
    setBusy(true);
    setMessage("");
    try {
      if (!publicKey || !supabase) throw Error("Push is nog niet beschikbaar.");
      const permission = await Notification.requestPermission();
      setDenied(permission === "denied");
      if (permission !== "granted")
        throw Error(
          "Geef meldingen toestemming in de instellingen van je browser of apparaat.",
        );
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ||
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidBytes(publicKey),
        }));
      const json = sub.toJSON();
      const r = await supabase
        .from("push_subscriptions")
        .upsert(
          {
            user_id: user,
            endpoint: sub.endpoint,
            p256dh: json.keys?.p256dh,
            auth: json.keys?.auth,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
          { onConflict: "endpoint" },
        )
        .select("id,reminders_enabled,morning_enabled")
        .single();
      if (r.error) {
        await sub.unsubscribe();
        throw Error(
          "Dit apparaat kon niet worden gekoppeld. Probeer opnieuw in te schakelen.",
        );
      }
      setDevice(r.data);
      setMessage(
        "Push staat aan op dit apparaat. Nieuwe herinneringen worden rond hun tijdstip aangeboden.",
      );
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Push inschakelen is niet gelukt.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function change(next: Device) {
    setBusy(true);
    setMessage("");
    try {
      const r = await supabase!
        .from("push_subscriptions")
        .update({
          reminders_enabled: next.reminders_enabled,
          morning_enabled: next.morning_enabled,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        })
        .eq("id", next.id)
        .eq("user_id", user)
        .select("id")
        .single();
      if (r.error) throw r.error;
      setDevice(next);
    } catch {
      setMessage("Voorkeur opslaan is niet gelukt.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="push-settings" aria-label="Pushmeldingen">
      <h3>Push op dit apparaat</h3>
      <p>
        Meldingen kunnen ook binnenkomen als Todo gesloten is. iPhone/iPad: voeg
        Todo eerst toe aan je beginscherm en open de app vanaf dat icoon
        (iOS/iPadOS 16.4 of nieuwer).
      </p>
      {!supported ? (
        <p className="hint">
          Deze browser ondersteunt hier geen webpush. Probeer de geïnstalleerde
          app of een recente browser.
        </p>
      ) : !publicKey ? (
        <p>Push wordt nog ingericht.</p>
      ) : (
        <>
          {device ? (
            <>
              <p>Push is ingeschakeld op dit apparaat.</p>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={device.reminders_enabled}
                  disabled={busy}
                  onChange={(e) =>
                    void change({
                      ...device,
                      reminders_enabled: e.target.checked,
                    })
                  }
                />
                Geplande herinneringen
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={device.morning_enabled}
                  disabled={busy}
                  onChange={(e) =>
                    void change({
                      ...device,
                      morning_enabled: e.target.checked,
                    })
                  }
                />
                Dagbriefing rond {deliveryTime}, volgens je briefinginstellingen
              </label>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void detachDevicePush(user)
                    .then(() => {
                      setDevice(null);
                      setMessage("Push is uitgezet op dit apparaat.");
                    })
                    .catch(() => setMessage("Uitzetten is niet gelukt."))
                    .finally(() => setBusy(false));
                }}
              >
                Push uitzetten
              </button>
            </>
          ) : (
            <button
              className="primary"
              disabled={busy || denied}
              onClick={() => void enable()}
            >
              Push inschakelen
            </button>
          )}
          {denied && (
            <p className="hint">
              Meldingen zijn geblokkeerd. Pas de toestemming aan in je browser-
              of apparaatinstellingen en open Todo opnieuw.
            </p>
          )}
        </>
      )}
      {message && <p role="status">{message}</p>}
      <p className="hint">
        Alleen algemene tekst op je vergrendelscherm. Toewijzingen en
        afrondingen volgen je accountvoorkeuren. Levering hangt af van je
        apparaat, netwerk en Focus-instellingen; het is geen exacte wekker.
        Uitloggen zet push op dit apparaat uit.
      </p>
    </section>
  );
}
