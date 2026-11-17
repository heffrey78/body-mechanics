import { MODIFIERS, MODIFIER_KINDS, modifierInfo, type Modifier, type ModifierKind } from "@bm/engine";
import { Chip } from "./components.tsx";

const KIND_LABEL: Record<ModifierKind, string> = {
  range: "Range", load: "Load", support: "Support", tempo: "Tempo", position: "Position", "grip-stance": "Grip and stance", side: "Side",
};

/** "Short range · Hold a support". */
export function modifierText(mods: readonly { id: string; value?: string | undefined }[]): string {
  return mods.map((m) => `${modifierInfo(m.id)?.label ?? m.id}${m.value ? ` ${m.value}` : ""}`).join(" · ");
}

/** How an exercise is done (#51): the vocabulary as chips, by kind. */
export function ModifierPicker({ value, onChange }: { value: readonly Modifier[]; onChange: (next: Modifier[]) => void }) {
  const on = (id: string) => value.some((m) => m.id === id);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }} aria-label="Modifiers">
      {MODIFIER_KINDS.map((kind) => (
        <div key={kind} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="muted" style={{ fontSize: 13 }}>{KIND_LABEL[kind]}</span>
          <div className="chips">
            {Object.entries(MODIFIERS[kind] as Record<string, string>).map(([id, label]) => (
              <Chip key={id} on={on(id)} onClick={() => onChange(on(id) ? value.filter((m) => m.id !== id) : [...value, { kind, id }])}>{label}</Chip>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
