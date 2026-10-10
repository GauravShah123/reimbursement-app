import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { PreviewBanner } from "./components/PreviewBanner.js";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PreviewBanner />
    <App />
  </StrictMode>,
);
