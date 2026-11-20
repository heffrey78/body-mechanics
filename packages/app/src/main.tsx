import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./theme/fonts.ts";
import "./theme/themes.css";
import "./ui/components.css";
import "./theme/theme.ts";
import { App } from "./App.tsx";
import { Gallery } from "./demo/Gallery.tsx";

const root = document.getElementById("root");
if (!root) throw new Error("No #root element");
createRoot(root).render(
  <StrictMode>
    {import.meta.env.DEV && location.hash === "#demos" ? <Gallery /> : <App />}
  </StrictMode>,
);
