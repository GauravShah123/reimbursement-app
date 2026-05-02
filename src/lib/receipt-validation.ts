import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import type { ReceiptValidationResult } from "./types";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface ReceiptData {
  total: number | null;
  currency: string | null;
  confidence: "high" | "medium" | "low";
  rawText: string;
}

async function extractReceiptData(filePath: string): Promise<ReceiptData> {
  const ext = path.extname(filePath).toLowerCase();
  const fileBuffer = fs.readFileSync(filePath);
  const base64 = fileBuffer.toString("base64");

  let mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" =
    "image/jpeg";
  if (ext === ".png") mediaType = "image/png";
  else if (ext === ".gif") mediaType = "image/gif";
  else if (ext === ".webp") mediaType = "image/webp";

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: base64,
            },
          },
          {
            type: "text",
            text: `Analyze this receipt image and extract the total amount charged.

Respond with ONLY a JSON object in this exact format (no markdown, no explanation):
{
  "total": <number or null if not found>,
  "currency": "<3-letter ISO currency code like CAD, USD, EUR, or null if not found>",
  "confidence": "<high|medium|low>",
  "rawText": "<brief description of what you see on the receipt>"
}

Rules:
- total should be the final total amount paid (after taxes, discounts)
- currency: look for $ signs with CAD/USD labels, "Canadian", currency symbols, or infer from context
- If the receipt shows "CA$" or "CAD" or is clearly a Canadian receipt, use "CAD"
- If you see "$" without a country indicator, use "USD" as default
- confidence: high if total is clearly visible, medium if somewhat clear, low if unclear`,
          },
        ],
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== "text") {
    return { total: null, currency: null, confidence: "low", rawText: "" };
  }

  try {
    const parsed = JSON.parse(content.text.trim()) as ReceiptData;
    return parsed;
  } catch {
    return {
      total: null,
      currency: null,
      confidence: "low",
      rawText: content.text,
    };
  }
}

export async function validateReceipts(
  receiptPaths: string[],
  claimedAmount: number,
  claimedCurrency: string
): Promise<ReceiptValidationResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      extractedTotal: null,
      extractedCurrency: null,
      isFlagged: false,
      flagReason: null,
      notes: "Receipt validation skipped: ANTHROPIC_API_KEY not configured.",
    };
  }

  const receiptResults: ReceiptData[] = [];

  for (const filePath of receiptPaths) {
    try {
      const data = await extractReceiptData(filePath);
      receiptResults.push(data);
    } catch (err) {
      receiptResults.push({
        total: null,
        currency: null,
        confidence: "low",
        rawText: `Error processing receipt: ${err}`,
      });
    }
  }

  // Sum all receipt totals (assuming same currency)
  const validTotals = receiptResults.filter((r) => r.total !== null);
  const receiptTotal =
    validTotals.length > 0
      ? validTotals.reduce((sum, r) => sum + (r.total ?? 0), 0)
      : null;

  // Determine currency from receipts (use the most common one)
  const currencies = receiptResults
    .map((r) => r.currency)
    .filter((c): c is string => c !== null);
  const receiptCurrency =
    currencies.length > 0
      ? currencies.sort(
          (a, b) =>
            currencies.filter((c) => c === b).length -
            currencies.filter((c) => c === a).length
        )[0]
      : null;

  const notes = receiptResults
    .map((r, i) => `Receipt ${i + 1}: ${r.rawText} (confidence: ${r.confidence})`)
    .join("; ");

  // Validation logic
  if (receiptTotal === null) {
    return {
      extractedTotal: null,
      extractedCurrency: receiptCurrency,
      isFlagged: true,
      flagReason:
        "Could not extract total from receipt(s). Manual review required.",
      notes,
    };
  }

  const amountShortfall = claimedAmount - receiptTotal;

  if (amountShortfall <= 0) {
    // Receipt total covers the claimed amount — OK
    return {
      extractedTotal: receiptTotal,
      extractedCurrency: receiptCurrency,
      isFlagged: false,
      flagReason: null,
      notes,
    };
  }

  // Receipt total is less than claimed amount
  const effectiveCurrency = receiptCurrency ?? claimedCurrency;

  if (effectiveCurrency.toUpperCase() === "CAD") {
    // Same currency and receipt is lower → definite discrepancy
    return {
      extractedTotal: receiptTotal,
      extractedCurrency: receiptCurrency,
      isFlagged: true,
      flagReason: `Receipt total (${receiptTotal.toFixed(2)} CAD) is less than claimed amount (${claimedAmount.toFixed(2)} ${claimedCurrency}). Both are in CAD — discrepancy requires manual review.`,
      notes,
    };
  }

  // Different currency — could be a valid FX conversion
  return {
    extractedTotal: receiptTotal,
    extractedCurrency: receiptCurrency,
    isFlagged: false,
    flagReason: null,
    notes: `Receipt shows ${receiptTotal.toFixed(2)} ${effectiveCurrency}, claimed ${claimedAmount.toFixed(2)} ${claimedCurrency}. Difference may be due to currency conversion. ${notes}`,
  };
}
