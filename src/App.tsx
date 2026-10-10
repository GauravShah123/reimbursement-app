import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./lib/api.js";
import { storeReceiptFile } from "./demo/backend.js";
import { scanImage, scanPdf, failScan } from "./lib/scan.js";
import type {
  ClaimDraft,
  MemberResponse,
  ReceiptLineInput,
  SessionUser,
  UploadedReceipt,
} from "./lib/types.js";
import { Shell } from "./components/Shell.js";
import { SignIn } from "./steps/SignIn.js";
import { Receipts } from "./steps/Receipts.js";
import { Details } from "./steps/Details.js";
import { ReviewSign } from "./steps/ReviewSign.js";
import { Confirmation } from "./steps/Confirmation.js";
import { History, RequestDetail } from "./steps/History.js";

type Step = "receipts" | "details" | "review" | "done";
type View = "flow" | "history" | "detail";
const MAX_FILES = 3;
const MAX_BYTES = 10 * 1024 * 1024;

function fileAllowed(file: File): boolean {
  const t = (file.type || "").toLowerCase();
  if (t === "application/pdf" || t.startsWith("image/")) return true;
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  return ["pdf", "jpg", "jpeg", "png", "gif", "webp", "heic", "heif"].includes(ext);
}

export function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [step, setStep] = useState<Step>("receipts");
  const [receipts, setReceipts] = useState<UploadedReceipt[]>([]);
  const receiptsRef = useRef<UploadedReceipt[]>([]);
  useEffect(() => { receiptsRef.current = receipts; }, [receipts]);
  const [member, setMember] = useState<MemberResponse | null>(null);
  const [draft, setDraft] = useState<ClaimDraft | null>(null);
  const [result, setResult] = useState<{ id: string; flags: { code: string; label: string }[] } | null>(null);
  const [view, setView] = useState<View>("flow");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  // In the real product, receipt files upload to storage only when a claim is
  // submitted, downloaded, or saved as a draft. In this preview they never leave
  // the tab: "uploading" just hands back a local blob: URL. Cache those URLs (by
  // source receipt id) so each file is only stored once.
  const uploadedRef = useRef<Record<string, string>>({});

  useEffect(() => {
    api<{ user: SessionUser }>("/api/me").then(({ res, data }) => {
      if (res.ok && data.user) setUser(data.user);
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    api<MemberResponse>("/api/member").then(({ res, data }) => {
      if (res.ok || res.status === 503) setMember(data);
    });
  }, [user]);

  const patchReceipt = useCallback((id: string, patch: Partial<UploadedReceipt>) => {
    setReceipts((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const addFiles = useCallback(
    async (fileList: FileList | File[]): Promise<string[]> => {
      const files = Array.from(fileList);
      const hints: string[] = [];
      const queue: { id: string; file: File }[] = [];
      let count = receiptsRef.current.length;
      for (const file of files) {
        if (count >= MAX_FILES) {
          hints.push(`You can upload at most ${MAX_FILES} files.`);
          break;
        }
        if (!fileAllowed(file)) { hints.push(`${file.name} is not an image or PDF.`); continue; }
        if (file.size <= 0) { hints.push(`${file.name} is empty.`); continue; }
        if (file.size > MAX_BYTES) { hints.push(`${file.name} is over 10 MB.`); continue; }
        queue.push({ id: crypto.randomUUID(), file });
        count++;
      }

      // Add placeholders + prepare an OCR source per file. HEIC is decoded once,
      // and that decoded image powers both the thumbnail and the OCR.
      const jobs: { id: string; file: File; isPdf: boolean; ocrSource: Promise<Blob | File | null> }[] = [];
      for (const { id, file } of queue) {
        const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
        const renderable =
          /^image\/(jpeg|png|gif|webp|bmp)$/i.test(file.type) ||
          /\.(jpe?g|png|gif|webp|bmp)$/i.test(file.name);
        const heic =
          /image\/(heic|heif)/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);

        let localPreviewUrl: string | undefined;
        let ocrSource: Promise<Blob | File | null>;
        if (isPdf) {
          // The browser can render a PDF straight from an object URL (used for the
          // side-by-side preview on the Details step). Text is extracted by pdf.js.
          localPreviewUrl = URL.createObjectURL(file);
          ocrSource = Promise.resolve(null);
        } else if (heic) {
          ocrSource = (async () => {
            try {
              const { default: heic2any } = await import("heic2any");
              const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.7 });
              const blob = Array.isArray(out) ? out[0] : out;
              patchReceipt(id, { localPreviewUrl: URL.createObjectURL(blob) });
              return blob;
            } catch {
              return null;
            }
          })();
        } else {
          localPreviewUrl = renderable ? URL.createObjectURL(file) : undefined;
          ocrSource = Promise.resolve(file);
        }

        setReceipts((prev) => [
          ...prev,
          { id, file, fileName: file.name, fileUrl: "", size: file.size, mimeType: file.type, localPreviewUrl },
        ]);
        jobs.push({ id, file, isPdf, ocrSource });
      }

      // Scan entirely on the device — images OCR with tesseract.js, PDFs parse with
      // pdf.js. Nothing is uploaded.
      const processOne = async (job: (typeof jobs)[number]) => {
        const { id, file, isPdf, ocrSource } = job;
        try {
          let scan;
          if (isPdf) {
            scan = await scanPdf(file);
          } else {
            const src = await ocrSource; // decoded image, or null if HEIC decode failed
            scan = src ? await scanImage(src) : failScan();
          }
          patchReceipt(id, { scan });
        } catch {
          patchReceipt(id, { scan: failScan() });
        }
      };
      jobs.forEach((job) => void processOne(job));

      return hints;
    },
    [patchReceipt],
  );

  const removeReceipt = useCallback((id: string) => {
    setReceipts((prev) => {
      const r = prev.find((x) => x.id === id);
      if (r?.localPreviewUrl) URL.revokeObjectURL(r.localPreviewUrl);
      return prev.filter((x) => x.id !== id);
    });
  }, []);

  // Store any receipt files that aren't stored yet and stamp their URLs onto the
  // lines. Shared by submit, download, and save-as-draft.
  const resolveLines = useCallback(
    async (lines: ReceiptLineInput[]): Promise<ReceiptLineInput[]> => {
      return Promise.all(
        lines.map(async (l) => {
          if (l.fileUrl) return l;
          const key = l.sourceUploadId ?? "";
          if (uploadedRef.current[key]) return { ...l, fileUrl: uploadedRef.current[key] };
          const rec = l.sourceUploadId ? receiptsRef.current.find((r) => r.id === l.sourceUploadId) : undefined;
          if (!rec?.file) return l;
          // HEIC can't be drawn by most browsers, so keep the decoded JPEG instead.
          const heic = /image\/(heic|heif)/i.test(rec.file.type) || /\.(heic|heif)$/i.test(rec.file.name);
          let source: Blob = rec.file;
          if (heic) {
            if (!rec.localPreviewUrl) return l;
            source = await (await fetch(rec.localPreviewUrl)).blob();
          }
          const url = storeReceiptFile(source);
          uploadedRef.current[key] = url;
          return { ...l, fileUrl: url };
        }),
      );
    },
    [],
  );

  // Save the current claim as a draft, then drop the user into their requests list.
  const saveDraft = useCallback(
    async (d: ClaimDraft) => {
      setSavingDraft(true);
      try {
        const receiptLines = await resolveLines(d.receiptLines);
        const { res, data } = await api<{ ok: boolean; id: string }>("/api/claim/draft", {
          method: "POST",
          body: JSON.stringify({ ...d, id: draftId ?? undefined, receiptLines }),
        });
        if (res.ok && data.id) {
          setDraftId(data.id);
          setView("history");
        }
      } finally {
        setSavingDraft(false);
      }
    },
    [resolveLines, draftId],
  );

  function revokePreviews() {
    for (const r of receiptsRef.current) {
      if (r.localPreviewUrl) URL.revokeObjectURL(r.localPreviewUrl);
    }
  }

  // Reset the flow for a brand-new request.
  function startNew() {
    revokePreviews();
    uploadedRef.current = {};
    setReceipts([]);
    setDraft(null);
    setDraftId(null);
    setResult(null);
    setSelectedId(null);
    setStep("receipts");
    setView("flow");
  }

  async function signOut() {
    await api("/api/auth/logout", { method: "POST" });
    revokePreviews();
    uploadedRef.current = {};
    setUser(null);
    setReceipts([]);
    setDraft(null);
    setDraftId(null);
    setResult(null);
    setSelectedId(null);
    setStep("receipts");
    setView("flow");
  }

  if (!authReady) return <div className="app" />;
  if (!user) return <SignIn onSignedIn={setUser} />;

  if (view === "history") {
    return (
      <History
        onOpen={(id) => { setSelectedId(id); setView("detail"); }}
        onNew={startNew}
        onSignOut={signOut}
      />
    );
  }

  if (view === "detail" && selectedId) {
    return <RequestDetail id={selectedId} onBack={() => setView("history")} onSignOut={signOut} />;
  }

  if (step === "done" && result) {
    return (
      <Confirmation
        id={result.id}
        onSignOut={signOut}
        onRestart={startNew}
        onViewRequests={() => setView("history")}
      />
    );
  }

  return (
    <Shell step={step} user={user} onSignOut={signOut} onShowHistory={() => setView("history")}>
      {step === "receipts" && (
        <Receipts
          receipts={receipts}
          onAddFiles={addFiles}
          onRemove={removeReceipt}
          onNext={() => setStep("details")}
        />
      )}
      {step === "details" && (
        <Details
          receipts={receipts}
          member={member}
          initial={draft}
          savingDraft={savingDraft}
          onBack={() => setStep("receipts")}
          onSaveDraft={saveDraft}
          onNext={(d) => {
            setDraft(d);
            setStep("review");
          }}
        />
      )}
      {step === "review" && draft && (
        <ReviewSign
          draft={draft}
          resolveLines={resolveLines}
          savingDraft={savingDraft}
          onBack={() => setStep("details")}
          onSaveDraft={saveDraft}
          onSubmitted={(id, flags) => {
            if (draftId) {
              void api(`/api/claim/draft?id=${encodeURIComponent(draftId)}`, { method: "DELETE" });
              setDraftId(null);
            }
            setResult({ id, flags });
            setStep("done");
          }}
        />
      )}
    </Shell>
  );
}
