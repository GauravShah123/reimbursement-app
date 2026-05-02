import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { validateReceipts } from "@/lib/receipt-validation";
import { generateUniversityForm } from "@/lib/pdf-generator";
import { sendReimbursementEmail, sendConfirmationEmail } from "@/lib/email";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

export const runtime = "nodejs";
export const maxDuration = 60;

async function saveFile(file: File, submissionId: string): Promise<string> {
  const uploadsDir = path.join(process.cwd(), "uploads", submissionId);
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const ext = path.extname(file.name) || ".jpg";
  const filename = `${uuidv4()}${ext}`;
  const filePath = path.join(uploadsDir, filename);

  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(filePath, buffer);

  return filePath;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const studentName = formData.get("studentName") as string;
    const studentId = formData.get("studentId") as string;
    const email = formData.get("email") as string;
    const program = formData.get("program") as string;
    const paymentMethod = formData.get("paymentMethod") as string;
    const paymentDetails = formData.get("paymentDetails") as string;
    const expenseDescription = formData.get("expenseDescription") as string;
    const expenseDate = formData.get("expenseDate") as string;
    const claimedAmount = parseFloat(formData.get("claimedAmount") as string);
    const currency = (formData.get("currency") as string).toUpperCase();
    const receipts = formData.getAll("receipts") as File[];

    if (
      !studentName ||
      !studentId ||
      !email ||
      !program ||
      !paymentMethod ||
      !paymentDetails ||
      !expenseDescription ||
      !expenseDate ||
      isNaN(claimedAmount) ||
      !currency ||
      receipts.length === 0
    ) {
      return NextResponse.json(
        { error: "All fields and at least one receipt are required." },
        { status: 400 }
      );
    }

    if (claimedAmount <= 0) {
      return NextResponse.json(
        { error: "Claimed amount must be greater than 0." },
        { status: 400 }
      );
    }

    const submissionId = uuidv4();

    // Save receipt files
    const receiptPaths: string[] = [];
    for (const receipt of receipts) {
      const filePath = await saveFile(receipt, submissionId);
      receiptPaths.push(filePath);
    }

    // Validate receipts with Claude Vision
    const validation = await validateReceipts(
      receiptPaths,
      claimedAmount,
      currency
    );

    const status = validation.isFlagged ? "flagged" : "pending";

    // Create submission record
    const submission = await prisma.submission.create({
      data: {
        id: submissionId,
        studentName,
        studentId,
        email,
        program,
        paymentMethod,
        paymentDetails,
        expenseDescription,
        expenseDate,
        claimedAmount,
        currency,
        receiptPaths: JSON.stringify(receiptPaths),
        receiptTotal: validation.extractedTotal,
        receiptCurrency: validation.extractedCurrency,
        status,
        flagReason: validation.flagReason,
        validationNotes: validation.notes,
      },
    });

    // Generate university form PDF
    const universityFormPath = await generateUniversityForm(submission);

    await prisma.submission.update({
      where: { id: submissionId },
      data: { universityFormPath },
    });

    const updatedSubmission = await prisma.submission.findUnique({
      where: { id: submissionId },
    });

    // Send emails
    try {
      await sendReimbursementEmail(updatedSubmission!, universityFormPath);
      await sendConfirmationEmail(updatedSubmission!);
    } catch (emailErr) {
      console.error("Email send failed (non-fatal):", emailErr);
    }

    return NextResponse.json({
      success: true,
      submissionId,
      status,
      flagged: validation.isFlagged,
      flagReason: validation.flagReason,
    });
  } catch (err) {
    console.error("Submission error:", err);
    return NextResponse.json(
      { error: "Internal server error. Please try again." },
      { status: 500 }
    );
  }
}
