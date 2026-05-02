export type SubmissionStatus =
  | "pending"
  | "flagged"
  | "approved"
  | "sent_to_university";

export interface ReceiptValidationResult {
  extractedTotal: number | null;
  extractedCurrency: string | null;
  isFlagged: boolean;
  flagReason: string | null;
  notes: string;
}

export interface SubmissionFormData {
  studentName: string;
  studentId: string;
  email: string;
  program: string;
  paymentMethod: "etransfer" | "cheque";
  paymentDetails: string;
  expenseDescription: string;
  expenseDate: string;
  claimedAmount: number;
  currency: string;
}
