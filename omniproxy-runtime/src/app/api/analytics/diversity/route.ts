import { NextResponse } from "next/server";
import { getDiversityReport } from "../../../../../open-sse/services/autoCombo/providerDiversity";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const report = getDiversityReport();
    return NextResponse.json(report);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
