import { NextResponse } from "next/server";
import { getDbInstance } from "@/lib/db/core";

type JsonRecord = Record<string, unknown>;

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/**
 * GET /api/providers/metrics — Aggregate per-provider stats from call_logs
 * Returns: { metrics: { [provider]: { totalRequests, totalSuccesses, successRate, avgLatencyMs } } }
 */
export async function GET() {
  try {
    const db = getDbInstance();
    const rows = db
      .prepare(
        `SELECT
          provider,
          COUNT(*) as totalRequests,
          SUM(CASE WHEN status >= 200 AND status < 400 THEN 1 ELSE 0 END) as totalSuccesses,
          ROUND(AVG(duration)) as avgLatencyMs
        FROM call_logs
        WHERE provider IS NOT NULL AND provider != '-'
        GROUP BY provider`
      )
      .all() as JsonRecord[];

    const metrics: Record<
      string,
      {
        totalRequests: number;
        totalSuccesses: number;
        successRate: number;
        avgLatencyMs: number;
      }
    > = {};
    for (const row of rows) {
      const provider =
        typeof row.provider === "string" && row.provider.trim().length > 0
          ? row.provider
          : "unknown";
      const totalRequests = toNumber(row.totalRequests);
      const totalSuccesses = toNumber(row.totalSuccesses);
      const avgLatencyMs = toNumber(row.avgLatencyMs);
      metrics[provider] = {
        totalRequests,
        totalSuccesses,
        successRate: totalRequests > 0 ? Math.round((totalSuccesses / totalRequests) * 100) : 0,
        avgLatencyMs,
      };
    }

    return NextResponse.json({ metrics });
  } catch (error) {
    console.error("[providers/metrics] Error:", error);
    return NextResponse.json({ metrics: {} });
  }
}
