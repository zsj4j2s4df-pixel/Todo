"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  connectorRequest,
  openProviderLogin,
  providerLabels,
  type Integration,
} from "@/lib/connections";
type Calendar = { id: string; name: string; writable: boolean };
export default function ConnectionSettings({
  user,
  onChange,
  onConnections,
}: {
  user: string;
  onChange: () => Promise<void>;
  onConnections: (connections: Integration[]) => void;
}) {
  const [rows, setRows] = useState<Integration[]>([]),
    [configured, setConfigured] = useState<Record<string, boolean>>({}),
    [message, setMessage] = useState(""),
    [working, setWorking] = useState(false),
    [selected, setSelected] = useState<Integration | null>(null),
    [available, setAvailable] = useState<Calendar[]>([]),
    [checked, setChecked] = useState<string[]>([]),
    [writes, setWrites] = useState<string[]>([]),
    [writeAuthorized, setWriteAuthorized] = useState(false);
  const [appleOpen, setAppleOpen] = useState(false),
    [appleEmail, setAppleEmail] = useState(""),
    [applePassword, setApplePassword] = useState(""),
    [gmail, setGmail] = useState<string | null>(null),
    [query, setQuery] = useState(""),
    [messages, setMessages] = useState<
      {
        id: string;
        subject: string;
        from: string;
        date: string;
        snippet: string;
      }[]
    >([]);
  const alive = useRef(true),
    latest = useRef({ onChange, onConnections });
  latest.current = { onChange, onConnections };
  async function refresh() {
    if (!supabase) return;
    const [status, connections] = await Promise.all([
      connectorRequest({ action: "status" }),
      supabase
        .from("integrations")
        .select("*")
        .eq("user_id", user)
        .order("created_at"),
    ]);
    if (connections.error)
      throw Error(
        "Verbindingen konden niet worden geladen. Controleer de databasemigraties.",
      );
    if (!alive.current) return;
    setConfigured(status.configured || {});
    setRows(connections.data || []);
    latest.current.onConnections(connections.data || []);
  }
  useEffect(() => {
    alive.current = true;
    void refresh().catch((e) => {
      if (alive.current) setMessage(e.message);
    });
    return () => {
      alive.current = false;
    };
  }, [user]);
  async function act(fn: () => Promise<void>) {
    setWorking(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      if (alive.current)
        setMessage(e instanceof Error ? e.message : "Koppelen is niet gelukt.");
    } finally {
      if (alive.current) setWorking(false);
    }
  }
  async function start(provider: string, id?: string, write = false) {
    const r = await connectorRequest({
      action: "start",
      provider,
      connection_id: id,
      write,
    });
    if (alive.current) openProviderLogin(r.url);
  }
  if (!supabase)
    return (
      <section>
        <h3>Agenda en mail verbinden</h3>
        <p>
          Dit werkt met een ingelogd account. De lokale versie verbindt geen
          externe accounts.
        </p>
      </section>
    );
  return (
    <section aria-label="Agenda en mail verbinden">
      <h3>Agenda en mail verbinden</h3>
      <p>
        Jij kiest welke agenda’s zichtbaar worden. Ingelezen afspraken zijn
        privé. Gmail wordt alleen op jouw gerichte verzoek gelezen.
      </p>
      <div className="assistant-actions">
        {Object.entries(providerLabels).map(([key, label]) => (
          <button
            type="button"
            className="secondary"
            key={key}
            disabled={
              working || (key !== "icloud_calendar" && !configured[key])
            }
            onClick={() =>
              key === "icloud_calendar"
                ? setAppleOpen(!appleOpen)
                : void act(() => start(key))
            }
          >
            {label} verbinden
          </button>
        ))}
      </div>
      {Object.keys(configured).some(
        (k) => k !== "icloud_calendar" && !configured[k],
      ) && (
        <p className="hint">
          Google en/of Microsoft moet de beheerder nog activeren. Je hoeft
          hiervoor geen sleutel in de chat te delen.
        </p>
      )}
      {appleOpen && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const password = applePassword;
            setApplePassword("");
            void act(async () => {
              await connectorRequest({
                action: "icloud",
                username: appleEmail,
                password,
              });
              if (alive.current) {
                setAppleOpen(false);
                setAppleEmail("");
                setMessage("iCloud verbonden. Kies nu je agenda’s.");
              }
              await refresh();
            });
          }}
        >
          <label>
            Apple-account e-mailadres
            <input
              type="email"
              required
              autoComplete="username"
              maxLength={200}
              value={appleEmail}
              onChange={(e) => setAppleEmail(e.target.value)}
            />
          </label>
          <label>
            App-specifiek Apple-wachtwoord
            <input
              type="password"
              required
              autoComplete="new-password"
              maxLength={200}
              value={applePassword}
              onChange={(e) => setApplePassword(e.target.value)}
            />
          </label>
          <p className="hint">
            Gebruik een apart app-wachtwoord uit je{" "}
            <a
              href="https://account.apple.com/"
              target="_blank"
              rel="noreferrer"
            >
              Apple-account
            </a>
            , nooit je gewone Apple-wachtwoord. De server bewaart het
            versleuteld; de app zet het niet in browseropslag.
          </p>
          <button className="secondary" disabled={working}>
            iCloud veilig verbinden
          </button>
          <button
            type="button"
            className="text-button"
            disabled={working}
            onClick={() => {
              setAppleOpen(false);
              setApplePassword("");
            }}
          >
            Annuleren
          </button>
        </form>
      )}
      {rows.map((c) => (
        <div className="inbox-entry" key={c.id}>
          <strong>{providerLabels[c.provider]}</strong>
          <p>{c.account_label}</p>
          <p role="status">
            {!c.enabled
              ? "Ontkoppeld"
              : c.status === "reauth"
                ? "Opnieuw aanmelden nodig"
                : c.status === "error"
                  ? "Synchronisatie niet gelukt; eerdere gegevens kunnen verouderd zijn"
                  : "Verbonden"}
            {c.last_sync
              ? ` · Laatst bijgewerkt ${new Date(c.last_sync).toLocaleString("nl-NL")}`
              : " · Nog niet gesynchroniseerd"}
          </p>
          {c.enabled && (
            <div className="assistant-actions">
              {c.provider !== "gmail" ? (
                <>
                  <button
                    className="text-button"
                    disabled={working}
                    onClick={() =>
                      void act(async () => {
                        const r = await connectorRequest({
                          action: "calendars",
                          id: c.id,
                        });
                        if (alive.current) {
                          setSelected(c);
                          setAvailable(r.calendars);
                          setChecked(c.calendar_ids || []);
                          setWrites(c.write_calendar_ids || []);
                          setWriteAuthorized(r.write_authorized);
                        }
                      })
                    }
                  >
                    Agenda’s kiezen
                  </button>
                  <button
                    className="text-button"
                    disabled={working || !c.calendar_ids.length}
                    onClick={() =>
                      void act(async () => {
                        const r = await connectorRequest({
                          action: "sync",
                          id: c.id,
                        });
                        await refresh();
                        await latest.current.onChange();
                        if (alive.current)
                          setMessage(
                            `${r.count} afspraken gecontroleerd en bijgewerkt.`,
                          );
                      })
                    }
                  >
                    Nu synchroniseren
                  </button>
                </>
              ) : (
                <button
                  className="text-button"
                  disabled={working}
                  onClick={() => {
                    setGmail(c.id);
                    setMessages([]);
                    setQuery("");
                  }}
                >
                  Mail zoeken en selecteren
                </button>
              )}
              {c.provider !== "icloud_calendar" && (
                <button
                  className="text-button"
                  disabled={working}
                  onClick={() => void act(() => start(c.provider, c.id))}
                >
                  Opnieuw aanmelden
                </button>
              )}
              <button
                className="text-button"
                disabled={working}
                onClick={() => {
                  if (
                    !confirm(
                      "Deze verbinding ontkoppelen? Todo kan het account daarna niet meer gebruiken.",
                    )
                  )
                    return;
                  const remove = confirm(
                    "Wil je de ingelezen afspraken ook uit je actieve Todo-agenda halen? Annuleren bewaart ze als losse privé-afspraken.",
                  );
                  const revoke =
                    ["google_calendar", "gmail"].includes(c.provider) &&
                    confirm(
                      "Ook de Todo-toestemming bij Google intrekken? Dit kan andere Google-koppelingen van hetzelfde account in Todo verbreken. Annuleren ontkoppelt alleen deze verbinding.",
                    );
                  void act(async () => {
                    const r = await connectorRequest({
                      revoke_provider: revoke,
                      action: "disconnect",
                      id: c.id,
                      remove_mirrors: remove,
                    });
                    await refresh();
                    await latest.current.onChange();
                    if (alive.current) setMessage(r.provider_permissions);
                  });
                }}
              >
                Ontkoppelen
              </button>
            </div>
          )}
        </div>
      ))}
      {selected && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              await connectorRequest({
                action: "select",
                id: selected.id,
                calendar_ids: checked,
                write_calendar_ids: writes.filter((id) => checked.includes(id)),
              });
              if (checked.length)
                await connectorRequest({ action: "sync", id: selected.id });
              if (alive.current) setSelected(null);
              await refresh();
              await latest.current.onChange();
            });
          }}
        >
          <h4>Agenda’s uit {providerLabels[selected.provider]}</h4>
          {available.map((c) => (
            <div key={c.id}>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={checked.includes(c.id)}
                  disabled={working}
                  onChange={(e) =>
                    setChecked(
                      e.target.checked
                        ? [...checked, c.id]
                        : checked.filter((id) => id !== c.id),
                    )
                  }
                />
                {c.name}
              </label>
              {checked.includes(c.id) && c.writable && writeAuthorized && (
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={writes.includes(c.id)}
                    disabled={working}
                    onChange={(e) =>
                      setWrites(
                        e.target.checked
                          ? [...writes, c.id]
                          : writes.filter((id) => id !== c.id),
                      )
                    }
                  />
                  Ook vanuit Todo wijzigen in {c.name}
                </label>
              )}
            </div>
          ))}
          {!writeAuthorized && selected.provider !== "icloud_calendar" && (
            <button
              type="button"
              className="text-button"
              disabled={working}
              onClick={() =>
                void act(() => start(selected.provider, selected.id, true))
              }
            >
              Opnieuw verbinden met schrijfrechten
            </button>
          )}
          <p className="hint">
            Eerst alleen lezen. Schrijven zet je bewust aan per agenda;
            wijzigingen kunnen deelnemers informeren.
          </p>
          <button className="secondary" disabled={working}>
            Agendakeuze bewaren
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => setSelected(null)}
          >
            Sluiten
          </button>
        </form>
      )}
      {gmail && (
        <section aria-label="Gmail selecteren">
          <h4>Mail voor je persoonlijke inbox</h4>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () => {
                const r = await connectorRequest({
                  action: "gmail_search",
                  id: gmail,
                  query,
                });
                if (alive.current) setMessages(r.messages || []);
              });
            }}
          >
            <label>
              Zoek in Gmail
              <input
                required
                maxLength={200}
                placeholder="Bijvoorbeeld from:school.nl"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <button className="secondary" disabled={working || !query.trim()}>
              Zoek maximaal tien mails
            </button>
          </form>
          {messages.map((m) => (
            <article className="inbox-entry" key={m.id}>
              <strong>{m.subject}</strong>
              <p>{m.from}</p>
              <p>{m.snippet}</p>
              <button
                className="text-button"
                disabled={working}
                onClick={() =>
                  void act(async () => {
                    const r = await connectorRequest({
                      action: "gmail_import",
                      id: gmail,
                      message_id: m.id,
                    });
                    await latest.current.onChange();
                    if (alive.current)
                      setMessage(
                        r.imported
                          ? "Mail bewaard in je persoonlijke inbox. Maak er daar een gecontroleerde taak of afspraak van."
                          : "Deze mail staat al in je inbox of bij je bewaarde notities.",
                      );
                  })
                }
              >
                Deze mail in mijn inbox bewaren
              </button>
            </article>
          ))}
          <button
            className="text-button"
            onClick={() => {
              setGmail(null);
              setMessages([]);
            }}
          >
            Mailselectie sluiten
          </button>
        </section>
      )}
      {working && <p role="status">Even verbinden of bijwerken…</p>}
      {message && <p role="status">{message}</p>}
      <button
        className="text-button"
        disabled={working}
        onClick={() => void act(refresh)}
      >
        Verbindingsstatus vernieuwen
      </button>
      <p className="hint">
        Automatische agendasynchronisatie: ongeveer iedere 15 minuten, van 7
        dagen terug tot 30 dagen vooruit. Bij fouten blijft de vorige
        succesvolle versie staan. Mail, bijlagen en uitnodigingen worden niet
        automatisch verstuurd.
      </p>
    </section>
  );
}
