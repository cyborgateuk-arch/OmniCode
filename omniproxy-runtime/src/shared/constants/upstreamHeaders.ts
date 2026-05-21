/**
 * User-supplied upstream extra headers: names we never forward (Host / hop-by-hop / framing).
 * Changing this list requires syncing: `sanitizeUpstreamHeadersMap` (models.ts), Zod
 * `upstreamHeaderNameSchema` / record refine (schemas.ts), and `upstream-headers-sanitize` tests.
 */
const FORBIDDEN = new Set(
  [
    "host",
    "connection",
    "content-length",
    "keep-alive",
    "proxy-connection",
    "transfer-encoding",
    "te",
    "trailer",
    "upgrade",
  ].map((s) => s.toLowerCase())
);

export function isForbiddenUpstreamHeaderName(name: string): boolean {
  return FORBIDDEN.has(String(name).trim().toLowerCase());
}
