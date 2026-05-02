import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const submissions = await prisma.submission.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(submissions);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch submissions" }, { status: 500 });
  }
}
