import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

export function Confirmation(props: {
  id: string;
  onRestart: () => void;
  onSignOut: () => void;
  onViewRequests: () => void;
}) {
  const { id, onRestart, onSignOut, onViewRequests } = props;
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    api<{ pdfUrl?: string }>(`/api/claim/${id}`).then(({ res, data }) => {
      if (res.ok) setPdfUrl(data.pdfUrl ?? null);
    });
  }, [id]);

  async function download() {
    if (!pdfUrl) return;
    setDownloading(true);
    try {
      const res = await fetch(pdfUrl);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "blueprint-claim.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      window.open(pdfUrl, "_blank", "noopener");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="success">
      <button className="success__signout" onClick={onSignOut}>Sign out</button>
      <div className="success__inner">
        <div className="success__check" aria-hidden="true">
          <svg width="40" height="40" viewBox="0 0 40 40">
            <path className="success__tick" d="M11 21 l6 6 L29 13" />
          </svg>
        </div>
        <h1 className="success__title">Claim submitted</h1>
        <p className="success__lead">
          In the real product this is emailed to finance — <strong>nothing more for you to do.</strong>{" "}
          This is a preview, so nothing was sent or saved anywhere.
        </p>

        <div className="success__actions">
          <button className="success__btn" onClick={download} disabled={!pdfUrl || downloading}>
            {downloading ? "Preparing…" : pdfUrl ? "Download your PDF" : "Loading…"}
          </button>
          <button className="success__btn success__btn--ghost" onClick={onRestart}>
            Submit another claim
          </button>
        </div>
        <button className="success__link" onClick={onViewRequests}>View my requests</button>
      </div>
    </div>
  );
}
