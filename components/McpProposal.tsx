"use client";
import { useEffect, useRef, useState } from "react";
import { mcpRequest } from "@/lib/mcp";
import VoiceRecorder from "./VoiceRecorder";
import { confirmsProposal } from "@/lib/voice-confirmation";
export default function McpProposal({
  id,
  onClose,
  onChanged,
  onEdit,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onEdit: (proposal: any) => void;
}) {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [proposal, setProposal] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [voice, setVoice] = useState(false),
    [external, setExternal] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    void mcpRequest("proposal_info", { proposal_id: id })
      .then((p) => {
        if (active) setProposal(p);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id]);
  async function decide(execute: boolean, edit = false) {
    if (busy || !proposal) return;
    if (execute && proposal.external && !external) {
      setError(
        "Bevestig eerst dat de externe agenda en mogelijk deelnemers worden bijgewerkt.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await mcpRequest(
        execute ? "proposal_execute" : "proposal_reject",
        { proposal_id: id, confirmed_external_effects: external },
      );
      await onChanged();
      if (!mounted.current) return;
      if (edit) {
        onEdit(proposal);
        return;
      }
      setProposal({ ...proposal, state: execute ? "done" : "cancelled" });
      setMessage(
        execute
          ? result.message || "Uitgevoerd. Je overzicht is bijgewerkt."
          : "Voorstel geannuleerd. Er is niets gewijzigd.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Uitvoeren is niet gelukt.");
    } finally {
      setBusy(false);
    }
  }
  const payload = proposal?.payload,
    item = payload?.item,
    pending = proposal?.state === "pending",
    title = item?.title || payload?.target_title || "Persoonlijke notitie";
  return (
    <section
      className="panel assistant-panel"
      aria-label="Assistentvoorstel bevestigen"
    >
      <h2>Even controleren</h2>
      {proposal ? (
        <>
          <p>
            Voorstel van {proposal.client_name} voor{" "}
            {proposal.account_email || "jouw Todo-account"}.
          </p>
          <h3>
            {
              (
                {
                  create: "Toevoegen",
                  update: "Wijzigen",
                  complete: payload.done ? "Afronden" : "Heropenen",
                  delete: "Verwijderen",
                  note: "Notitie bewaren",
                } as Record<string, string>
              )[proposal.action]
            }
            : {title}
          </h3>
          {(item?.description || payload?.body) && (
            <p className="note-text">{item?.description || payload.body}</p>
          )}
          {item?.all_day ? (
            <p>
              Hele dag: {item.start_date} tot {item.end_date} (einddatum niet
              inbegrepen)
            </p>
          ) : (
            item?.due_at && (
              <p>
                {new Date(item.due_at).toLocaleString("nl-NL")} ·{" "}
                {item.timezone}
              </p>
            )
          )}
          {proposal.action === "delete" && (
            <p>
              Weet je zeker dat je dit wilt verwijderen? Lokale items komen in
              de prullenbak.
            </p>
          )}
          {pending && proposal.external && (
            <label className="check-label">
              <input
                type="checkbox"
                checked={external}
                disabled={busy}
                onChange={(e) => setExternal(e.target.checked)}
              />
              Ik bevestig de wijziging in de bronagenda. Dit kan deelnemers
              informeren; herstel in de bron is niet automatisch mogelijk.
            </label>
          )}
          {pending ? (
            <>
              <div className="assistant-actions">
                <button
                  className="primary"
                  disabled={busy || voice || (proposal.external && !external)}
                  onClick={() => void decide(true)}
                >
                  {proposal.action === "delete"
                    ? "Ja, verwijderen bevestigen"
                    : "Voorstel uitvoeren"}
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => void decide(false)}
                >
                  Annuleren
                </button>
                {["create", "update"].includes(proposal.action) &&
                  !proposal.external && (
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => void decide(false, true)}
                    >
                      Aanpassen in Todo
                    </button>
                  )}
              </div>
              <VoiceRecorder
                disabled={busy}
                label="Bevestiging inspreken"
                onBusyChange={setVoice}
                onText={(text) => {
                  if (confirmsProposal(text, proposal.action))
                    void decide(true);
                  else
                    setError(
                      "Zeg exact ja opslaan, of voor verwijderen ja verwijderen. Je kunt ook de knop gebruiken.",
                    );
                }}
              />
              <p className="hint">
                Dit voorstel verloopt na vijftien minuten. Wijzigingen sinds het
                voorstel worden niet overschreven.
              </p>
            </>
          ) : (
            <p>
              {proposal.state === "done"
                ? "Dit voorstel is al uitgevoerd."
                : "Dit voorstel is niet meer actief."}
            </p>
          )}
        </>
      ) : (
        !error && <p role="status">Voorstel controleren…</p>
      )}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      <button className="text-button" disabled={busy} onClick={onClose}>
        Terug naar mijn overzicht
      </button>
    </section>
  );
}
