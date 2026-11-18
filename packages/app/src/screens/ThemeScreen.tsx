import { useState } from "react";
import { THEMES, type ThemeChoice, type ThemeMode } from "../theme/theme.ts";
import { Button, Card, Chip, MarkBadge, Segmented, SetRow, Stepper, Tag, Timer } from "../ui/components.tsx";

/** More › Theme (#23): theme and mode, applied at once, with every shared component to judge them by. */
export function ThemeScreen({ choice, onChange, onBack }: { choice: ThemeChoice; onChange: (c: ThemeChoice) => void; onBack: () => void }) {
  const [load, setLoad] = useState(16);
  return (
    <div className="pad">
      <div className="hrow"><Button variant="ghost" onClick={onBack}>‹ More</Button></div>
      <h1 className="title">Theme</h1>
      <span className="label">Theme</span>
      <div className="chips">
        {THEMES.map((t) => <Chip key={t.id} on={choice.name === t.id} onClick={() => onChange({ ...choice, name: t.id })}>{t.label}</Chip>)}
      </div>
      <span className="muted">{THEMES.find((t) => t.id === choice.name)?.blurb}</span>
      <span className="label">Light or dark</span>
      <Segmented<ThemeMode>
        label="Light or dark"
        options={[{ id: "system", label: "Follow system" }, { id: "light", label: "Light" }, { id: "dark", label: "Dark" }]}
        value={choice.mode}
        onChange={(mode) => onChange({ ...choice, mode })}
      />

      <span className="label" style={{ marginTop: 8 }}>Preview</span>
      <Card>
        <span className="title" style={{ fontSize: 24 }}>Plank</span>
        <span className="muted">Hold · core · last time 0:32</span>
        <div><SetRow label="Set 1" value="0:32 hold" /><SetRow label="Set 2" value="0:30 hold" /></div>
        <Timer seconds={24} label="Hold timer, 0:24" />
        <Button variant="stop" xl>Stop and log</Button>
      </Card>
      <Card>
        <Stepper label="Load" value={`${load} kg`} onLess={() => setLoad(Math.max(0, load - 2))} onMore={() => setLoad(load + 2)} />
        <div className="chips"><Chip>Cat-cow</Chip><Chip on>Push-up</Chip><Tag>Each side</Tag><Tag warn>Body map</Tag></div>
        <div className="chips">
          <MarkBadge kind="pain" /><MarkBadge kind="stiffness" /><MarkBadge kind="weakness" /><MarkBadge kind="injury" /><MarkBadge kind="condition" />
        </div>
        <div className="pair">
          <Button>Type next</Button>
          <Button variant="primary">Suggest next</Button>
        </div>
      </Card>
    </div>
  );
}
