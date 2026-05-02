"use client";

import { useState, useRef } from "react";
import {
  Upload,
  CheckCircle,
  AlertTriangle,
  Loader2,
  X,
  FileText,
  ChevronRight,
} from "lucide-react";

type SubmitResult = {
  success: boolean;
  submissionId: string;
  status: string;
  flagged: boolean;
  flagReason: string | null;
};

const CURRENCIES = ["CAD", "USD", "EUR", "GBP", "JPY", "AUD", "CNY", "INR"];

export default function SubmissionPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    studentName: "",
    studentId: "",
    email: "",
    program: "",
    paymentMethod: "etransfer",
    paymentDetails: "",
    expenseDescription: "",
    expenseDate: "",
    claimedAmount: "",
    currency: "CAD",
  });

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleFileAdd(files: FileList | null) {
    if (!files) return;
    const newFiles = Array.from(files).filter((f) =>
      f.type.startsWith("image/") || f.type === "application/pdf"
    );
    setReceipts((prev) => [...prev, ...newFiles]);
  }

  function removeReceipt(index: number) {
    setReceipts((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    setLoading(true);
    setError(null);

    try {
      const data = new FormData();
      Object.entries(form).forEach(([k, v]) => data.append(k, v));
      receipts.forEach((f) => data.append("receipts", f));

      const res = await fetch("/api/submit", { method: "POST", body: data });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "Submission failed.");
        return;
      }

      setResult(json);
      setStep(3);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const step1Valid =
    form.studentName &&
    form.studentId &&
    form.email.includes("@") &&
    form.program;

  const step2Valid =
    form.paymentDetails &&
    form.expenseDescription &&
    form.expenseDate &&
    parseFloat(form.claimedAmount) > 0 &&
    receipts.length > 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#12305f] text-white shadow">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">UW Blueprint</h1>
            <p className="text-blue-200 text-sm">Reimbursement Portal</p>
          </div>
          <a
            href="/dashboard"
            className="text-sm text-blue-200 hover:text-white flex items-center gap-1 transition-colors"
          >
            VP Finance Dashboard <ChevronRight size={14} />
          </a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        {step < 3 && (
          <>
            <h2 className="text-2xl font-bold text-gray-900 mb-1">
              Submit a Reimbursement
            </h2>
            <p className="text-gray-500 mb-8 text-sm">
              Fill in your details, attach your receipts, and we'll handle the
              rest — your request will be automatically validated and forwarded
              to the VP Finance.
            </p>

            {/* Step indicator */}
            <div className="flex items-center gap-3 mb-8">
              {[
                { n: 1, label: "Your Info" },
                { n: 2, label: "Expense & Receipts" },
              ].map(({ n, label }) => (
                <div key={n} className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                      step === n
                        ? "bg-blue-600 text-white"
                        : step > n
                        ? "bg-green-500 text-white"
                        : "bg-gray-200 text-gray-500"
                    }`}
                  >
                    {step > n ? <CheckCircle size={16} /> : n}
                  </div>
                  <span
                    className={`text-sm font-medium ${
                      step === n ? "text-blue-700" : "text-gray-400"
                    }`}
                  >
                    {label}
                  </span>
                  {n < 2 && <div className="w-8 h-px bg-gray-300 mx-1" />}
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── Step 1: Student Info ── */}
        {step === 1 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
            <h3 className="text-lg font-semibold text-gray-800 mb-6">
              Student Information
            </h3>
            <div className="grid grid-cols-2 gap-5">
              <Field
                label="Full Name"
                required
                value={form.studentName}
                onChange={(v) => updateField("studentName", v)}
                placeholder="Jane Doe"
              />
              <Field
                label="Student ID"
                required
                value={form.studentId}
                onChange={(v) => updateField("studentId", v)}
                placeholder="20XXXXXX"
              />
              <Field
                label="UWaterloo Email"
                required
                type="email"
                value={form.email}
                onChange={(v) => updateField("email", v)}
                placeholder="jdoe@uwaterloo.ca"
                className="col-span-2"
              />
              <Field
                label="Program / Department"
                required
                value={form.program}
                onChange={(v) => updateField("program", v)}
                placeholder="e.g. Computer Science"
                className="col-span-2"
              />
            </div>

            <hr className="my-6 border-gray-100" />
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              Payment Information
            </h3>
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Payment Method <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-3">
                {[
                  { value: "etransfer", label: "Interac E-Transfer" },
                  { value: "cheque", label: "Cheque" },
                ].map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => updateField("paymentMethod", value)}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      form.paymentMethod === value
                        ? "bg-blue-600 border-blue-600 text-white"
                        : "bg-white border-gray-300 text-gray-700 hover:border-blue-400"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <Field
              label={
                form.paymentMethod === "etransfer"
                  ? "E-Transfer Email Address"
                  : "Cheque Payable To"
              }
              required
              value={form.paymentDetails}
              onChange={(v) => updateField("paymentDetails", v)}
              placeholder={
                form.paymentMethod === "etransfer"
                  ? "jdoe@gmail.com"
                  : "Jane Doe"
              }
            />

            <div className="mt-8 flex justify-end">
              <button
                onClick={() => setStep(2)}
                disabled={!step1Valid}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Expense + Receipts ── */}
        {step === 2 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
            <h3 className="text-lg font-semibold text-gray-800 mb-6">
              Expense Details
            </h3>
            <div className="grid grid-cols-2 gap-5">
              <Field
                label="Expense Date"
                required
                type="date"
                value={form.expenseDate}
                onChange={(v) => updateField("expenseDate", v)}
                className="col-span-1"
              />
              <div className="col-span-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount Claimed <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.claimedAmount}
                    onChange={(e) =>
                      updateField("claimedAmount", e.target.value)
                    }
                    placeholder="0.00"
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <select
                    value={form.currency}
                    onChange={(e) => updateField("currency", e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <Field
                label="Description of Expense"
                required
                value={form.expenseDescription}
                onChange={(v) => updateField("expenseDescription", v)}
                placeholder="e.g. Team dinner for project kickoff"
                className="col-span-2"
                multiline
              />
            </div>

            <hr className="my-6 border-gray-100" />
            <h3 className="text-lg font-semibold text-gray-800 mb-2">
              Receipts
            </h3>
            <p className="text-gray-500 text-sm mb-4">
              Upload all receipts for this expense. We'll use AI to validate the
              amounts match what you're claiming.
            </p>

            {/* Drop zone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFileAdd(e.dataTransfer.files);
              }}
              className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
            >
              <Upload className="mx-auto mb-3 text-gray-400" size={28} />
              <p className="text-sm font-medium text-gray-600">
                Click or drag & drop receipts here
              </p>
              <p className="text-xs text-gray-400 mt-1">
                JPEG, PNG, WebP, or PDF
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
                multiple
                className="hidden"
                onChange={(e) => handleFileAdd(e.target.files)}
              />
            </div>

            {/* File list */}
            {receipts.length > 0 && (
              <ul className="mt-4 space-y-2">
                {receipts.map((f, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2.5 border border-gray-100"
                  >
                    <div className="flex items-center gap-2">
                      <FileText size={16} className="text-blue-500" />
                      <span className="text-sm text-gray-700 font-medium">
                        {f.name}
                      </span>
                      <span className="text-xs text-gray-400">
                        ({(f.size / 1024).toFixed(0)} KB)
                      </span>
                    </div>
                    <button
                      onClick={() => removeReceipt(i)}
                      className="text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {error && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="mt-8 flex justify-between">
              <button
                onClick={() => setStep(1)}
                className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={!step2Valid || loading}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Validating & Submitting…
                  </>
                ) : (
                  "Submit Request"
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Confirmation ── */}
        {step === 3 && result && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 text-center">
            {result.flagged ? (
              <>
                <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertTriangle size={32} className="text-yellow-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  Submitted — Flagged for Review
                </h2>
                <p className="text-gray-500 mb-4 max-w-md mx-auto">
                  Your submission was received, but our automated validator
                  flagged it for manual review.
                </p>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-5 py-4 text-left mb-6 max-w-md mx-auto">
                  <p className="text-sm font-semibold text-yellow-800 mb-1">
                    Reason:
                  </p>
                  <p className="text-sm text-yellow-700">{result.flagReason}</p>
                </div>
              </>
            ) : (
              <>
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle size={32} className="text-green-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  Request Submitted!
                </h2>
                <p className="text-gray-500 mb-6 max-w-md mx-auto">
                  Your reimbursement request passed automated validation and has
                  been forwarded to the VP Finance. You'll receive a confirmation
                  email shortly.
                </p>
              </>
            )}
            <p className="text-sm text-gray-400 mb-6">
              Submission ID:{" "}
              <span className="font-mono font-semibold text-gray-600">
                {result.submissionId.slice(0, 8).toUpperCase()}
              </span>
            </p>
            <button
              onClick={() => {
                setStep(1);
                setResult(null);
                setReceipts([]);
                setForm({
                  studentName: "",
                  studentId: "",
                  email: "",
                  program: "",
                  paymentMethod: "etransfer",
                  paymentDetails: "",
                  expenseDescription: "",
                  expenseDate: "",
                  claimedAmount: "",
                  currency: "CAD",
                });
              }}
              className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Submit Another Request
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

// ── Reusable field component ──
function Field({
  label,
  required,
  value,
  onChange,
  type = "text",
  placeholder,
  className = "",
  multiline = false,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  className?: string;
  multiline?: boolean;
}) {
  const inputClass =
    "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";

  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className={`${inputClass} resize-none`}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={inputClass}
        />
      )}
    </div>
  );
}
