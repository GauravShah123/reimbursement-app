// In-browser stand-in for the real product's server.
//
// The real product runs serverless functions backed by Google OAuth, a database,
// file storage, a member roster and outbound email. This public preview ships
// NONE of that: there is no server, no credentials and no network API. Every
// "request" is handled here, in the visitor's own tab, against sample data that
// lives in memory and disappears on reload. Nothing a visitor types or uploads
// ever leaves their browser.
import { PDFDocument, PageSizes } from "pdf-lib";
import { buildClaimFormPdf, parseAmount } from "./claim-form-pdf.js";
import type {
  ClaimDetail,
  ClaimDraft,
  ClaimSubmitPayload,
  ClaimSummary,
  MemberResponse,
  ReceiptLineInput,
  SessionUser,
  SubmitResponse,
} from "../lib/types.js";

// --- Sample identity ---------------------------------------------------------

export const DEMO_USER: SessionUser = {
  sub: "demo-user",
  email: "alex.demo@example.org",
  name: "Alex Demo",
  picture: null,
};

const DEMO_MEMBER: MemberResponse = {
  member_found: true,
  prefill: {
    bp_email: DEMO_USER.email,
    name: DEMO_USER.name,
    uw_email: "alex.demo@example.edu",
    program: "Sample Program",
    department: "Engineering",
    role: "Project Lead",
    student_number: "20000000",
  },
  flags: { not_on_sheet: false },
};

// Fixed sample exchange rates (the real product looks up the live rate).
export const DEMO_RATES_TO_CAD: Record<string, number> = { CAD: 1, USD: 1.37, EUR: 1.49, GBP: 1.74 };

// --- Limits ------------------------------------------------------------------
// Everything here runs on the visitor's device, so these only bound how much
// memory one tab can use; there is no shared resource to exhaust.
const MAX_CLAIMS = 12;
const MAX_LINES = 3;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TEXT = 500;

const SESSION_KEY = "bp_preview_signed_in";
const LEAD_ROLES = new Set([
  "co-president", "internal director", "external director", "director lead",
  "product manager", "project lead", "vp product", "vp engineering", "vp design",
]);

type StoredClaim = ClaimDetail & { objectUrls: string[] };

const DAY = 86400000;
const EMPTY_MAILING = {
  line1: "123 Sample Street", line2: "", city: "Waterloo", province: "Ontario",
  postalCode: "A1A 1A1", country: "Canada",
};

function seedClaims(): StoredClaim[] {
  const now = Date.now();
  const base = {
    fullName: DEMO_USER.name,
    studentNumber: "20000000",
    department: "Engineering",
    mailing: EMPTY_MAILING,
    pdfUrl: null,
    objectUrls: [],
  };
  return [
    {
      ...base,
      id: "sample-1",
      claimNumber: "4600020000000",
      status: "submitted",
      totalCad: 64.2,
      flags: [],
      reason: "Snacks for the fall design sprint (sample)",
      datePrepared: new Date(now - 9 * DAY).toISOString().slice(0, 10),
      createdAt: now - 9 * DAY,
      updatedAt: now - 9 * DAY,
      lines: [
        {
          transactionDate: new Date(now - 11 * DAY).toISOString().slice(0, 10),
          description: "Snacks for the fall design sprint (sample)",
          amount: 64.2, currency: "CAD", amountCad: 64.2, fileName: null, fileUrl: null,
        },
      ],
    },
    {
      ...base,
      id: "sample-2",
      claimNumber: "4601520000000",
      status: "draft",
      totalCad: 27.4,
      flags: [],
      reason: "Poster printing (sample draft)",
      datePrepared: new Date(now - 2 * DAY).toISOString().slice(0, 10),
      createdAt: now - 2 * DAY,
      updatedAt: now - 2 * DAY,
      lines: [
        {
          transactionDate: new Date(now - 3 * DAY).toISOString().slice(0, 10),
          description: "Poster printing (sample draft)",
          amount: 20, currency: "USD", amountCad: 27.4, fileName: null, fileUrl: null,
        },
      ],
    },
  ];
}

let claims: StoredClaim[] = seedClaims();

// --- Helpers -----------------------------------------------------------------

