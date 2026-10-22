import type { Item } from "@/lib/model";
import Icon from "./AppIcon";
export default function ChecklistEditor({
  value,
  onChange,
}: {
  value: Item["checklist"];
  onChange: (v: Item["checklist"]) => void;
}) {
  return (
    <div className="checklist-editor">
      <h3>Kleine stappen / meenemen</h3>
      {value.map((step, index) => (
        <div className="checklist-step" key={step.id}>
          <input
            type="checkbox"
            aria-label={`Stap ${index + 1} afgerond`}
            checked={step.done}
            onChange={(e) =>
              onChange(
                value.map((s) =>
                  s.id === step.id ? { ...s, done: e.target.checked } : s,
                ),
              )
            }
          />
          <input
            aria-label={`Stap ${index + 1}`}
            maxLength={200}
            required
            value={step.text}
            onChange={(e) =>
              onChange(
                value.map((s) =>
                  s.id === step.id ? { ...s, text: e.target.value } : s,
                ),
              )
            }
          />
          <button
            type="button"
            className="text-button"
            aria-label={`Stap ${index + 1} verwijderen`}
            onClick={() => onChange(value.filter((s) => s.id !== step.id))}
          >
            <Icon name="plus" rotate={45} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-button"
        disabled={value.length >= 50}
        onClick={() =>
          onChange([
            ...value,
            { id: crypto.randomUUID(), text: "", done: false },
          ])
        }
      >
        <Icon name="plus" /> Stap toevoegen
      </button>
    </div>
  );
}
