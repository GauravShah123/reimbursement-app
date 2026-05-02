import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { submissionId } = await req.json();

    if (!submissionId) {
      return NextResponse.json({ error: "submissionId required" }, { status: 400 });
    }

    const submission = await prisma.submission.update({
      where: { id: submissionId },
      data: { status: "approved" },
    });

    return NextResponse.json({ success: true, submission });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to approve" }, { status: 500 });
  }
}