function isSignedIn(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function setSignedIn(on: boolean): void {
  try {
    if (on) sessionStorage.setItem(SESSION_KEY, "1");
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable — sign-in just won't survive a reload */
  }
}

const clip = (s: unknown, max = MAX_TEXT) => String(s ?? "").slice(0, max);

function resolveLines(lines: ReceiptLineInput[]) {
  return lines.slice(0, MAX_LINES).map((line) => {
    const amount = parseAmount(line.amount);
    const currency = clip(line.currency || "CAD", 3).trim().toUpperCase();
    const rate = DEMO_RATES_TO_CAD[currency] ?? null;
    const amountCad = rate != null ? Math.round(amount * rate * 100) / 100 : amount;
    return { line, amount, currency, amountCad };
  });
}

function sumCad(resolved: ReturnType<typeof resolveLines>): number {
  return Math.round(resolved.reduce((s, r) => s + r.amountCad, 0) * 100) / 100;
}

function computeFlags(resolved: ReturnType<typeof resolveLines>, totalCad: number) {
  const flags: { code: string; label: string }[] = [];
  const role = String(DEMO_MEMBER.prefill.role ?? "").trim().toLowerCase();
  if (!LEAD_ROLES.has(role)) {
    flags.push({ code: "non_lead_role", label: `Role not in lead-role allowlist (${role || "unknown"})` });
  }
  if (totalCad > 100) {
    flags.push({ code: "over_100", label: `Total exceeds $100 CAD ($${totalCad.toFixed(2)})` });
  }
  const nonCad = [...new Set(resolved.map((r) => r.currency).filter((c) => c && c !== "CAD"))];
  if (nonCad.length) {
    flags.push({ code: "non_cad", label: `Non-CAD currency on receipt(s): ${nonCad.join(", ")}` });
  }
  return flags;
}

function toStored(
  id: string,
  status: StoredClaim["status"],
  d: ClaimDraft,
  resolved: ReturnType<typeof resolveLines>,
  createdAt: number,
): StoredClaim {
  return {
    id,
    claimNumber: clip(d.claimNumberDisplay || `${Date.now()}`, 64),
    status,
    totalCad: sumCad(resolved),
    flags: [],
    pdfUrl: null,
    fullName: clip(d.fullName),
    studentNumber: clip(d.studentNumber, 64),
    department: clip(d.department),
    reason: clip(d.reason),
    datePrepared: clip(d.datePrepared, 10),
    mailing: {
      line1: clip(d.mailing?.line1), line2: clip(d.mailing?.line2), city: clip(d.mailing?.city),
      province: clip(d.mailing?.province), postalCode: clip(d.mailing?.postalCode, 32),
      country: clip(d.mailing?.country),
    },
    createdAt,
    updatedAt: Date.now(),
    lines: resolved.map((r) => ({
      transactionDate: clip(r.line.transactionDate, 10) || null,
      description: clip(r.line.description),
      amount: r.amount,
      currency: r.currency,
      amountCad: r.amountCad,
      fileName: r.line.fileName ? clip(r.line.fileName, 200) : null,
      fileUrl: r.line.fileUrl ?? null,
    })),
    objectUrls: [],
  };
}

function upsert(claim: StoredClaim): void {
  claims = [claim, ...claims.filter((c) => c.id !== claim.id)];
  // Keep the in-memory store small: drop the oldest entries and free their PDFs.
  for (const dropped of claims.slice(MAX_CLAIMS)) {
    dropped.objectUrls.forEach((u) => URL.revokeObjectURL(u));
  }
  claims = claims.slice(0, MAX_CLAIMS);
}

// --- Receipt files -----------------------------------------------------------

/** "Upload" a receipt: it stays in this tab and gets a local blob: URL. */
export function storeReceiptFile(file: Blob): string {
  if (file.size > MAX_FILE_BYTES) throw new Error("File is over 10 MB.");
  return URL.createObjectURL(file);
}

async function receiptToJpeg(blob: Blob, maxDim = 1600, quality = 0.7): Promise<Uint8Array> {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bmp.width * scale));
  canvas.height = Math.max(1, Math.round(bmp.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const out = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
  if (!out) throw new Error("jpeg encode failed");
  return new Uint8Array(await out.arrayBuffer());
}

/** Build the merged claim PDF (form + receipts) on the device. */
export async function buildMergedClaimPdf(payload: ClaimSubmitPayload): Promise<Blob> {
  const resolved = resolveLines(payload.receiptLines);
  const formPdf = await buildClaimFormPdf({
    ...payload,
    claimantBpEmail: DEMO_USER.email,
    receiptLines: resolved.map((r) => ({
      transactionDate: r.line.transactionDate,
      description: r.line.description,
      amount: r.amountCad,
    })),
  });

  const merged = await PDFDocument.load(formPdf);
  for (const r of resolved) {
    const url = r.line.fileUrl;
    // Only ever read files this tab created itself — never a remote URL.
    if (!url || !url.startsWith("blob:")) continue;
    try {
      const blob = await (await fetch(url)).blob();
      const isPdf = blob.type === "application/pdf" || /\.pdf$/i.test(r.line.fileName || "");
      if (isPdf) {
        const inner = await PDFDocument.load(await blob.arrayBuffer());
        const pages = await merged.copyPages(inner, inner.getPageIndices().slice(0, 10));
        pages.forEach((p) => merged.addPage(p));
      } else {
        const img = await merged.embedJpg(await receiptToJpeg(blob));
        const page = merged.addPage(PageSizes.Letter);
        const { width: PW, height: PH } = page.getSize();
        const margin = 36;
        const scale = Math.min((PW - margin * 2) / img.width, (PH - margin * 2) / img.height, 1);
        const dw = img.width * scale;
        const dh = img.height * scale;
        page.drawImage(img, { x: (PW - dw) / 2, y: (PH - dh) / 2, width: dw, height: dh });
      }
    } catch {
      /* unreadable receipt (e.g. an encrypted PDF) — leave it out of the sample PDF */
    }
  }
  const bytes = await merged.save();
  return new Blob([bytes.slice().buffer], { type: "application/pdf" });
}

// --- "API" -------------------------------------------------------------------

type Reply<T = unknown> = { status: number; data: T };
const ok = <T,>(data: T): Reply<T> => ({ status: 200, data });
const fail = (status: number, code: string, message: string): Reply =>
  ({ status, data: { ok: false, error: code, errors: [{ code, message }] } });

/** Brief pause so the preview shows the same loading states as the real product. */
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function handle(method: string, path: string, body: unknown): Promise<Reply> {
  const [route, query = ""] = path.split("?");
  const params = new URLSearchParams(query);

  if (route === "/api/auth/demo" && method === "POST") {
    await pause(400);
    setSignedIn(true);
    return ok({ user: DEMO_USER });
  }
  if (route === "/api/auth/logout") {
    setSignedIn(false);
    return { status: 204, data: {} };
  }

  // Everything below mirrors the real product's signed-in-only routes.
  if (!isSignedIn()) return fail(401, "unauthorized", "Sign in first.");

  if (route === "/api/me") return ok({ user: DEMO_USER });
  if (route === "/api/member") return ok(DEMO_MEMBER);

  if (route === "/api/claims") {
    await pause(250);
    const list: ClaimSummary[] = claims.map((c) => ({
      id: c.id, claimNumber: c.claimNumber, status: c.status, totalCad: c.totalCad,
      reason: c.reason, flags: c.flags, createdAt: c.createdAt, updatedAt: c.updatedAt,
    }));
    return ok({ claims: list });
  }

  if (route === "/api/claim/draft" && method === "DELETE") {
    const id = params.get("id");
    claims = claims.filter((c) => !(c.id === id && c.status === "draft"));
    return ok({ ok: true });
  }

  if (route === "/api/claim/draft" && method === "POST") {
    await pause(350);
    const d = body as ClaimDraft & { id?: string };
    const existing = claims.find((c) => c.id === d.id && c.status === "draft");
    const id = existing?.id ?? crypto.randomUUID();
    upsert(toStored(id, "draft", d, resolveLines(d.receiptLines ?? []), existing?.createdAt ?? Date.now()));
    return ok({ ok: true, id, status: "draft" });
  }

  if (route === "/api/claim/submit" && method === "POST") {
    const payload = body as ClaimSubmitPayload;
    if (!payload?.fullName?.trim() || !payload?.studentNumber?.trim() || !payload.receiptLines?.length) {
      return fail(400, "validation", "Fill in your details and add at least one receipt.");
    }
    if (!String(payload.signaturePngDataUrl || "").startsWith("data:image/png;base64,")) {
      return fail(400, "validation", "Signature must be a PNG data URL");
    }
    let pdf: Blob;
    try {
      // The real product also emails finance and stores a record here. The
      // preview only builds the PDF; the pause stands in for that extra work.
      [pdf] = await Promise.all([buildMergedClaimPdf(payload), pause(3200)]);
    } catch {
      return fail(500, "submit_failed", "Could not generate the claim. Please try again.");
    }
    const resolved = resolveLines(payload.receiptLines);
    const claim = toStored(crypto.randomUUID(), "submitted", payload, resolved, Date.now());
    claim.flags = computeFlags(resolved, claim.totalCad);
    claim.pdfUrl = URL.createObjectURL(pdf);
    claim.objectUrls.push(claim.pdfUrl);
    upsert(claim);
    const res: SubmitResponse = { ok: true, id: claim.id, status: "submitted", flags: claim.flags };
    return ok(res);
  }

  if (route.startsWith("/api/claim/")) {
    const id = decodeURIComponent(route.slice("/api/claim/".length));
    const found = claims.find((c) => c.id === id);
    if (!found) return fail(404, "not_found", "Not found.");
    const { objectUrls: _objectUrls, ...detail } = found;
    return ok(detail);
  }

  return fail(404, "not_found", "Not found.");
}
