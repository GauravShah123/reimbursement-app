import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type {
  ClaimDraft,
  MailingAddress,
  MemberResponse,
  ReceiptLineInput,
  UploadedReceipt,
} from "../lib/types.js";
import { useCountUp } from "../lib/useCountUp.js";
import { DEMO_RATES_TO_CAD } from "../demo/backend.js";

const CURRENCIES = ["CAD", "USD", "EUR", "GBP"];
const MAIL_KEY = "bp_claim_mailing_v1";
const EMPTY_MAIL: MailingAddress = {
  line1: "", line2: "", city: "", province: "Ontario", postalCode: "", country: "Canada",
};

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Google Sheets serial date: days since 1899-12-30. */
function sheetsSerial(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return "—";
  const [y, m, d] = ymd.split("-").map(Number);
  const days = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
  return String(days);
}

function lineFromReceipt(r: UploadedReceipt): ReceiptLineInput {
  const ex = r.scan?.extracted;
  const tx = ex?.transactionDate && /^\d{4}-\d{2}-\d{2}$/.test(ex.transactionDate) ? ex.transactionDate : "";
  let cur = (ex?.currency || "CAD").toUpperCase();
  if (!CURRENCIES.includes(cur)) cur = "CAD";
  return {
    id: crypto.randomUUID(),
    sourceUploadId: r.id,
    fileName: r.fileName,
    fileUrl: r.fileUrl,
    transactionDate: tx,
    description: "",
    amount: ex?.amount != null ? String(ex.amount) : "",
    currency: cur,
  };
}

/** Receipt image/PDF shown beside the line so the user can verify the amount. */
const ZoomIcon = (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 3h6v6" />
    <path d="M9 21H3v-6" />
    <path d="M21 3l-7 7" />
    <path d="M3 21l7-7" />
  </svg>
);

function ReceiptPreview({ rc, onZoom }: { rc?: UploadedReceipt; onZoom: (src: string, pdf: boolean) => void }) {
  if (!rc) return <div className="rcphoto__box rcphoto--empty">No file</div>;
  const isPdf = (rc.fileName || "").toLowerCase().endsWith(".pdf");
  const preview = rc.localPreviewUrl || rc.scan?.previewUrl;
  const full = preview || rc.fileUrl;
  if (!isPdf && !preview) {
    return <div className="rcphoto__box rcphoto--empty">{rc.scan ? "Preview unavailable" : "Loading…"}</div>;
  }
  return (
    <div className="rcphoto__box">
      {isPdf ? (
        <iframe className="rcphoto__frame" src={rc.localPreviewUrl || rc.fileUrl} title="Receipt" />
      ) : (
        <img className="rcphoto__img" src={preview} alt="Receipt" loading="lazy" />
      )}
      <button
        type="button"
        className="rcphoto__zoom"
        onClick={() => onZoom(isPdf ? (rc.localPreviewUrl || rc.fileUrl) : full, isPdf)}
        aria-label="View receipt larger"
      >
        {ZoomIcon}
      </button>
    </div>
  );
}

