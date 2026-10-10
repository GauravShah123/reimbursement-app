// Shared types between the React client and the API contract.

export type SessionUser = {
  sub: string;
  email: string;
  name: string;
  picture: string | null;
};

export type MemberPrefill = {
  bp_email?: string;
  name?: string;
  uw_email?: string;
  program?: string;
  department?: string;
  role?: string;
  student_number?: string;
};

export type MemberResponse = {
  member_found: boolean;
  prefill: MemberPrefill;
  flags: { not_on_sheet?: boolean };
  message?: string;
};

export type ScanConfidence = "ok" | "low" | "none";

export type ReceiptScanResult = {
  ok: boolean;
  errors: { code: string; message: string }[];
  warnings?: { code: string; message: string }[];
  previewUrl?: string; // web-displayable JPEG (HEIC decoded) for side-by-side review
  extracted: {
    amount: number | null;
    currency: string;
    transactionDate: string | null;
    confidence: ScanConfidence;
    extractionMethod?: string;
  };
};

// A receipt the user has added and scanned, held in client state. In this public
// preview the file never leaves the browser.
export type UploadedReceipt = {
  id: string;
  file: File; // original file, kept in-browser
  fileName: string;
  fileUrl: string; // local blob: URL — empty until the claim is saved or submitted
  size: number;
  mimeType: string;
  localPreviewUrl?: string; // object URL for instant preview (image thumbnail, or PDF iframe)
  scan?: ReceiptScanResult;
};

export type ReceiptLineInput = {
  id: string;
  sourceUploadId: string | null;
  fileName: string | null;
  fileUrl: string | null;
  transactionDate: string;
  description: string;
  amount: string;
  currency: string;
};

export type MailingAddress = {
  line1: string;
  line2: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
};

export type ClaimDraft = {
  claimNumberDisplay?: string;
  fullName: string;
  studentNumber: string;
  department: string;
  datePrepared: string;
  reason: string;
  mailing: MailingAddress;
  receiptLines: ReceiptLineInput[];
};

export type ClaimSubmitPayload = ClaimDraft & {
  signaturePngDataUrl: string;
  signedAt: string;
};

export type ClaimStatus = "draft" | "processing" | "submitted" | "failed";

// One row in the "My requests" history list.
export type ClaimSummary = {
  id: string;
  claimNumber: string;
  status: ClaimStatus;
  totalCad: number;
  reason: string;
  flags: { code: string; label: string }[];
  createdAt: number;
  updatedAt: number;
};

export type ClaimDetailLine = {
  transactionDate: string | null;
  description: string;
  amount: number;
  currency: string;
  amountCad: number;
  fileName: string | null;
  fileUrl: string | null;
};

// Full detail for the read-only request view.
export type ClaimDetail = {
  id: string;
  claimNumber: string;
  status: ClaimStatus;
  totalCad: number;
  flags: { code: string; label: string }[];
  pdfUrl: string | null;
  fullName: string;
  studentNumber: string;
  department: string;
  reason: string;
  datePrepared: string;
  mailing: MailingAddress;
  createdAt: number;
  updatedAt: number;
  lines: ClaimDetailLine[];
};

export type SubmitResponse =
  | { ok: true; id: string; status: string; flags: { code: string; label: string }[] }
  | { ok: false; errors: { code: string; message: string }[] };
