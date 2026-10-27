"use client";
import { useEffect, useState } from "react";
import { mcpRequest, mcpUrl } from "@/lib/mcp";
import { supabase } from "@/lib/supabase";
export default function McpSettings() {
  const [grants, setGrants] = useState<any[]>([]),
    [ready, setReady] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    if (!supabase) return;
    void Promise.all([
      mcpRequest("grants"),
      fetch(
        "https://todo.zsj4j2s4df.workers.dev/.well-known/oauth-protected-resource/mcp",
        { credentials: "omit", referrerPolicy: "no-referrer" },
      )
        .then(async (r) => r.ok && (await r.json()).resource === mcpUrl)
        .catch(() => false),
    ])
      .then(([rows, available]) => {
        if (active) {
          setGrants(rows || []);
          setReady(available);
        }
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      });
    return () => {
      active = false;
    };
  }, [refresh]);
  if (!supabase) return null;
  return (
    <section aria-label="ChatGPT en Claude verbinden">
      <h3>Todo in ChatGPT en Claude</h3>
      <p>
        {ready
          ? "De connectorserver is bereikbaar. Je meldt je per assistent aan met je eigen Todo-account."
          : "De connector is nog niet bereikbaar of nog niet geactiveerd."}
      </p>
      {ready && (
        <>
          <label>
            Todo-connectoradres
            <input readOnly value={mcpUrl} onFocus={(e) => e.target.select()} />
          </label>
          <button
            className="text-button"
            onClick={() =>
              void navigator.clipboard
                ?.writeText(mcpUrl)
                .then(() => setMessage("Connectoradres gekopieerd."))
                .catch(() =>
                  setMessage("Selecteer en kopieer het adres hierboven."),
                )
            }
          >
            Connectoradres kopiëren
          </button>
          <ol>
            <li>
              ChatGPT: Plugins → eigen MCP-server toevoegen. Gebruik het adres
              hierboven en OAuth.
            </li>
            <li>
              Claude: Connectors → aangepaste webconnector toevoegen. Kies waar
              nodig automatisch registreren als OAuth-client.
            </li>
            <li>
              Meld je aan bij Todo en controleer de rechten. Je partner verbindt
              een eigen account.
            </li>
          </ol>
          <p className="hint">
            Beschikbaarheid en menunamen hangen af van je account, abonnement en
            workspacebeleid. Een bereikbare server is nog geen geteste
            verbinding met beide clients.
          </p>
        </>
      )}
      {grants.map((g) => (
        <div className="inbox-entry" key={g.id}>
          <strong>{g.client_name}</strong>
          <p>
            {g.revoked_at
              ? "Ingetrokken"
              : `Actief · ${g.scopes.includes("todo:prepare") ? "lezen en voorstellen" : "alleen lezen"}`}
          </p>
          {!g.revoked_at && (
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                if (
                  !confirm(
                    "Deze assistent de toegang tot je Todo-gegevens ontzeggen?",
                  )
                )
                  return;
                setBusy(true);
                void mcpRequest("revoke", { grant_id: g.id })
                  .then(() => {
                    setRefresh(refresh + 1);
                    setMessage("Toegang ingetrokken.");
                  })
                  .catch((e) => setMessage(e.message))
                  .finally(() => setBusy(false));
              }}
            >
              Toegang intrekken
            </button>
          )}
        </div>
      ))}
      <button
        className="text-button"
        disabled={busy}
        onClick={() => setRefresh(refresh + 1)}
      >
        Connectorstatus vernieuwen
      </button>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
