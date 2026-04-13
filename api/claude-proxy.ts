/**
 * Vercel Serverless Function — /api/claude-proxy
 *
 * Proxies Anthropic Claude API requests so the browser never sees the API key.
 *
 * Set in Vercel dashboard (Project → Settings → Environment Variables):
 *   ANTHROPIC_API_KEY = your Anthropic API key (sk-ant-...)
 *
 * The client sends a POST with { model, max_tokens, messages } and receives
 * the Claude response. The API key is injected server-side only.
 */

export const runtime = 'edge';

/** Restrict to your deployed domain(s). Update this when you go to production. */
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
];

function getCorsOrigin(req: Request): string {
  const origin = req.headers.get('origin') ?? '';
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  // In production on Vercel, same-origin requests won't have a different origin
  // If origin header is absent (same-origin), allow it
  if (!origin) return '*';
  return ALLOWED_ORIGINS[0]; // fallback — will cause CORS rejection in browser
}

function corsHeaders(req: Request) {
  return {
    'Access-Control-Allow-Origin': getCorsOrigin(req),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export default async function handler(req: Request): Promise<Response> {
  // Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured on server' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders(req) } },
    );
  }

  try {
    const body = await req.json() as {
      model?: string;
      max_tokens?: number;
      messages?: unknown[];
    };

    // Validate required fields
    if (!body.model || !body.messages || !Array.isArray(body.messages)) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: model, messages' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders(req) } },
      );
    }

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: body.model,
        max_tokens: body.max_tokens ?? 256,
        messages: body.messages,
      }),
    });

    if (!claudeRes.ok) {
      const text = await claudeRes.text();
      console.error('[claude-proxy] Anthropic error:', claudeRes.status, text);
      return new Response(
        JSON.stringify({ error: 'Anthropic API error', detail: text }),
        { status: claudeRes.status, headers: { 'Content-Type': 'application/json', ...corsHeaders(req) } },
      );
    }

    const data = await claudeRes.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...corsHeaders(req),
      },
    });
  } catch (err) {
    console.error('[claude-proxy] unexpected error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders(req) } },
    );
  }
}
