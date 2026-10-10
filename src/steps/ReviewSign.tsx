import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../lib/api.js";
import { buildMergedClaimPdf } from "../demo/backend.js";
import type { ClaimDraft, ReceiptLineInput, SubmitResponse } from "../lib/types.js";
import { SignaturePad, type SignaturePadHandle } from "../components/SignaturePad.js";

function amt(s: string): number {
  return parseFloat(String(s).replace(/[^0-9.]/g, "")) || 0;
}

const SUBMIT_STAGES = [
  "Uploading your receipts",
  "Building your claim PDF",
  "Merging in your receipts",
  "Sending it to finance (simulated)",
];

export function ReviewSign(props: {
  draft: ClaimDraft;
  resolveLines: (lines: ReceiptLineInput[]) => Promise<ReceiptLineInput[]>;
  savingDraft: boolean;
  onBack: () => void;
  onSaveDraft: (d: ClaimDraft) => void | Promise<void>;
  onSubmitted: (id: string, flags: { code: string; label: string }[]) => void;
}) {
  const { draft, resolveLines, savingDraft, onBack, onSaveDraft, onSubmitted } = props;
  const padRef = useRef<SignaturePadHandle>(null);

  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const [, force] = useState(0);
  const [stage, setStage] = useState(0);
  const signed = padRef.current ? !padRef.current.isEmpty() : false;

  // Advance the staged "submitting" copy while the PDF/email pipeline runs.
  useEffect(() => {
    if (!busy) {
      setStage(0);
      return;
    }
    const id = window.setInterval(
      () => setStage((s) => Math.min(s + 1, SUBMIT_STAGES.length - 1)),
      1600,
    );
    return () => window.clearInterval(id);
  }, [busy]);

  async function downloadPdf() {
    setError("");
    const pad = padRef.current;
    if (!pad || pad.isEmpty()) return setError("Add your signature first, then download.");
    setDownloading(true);
    try {
      const receiptLines = await resolveLines(draft.receiptLines);
      const payload = { ...draft, receiptLines, signaturePngDataUrl: pad.toDataURL(), signedAt: new Date().toISOString() };
      const blob = await buildMergedClaimPdf(payload);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "claim-preview.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Download failed. Try again.");
    } finally {
      setDownloading(false);
    }
  }

  async function submit() {
    setError("");
    const pad = padRef.current;
    if (!pad || pad.isEmpty()) return setError("Add your signature to submit.");
    setBusy(true);
    try {
      const receiptLines = await resolveLines(draft.receiptLines);
      const payload = {
        ...draft,
        receiptLines,
        signaturePngDataUrl: pad.toDataURL(),
        signedAt: new Date().toISOString(),
      };
      const { res, data } = await api<SubmitResponse>("/api/claim/submit", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!res.ok || !data.ok) {
        const msg = (!data.ok && data.errors?.map((e) => e.message).join(" ")) || "Submit failed.";
        setError(msg);
        setBusy(false);
        return;
      }
      onSubmitted(data.id, data.flags);
    } catch {
      setError("Network error. Try again.");
      setBusy(false);
    }
  }

  return (
    <section>
      <h1 className="title">Review &amp; sign</h1>
      <p className="sub">In the real product, this is what gets sent to finance as one PDF.</p>

      {draft.receiptLines.map((l, i, arr) => (
        <div className={`srow${i === arr.length - 1 ? " srow--last" : ""}`} key={l.id}>
          <span className="sd">{l.description || "(no description)"}</span>
          <span className="sv">{l.currency} {amt(l.amount).toFixed(2)}</span>
        </div>
      ))}
      {(() => {
        const allCad = draft.receiptLines.every((l) => l.currency === "CAD");
        const cadSum = draft.receiptLines
          .filter((l) => l.currency === "CAD")
          .reduce((s, l) => s + amt(l.amount), 0);
        return (
          <div className="totrow">
            <span className="tl">Total</span>
            <span className="tv">
              {allCad ? `CAD ${cadSum.toFixed(2)}` : "finalized on submit"}
            </span>
          </div>
        );
      })()}
      {!draft.receiptLines.every((l) => l.currency === "CAD") && (
        <p className="fx">Foreign amounts are converted to CAD when you submit (sample rates in this preview).</p>
      )}

      <p className="cert">
        I certify that all expenditures in this claim adhere to the University's policies, were
        incurred by me for University purposes, and have not been and will not be reimbursed from
        another source.
      </p>

      <div className="sigwrap">
        <div className="sighd">
          <span>
            Signature<span className="req">*</span>
            <span className={`sig-check${signed ? " on" : ""}`} aria-hidden="true" style={{ marginLeft: 7 }}>✓</span>
          </span>
          <button onClick={() => { padRef.current?.clear(); force((n) => n + 1); }}>Clear</button>
        </div>
        <SignaturePad
          ref={padRef}
          className={signed ? "signed" : ""}
          onInk={() => force((n) => n + 1)}
        />
      </div>

      {error && <p className="error">{error}</p>}

      <div className="act">
        <button className="lnk" onClick={onBack} disabled={busy || downloading || savingDraft}>Back</button>
        <button className="lnk" onClick={() => onSaveDraft(draft)} disabled={busy || downloading || savingDraft}>
          {savingDraft ? "Saving…" : "Save as draft"}
        </button>
        <button className="btn btn--ghost" onClick={downloadPdf} disabled={busy || downloading || savingDraft}>
          {downloading ? "Preparing…" : "Download PDF"}
        </button>
        <button className="btn" onClick={submit} disabled={busy || downloading || savingDraft}>
          {busy ? "Submitting…" : "Submit claim"}
        </button>
      </div>

      {busy &&
        createPortal(
          <div className="submitting" role="status" aria-live="polite">
            <div className="submitting__card">
              <div className="submitting__doc" aria-hidden="true">
                <span className="submitting__line" />
                <span className="submitting__line" />
                <span className="submitting__line submitting__line--short" />
                <span className="submitting__beam" />
              </div>
              <p className="submitting__title">{SUBMIT_STAGES[stage]}…</p>
              <p className="submitting__sub">Hang tight — assembling everything into one PDF.</p>
              <div className="submitting__steps">
                {SUBMIT_STAGES.map((s, i) => (
                  <span key={s} className={`submitting__dot${i <= stage ? " on" : ""}`} />
                ))}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </section>
  );
}
