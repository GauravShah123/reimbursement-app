import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";
import fs from "fs";
import path from "path";
import type { Submission } from "@prisma/client";

function drawField(
  page: PDFPage,
  font: PDFFont,
  boldFont: PDFFont,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number = 500
) {
  const labelSize = 9;
  const valueSize = 11;

  page.drawText(label, {
    x,
    y: y + 14,
    size: labelSize,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });

  // Underline
  page.drawLine({
    start: { x, y },
    end: { x: x + width, y },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });

  page.drawText(value || "—", {
    x: x + 2,
    y: y + 3,
    size: valueSize,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.1),
  });
}

function drawSectionHeader(
  page: PDFPage,
  boldFont: PDFFont,
  title: string,
  x: number,
  y: number,
  width: number = 515
) {
  page.drawRectangle({
    x,
    y: y - 4,
    width,
    height: 20,
    color: rgb(0.1, 0.33, 0.6),
  });

  page.drawText(title, {
    x: x + 8,
    y: y + 2,
    size: 11,
    font: boldFont,
    color: rgb(1, 1, 1),
  });
}

export async function generateUniversityForm(
  submission: Submission
): Promise<string> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // US Letter
  const { height } = page.getSize();

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margin = 48;
  let y = height - margin;

  // Header
  page.drawRectangle({
    x: 0,
    y: height - 80,
    width: 612,
    height: 80,
    color: rgb(0.07, 0.2, 0.38),
  });

  page.drawText("UW BLUEPRINT", {
    x: margin,
    y: height - 36,
    size: 22,
    font: boldFont,
    color: rgb(1, 1, 1),
  });

  page.drawText("Student Reimbursement Request", {
    x: margin,
    y: height - 56,
    size: 12,
    font,
    color: rgb(0.75, 0.88, 1),
  });

  // Submission ID & Date (top right)
  const submittedDate = new Date(submission.createdAt).toLocaleDateString(
    "en-CA",
    { year: "numeric", month: "long", day: "numeric" }
  );
  page.drawText(`Submission ID: ${submission.id.slice(0, 8).toUpperCase()}`, {
    x: 612 - margin - 200,
    y: height - 36,
    size: 9,
    font,
    color: rgb(0.75, 0.88, 1),
  });
  page.drawText(`Date: ${submittedDate}`, {
    x: 612 - margin - 200,
    y: height - 52,
    size: 9,
    font,
    color: rgb(0.75, 0.88, 1),
  });

  y = height - 110;

  // Status badge
  if (submission.status === "flagged") {
    page.drawRectangle({
      x: margin,
      y: y - 4,
      width: 515,
      height: 36,
      color: rgb(1, 0.95, 0.9),
      borderColor: rgb(0.9, 0.4, 0.1),
      borderWidth: 1,
    });
    page.drawText("⚠  FLAGGED FOR MANUAL REVIEW", {
      x: margin + 8,
      y: y + 10,
      size: 10,
      font: boldFont,
      color: rgb(0.7, 0.2, 0),
    });
    if (submission.flagReason) {
      page.drawText(submission.flagReason.slice(0, 90), {
        x: margin + 8,
        y: y - 2,
        size: 8,
        font,
        color: rgb(0.6, 0.2, 0),
      });
    }
    y -= 52;
  }

  // ── Section 1: Student Information ──
  drawSectionHeader(page, boldFont, "STUDENT INFORMATION", margin, y);
  y -= 40;

  drawField(page, font, boldFont, "Full Name", submission.studentName, margin, y, 240);
  drawField(page, font, boldFont, "Student ID", submission.studentId, margin + 260, y, 215);
  y -= 48;

  drawField(page, font, boldFont, "Email Address", submission.email, margin, y, 240);
  drawField(page, font, boldFont, "Program / Department", submission.program, margin + 260, y, 215);
  y -= 56;

  // ── Section 2: Payment Information ──
  drawSectionHeader(page, boldFont, "PAYMENT INFORMATION", margin, y);
  y -= 40;

  const paymentLabel =
    submission.paymentMethod === "etransfer"
      ? "E-Transfer Email"
      : "Cheque Payable To";
  drawField(page, font, boldFont, "Payment Method", submission.paymentMethod === "etransfer" ? "Interac E-Transfer" : "Cheque", margin, y, 240);
  drawField(page, font, boldFont, paymentLabel, submission.paymentDetails, margin + 260, y, 215);
  y -= 56;

  // ── Section 3: Expense Details ──
  drawSectionHeader(page, boldFont, "EXPENSE DETAILS", margin, y);
  y -= 40;

  drawField(page, font, boldFont, "Expense Date", submission.expenseDate, margin, y, 240);
  drawField(
    page,
    font,
    boldFont,
    "Amount Claimed",
    `${submission.claimedAmount.toFixed(2)} ${submission.currency}`,
    margin + 260,
    y,
    215
  );
  y -= 48;

  drawField(page, font, boldFont, "Description of Expense", submission.expenseDescription, margin, y, 515);
  y -= 56;

  // ── Section 4: Receipt Validation ──
  drawSectionHeader(page, boldFont, "RECEIPT VALIDATION", margin, y);
  y -= 40;

  const receiptTotal =
    submission.receiptTotal != null
      ? `${submission.receiptTotal.toFixed(2)} ${submission.receiptCurrency ?? ""}`
      : "Not extracted";

  drawField(page, font, boldFont, "Receipt Total (OCR)", receiptTotal, margin, y, 240);
  drawField(
    page,
    font,
    boldFont,
    "Validation Status",
    submission.status === "flagged" ? "FLAGGED" : "PASSED",
    margin + 260,
    y,
    215
  );
  y -= 48;

  if (submission.validationNotes) {
    page.drawText("Validation Notes:", {
      x: margin,
      y,
      size: 9,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
    y -= 14;

    // Word wrap validation notes
    const maxWidth = 500;
    const words = submission.validationNotes.split(" ");
    let line = "";
    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      const testWidth = font.widthOfTextAtSize(testLine, 9);
      if (testWidth > maxWidth && line) {
        page.drawText(line, { x: margin, y, size: 9, font, color: rgb(0.3, 0.3, 0.3) });
        y -= 12;
        line = word;
      } else {
        line = testLine;
      }
    }
    if (line) {
      page.drawText(line, { x: margin, y, size: 9, font, color: rgb(0.3, 0.3, 0.3) });
      y -= 12;
    }
    y -= 8;
  }

  // ── Section 5: Approvals ──
  y -= 16;
  drawSectionHeader(page, boldFont, "APPROVALS", margin, y);
  y -= 48;

  const approvalBoxWidth = 230;
  const signatureY = y - 20;

  // VP Finance box
  page.drawRectangle({
    x: margin,
    y: signatureY - 10,
    width: approvalBoxWidth,
    height: 70,
    borderColor: rgb(0.8, 0.8, 0.8),
    borderWidth: 1,
  });
  page.drawText("VP Finance, UW Blueprint", {
    x: margin + 8,
    y: signatureY + 40,
    size: 9,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });
  page.drawLine({
    start: { x: margin + 8, y: signatureY + 14 },
    end: { x: margin + approvalBoxWidth - 8, y: signatureY + 14 },
    thickness: 0.5,
    color: rgb(0.6, 0.6, 0.6),
  });
  page.drawText("Signature", {
    x: margin + 8,
    y: signatureY + 2,
    size: 8,
    font,
    color: rgb(0.6, 0.6, 0.6),
  });
  page.drawLine({
    start: { x: margin + 8, y: signatureY - 4 },
    end: { x: margin + approvalBoxWidth - 8, y: signatureY - 4 },
    thickness: 0.5,
    color: rgb(0.6, 0.6, 0.6),
  });
  page.drawText("Date", {
    x: margin + 8,
    y: signatureY - 16,
    size: 8,
    font,
    color: rgb(0.6, 0.6, 0.6),
  });

  // University box
  page.drawRectangle({
    x: margin + approvalBoxWidth + 30,
    y: signatureY - 10,
    width: approvalBoxWidth,
    height: 70,
    borderColor: rgb(0.8, 0.8, 0.8),
    borderWidth: 1,
  });
  page.drawText("University of Waterloo Finance", {
    x: margin + approvalBoxWidth + 38,
    y: signatureY + 40,
    size: 9,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });
  page.drawLine({
    start: { x: margin + approvalBoxWidth + 38, y: signatureY + 14 },
    end: { x: margin + 2 * approvalBoxWidth + 22, y: signatureY + 14 },
    thickness: 0.5,
    color: rgb(0.6, 0.6, 0.6),
  });
  page.drawText("Signature", {
    x: margin + approvalBoxWidth + 38,
    y: signatureY + 2,
    size: 8,
    font,
    color: rgb(0.6, 0.6, 0.6),
  });
  page.drawLine({
    start: { x: margin + approvalBoxWidth + 38, y: signatureY - 4 },
    end: { x: margin + 2 * approvalBoxWidth + 22, y: signatureY - 4 },
    thickness: 0.5,
    color: rgb(0.6, 0.6, 0.6),
  });
  page.drawText("Date", {
    x: margin + approvalBoxWidth + 38,
    y: signatureY - 16,
    size: 8,
    font,
    color: rgb(0.6, 0.6, 0.6),
  });

  // Footer
  page.drawLine({
    start: { x: margin, y: 48 },
    end: { x: 612 - margin, y: 48 },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });
  page.drawText(
    "UW Blueprint | University of Waterloo | This form was auto-generated by the Blueprint Reimbursement System",
    {
      x: margin,
      y: 36,
      size: 8,
      font,
      color: rgb(0.6, 0.6, 0.6),
    }
  );

  const pdfBytes = await pdfDoc.save();

  const uploadsDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const outputPath = path.join(uploadsDir, `university-form-${submission.id}.pdf`);
  fs.writeFileSync(outputPath, pdfBytes);

  return outputPath;
}
