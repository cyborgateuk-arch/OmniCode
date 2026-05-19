import { NextRequest, NextResponse } from "next/server";
import { getDbInstance } from "@/lib/db/core";
import { isAuthenticated } from "@/shared/utils/apiAuth";

interface CacheEntry {
  id: string;
  signature: string;
  model: string;
  hit_count: number;
  tokens_saved: number;
  created_at: string;
  expires_at: string;
}

export async function GET(req: NextRequest) {
  if (!(await isAuthenticated(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const search = searchParams.get("search") || "";
    const model = searchParams.get("model") || "";
    const sortBy = searchParams.get("sortBy") || "created_at";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    const db = getDbInstance();
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (search) {
      conditions.push("(signature LIKE ? OR model LIKE ?)");
      params.push(`%${search}%`, `%${search}%`);
    }

    if (model) {
      conditions.push("model = ?");
      params.push(model);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const validSortColumns = ["created_at", "expires_at", "hit_count", "tokens_saved", "model"];
    const orderBy = validSortColumns.includes(sortBy) ? sortBy : "created_at";
    const order = sortOrder === "asc" ? "ASC" : "DESC";

    const countRow = db
      .prepare(`SELECT COUNT(*) as total FROM semantic_cache ${whereClause}`)
      .get(...params) as { total: number };

    const entries = db
      .prepare(
        `SELECT id, signature, model, hit_count, tokens_saved, created_at, expires_at
         FROM semantic_cache ${whereClause}
         ORDER BY ${orderBy} ${order}
         LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as CacheEntry[];

    return NextResponse.json({
      entries,
      pagination: {
        page,
        limit,
        total: countRow?.total || 0,
        totalPages: Math.ceil((countRow?.total || 0) / limit),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await isAuthenticated(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const signature = searchParams.get("signature");
    const model = searchParams.get("model");

    const db = getDbInstance();

    if (signature) {
      db.prepare("DELETE FROM semantic_cache WHERE signature = ?").run(signature);
      return NextResponse.json({ ok: true, deleted: 1 });
    }

    if (model) {
      const result = db.prepare("DELETE FROM semantic_cache WHERE model = ?").run(model);
      return NextResponse.json({ ok: true, deleted: result.changes });
    }

    return NextResponse.json({ error: "Provide signature or model parameter" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
