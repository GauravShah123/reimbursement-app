// Heuristic receipt validation on plain text. Only "amount_unclear" and "receipt_too_old" are hard
// errors; the receipt-likeness / statement / itemization checks become a soft
// `confidence` signal so the UI can warn-but-allow instead of blocking.

export type ReceiptError = { code: string; message: string };
export type Confidence = "ok" | "low" | "none";

export const DEFAULT_POLICY = {
  minTextChars: 32,
  minReceiptScore: 2,
  staleDays: 365,
  maxReasonableAmount: 500_000,
};

const MONTH_WORDS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function parseMonthNameDateMatch(m: RegExpMatchArray) {
  const raw1 = String(m[1]).replace(/,/g, "").trim();
  const raw2 = String(m[2]).replace(/,/g, "").trim();
  const raw3 = String(m[3]).replace(/,/g, "").trim();
  const key = (s: string) => {
    const t = s.toLowerCase().slice(0, 3);
    return Object.prototype.hasOwnProperty.call(MONTH_WORDS, t) ? t : null;
  };
  const k1 = key(raw1);
  const k2 = key(raw2);
  if (k1) {
    const mo = MONTH_WORDS[k1];
    const d = Number(raw2);
    let y = Number(raw3);
    if (!Number.isFinite(d) || d < 1 || !Number.isFinite(y)) return null;
    if (y < 100) y += y < 50 ? 2000 : 1900;
    return { y, mo, d };
  }
  if (k2) {
    const d = Number(raw1);
    const mo = MONTH_WORDS[k2];
    let y = Number(raw3);
    if (!Number.isFinite(d) || d < 1 || !Number.isFinite(y)) return null;
    if (y < 100) y += y < 50 ? 2000 : 1900;
    return { y, mo, d };
  }
  return null;
}

const RECEIPT_POSITIVE = [
  /\breceipt\b/i, /\binvoice\b/i, /proof\s+of\s+payment/i, /\bpaid\b/i,
  /thank\s+you/i, /\bpurchase\b/i, /\btransaction\b/i, /\bpos\b/i,
  /\bcashier\b/i, /\bterminal\b/i, /\bregister\b/i, /\bsubtotal\b/i,
  /\b(total|grand\s*total)\b/i, /\b(tax|hst|gst|vat)\b/i, /\bamount\s*(due|paid)\b/i,
  /\bmerchant\b/i, /\bstore\s*#?\b/i, /\border\s*#?\b/i, /\bchange\b/i,
  /\bvisa\b|\bmastercard\b|\binterac\b|\bdebit\b|\bcredit\b/i,
];

const STATEMENT_NEGATIVE = [
  /minimum\s+payment/i, /account\s+summary/i, /available\s+credit/i, /\bAPR\b/i,
  /previous\s+balance/i, /statement\s+balance/i, /credit\s+limit/i,
  /cash\s+advance/i, /new\s+balance/i,
];

