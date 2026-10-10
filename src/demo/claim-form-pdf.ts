// Renders the expense claim form with pdf-lib, entirely in the browser.
// Same layout as the real product (bordered cell grid, the Date/Description/
// Travel/Other/Exch Rate/TOTAL line table, the Account table, and the three
// certification blocks), plus a "sample" watermark so a preview PDF can never
// be mistaken for a real claim.
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont } from "pdf-lib";

/** Parse a free-form money string ("$1,234.56", "CAD 99") into a finite number; 0 on failure. */
export function parseAmount(s: unknown): number {
  const n = parseFloat(String(s ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export type ClaimFormData = {
  claimNumberDisplay?: string;
  fullName?: string;
  studentNumber?: string;
  department?: string;
  datePrepared?: string;
  reason?: string;
  claimantBpEmail?: string;
  mailing?: Partial<{
    line1: string;
    line2: string;
    city: string;
    province: string;
    postalCode: string;
    country: string;
  }>;
  receiptLines?: { transactionDate?: string; description?: string; amount?: string | number }[];
  signaturePngDataUrl: string;
  signedAt?: string;
};

const BLACK = rgb(0.1, 0.1, 0.1);
const GRAY = rgb(0.3, 0.3, 0.3);
const BORDER = rgb(0.6, 0.6, 0.6);
const HEADBG = rgb(0.91, 0.91, 0.91);
const RED = rgb(0.8, 0, 0);
const BLUE = rgb(0, 0.4, 0.8);

function safe(s: unknown): string {
  return String(s ?? "").replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "");
}
function money(n: number): string {
  return n.toFixed(2);
}

export async function buildClaimFormPdf(d: ClaimFormData): Promise<Uint8Array> {
  const sig = d.signaturePngDataUrl;
  if (typeof sig !== "string" || !sig.startsWith("data:image/png;base64,")) {
    throw new Error("invalid_signature_data_url");
  }

  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvB = await doc.embedFont(StandardFonts.HelveticaBold);

  const L = 36;
  const W = 540;
  let y = 792 - 30; // top cursor

  const text = (s: unknown, x: number, baseline: number, size = 8.5, f: PDFFont = helv, color = BLACK) =>
    page.drawText(safe(s), { x, y: baseline, size, font: f, color });

  const clip = (s: unknown, maxW: number, size: number, f: PDFFont = helv): string => {
    let str = safe(s);
    if (f.widthOfTextAtSize(str, size) <= maxW) return str;
    while (str.length && f.widthOfTextAtSize(str + "…", size) > maxW) str = str.slice(0, -1);
    return str + "…";
  };

  const wrapLines = (str: string, maxW: number, size: number, f: PDFFont = helv): string[] => {
    const words = safe(str).split(" ");
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (f.widthOfTextAtSize(t, size) > maxW && cur) {
        lines.push(cur);
        cur = w;
      } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  };

  type Cell = {
    w: number;
    label?: string;
    value?: unknown;
    text?: string;
    size?: number;
    bold?: boolean;
    align?: "left" | "center" | "right";
    color?: ReturnType<typeof rgb>;
    fill?: ReturnType<typeof rgb>;
    textY?: number;
  };

  // Draw one bordered row of cells starting at top `top`, height `h`.
  const row = (top: number, h: number, cells: Cell[]) => {
    let x = L;
    for (const c of cells) {
      page.drawRectangle({
        x,
        y: top - h,
        width: c.w,
        height: h,
        borderColor: BORDER,
        borderWidth: 0.6,
        color: c.fill,
      });
      if (c.label) text(c.label, x + 4, top - 8.5, 6.8, helv, GRAY);
      if (c.value != null) text(clip(c.value, c.w - 8, 8.5), x + 4, top - 19, 8.5, helv, BLACK);
      if (c.text != null) {
        const size = c.size ?? 8.5;
        const f = c.bold ? helvB : helv;
        let tx = x + 4;
        if (c.align === "center") tx = x + (c.w - f.widthOfTextAtSize(safe(c.text), size)) / 2;
        else if (c.align === "right") tx = x + c.w - 4 - f.widthOfTextAtSize(safe(c.text), size);
        text(c.text, tx, top - (c.textY ?? 10), size, f, c.color ?? BLACK);
      }
      x += c.w;
    }
  };

  // ── Header: logo | title | claim # ───────────────────────────────────
  const hH = 38;
  row(y, hH, [{ w: 130 }, { w: 270 }, { w: 140 }]);
  text("University of Waterloo", L + 6, y - 22, 10, helvB);
  text("Expense Claim Form", L + 130 + (270 - helvB.widthOfTextAtSize("Expense Claim Form", 15)) / 2, y - 24, 15, helvB);
  text("Claim #:", L + 406, y - 16, 8.5, helvB);
  text(clip(d.claimNumberDisplay, 130, 8.5), L + 406, y - 29, 8.5, helv, BLACK);
  y -= hH;

  // ── Payee + Concur note ───────────────────────────────────────────────
  row(y, 22, [{ w: W, label: "Payee is:" }]);
  y -= 22;
  row(y, 15, [
    {
      w: W,
      text: "Please note, if you are a regular, ongoing employee, you must submit claims for reimbursement using Concur",
      size: 7,
      bold: true,
      color: RED,
      textY: 10,
    },
  ]);
  y -= 15;

  // ── Claimant grid (4 col) ─────────────────────────────────────────────
  const c4 = W / 4;
  const mail = d.mailing || {};
  row(y, 26, [
    { w: c4, label: "Claimant Name", value: d.fullName },
    { w: c4, label: "Employee/Student Number", value: d.studentNumber },
    { w: c4, label: "Department", value: d.department },
    { w: c4, label: "Date Prepared", value: d.datePrepared },
  ]);
  y -= 26;
  row(y, 26, [
    { w: c4 * 2, label: "Mailing Address", value: [mail.line1, mail.line2].filter(Boolean).join(", ") },
    { w: c4, label: "Phone Number" },
    { w: c4, label: "E-Mail Address", value: d.claimantBpEmail },
  ]);
  y -= 26;
  row(y, 26, [
    { w: c4, label: "City", value: mail.city },
    { w: c4, label: "Province/State", value: mail.province },
    { w: c4, label: "Postal Code", value: mail.postalCode },
    { w: c4, label: "Country", value: mail.country },
  ]);
  y -= 26;
  row(y, 26, [{ w: W, label: "Destination / Reason for request", value: d.reason }]);
  y -= 26;

  // ── Travel block ──────────────────────────────────────────────────────
  row(y, 36, [
    { w: c4, label: "Travel Advance Request $" },
    { w: c4 * 2, label: "Pay to" },
    { w: c4, label: "Authorized Signature" },
  ]);
  y -= 36;
  row(y, 24, [
    { w: c4, label: "Dates of Travel" },
    { w: c4, label: "To" },
    { w: c4, label: "Number of Days" },
    { w: c4 },
  ]);
  y -= 24;

  // ── Line items (Date | Description | Travel | Other | Exch Rate | TOTAL)
  const lc = [66, 210, 66, 66, 60, 72]; // sums to 540
  const header = (top: number, labels: string[], widths: number[]) => {
    let x = L;
    labels.forEach((lab, i) => {
      page.drawRectangle({ x, y: top - 15, width: widths[i], height: 15, borderColor: BORDER, borderWidth: 0.6, color: HEADBG });
      const tw = helvB.widthOfTextAtSize(lab, 7.5);
      text(lab, x + (widths[i] - tw) / 2, top - 10.5, 7.5, helvB);
      x += widths[i];
    });
  };
  header(y, ["Date", "Description", "Travel", "Other", "Exch Rate", "TOTAL"], lc);
  y -= 15;

  const filled = (d.receiptLines || []).filter(
    (r) => parseAmount(r.amount) > 0 || safe(r.description).trim().length > 0 || safe(r.transactionDate).trim().length > 0,
  );
  let total = 0;
  const lineRows = filled.length ? filled : [{ transactionDate: "", description: "", amount: 0 }];
  for (const r of lineRows) {
    const amt = parseAmount(r.amount);
    total += amt;
    row(y, 15, [
      { w: lc[0], text: safe(r.transactionDate), size: 8, textY: 10 },
      { w: lc[1], text: clip(r.description, lc[1] - 8, 8), size: 8, textY: 10 },
      { w: lc[2], text: " ", size: 8, textY: 10 },
      { w: lc[3], text: amt ? money(amt) : " ", size: 8, align: "right", textY: 10 },
      { w: lc[4], text: amt ? "1.00" : " ", size: 8, align: "right", textY: 10 },
      { w: lc[5], text: amt ? money(amt) : " ", size: 8, align: "right", textY: 10 },
    ]);
    y -= 15;
  }
  row(y, 15, [
    { w: lc[0] + lc[1], text: "Totals", bold: true, align: "right", size: 8.5, textY: 10 },
    { w: lc[2], text: "0.00", align: "right", size: 8, textY: 10 },
    { w: lc[3], text: money(total), align: "right", size: 8, textY: 10 },
    { w: lc[4], text: " ", textY: 10 },
    { w: lc[5], text: money(total), align: "right", bold: true, size: 8, textY: 10 },
  ]);
  y -= 15;

  // ── Advance / currency row ────────────────────────────────────────────
  const c5 = W / 5;
  row(y, 26, [
    { w: c5, label: "Has an Advance been issued?" },
    { w: c5, label: "Advance Claim #" },
    { w: c5, label: "Less Travel Advance" },
    { w: c5, label: "Total Reimbursement", value: money(total) },
    { w: c5, label: "Currency", value: "CDN" },
  ]);
  y -= 26;
  row(y, 15, [
    { w: c5 * 2, text: "***ALL ORIGINAL DOCUMENTATION MUST BE ATTACHED***", size: 7, bold: true, color: RED, textY: 10 },
    { w: c5 * 3, text: "**Employees/Students paid in $CDN; Visitors can be paid in home currency", size: 7, color: BLUE, textY: 10 },
  ]);
  y -= 15;

  // ── Account table ─────────────────────────────────────────────────────
  header(y, ["Account", "Work Order", "Activity", "Amount", "Account Holder's Signature"], [c5, c5, c5, c5, c5]);
  y -= 15;
  for (let i = 0; i < 5; i++) {
    row(y, 15, [{ w: c5 }, { w: c5 }, { w: c5 }, { w: c5 }, { w: c5 }]);
    y -= 15;
  }
  row(y, 15, [
    { w: c5 * 3, text: "Total Reimbursement", bold: true, align: "right", size: 8.5, textY: 10 },
    { w: c5, text: money(total), align: "right", size: 8, textY: 10 },
    { w: c5 },
  ]);
  y -= 15;

  // ── Certification boxes ───────────────────────────────────────────────
  y -= 6;
  const box = (lines: string[], drawInner: (innerTop: number) => number) => {
    const pad = 6;
    const lh = 10;
    // measure: header lines + inner content
    const headerH = lines.length * lh;
    // draw with a provisional pass to compute inner height
    let innerTop = y - pad - 8;
    for (const ln of lines) {
      // placeholder; actual draw below after we know height
      void ln;
    }
    // We need the box height first; compute by running drawInner against a measuring cursor.
    // Simpler: compute inner content height via drawInner returning consumed height when measuring=false here,
    // so do a two-step: draw text after rect. We'll compute total height first.
    const innerH = drawInner(0); // measuring mode returns height (negative consumed)
    const boxH = pad + headerH + 4 + innerH + pad;
    page.drawRectangle({ x: L, y: y - boxH, width: W, height: boxH, borderColor: BLACK, borderWidth: 1 });
    let ty = y - pad - 8;
    for (const ln of lines) {
      text(ln, L + pad, ty, 7.6, helv, BLACK);
      ty -= lh;
    }
    innerTop = ty - 2;
    drawInner(innerTop);
    y -= boxH + 4;
  };

  // Cert 1 — claimant + signature image
  {
    const lines = wrapLines(
      "I certify that all expenditures in this claim adhere to the University's policies*, were incurred by me for University purposes and have not been / will not be reimbursed from another source.",
      W - 12,
      7.6,
    );
    let sigW = 0;
    let sigH = 0;
    let sigImg: Awaited<ReturnType<typeof doc.embedPng>> | null = null;
    try {
      sigImg = await doc.embedPng(sig);
      sigW = Math.min(200, sigImg.width);
      sigH = (sigImg.height / sigImg.width) * sigW;
      if (sigH > 50) {
        sigH = 50;
        sigW = (sigImg.width / sigImg.height) * sigH;
      }
    } catch {
      sigImg = null;
    }
    const innerContentH = 11 + sigH + 12; // label + image + signed line
    box(lines, (innerTop) => {
      if (innerTop === 0) return innerContentH;
      text("Signature of Claimant:", L + 6, innerTop, 7.6, helvB);
      if (sigImg) page.drawImage(sigImg, { x: L + 6, y: innerTop - 4 - sigH, width: sigW, height: sigH });
      text(`Signed electronically: ${safe(d.signedAt)}`, L + 6, innerTop - 6 - sigH - 8, 7, helv, GRAY);
      return innerContentH;
    });
  }

  // Cert 2 — supervisor + print name
  {
    const lines = wrapLines(
      "I certify that all expenditures in this claim adhere to the University's policies and were incurred for University purposes.",
      W - 12,
      7.6,
    );
    const innerH = 40;
    box(lines, (innerTop) => {
      if (innerTop === 0) return innerH;
      const half = (W - 12) / 2;
      text("Signature of Supervisor:", L + 6, innerTop, 7.6, helvB);
      text("Print Name:", L + 6 + half, innerTop, 7.6, helvB);
      page.drawLine({ start: { x: L + 6, y: innerTop - 26 }, end: { x: L + 6 + half - 14, y: innerTop - 26 }, thickness: 0.6, color: BLACK });
      page.drawLine({ start: { x: L + 6 + half, y: innerTop - 26 }, end: { x: L + W - 6, y: innerTop - 26 }, thickness: 0.6, color: BLACK });
      return innerH;
    });
  }

  // Cert 3 — department reviewer
  {
    const lines = wrapLines(
      "I certify that this claim is complete and accurate and all expenditures adhere to the University's policies.",
      W - 12,
      7.6,
    );
    const innerH = 34;
    box(lines, (innerTop) => {
      if (innerTop === 0) return innerH;
      text("Signature of Department Designated Reviewer:", L + 6, innerTop, 7.6, helvB);
      page.drawLine({ start: { x: L + 6, y: innerTop - 24 }, end: { x: L + W - 6, y: innerTop - 24 }, thickness: 0.6, color: BLACK });
      return innerH;
    });
  }

  // Preview-only watermark across the page.
  const mark = "PUBLIC PREVIEW - SAMPLE ONLY";
  const markSize = 34;
  const markW = helvB.widthOfTextAtSize(mark, markSize);
  page.drawText(mark, {
    x: 306 - (markW / 2) * Math.cos(Math.PI / 4),
    y: 396 - (markW / 2) * Math.sin(Math.PI / 4),
    size: markSize,
    font: helvB,
    color: BLUE,
    opacity: 0.16,
    rotate: degrees(45),
  });

  return doc.save();
}
