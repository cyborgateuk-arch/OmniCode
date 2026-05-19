import { NextResponse } from "next/server";
import { getAuditStats } from "@omniroute/open-sse/mcp-server/audit";

export async function GET() {
  try {
    const stats = await getAuditStats();
    return NextResponse.json(stats);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load MCP audit stats";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
