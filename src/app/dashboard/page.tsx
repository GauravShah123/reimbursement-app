"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle,
  AlertTriangle,
  Clock,
  Send,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";

type Submission = {
  id: string;
  createdAt: string;
  studentName: string;
  studentId: string;
  email: string;
  program: string;
  paymentMethod: string;
  paymentDetails: string;
  expenseDescription: string;
  expenseDate: string;
  claimedAmount: number;
  currency: string;
  receiptTotal: number | null;
  receiptCurrency: string | null;
  status: string;
  flagReason: string | null;
  validationNotes: string | null;
};

const STATUS_CONFIG = {
  pending: {
    label: "Pending Review",
    color: "bg-blue-100 text-blue-700",
    icon: <Clock size={14} />,
  },
  flagged: {
    label: "Flagged",
    color: "bg-yellow-100 text-yellow-700",
    icon: <AlertTriangle size={14} />,
  },
  approved: {
    label: "Approved",
    color: "bg-green-100 text-green-700",
    icon: <CheckCircle size={14} />,
  },
  sent_to_university: {
    label: "Sent to University",
    color: "bg-purple-100 text-purple-700",
    icon: <Send size={14} />,
  },
};

export default function DashboardPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [sendModal, setSendModal] = useState<string | null>(null);
  const [universityEmail, setUniversityEmail] = useState("finance@uwaterloo.ca");
  const [filter, setFilter] = useState<string>("all");

  async function load() {
    setLoading(true);
    const res = await fetch("/api/submissions");
    const data = await res.json();
    setSubmissions(data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function approve(id: string) {
    setActionLoading(id);
    await fetch("/api/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submissionId: id }),
    });
    await load();
    setActionLoading(null);
  }

  async function sendToUniversity(id: string) {
    setActionLoading(id);
    await fetch("/api/send-to-university", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submissionId: id, universityEmail }),
    });
    setSendModal(null);
    await load();
    setActionLoading(null);
  }

  const filtered =
    filter === "all"
      ? submissions
      : submissions.filter((s) => s.status === filter);

  const counts = {
    all: submissions.length,
    pending: submissions.filter((s) => s.status === "pending").length,
    flagged: submissions.filter((s) => s.status === "flagged").length,
    approved: submissions.filter((s) => s.status === "approved").length,
    sent_to_university: submissions.filter(
      (s) => s.status === "sent_to_university"
    ).length,
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#12305f] text-white shadow">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">UW Blueprint</h1>
            <p className="text-blue-200 text-sm">VP Finance Dashboard</p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={load}
              className="text-blue-200 hover:text-white flex items-center gap-1.5 text-sm transition-colors"
            >
              <RefreshCw size={14} />
              Refresh
            </button>
            <a
              href="/"
              className="text-sm bg-blue-600 hover:bg-blue-500 px-4 py-1.5 rounded-lg transition-colors"
            >
              ← Student Portal
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Stats row */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { key: "pending", label: "Pending", color: "text-blue-600" },
            { key: "flagged", label: "Flagged", color: "text-yellow-600" },
            { key: "approved", label: "Approved", color: "text-green-600" },
            { key: "sent_to_university", label: "Sent", color: "text-purple-600" },
          ].map(({ key, label, color }) => (
            <div
              key={key}
              className="bg-white rounded-xl border border-gray-100 shadow-sm p-5"
            >
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">
                {label}
              </p>
              <p className={`text-3xl font-bold ${color}`}>
                {counts[key as keyof typeof counts]}
              </p>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-5">
          {["all", "pending", "flagged", "approved", "sent_to_university"].map(
            (f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  filter === f
                    ? "bg-[#12305f] text-white"
                    : "bg-white text-gray-600 border border-gray-200 hover:border-blue-400"
                }`}
              >
                {f === "all"
                  ? `All (${counts.all})`
                  : f === "sent_to_university"
                  ? `Sent (${counts.sent_to_university})`
                  : `${f.charAt(0).toUpperCase() + f.slice(1)} (${counts[f as keyof typeof counts]})`}
              </button>
            )
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-gray-400" size={32} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-lg">No submissions yet</p>
            <p className="text-sm mt-1">
              Submissions will appear here once students submit requests.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((s) => {
              const cfg =
                STATUS_CONFIG[s.status as keyof typeof STATUS_CONFIG] ||
                STATUS_CONFIG.pending;
              const isExpanded = expanded === s.id;

              return (
                <div
                  key={s.id}
                  className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden"
                >
                  {/* Row header */}
                  <div
                    className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => setExpanded(isExpanded ? null : s.id)}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div>
                        <p className="font-semibold text-gray-900">
                          {s.studentName}
                        </p>
                        <p className="text-xs text-gray-400">
                          {s.studentId} · {s.email}
                        </p>
                      </div>
                      <div className="hidden sm:block min-w-0">
                        <p className="text-sm text-gray-700 truncate max-w-xs">
                          {s.expenseDescription}
                        </p>
                        <p className="text-xs text-gray-400">{s.expenseDate}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0">
                      <span className="text-lg font-bold text-gray-800">
                        {s.claimedAmount.toFixed(2)}{" "}
                        <span className="text-sm font-normal text-gray-500">
                          {s.currency}
                        </span>
                      </span>
                      <span
                        className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${cfg.color}`}
                      >
                        {cfg.icon}
                        {cfg.label}
                      </span>
                      {isExpanded ? (
                        <ChevronUp size={16} className="text-gray-400" />
                      ) : (
                        <ChevronDown size={16} className="text-gray-400" />
                      )}
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 px-6 py-5 bg-gray-50">
                      {s.status === "flagged" && s.flagReason && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 mb-5">
                          <p className="text-sm font-semibold text-yellow-800">
                            ⚠ Flag Reason
                          </p>
                          <p className="text-sm text-yellow-700 mt-0.5">
                            {s.flagReason}
                          </p>
                        </div>
                      )}

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-4 mb-5">
                        <Detail label="Program" value={s.program} />
                        <Detail
                          label="Payment Method"
                          value={
                            s.paymentMethod === "etransfer"
                              ? "Interac E-Transfer"
                              : "Cheque"
                          }
                        />
                        <Detail
                          label={
                            s.paymentMethod === "etransfer"
                              ? "E-Transfer Email"
                              : "Payable To"
                          }
                          value={s.paymentDetails}
                        />
                        <Detail
                          label="Claimed Amount"
                          value={`${s.claimedAmount.toFixed(2)} ${s.currency}`}
                        />
                        <Detail
                          label="Receipt Total (OCR)"
                          value={
                            s.receiptTotal != null
                              ? `${s.receiptTotal.toFixed(2)} ${s.receiptCurrency ?? ""}`
                              : "Not extracted"
                          }
                        />
                        <Detail
                          label="Submitted"
                          value={new Date(s.createdAt).toLocaleDateString(
                            "en-CA",
                            {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            }
                          )}
                        />
                      </div>

                      {s.validationNotes && (
                        <div className="bg-white border border-gray-100 rounded-lg px-4 py-3 mb-5">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                            Validation Notes
                          </p>
                          <p className="text-sm text-gray-600">
                            {s.validationNotes}
                          </p>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-3">
                        {(s.status === "pending" || s.status === "flagged") && (
                          <button
                            onClick={() => approve(s.id)}
                            disabled={actionLoading === s.id}
                            className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                          >
                            {actionLoading === s.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <CheckCircle size={14} />
                            )}
                            Approve
                          </button>
                        )}
                        {s.status === "approved" && (
                          <button
                            onClick={() => setSendModal(s.id)}
                            disabled={actionLoading === s.id}
                            className="flex items-center gap-1.5 px-4 py-2 bg-[#12305f] text-white rounded-lg text-sm font-medium hover:bg-blue-900 disabled:opacity-50 transition-colors"
                          >
                            {actionLoading === s.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Send size={14} />
                            )}
                            Send to University
                          </button>
                        )}
                        {s.status === "sent_to_university" && (
                          <span className="text-sm text-gray-400 italic flex items-center gap-1.5">
                            <CheckCircle size={14} className="text-green-500" />
                            Sent to University
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Send to University Modal */}
      {sendModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Send to University
              </h3>
              <button
                onClick={() => setSendModal(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              The reimbursement form and receipts will be emailed to the
              University of Waterloo Finance office.
            </p>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              University Finance Email
            </label>
            <input
              type="email"
              value={universityEmail}
              onChange={(e) => setUniversityEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-5"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setSendModal(null)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => sendToUniversity(sendModal)}
                disabled={!universityEmail || actionLoading === sendModal}
                className="flex items-center gap-1.5 px-5 py-2 bg-[#12305f] text-white rounded-lg text-sm font-medium hover:bg-blue-900 disabled:opacity-50 transition-colors"
              >
                {actionLoading === sendModal ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Send size={14} />
                )}
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-0.5">
        {label}
      </p>
      <p className="text-sm font-semibold text-gray-800">{value}</p>
    </div>
  );
}
