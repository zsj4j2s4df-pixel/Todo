"use client";
import { useEffect, useRef, useState } from "react";
import { mcpRequest, clientRedirect } from "@/lib/mcp";
export default function McpConsent({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [details, setDetails] = useState<any>(null),
    [prepare, setPrepare] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void mcpRequest("consent_info", { request_id: id })
      .then((d) => {
        if (active) setDetails(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id]);
  async function decide(allow: boolean) {
    setBusy(true);
    setError("");
    try {
      const r = await mcpRequest(allow ? "consent" : "deny", {
        request_id: id,
        scopes: [
          "todo:read",
          ...(prepare && details?.scopes.includes("todo:prepare")
            ? ["todo:prepare"]
            : []),
        ],
      });
      if (mounted.current) clientRedirect(r.redirect_url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verbinden is niet gelukt.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="panel assistant-panel"
      aria-label="Assistent toestemming geven"
    >
      <h2>Todo met je assistent verbinden</h2>
      {details ? (
        <>
          <p>
            <strong>{details.client_name}</strong> vraagt toegang tot Todo.
          </p>
          <p>
            Je verbindt als {details.account_email || "je huidige Todo-account"}
            . Alleen gegevens die jij mag zien zijn beschikbaar.
          </p>
          <p className="hint">
            Dit is een aangepaste connector. Controleer de naam en het
            terugkeeradres: {details.redirect_uri}
          </p>
          <label className="check-label">
            <input type="checkbox" checked disabled />
            Mijn zichtbare taken, agenda, herinneringen en persoonlijke notities
            lezen
          </label>
          {details.scopes.includes("todo:prepare") && (
            <label className="check-label">
              <input
                type="checkbox"
                checked={prepare}
                disabled={busy}
                onChange={(e) => setPrepare(e.target.checked)}
              />
              Ook wijzigingen voorstellen. Uitvoering bevestig ik zelf in Todo.
            </label>
          )}
          <p>Je kunt deze toegang later intrekken bij Instellingen.</p>
          <div className="assistant-actions">
            <button
              className="primary"
              disabled={busy}
              onClick={() => void decide(true)}
            >
              Verbinden met dit account
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void decide(false)}
            >
              Geen toestemming
            </button>
          </div>
        </>
      ) : (
        !error && <p role="status">Aanvraag controleren…</p>
      )}
      {error && <p role="alert">{error}</p>}
      <button className="text-button" disabled={busy} onClick={onClose}>
        Terug naar Todo
      </button>
    </section>
  );
}
