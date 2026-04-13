/**
 * /api/vitallens-proxy.ts — Vercel Edge Function
 *
 * Transparent streaming proxy for the VitalLens REST API.
 *
 * Why this exists:
 *   api.rouast.com does NOT send CORS headers, so browsers cannot call it
 *   directly. This edge function runs server-side, adds the API key from an
 *   environment variable, and pipes the response back with CORS headers.
 *
 * Usage from the browser:
 *   POST /api/vitallens-proxy?endpoint=file
 *   Content-Type: multipart/form-data
 *   Body: { video: <Blob>, fps: "30", roi_method: "face" }
 *
 * Supported endpoints (passed as ?endpoint=<name>):
 *   file            → api.rouast.com/vitallens-v3/file
 *   stream          → api.rouast.com/vitallens-v3/stream
 *   resolve-model   → api.rouast.com/vitallens-v3/resolve-model
 *
 * IMPORTANT REMINDER:
 *   VITALLENS_API_KEY must be set in Vercel dashboard → Settings → Environment Variables
 *   (no VITE_ prefix, server-side only).
 */

export const runtime = 'edge';

const VITALLENS_BASE = 'https://api.rouast.com/vitallens-v3';

/** Restrict to your deployed domain(s). Update when you go to production. */
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
];

function getCorsOrigin(req: Request): string {
  const origin = req.headers.get('origin') ?? '';
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  if (!origin) return '*'; // same-origin requests
  return ALLOWED_ORIGINS[0];
}

function corsHeaders(req: Request) {
  return {
    'Access-Control-Allow-Origin': getCorsOrigin(req),
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-api-key, Authorization',
  };
}

function json(body: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...(req ? corsHeaders(req) : {}) },
  });
}

export default async function handler(req: Request): Promise<Response> {
  // ── CORS preflight ────────────────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  // ── API key from env ──────────────────────────────────────────────────────
  const apiKey = process.env.VITALLENS_API_KEY;
  if (!apiKey) {
    console.error('[vitallens-proxy] VITALLENS_API_KEY env var not set');
    return json({ error: 'VITALLENS_API_KEY not configured on server' }, 500, req);
  }

  // ── Resolve target endpoint ───────────────────────────────────────────────
  const url = new URL(req.url);
  const endpoint = url.searchParams.get('endpoint') || 'file';
  const allowed = ['file', 'stream', 'resolve-model'];
  if (!allowed.includes(endpoint)) {
    return json({ error: `Unknown endpoint "${endpoint}". Allowed: ${allowed.join(', ')}` }, 400, req);
  }

  const targetUrl = `${VITALLENS_BASE}/${endpoint}`;

  // ── Build forwarded headers ───────────────────────────────────────────────
  // Copy client headers but override / inject the API key.
  const fwdHeaders = new Headers();
  for (const [k, v] of req.headers.entries()) {
    // Skip hop-by-hop headers that should not be forwarded
    if (['host', 'connection', 'transfer-encoding', 'keep-alive'].includes(k.toLowerCase())) continue;
    fwdHeaders.set(k, v);
  }
  fwdHeaders.set('x-api-key', apiKey);

  // ── Forward request (body streamed directly — no buffering) ──────────────
  console.log(`[vitallens-proxy] → ${req.method} ${targetUrl}`);

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(targetUrl, {
      method: req.method,
      headers: fwdHeaders,
      body: req.body,          // ReadableStream — streamed, not buffered
      // @ts-expect-error — duplex is needed for streaming POST in some runtimes
      duplex: 'half',
    });
  } catch (err) {
    console.error('[vitallens-proxy] upstream fetch failed:', err);
    return json({ error: 'Failed to reach api.rouast.com', detail: String(err) }, 502, req);
  }

  // ── Stream response back with CORS headers ────────────────────────────────
  const respHeaders = new Headers(corsHeaders(req));
  // Forward upstream content-type so clients can parse correctly
  const ct = upstreamRes.headers.get('content-type');
  if (ct) respHeaders.set('content-type', ct);

  console.log(`[vitallens-proxy] ← HTTP ${upstreamRes.status} from api.rouast.com`);

  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers: respHeaders,
  });
}
