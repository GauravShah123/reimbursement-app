import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { submissionId, universityEmail } = await req.json();

    if (!submissionId || !universityEmail) {
      return NextResponse.json(
        { error: "submissionId and universityEmail required" },
        { status: 400 }
      );
    }

    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
    });

    if (!submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const attachments: nodemailer.SendMailOptions["attachments"] = [];

    if (submission.universityFormPath && fs.existsSync(submission.universityFormPath)) {
      attachments.push({
        filename: `UWBlueprint-Reimbursement-${submission.id.slice(0, 8).toUpperCase()}.pdf`,
        path: submission.universityFormPath,
        contentType: "application/pdf",
      });
    }

    const receiptPaths: string[] = JSON.parse(submission.receiptPaths || "[]");
    for (const receiptPath of receiptPaths) {
      if (fs.existsSync(receiptPath)) {
        attachments.push({
          filename: `Receipt-${path.basename(receiptPath)}`,
          path: receiptPath,
        });
      }
    }

    await transporter.sendMail({
      from: process.env.EMAIL_FROM || "UW Blueprint <noreply@uwblueprint.org>",
      to: universityEmail,
      subject: `Student Club Reimbursement Request — ${submission.studentName} (${submission.studentId})`,
      html: `
<p>Dear University of Waterloo Finance Office,</p>
<p>Please find attached a reimbursement request form and supporting receipts for the following student:</p>
<ul>
  <li><strong>Student Name:</strong> ${submission.studentName}</li>
  <li><strong>Student ID:</strong> ${submission.studentId}</li>
  <li><strong>Program:</strong> ${submission.program}</li>
  <li><strong>Amount:</strong> ${submission.claimedAmount.toFixed(2)} ${submission.currency}</li>
  <li><strong>Description:</strong> ${submission.expenseDescription}</li>
  <li><strong>Payment Method:</strong> ${submission.paymentMethod === "etransfer" ? "Interac E-Transfer" : "Cheque"}</li>
  <li><strong>Payment Details:</strong> ${submission.paymentDetails}</li>
</ul>
<p>This request has been reviewed and approved by UW Blueprint's VP Finance.</p>
<p>Please process at your earliest convenience. If you have any questions, feel free to reply to this email.</p>
<p>Thank you,<br/>VP Finance, UW Blueprint<br/>University of Waterloo</p>
      `,
      attachments,
    });

    await prisma.submission.update({
      where: { id: submissionId },
      data: { status: "sent_to_university" },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to send to university" }, { status: 500 });
  }
}
