import { useRef, useState, useEffect } from "react";
import type { UploadedReceipt } from "../lib/types.js";

const READING_PHRASES = [
  "Reading your receipt…",
  "Finding the total…",
  "Checking the date…",
  "Almost there…",
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatDate(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  return `${MONTHS[+m[2] - 1]} ${+m[3]}, ${m[1]}`;
}

function stageOf(r: UploadedReceipt): "reading" | "done" {
  if (!r.scan) return "reading";
  return "done";
}

/** Small square thumbnail — the real receipt photo (HEIC decoded client-side). */
function Thumb({ r }: { r: UploadedReceipt }) {
  const isPdf = (r.fileName || "").toLowerCase().endsWith(".pdf");
  if (isPdf) return <span className="rthumb rthumb--label">PDF</span>;
  const src = r.localPreviewUrl || r.scan?.previewUrl;
  if (src) {
    return (
      <span className="rthumb">
        <img src={src} alt="" />
      </span>
    );
  }
  // Scan finished but there's no displayable image (e.g. a HEIC that couldn't
  // decode) — a static "no preview" mark, not the loading shimmer.
  if (r.scan) {
    return (
      <span className="rthumb rthumb--none" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.3" />
          <path d="m21 15-5-5L5 21" />
        </svg>
      </span>
    );
  }
  return <span className="rthumb rthumb--loading" aria-hidden="true" />;
}

export function Receipts(props: {
  receipts: UploadedReceipt[];
  onAddFiles: (files: FileList | File[]) => Promise<string[]>;
  onRemove: (id: string) => void;
  onNext: () => void;
}) {
  const { receipts, onAddFiles, onRemove, onNext } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(false);
  const [hint, setHint] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    import("heic2any").catch(() => {});
  }, []);

  const anyScanning = receipts.some((r) => stageOf(r) !== "done");

  useEffect(() => {
    if (!anyScanning) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1400);
    return () => window.clearInterval(id);
  }, [anyScanning]);

  function pulseDrop() {
    const el = dropRef.current;
    if (!el) return;
    el.classList.remove("pulse");
    void el.offsetWidth;
    el.classList.add("pulse");
  }

  async function add(files: FileList | File[]) {
    const hints = await onAddFiles(files);
    setHint(hints.join(" "));
  }

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const files: File[] = [];
      for (const item of e.clipboardData?.items ?? []) {
        if (item.kind === "file") {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length) {
        e.preventDefault();
        void add(files);
      }
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  const ready = receipts.length > 0 && !anyScanning;

  return (
    <section>
      <h1 className="title">Receipts</h1>
      <p className="sub">Add a photo or PDF of each receipt. We'll read the amount and date for you.</p>

      <div
        ref={dropRef}
        className={`drop${drag ? " drag" : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => { e.preventDefault(); }}
        onDragEnter={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (e.dataTransfer.files.length) {
            pulseDrop();
            void add(e.dataTransfer.files);
          }
        }}
      >
        <input
          ref={inputRef}
          className="hidden-input"
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,.pdf,application/pdf"
          multiple
          onChange={(e) => {
            if (e.target.files?.length) void add(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="di" aria-hidden="true">↑</div>
        <p className="dt">Click or drag a receipt here</p>
        <p className="dm">
          …or paste from your clipboard with <kbd className="kbd">⌘V</kbd> <kbd className="kbd">Ctrl+V</kbd>
        </p>
        <p className="dm dm--meta">Image or PDF · up to 3 files · 10 MB each</p>
      </div>

      <ul className="rlist">
        {receipts.map((r) => {
          const stage = stageOf(r);
          const scanning = stage !== "done";
          const ex = r.scan?.extracted;
          const amountFound = ex?.amount != null;
          const ok = Boolean(r.scan?.ok && ex?.confidence === "ok");
          // Only show a warning line when we DID read an amount but it's iffy;
          // a full failure is communicated by the row itself, not a second line.
          const showWarn = Boolean(!scanning && amountFound && r.scan?.warnings?.length);
          return (
            <li key={r.id} className={`rli${scanning ? " rli--scanning" : ""}`}>
              <div className="frow">
                <Thumb r={r} />
                <div className="rmeta">
                  {scanning ? (
                    <div className="rmeta__status">
                      {READING_PHRASES[tick % READING_PHRASES.length]}
                    </div>
                  ) : amountFound ? (
                    <>
                      <div className="rmeta__amt val-in">{`${ex!.currency} ${ex!.amount}`}</div>
                      {ex!.transactionDate && <div className="rmeta__date">{formatDate(ex!.transactionDate)}</div>}
                    </>
                  ) : (
                    <>
                      <div className="rmeta__title">Couldn't read it</div>
                      <div className="rmeta__date">Add the amount on the next step</div>
                    </>
                  )}
                </div>
                {!scanning &&
                  (amountFound ? (
                    <span className={`chip chip--${ok ? "ok" : "warn"}`}>{ok ? "Scanned" : "Check it"}</span>
                  ) : (
                    <span className="chip chip--warn">Enter manually</span>
                  ))}
                <button className="rm" aria-label="Remove receipt" onClick={() => onRemove(r.id)}>×</button>
              </div>
              {scanning && <div className="scanbar" aria-hidden="true"><i /></div>}
              {showWarn && (
                <p className="warn">{(r.scan?.warnings ?? []).map((e) => e.message).join(" ")}</p>
              )}
            </li>
          );
        })}
      </ul>

      {hint && <p className="error">{hint}</p>}

      <div className="act">
        <button className="btn" disabled={!ready} onClick={onNext}>Continue</button>
      </div>
    </section>
  );
}
