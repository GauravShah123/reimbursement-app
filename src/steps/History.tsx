import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../lib/api.js";
import type { ClaimSummary, ClaimDetail, ClaimStatus } from "../lib/types.js";

const STATUS_LABEL: Record<ClaimStatus, string> = {
  draft: "Draft",
  processing: "Processing",
  submitted: "Submitted",
  failed: "Failed",
};

function StatusBadge({ status }: { status: ClaimStatus }) {
  return <span className={`badge badge--${status}`}>{STATUS_LABEL[status] ?? status}</span>;
}

function formatWhen(ms: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function money(n: number, currency = "CAD"): string {
  return `${currency} ${(Number(n) || 0).toFixed(2)}`;
}

function isPdf(name: string | null): boolean {
  return (name || "").toLowerCase().endsWith(".pdf");
}

/** The "My requests" list — submitted claims and saved drafts, newest first. */
export function History(props: { onOpen: (id: string) => void; onNew: () => void; onSignOut: () => void }) {
  const { onOpen, onNew, onSignOut } = props;
  const [claims, setClaims] = useState<ClaimSummary[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ claims: ClaimSummary[] }>("/api/claims").then(({ res, data }) => {
      if (res.ok) setClaims(data.claims || []);
      else setError("Couldn't load your requests. Try again later.");
    });
  }, []);

  return (
    <div className="app">
      <div className="col">
        <div className="head">
          <span className="mark">blueprint reimbursements</span>
          <div className="head-right">
            <button className="head-link" onClick={onNew}>New request</button>
            <span className="head-sep" aria-hidden="true" />
            <button className="head-signout" onClick={onSignOut}>Sign out</button>
          </div>
        </div>

        <section className="step-enter">
          <h1 className="title">My requests</h1>
          <p className="sub">Everything you've submitted to finance, plus any drafts you've saved. These are sample entries and reset when you reload.</p>

          {error && <p className="error">{error}</p>}

          {claims === null && !error ? (
            <ul className="hlist">
              {[0, 1, 2].map((i) => (
                <li key={i} className="hli hli--skel"><span className="skel-line" /></li>
              ))}
            </ul>
          ) : claims && claims.length === 0 ? (
            <div className="empty">
              <p className="empty__title">No requests yet</p>
              <p className="empty__sub">When you submit or save a claim, it'll show up here.</p>
              <button className="btn" onClick={onNew}>Start a request</button>
            </div>
          ) : (
            <ul className="hlist">
              {(claims ?? []).map((c) => (
                <li key={c.id}>
                  <button className="hli" onClick={() => onOpen(c.id)}>
                    <span className="hli__main">
                      <span className="hli__title">{c.reason?.trim() || "Untitled request"}</span>
                      <span className="hli__meta">{formatWhen(c.updatedAt)}</span>
                    </span>
                    <span className="hli__right">
                      <span className="hli__amt">{money(c.totalCad)}</span>
                      <StatusBadge status={c.status} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/** Read-only detail for one request: the entered fields, line items, and receipts. */
export function RequestDetail(props: { id: string; onBack: () => void; onSignOut: () => void }) {
  const { id, onBack, onSignOut } = props;
  const [d, setD] = useState<ClaimDetail | null>(null);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState<{ src: string; pdf: boolean } | null>(null);

  useEffect(() => {
    api<ClaimDetail>(`/api/claim/${id}`).then(({ res, data }) => {
      if (res.ok && data?.id) setD(data);
      else setError("Couldn't load this request.");
    });
  }, [id]);

  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setZoom(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

  const mailingText = d
    ? [d.mailing.line1, d.mailing.line2, d.mailing.city, d.mailing.province, d.mailing.postalCode, d.mailing.country]
        .map((s) => (s || "").trim())
        .filter(Boolean)
        .join(", ")
    : "";

  async function downloadPdf() {
    if (!d?.pdfUrl) return;
    try {
      const res = await fetch(d.pdfUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `claim-${d.claimNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      window.open(d.pdfUrl, "_blank", "noopener");
    }
  }

  return (
    <div className="app">
      <div className="col">
        <div className="head">
          <span className="mark">blueprint reimbursements</span>
          <div className="head-right">
            <button className="head-link" onClick={onBack}>← My requests</button>
            <span className="head-sep" aria-hidden="true" />
            <button className="head-signout" onClick={onSignOut}>Sign out</button>
          </div>
        </div>

        <section className="step-enter">
          {error && <p className="error">{error}</p>}
          {!d && !error && <p className="sub">Loading…</p>}

          {d && (
            <>
              <div className="dhead">
                <div>
                  <h1 className="title" style={{ marginBottom: 4 }}>{d.reason?.trim() || "Reimbursement request"}</h1>
                  <p className="sub" style={{ margin: 0 }}>
                    {formatWhen(d.updatedAt)} · Claim #{d.claimNumber}
                  </p>
                </div>
                <StatusBadge status={d.status} />
              </div>

              {d.status === "draft" && (
                <p className="hint-amber">This is a saved draft — it hasn't been sent to finance yet.</p>
              )}

              <div className="dtot">
                <span>Total submitted</span>
                <strong>{money(d.totalCad)}</strong>
              </div>

              <h2 className="dsec">Receipts</h2>
              {d.lines.length === 0 ? (
                <p className="sub">No receipt lines.</p>
              ) : (
                <ul className="dlines">
                  {d.lines.map((l, i) => (
                    <li className="dline" key={i}>
                      {l.fileUrl ? (
                        isPdf(l.fileName) ? (
                          <button className="dline__thumb dline__thumb--pdf" onClick={() => setZoom({ src: l.fileUrl!, pdf: true })}>PDF</button>
                        ) : (
                          <button className="dline__thumb" onClick={() => setZoom({ src: l.fileUrl!, pdf: false })}>
                            <img src={l.fileUrl} alt="" loading="lazy" />
                          </button>
                        )
                      ) : (
                        <span className="dline__thumb dline__thumb--none" aria-hidden="true" />
                      )}
                      <div className="dline__body">
                        <div className="dline__desc">{l.description || "(no description)"}</div>
                        {l.transactionDate && <div className="dline__date">{l.transactionDate}</div>}
                      </div>
                      <div className="dline__amt">
                        <div>{money(l.amount, l.currency)}</div>
                        {l.currency !== "CAD" && <div className="dline__cad">{money(l.amountCad)}</div>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <h2 className="dsec">Details</h2>
              <dl className="dgrid">
                <div><dt>Name</dt><dd>{d.fullName || "—"}</dd></div>
                <div><dt>Student number</dt><dd>{d.studentNumber || "—"}</dd></div>
                <div><dt>Department</dt><dd>{d.department || "—"}</dd></div>
                <div><dt>Date prepared</dt><dd>{d.datePrepared || "—"}</dd></div>
                <div className="dgrid__wide"><dt>Mailing address</dt><dd>{mailingText || "—"}</dd></div>
                <div className="dgrid__wide"><dt>Reason</dt><dd>{d.reason || "—"}</dd></div>
              </dl>

              {d.status === "submitted" && d.pdfUrl && (
                <div className="act">
                  <button className="btn btn--ghost" onClick={downloadPdf}>Download the sample PDF</button>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {zoom &&
        createPortal(
          <div className="lightbox" onClick={() => setZoom(null)}>
            <button className="lightbox__close" aria-label="Close" onClick={() => setZoom(null)}>×</button>
            {zoom.pdf ? (
              <iframe className="lightbox__frame" src={zoom.src} title="Receipt" onClick={(e) => e.stopPropagation()} />
            ) : (
              <img className="lightbox__img" src={zoom.src} alt="Receipt" onClick={(e) => e.stopPropagation()} />
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
