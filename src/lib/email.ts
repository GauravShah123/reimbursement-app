import nodemailer from "nodemailer";
import type { Submission } from "@prisma/client";
import fs from "fs";
import path from "path";

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

function formatCurrency(amount: number, currency: string): string {
  return `${amount.toFixed(2)} ${currency}`;
}

function buildEmailBody(submission: Submission): string {
  const flaggedWarning =
    submission.status === "flagged"
      ? `
  <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:6px;padding:16px;margin-bottom:24px;">
    <strong style="color:#856404;">⚠ Flagged for Manual Review</strong><br/>
    <span style="color:#856404;font-size:14px;">${submission.flagReason}</span>
  </div>`
      : "";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; max-width: 640px; margin: 0 auto; padding: 0; }
    .header { background: #12305f; padding: 32px 32px 24px; }
    .header h1 { color: #fff; margin: 0; font-size: 22px; }
    .header p { color: #a8c4e0; margin: 4px 0 0; font-size: 14px; }
    .content { padding: 32px; background: #fff; }
    .section { margin-bottom: 28px; }
    .section h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; margin-bottom: 14px; }
    .field { display: flex; margin-bottom: 10px; font-size: 14px; }
    .field-label { color: #6b7280; width: 180px; flex-shrink: 0; }
    .field-value { color: #111; font-weight: 500; }
    .amount { font-size: 24px; font-weight: 700; color: #12305f; }
    .cta { background: #1a56db; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 6px; display: inline-block; font-weight: 600; margin-top: 8px; }
    .footer { background: #f9fafb; padding: 20px 32px; font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; }
    .tag { display: inline-block; padding: 2px 10px; border-radius: 9999px; font-size: 12px; font-weight: 600; }
    .tag-flagged { background: #fef3c7; color: #92400e; }
    .tag-ok { background: #d1fae5; color: #065f46; }
  </style>
</head>
<body>
  <div class="header">
    <h1>UW Blueprint — Reimbursement Request</h1>
    <p>Submission ID: ${submission.id.slice(0, 8).toUpperCase()} · ${new Date(submission.createdAt).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" })}</p>
  </div>
  <div class="content">
    <p style="font-size:15px;margin-top:0;">Hi,</p>
    <p style="font-size:15px;">A new reimbursement request has been submitted by a UW Blueprint member. Please find the details below and the university reimbursement form attached.</p>

    ${flaggedWarning}

    <div class="section">
      <h2>Student Information</h2>
      <div class="field"><span class="field-label">Name</span><span class="field-value">${submission.studentName}</span></div>
      <div class="field"><span class="field-label">Student ID</span><span class="field-value">${submission.studentId}</span></div>
      <div class="field"><span class="field-label">Email</span><span class="field-value">${submission.email}</span></div>
      <div class="field"><span class="field-label">Program</span><span class="field-value">${submission.program}</span></div>
    </div>

    <div class="section">
      <h2>Expense Details</h2>
      <div class="field"><span class="field-label">Description</span><span class="field-value">${submission.expenseDescription}</span></div>
      <div class="field"><span class="field-label">Expense Date</span><span class="field-value">${submission.expenseDate}</span></div>
      <div class="field"><span class="field-label">Amount Claimed</span><span class="field-value amount">${formatCurrency(submission.claimedAmount, submission.currency)}</span></div>
    </div>

    <div class="section">
      <h2>Payment Information</h2>
      <div class="field"><span class="field-label">Payment Method</span><span class="field-value">${submission.paymentMethod === "etransfer" ? "Interac E-Transfer" : "Cheque"}</span></div>
      <div class="field"><span class="field-label">${submission.paymentMethod === "etransfer" ? "E-Transfer Email" : "Payable To"}</span><span class="field-value">${submission.paymentDetails}</span></div>
    </div>

    <div class="section">
      <h2>Receipt Validation</h2>
      <div class="field">
        <span class="field-label">Status</span>
        <span class="field-value">
          ${submission.status === "flagged"
            ? '<span class="tag tag-flagged">Flagged</span>'
            : '<span class="tag tag-ok">Passed</span>'}
        </span>
      </div>
      ${submission.receiptTotal != null
        ? `<div class="field"><span class="field-label">Receipt Total (OCR)</span><span class="field-value">${formatCurrency(submission.receiptTotal, submission.receiptCurrency ?? "")}</span></div>`
        : ""}
      ${submission.validationNotes
        ? `<div class="field"><span class="field-label">Notes</span><span class="field-value" style="font-size:13px;color:#4b5563;">${submission.validationNotes}</span></div>`
        : ""}
    </div>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0;"/>
    <p style="font-size:14px;color:#374151;">
      Please review the attached documents (university reimbursement form + receipts). If everything looks correct, you can forward them directly to the University of Waterloo Finance office.
    </p>
    <p style="font-size:14px;color:#374151;">
      <strong>Review in dashboard:</strong>
    </p>
    <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard" class="cta">Open VP Finance Dashboard →</a>
  </div>
  <div class="footer">
    This email was automatically generated by the UW Blueprint Reimbursement System.<br/>
    Questions? Contact the student at ${submission.email}.
  </div>
</body>
</html>`;
}

export async function sendReimbursementEmail(
  submission: Submission,
  universityFormPath: string
): Promise<void> {
  const transporter = createTransport();

  const attachments: nodemailer.SendMailOptions["attachments"] = [];

  // Attach generated university form PDF
  if (fs.existsSync(universityFormPath)) {
    attachments.push({
      filename: `UWBlueprint-Reimbursement-${submission.id.slice(0, 8).toUpperCase()}.pdf`,
      path: universityFormPath,
      contentType: "application/pdf",
    });
  }

  // Attach original receipts
  const receiptPaths: string[] = JSON.parse(submission.receiptPaths || "[]");
  for (const receiptPath of receiptPaths) {
    if (fs.existsSync(receiptPath)) {
      const filename = path.basename(receiptPath);
      attachments.push({
        filename: `Receipt-${filename}`,
        path: receiptPath,
      });
    }
  }

  const flagSubject = submission.status === "flagged" ? "[FLAGGED] " : "";
  const subject = `${flagSubject}Reimbursement Request: ${submission.studentName} — ${formatCurrency(submission.claimedAmount, submission.currency)}`;

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || "UW Blueprint <noreply@uwblueprint.org>",
    to: process.env.VP_FINANCE_EMAIL || "vp.finance@uwblueprint.org",
    subject,
    html: buildEmailBody(submission),
    attachments,
  });
}

export async function sendConfirmationEmail(submission: Submission): Promise<void> {
  const transporter = createTransport();

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || "UW Blueprint <noreply@uwblueprint.org>",
    to: submission.email,
    subject: `Reimbursement Request Received — ${formatCurrency(submission.claimedAmount, submission.currency)}`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; max-width: 600px; margin: 0 auto; }
    .header { background: #12305f; padding: 28px 32px; }
    .header h1 { color: #fff; margin: 0; font-size: 20px; }
    .content { padding: 32px; }
    .status { background: ${submission.status === "flagged" ? "#fff3cd" : "#d1fae5"}; border-radius: 6px; padding: 14px 18px; margin-bottom: 20px; }
    .footer { background: #f9fafb; padding: 16px 32px; font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Reimbursement Request Received</h1>
  </div>
  <div class="content">
    <p>Hi ${submission.studentName},</p>
    <p>Your reimbursement request for <strong>${formatCurrency(submission.claimedAmount, submission.currency)}</strong> has been received and forwarded to the VP Finance for review.</p>

    <div class="status">
      ${submission.status === "flagged"
        ? `<strong>⚠ Note:</strong> Your submission has been flagged for manual review.<br/><small>${submission.flagReason}</small>`
        : "<strong>✓</strong> Your receipts passed automated validation."}
    </div>

    <p><strong>Submission ID:</strong> ${submission.id.slice(0, 8).toUpperCase()}</p>
    <p><strong>Amount Requested:</strong> ${formatCurrency(submission.claimedAmount, submission.currency)}</p>
    <p><strong>Description:</strong> ${submission.expenseDescription}</p>

    <p>You'll be notified when the VP Finance has reviewed your request. Typical processing time is 5–10 business days.</p>
    <p>If you have questions, reach out to your VP Finance directly.</p>
    <p>— UW Blueprint</p>
  </div>
  <div class="footer">This is an automated message from the UW Blueprint Reimbursement System.</div>
</body>
</html>`,
  });
}
