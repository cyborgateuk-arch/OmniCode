import { NextResponse } from "next/server";
import { validateApiKey, getProviderConnections, getModelAliases } from "@/models";

// Verify API key and return provider credentials
export async function POST(request) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing API key" }, { status: 401 });
    }

    const apiKey = authHeader.slice(7);

    // Validate API key
    const isValid = await validateApiKey(apiKey);
    if (!isValid) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }

    // Get active provider connections
    const connections = await getProviderConnections({ isActive: true });

    // Helper to mask sensitive values
    function maskSecret(value: string | null | undefined): string | null {
      if (!value) return null;
      if (value.length <= 8) return "****";
      return value.slice(0, 4) + "****" + value.slice(-4);
    }

    function toOptionalString(value: unknown): string | null {
      return typeof value === "string" ? value : null;
    }

    // Map connections — NEVER expose raw credentials
    const mappedConnections = connections.map((conn) => ({
      provider: conn.provider,
      authType: conn.authType,
      hasApiKey: !!conn.apiKey,
      hasAccessToken: !!conn.accessToken,
      hasRefreshToken: !!conn.refreshToken,
      maskedApiKey: maskSecret(toOptionalString(conn.apiKey)),
      projectId: conn.projectId || null,
      expiresAt: conn.expiresAt,
      priority: conn.priority,
      globalPriority: conn.globalPriority,
      defaultModel: conn.defaultModel,
      isActive: conn.isActive,
    }));

    // Get model aliases
    const modelAliases = await getModelAliases();

    return NextResponse.json({
      connections: mappedConnections,
      modelAliases,
    });
  } catch (error) {
    console.log("Cloud auth error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
