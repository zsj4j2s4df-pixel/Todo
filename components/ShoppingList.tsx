"use client";
import { useState } from "react";
import type { Item, Member } from "@/lib/model";
import { assigneeLabel } from "@/lib/workspace";
export default function ShoppingList({
  item,
  user,
  members,
  busy,
  onStep,
  onOpen,
}: {
  item: Item;
  user: string;
  members: Member[];
  busy: boolean;
  onStep: (
    id: string,
    text: string | null,
    checked: boolean | null,
  ) => Promise<boolean>;
  onOpen: () => void;
}) {
  const [text, setText] = useState("");
  return (
    <article
      className="inbox-entry"
      aria-label={`Boodschappenlijst ${item.title}`}
    >
      <button className="text-button" onClick={onOpen}>
        <strong>{item.title}</strong>
      </button>
      <p className="hint">
        {assigneeLabel(item, user, members)} ·{" "}
        {item.visibility === "private" ? "Alleen jij" : "Gedeelde boodschappen"}
      </p>
      {item.checklist.map((step) => (
        <label className="check-label" key={step.id}>
          <input
            type="checkbox"
            checked={step.done}
            disabled={busy}
            onChange={(e) => void onStep(step.id, null, e.target.checked)}
          />
          {step.text}
        </label>
      ))}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (await onStep(crypto.randomUUID(), text, null)) setText("");
        }}
      >
        <label>
          Boodschap toevoegen
          <input
            value={text}
            maxLength={200}
            disabled={busy}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <button
          className="text-button"
          disabled={busy || !text.trim() || item.checklist.length >= 50}
        >
          Toevoegen aan lijst
        </button>
      </form>
      <p className="hint">
        Wijzigingen worden opgeslagen. Andere apparaten halen ze op met
        Vernieuwen.
      </p>
    </article>
  );
}
