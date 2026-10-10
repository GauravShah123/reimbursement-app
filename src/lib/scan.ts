// Client-side receipt scanning. Images are OCR'd in the browser with tesseract.js
// (no serverless time limit — the heavy work runs on the user's device), then the
// shared heuristic analysis runs locally too. PDFs are parsed in the browser with
// pdf.js (embedded text only). Nothing is uploaded.
import type { ReceiptScanResult } from "./types.js";
import { analyzeReceiptPlainText } from "./receipt-analyze.js";

export function failScan(status?: number): ReceiptScanResult {
  const slow = status === 504 || status === 502 || status === 408;
  return {
    ok: false,
    errors: [
      {
        code: "scan_failed",
        message: slow
          ? "Couldn't auto-read this one in time — enter the amount and date on the next step."
          : "Couldn't read this receipt automatically — enter the details on the next step.",
      },
    ],
    extracted: { amount: null, currency: "CAD", transactionDate: null, confidence: "none" },
  };
}

function toResult(text: string): ReceiptScanResult {
  const a = analyzeReceiptPlainText(text);
  return {
    ok: a.ok,
    errors: a.errors,
    warnings: a.warnings,
    extracted: {
      amount: a.extracted.amount,
      currency: "CAD",
      transactionDate: a.extracted.transactionDate,
      confidence: a.confidence,
    },
  };
}

/** OCR an image in the browser (tesseract.js is lazy-loaded). */
export async function scanImage(src: Blob | File): Promise<ReceiptScanResult> {
  try {
    const { recognize } = await import("tesseract.js");
    const { data } = await recognize(src as Blob, "eng", { logger: () => {} });
    return toResult(data.text || "");
  } catch {
    return failScan();
  }
}

/**
 * PDFs: extract embedded text in the browser with pdf.js — no upload, no server.
 * (Image-only/scanned PDFs have no text layer; those fall back to manual entry.)
 */
export async function scanPdf(file: File): Promise<ReceiptScanResult> {
  try {
    const pdfjs = await import("pdfjs-dist");
    const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const buf = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buf }).promise;
    let text = "";
    const pages = Math.min(doc.numPages, 5);
    for (let i = 1; i <= pages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((it) => ("str" in it ? it.str : "")).join(" ") + "\n";
    }
    if (!text.trim()) return failScan();
    return toResult(text);
  } catch {
    return failScan();
  }
}
