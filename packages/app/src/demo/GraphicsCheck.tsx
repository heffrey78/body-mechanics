import { useState } from "react";
import { Card, Segmented } from "../ui/components.tsx";
import { ON_ANDROID, setUse3d, use3d } from "./prefs.ts";

/**
 * How demonstrations are drawn on this device (#80): with 3D graphics, or as a plain drawing that needs
 * none. The drawing is the default on Android, where 3D graphics have crashed the app.
 */
export function GraphicsCheck() {
  const [on, setOn] = useState(use3d);
  return (
    <Card>
      <span className="label">Demonstrations</span>
      <Segmented label="How demonstrations are drawn" value={on ? "3d" : "drawn"} onChange={(v) => { setUse3d(v === "3d"); setOn(v === "3d"); }}
        options={[{ id: "drawn", label: "Drawing" }, { id: "3d", label: "3D graphics" }]} />
      <span className="muted" style={{ fontSize: 13 }}>
        {ON_ANDROID
          ? "Drawing is the safe choice on this phone: 3D graphics have stopped working, and crashed the app, after switching to another app and back."
          : "3D graphics look better. Drawing needs no graphics hardware."}
      </span>
    </Card>
  );
}
