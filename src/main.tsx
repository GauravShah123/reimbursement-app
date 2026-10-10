import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { PreviewBanner } from "./components/PreviewBanner.js";
import { CaseStudy } from "./steps/CaseStudy.js";
import "./styles.css";

const CASE_STUDY_HASH = "#how-its-built";

function Root() {
  const [showCase, setShowCase] = useState(() => window.location.hash === CASE_STUDY_HASH);

  useEffect(() => {
    const onHash = () => setShowCase(window.location.hash === CASE_STUDY_HASH);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (showCase) window.scrollTo(0, 0);
  }, [showCase]);

  const close = () => {
    history.replaceState(null, "", window.location.pathname);
    setShowCase(false);
  };

  return (
    <>
      <PreviewBanner
        onShowCaseStudy={showCase ? undefined : () => { window.location.hash = CASE_STUDY_HASH; }}
      />
      {showCase && <CaseStudy onClose={close} />}
      {/* The app stays mounted underneath so an in-progress claim isn't lost. */}
      <div className="app-host" hidden={showCase}>
        <App />
      </div>
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