function normalizeText(raw: unknown): string {
  return String(raw ?? "").replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

function scoreReceiptLikeness(text: string): number {
  return RECEIPT_POSITIVE.reduce((s, re) => s + (re.test(text) ? 1 : 0), 0);
}
function scoreStatementLikeness(text: string): number {
  return STATEMENT_NEGATIVE.reduce((s, re) => s + (re.test(text) ? 1 : 0), 0);
}

function countItemPriceLines(text: string): number {
  const lines = text.split(/\n/).map((l) => l.trim()).filter((l) => l.length >= 2);
  let n = 0;
  for (const line of lines) {
    if (/total|subtotal|grand|tax|balance\s+due|amount\s+due|change|tip\b/i.test(line))
      continue;
    const priceOnly = /^\$?\s*\d[\d,Oo\s]*[.,]\s*\d{2}\s*$/i.test(line);
    if (priceOnly || (line.length >= 4 && /\d\s*[.,Oo]\s*\d{1,2}\b|\d[.,Oo]\d{2}\b/.test(line)))
      n += 1;
  }
  return n;
}

function hasItemizedSignals(text: string): boolean {
  if (/(qty|quantity|sku|item\s*#|item\s*no|description)/i.test(text)) return true;
  const itemLines = countItemPriceLines(text);
  if (itemLines >= 2) return true;
  const hasSaleStructure =
    /\b(total|subtotal|tax|hst|gst|vat|balance|amount\s*d)\b/i.test(text) &&
    /\d\s*[.,Oo]\s*\d{1,2}\b|\d[.,Oo]\d{2}\b/.test(text);
  if (itemLines >= 1 && hasSaleStructure) return true;
  const moneyish = text.match(/\$?\s*[\dOo,]{1,7}[.,]\s*\d{2}\b/gi) || [];
  if (moneyish.length >= 2 && /\b(total|subtotal|tax)\b/i.test(text)) return true;
  return false;
}

function looksLikeCardStatementOnly(text: string): boolean {
  return scoreStatementLikeness(text) >= 3 && scoreReceiptLikeness(text) < 5;
}

function normalizeMoneyToken(token: string): string {
  return String(token).replace(/,/g, "").replace(/[Oo]/g, "0").trim();
}

function parseMoneyValue(token: string): number | null {
  const normalized = normalizeMoneyToken(token).replace(/\s+/g, "");
  let m = normalized.match(/^(\d+)[.](\d{2})$/);
  if (!m) {
    m = normalized.match(/^(\d+),(\d{2})$/);
    if (!m) return null;
  }
  const v = Number.parseFloat(`${m[1]}.${m[2]}`);
  if (!Number.isFinite(v) || v <= 0 || v >= DEFAULT_POLICY.maxReasonableAmount) {
    return null;
  }
  return v;
}

/** First money token on a line (OCR O/o tolerant), or null. */
function priceOnLine(line: string): number | null {
  const m = line.match(/([\d,Oo]+)\s*[.,]\s*([\dOo]{2})\b/);
  if (!m) return null;
  const intp = m[1].replace(/,/g, "").replace(/[Oo]/g, "0");
  const dec = m[2].replace(/[Oo]/g, "0");
  return parseMoneyValue(`${intp}.${dec}`);
}

/**
 * Find the amount paid. Receipts with "Suggested Tip" sections list inflated
 * "Total $X" lines for each tip %, which used to win (last-match). We now:
 *   1. cut off everything from a "suggested tip / gratuity options" header on,
 *   2. take the labeled grand-total/total/amount-due line (skipping subtotal and
 *      any line mentioning "tip"), last one before the tip section winning,
 *   3. fall back to outlier-aware money tokens (also before the tip section).
 */
function extractAmount(text: string): number | null {
  const lines = text.split(/\n/).map((l) => l.trim());

  let tipStart = lines.length;
  const TIP_HEADER =
    /(suggested|recommended|add\s+a?)\s*tip|tip\s*(guide|option|amount|suggestion|percentag)|gratuity\s*(option|suggest|guide|idea)/i;
  for (let i = 0; i < lines.length; i++) {
    if (TIP_HEADER.test(lines[i])) {
      tipStart = i;
      break;
    }
  }

  const TOTAL = /\b(grand\s*total|amount\s*(paid|due)|balance\s*due|total\s*due|total)\b/i;
  const SUBTOTAL = /\bsub\s*-?\s*total\b/i;

  let amount: number | null = null;
  for (let i = 0; i < tipStart; i++) {
    const line = lines[i];
    if (!TOTAL.test(line) || SUBTOTAL.test(line) || /\btip\b/i.test(line)) continue;
    let v = priceOnLine(line);
    if (v == null && i + 1 < tipStart) v = priceOnLine(lines[i + 1]); // price on next line
    if (v != null) amount = v;
  }
  if (amount != null) return amount;

  // Fallback: plausible money tokens before any tip section, with outlier rejection.
  const vals: number[] = [];
  const moneyRe = /([\d,Oo]+)\s*[.,]\s*([\dOo]{2})\b/g;
  for (let i = 0; i < tipStart; i++) {
    let m: RegExpExecArray | null;
    moneyRe.lastIndex = 0;
    while ((m = moneyRe.exec(lines[i])) !== null) {
      const v = parseMoneyValue(
        `${m[1].replace(/,/g, "").replace(/[Oo]/g, "0")}.${m[2].replace(/[Oo]/g, "0")}`,
      );
      if (v != null) vals.push(v);
    }
  }
  if (vals.length >= 2) {
    const sorted = [...vals].sort((a, b) => b - a);
    const [hi, second] = sorted;
    if (hi > Math.max(120, second * 5) && second <= 200) return second;
    return hi;
  }
  return vals.length === 1 ? vals[0] : null;
}

function isValidGregorianUTC(y: number, mo0: number, d: number): boolean {
  if (mo0 < 0 || mo0 > 11 || d < 1 || d > 31 || y < 1990 || y > 2100) return false;
  const dt = new Date(Date.UTC(y, mo0, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo0 && dt.getUTCDate() === d;
}

function partsToDMY(a: number, b: number, cRaw: number) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a < 1 || b < 1) return null;
  let y = Number(cRaw);
  if (y < 100) y += y < 50 ? 2000 : 1900;
  let d: number;
  let mo0: number;
  if (a > 12 && b <= 12) {
    d = a;
    mo0 = b - 1;
  } else if (b > 12 && a <= 12) {
    mo0 = a - 1;
    d = b;
  } else if (a > 31 || b > 31) {
    return null;
  } else {
    d = a;
    mo0 = b - 1;
  }
  if (!isValidGregorianUTC(y, mo0, d)) return null;
  return { y, mo0, d };
}

function extractBestTransactionDate(
  rawText: string,
  staleDays = DEFAULT_POLICY.staleDays,
): Date | null {
  const text = String(rawText ?? "").replace(/\bINVALID\s+DATE\b/gi, " ");
  const found: Date[] = [];
  const patterns = [
    /(\d{4})-(\d{2})-(\d{2})/g,
    /(\d{4})[\s./](\d{1,2})[\s./](\d{1,2})\b/g,
    /(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/g,
    /(\d{1,2})[./](\d{1,2})[./](\d{4})\b/g,
    /\b(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\b/g,
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(\d{2,4})\b/gi,
    /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{2,4})\b/gi,
  ];
  for (const re of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      let y: number, mo: number, d: number;
      if (/Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/i.test(m[0])) {
        const amd = parseMonthNameDateMatch(m);
        if (!amd) continue;
        ({ y, mo, d } = amd);
      } else if (m[0].includes("-") && m[1].length === 4) {
        y = Number(m[1]); mo = Number(m[2]) - 1; d = Number(m[3]);
      } else if (m[1].length === 4 && Number(m[1]) >= 2000) {
        y = Number(m[1]); mo = Number(m[2]) - 1; d = Number(m[3]);
      } else if (/^20\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(m[0])) {
        y = Number(m[1]); mo = Number(m[2]) - 1; d = Number(m[3]);
      } else {
        const p = partsToDMY(Number(m[1]), Number(m[2]), Number(m[3]));
        if (!p) continue;
        y = p.y; mo = p.mo0; d = p.d;
      }
      if (!isValidGregorianUTC(y, mo, d)) continue;
      const dt = new Date(Date.UTC(y, mo, d));
      if (Number.isFinite(dt.getTime()) && y >= 2000 && y <= new Date().getUTCFullYear() + 3) {
        found.push(dt);
      }
    }
  }
  if (!found.length) return null;
  const now = Date.now();
  const futureGraceMs = 400 * 86400000;
  const plausible = found.filter((d) => d.getTime() <= now + futureGraceMs);
  if (!plausible.length) return null;
  const staleCutoffMs = now - staleDays * 86400000;
  const notStale = plausible.filter((d) => d.getTime() > staleCutoffMs);
  const pool = notStale.length ? notStale : plausible;
  pool.sort((a, b) => b.getTime() - a.getTime());
  return pool[0];
}

function isStaleDate(date: Date, staleDays: number): boolean {
  return date.getTime() <= Date.now() - staleDays * 86400000;
}

export function analyzeReceiptPlainText(rawText: string, policy = DEFAULT_POLICY) {
  const text = normalizeText(rawText);
  const errors: ReceiptError[] = [];
  const warnings: ReceiptError[] = [];

  if (text.length < policy.minTextChars) {
    return {
      ok: false,
      errors: [
        {
          code: "insufficient_text",
          message:
            "Could not read enough text from this file. Try a clearer photo or a PDF with selectable text.",
        },
      ],
      warnings: [],
      confidence: "none" as Confidence,
      extracted: { amount: null, currency: "CAD", transactionDate: null, textLength: text.length },
    };
  }

  const receiptScore = scoreReceiptLikeness(text);
  if (receiptScore < policy.minReceiptScore) {
    warnings.push({
      code: "not_receipt",
      message:
        "This may not be a receipt or proof of payment. Double-check before continuing.",
    });
  }
  if (looksLikeCardStatementOnly(text)) {
    warnings.push({
      code: "likely_card_statement",
      message:
        "This looks like a card or bank statement, not an itemized receipt. You can still continue.",
    });
  }
  if (!hasItemizedSignals(text)) {
    warnings.push({
      code: "not_itemized",
      message:
        "We couldn't confirm line items and a total. Double-check the amount — you can still continue.",
    });
  }

  const amount = extractAmount(text);
  if (amount == null) {
    errors.push({
      code: "amount_unclear",
      message: "Could not read the amount from this receipt. Try a clearer image or PDF.",
    });
  }

  const txDate = extractBestTransactionDate(text, policy.staleDays);
  if (txDate && isStaleDate(txDate, policy.staleDays)) {
    errors.push({
      code: "receipt_too_old",
      message: `This receipt is more than ${policy.staleDays} days old and cannot be submitted under current policy.`,
    });
  }

  const amountRounded = amount == null ? null : Math.round(amount * 100) / 100;
  const confidence: Confidence =
    errors.length > 0 ? "none" : warnings.length > 0 ? "low" : "ok";

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    confidence,
    extracted: {
      amount: amountRounded,
      currency: "CAD",
      transactionDate: txDate ? txDate.toISOString().slice(0, 10) : null,
      textLength: text.length,
    },
  };
}