export function Details(props: {
  receipts: UploadedReceipt[];
  member: MemberResponse | null;
  initial: ClaimDraft | null;
  savingDraft: boolean;
  onBack: () => void;
  onSaveDraft: (draft: ClaimDraft) => void | Promise<void>;
  onNext: (draft: ClaimDraft) => void;
}) {
  const { receipts, member, initial, savingDraft, onBack, onSaveDraft, onNext } = props;
  const prefill = member?.prefill ?? {};

  const [lines, setLines] = useState<ReceiptLineInput[]>(
    () => initial?.receiptLines ?? receipts.map(lineFromReceipt),
  );
  const [reason, setReason] = useState(initial?.reason ?? "");
  const [fullName, setFullName] = useState(initial?.fullName ?? prefill.name ?? "");
  const [studentNumber, setStudentNumber] = useState(initial?.studentNumber ?? prefill.student_number ?? "");
  const [department, setDepartment] = useState(initial?.department ?? prefill.department ?? "");
  const [datePrepared] = useState(initial?.datePrepared || todayYmd());
  const [mailing, setMailing] = useState<MailingAddress>(initial?.mailing ?? EMPTY_MAIL);

  // Expand-by-default: only collapse a section when we actually have the data.
  const infoComplete = Boolean(member?.member_found && fullName && studentNumber);
  const [editInfo, setEditInfo] = useState(!infoComplete);
  const [editMail, setEditMail] = useState(true);
  // The real product looks up the live rate; the preview uses fixed sample rates.
  const rates: Record<string, number | null> = DEMO_RATES_TO_CAD;
  const [error, setError] = useState("");
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [zoom, setZoom] = useState<{ src: string; pdf: boolean } | null>(null);
  const clearErr = (k: string) =>
    setErrs((p) => {
      if (!p[k]) return p;
      const n = { ...p };
      delete n[k];
      return n;
    });

  // Fill from the member roster as soon as it loads (it may arrive after mount),
  // without overwriting anything the user already typed. Collapse once complete.
  useEffect(() => {
    if (!member?.member_found) return;
    const p = member.prefill;
    if (p.name) setFullName((v) => v || String(p.name));
    if (p.student_number != null) setStudentNumber((v) => v || String(p.student_number));
    if (p.department != null) setDepartment((v) => v || String(p.department));
    if (p.name && p.student_number) setEditInfo(false);
  }, [member]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(MAIL_KEY);
      if (raw && !initial) {
        const saved = { ...EMPTY_MAIL, ...JSON.parse(raw) };
        setMailing(saved);
        if (saved.line1) setEditMail(false); // collapse only if we have a saved address
      }
    } catch { /* ignore */ }
  }, []);

  const totalCad = useMemo(() => {
    let sum = 0;
    for (const l of lines) {
      const amt = parseFloat(String(l.amount).replace(/[^0-9.]/g, "")) || 0;
      const rate = l.currency === "CAD" ? 1 : rates[l.currency];
      sum += rate != null ? amt * rate : amt;
    }
    return Math.round(sum * 100) / 100;
  }, [lines, rates]);
  const animatedTotal = useCountUp(totalCad);

  // Close the receipt lightbox on Escape.
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoom(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

  function patchLine(id: string, patch: Partial<ReceiptLineInput>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  // Current form values as a draft, with no validation — drafts may be incomplete.
  function buildDraft(): ClaimDraft {
    return {
      claimNumberDisplay: studentNumber.trim() ? `${sheetsSerial(datePrepared)}${studentNumber.trim()}` : undefined,
      fullName: fullName.trim(),
      studentNumber: studentNumber.trim(),
      department: department.trim(),
      datePrepared,
      reason: (lines.length === 1 ? lines[0].description : reason).trim(),
      mailing,
      receiptLines: lines.map((l) => ({ ...l, description: l.description.trim(), amount: l.amount.trim() })),
    };
  }

  function submit() {
    setError("");
    const e: Record<string, string> = {};
    if (!fullName.trim()) e.fullName = "Required";
    if (!studentNumber.trim()) e.studentNumber = "Required";
    for (const l of lines) {
      if (!l.description.trim()) e[`desc-${l.id}`] = "Required";
      const amt = parseFloat(String(l.amount).replace(/[^0-9.]/g, ""));
      if (!l.amount.trim() || !Number.isFinite(amt) || amt <= 0) e[`amt-${l.id}`] = "Enter an amount";
    }
    setErrs(e);
    if (Object.keys(e).length > 0) {
      if (e.fullName || e.studentNumber) setEditInfo(true);
      return;
    }
    try { localStorage.setItem(MAIL_KEY, JSON.stringify(mailing)); } catch { /* ignore */ }
    onNext({
      claimNumberDisplay: `${sheetsSerial(datePrepared)}${studentNumber.trim()}`,
      fullName: fullName.trim(),
      studentNumber: studentNumber.trim(),
      department: department.trim(),
      datePrepared,
      reason: (lines.length === 1 ? lines[0].description : reason).trim(),
      mailing,
      receiptLines: lines.map((l) => ({ ...l, description: l.description.trim(), amount: l.amount.trim() })),
    });
  }

  const fromRoster = member?.member_found;

  return (
    <section>
      <h1 className="title">Details</h1>

      {/* Your info — collapsed confirmed row when known, expanded fields when not */}
      <div className="entry">
      {infoComplete && !editInfo ? (
        <div className="lrow">
          <div>
            <div className="lt">{fullName}</div>
            <div className="ls">{[studentNumber, department].filter(Boolean).join(" · ")}{fromRoster ? " · from member roster" : ""}</div>
          </div>
          <button className="edit" onClick={() => setEditInfo(true)}>Edit</button>
        </div>
      ) : (
        <>
          {!fromRoster && (
            <p className="hint-amber">We couldn't pull your details from the member roster — please confirm them below.</p>
          )}
          <div className="field"><label className="lab">Full name<span className="req">*</span></label>
            <input className={`input${errs.fullName ? " input--error" : ""}`} value={fullName} onChange={(e) => { setFullName(e.target.value); clearErr("fullName"); }} autoComplete="name" />
            {errs.fullName && <p className="field-error">{errs.fullName}</p>}</div>
          <div className="two">
            <div className="field" style={{ flex: 1 }}><label className="lab">Student number<span className="req">*</span></label>
              <input className={`input${errs.studentNumber ? " input--error" : ""}`} value={studentNumber} onChange={(e) => { setStudentNumber(e.target.value); clearErr("studentNumber"); }} />
              {errs.studentNumber && <p className="field-error">{errs.studentNumber}</p>}</div>
            <div className="field" style={{ flex: 1 }}><label className="lab">Department</label>
              <input className="input" value={department} onChange={(e) => setDepartment(e.target.value)} /></div>
          </div>
        </>
      )}
      </div>

      {/* Expense lines — receipt photo beside the fields */}
      {lines.map((l, i) => {
        const rc = receipts.find((r) => r.id === l.sourceUploadId);
        const dk = `desc-${l.id}`;
        const ak = `amt-${l.id}`;
        return (
          <div key={l.id} style={{ marginTop: i === 0 ? 16 : 28 }}>
            <div className="rcblock">
              <ReceiptPreview rc={rc} onZoom={(src, pdf) => setZoom({ src, pdf })} />
              <div className="rcfields">
                <div className="field" style={{ marginTop: 0 }}><label className="lab">What was this for?<span className="req">*</span></label>
                  <input className={`input${errs[dk] ? " input--error" : ""}`} value={l.description}
                    onChange={(e) => { patchLine(l.id, { description: e.target.value }); clearErr(dk); }} />
                  {errs[dk] && <p className="field-error">{errs[dk]}</p>}</div>
                <div className="two">
                  <div className="field" style={{ flex: 1 }}><label className="lab">Amount<span className="req">*</span></label>
                    <input className={`input${errs[ak] ? " input--error" : ""}`} inputMode="decimal" value={l.amount}
                      onChange={(e) => { patchLine(l.id, { amount: e.target.value }); clearErr(ak); }} />
                    {errs[ak] && <p className="field-error">{errs[ak]}</p>}</div>
                  <div className="field" style={{ width: 110 }}><label className="lab">Currency</label>
                    <select className="select" value={l.currency}
                      onChange={(e) => patchLine(l.id, { currency: e.target.value })}>
                      {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select></div>
                </div>
                {l.currency !== "CAD" && (
                  <p className="fx">
                    {rates[l.currency] == null
                      ? "Couldn't load today's exchange rate — we'll convert at submit."
                      : `≈ CAD ${((parseFloat(String(l.amount).replace(/[^0-9.]/g, "")) || 0) * (rates[l.currency] as number)).toFixed(2)} at a sample rate.`}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}

      <div className="entry">
      {/* With a single receipt, "what was this for?" already IS the reason, so we
          reuse it. A separate claim-level reason only appears for multiple receipts. */}
      {lines.length > 1 && (
        <div className="field"><label className="lab">Reason for the claim</label>
          <textarea className="textarea" rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="A short summary for finance, covering all receipts" /></div>
      )}

      {/* Mailing address — expanded when empty, collapsed when saved */}
      <p className="sec">Mailing address</p>
      {!editMail && mailing.line1 ? (
        <div className="lrow lrow--flush">
          <div>
            <div className="lt">{mailing.line1}</div>
            <div className="ls">{[mailing.city, mailing.province, mailing.postalCode].filter(Boolean).join(", ") || "saved"}</div>
          </div>
          <button className="edit" onClick={() => setEditMail(true)}>Edit</button>
        </div>
      ) : (
        <form className="addr-form" autoComplete="on" onSubmit={(e) => e.preventDefault()}>
          <div className="field"><label className="lab">Address line 1</label>
            <input className="input" name="address-line1" autoComplete="address-line1" value={mailing.line1} onChange={(e) => setMailing({ ...mailing, line1: e.target.value })} /></div>
          <div className="field"><label className="lab">Address line 2</label>
            <input className="input" name="address-line2" autoComplete="address-line2" value={mailing.line2} onChange={(e) => setMailing({ ...mailing, line2: e.target.value })} /></div>
          <div className="two">
            <div className="field" style={{ flex: 1 }}><label className="lab">City</label>
              <input className="input" name="city" autoComplete="address-level2" value={mailing.city} onChange={(e) => setMailing({ ...mailing, city: e.target.value })} /></div>
            <div className="field" style={{ width: 170 }}><label className="lab">Province or state</label>
              <input className="input" name="state" autoComplete="address-level1" value={mailing.province} onChange={(e) => setMailing({ ...mailing, province: e.target.value })} /></div>
          </div>
          <div className="two">
            <div className="field" style={{ flex: 1 }}><label className="lab">Postal code</label>
              <input className="input" name="postal-code" autoComplete="postal-code" inputMode="text" value={mailing.postalCode} onChange={(e) => setMailing({ ...mailing, postalCode: e.target.value })} /></div>
            <div className="field" style={{ flex: 1 }}><label className="lab">Country</label>
              <input className="input" name="country" autoComplete="country-name" value={mailing.country} onChange={(e) => setMailing({ ...mailing, country: e.target.value })} /></div>
          </div>
        </form>
      )}

      <div className="totrow"><span className="tl">Total reimbursement</span><span className="tv">CAD {animatedTotal.toFixed(2)}</span></div>
      </div>

      {error && <p className="error">{error}</p>}
      <div className="act">
        <button className="lnk" onClick={onBack} disabled={savingDraft}>Back</button>
        <button className="lnk" onClick={() => onSaveDraft(buildDraft())} disabled={savingDraft}>
          {savingDraft ? "Saving…" : "Save as draft"}
        </button>
        <button className="btn" onClick={submit} disabled={savingDraft}>Review</button>
      </div>

      {zoom &&
        createPortal(
          <div className="lightbox" role="dialog" aria-modal="true" onClick={() => setZoom(null)}>
            <button className="lightbox__close" aria-label="Close" onClick={() => setZoom(null)}>×</button>
            {zoom.pdf ? (
              <iframe className="lightbox__frame" src={zoom.src} title="Receipt" onClick={(e) => e.stopPropagation()} />
            ) : (
              <img className="lightbox__img" src={zoom.src} alt="Receipt" onClick={(e) => e.stopPropagation()} />
            )}
          </div>,
          document.body,
        )}
    </section>
  );
}
