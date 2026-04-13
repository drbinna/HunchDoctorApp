/**
 * Vercel Serverless Function — /api/hume-token
 *
 * Exchanges HUME_API_KEY + HUME_SECRET_KEY (server-side env vars) for a
 * short-lived Hume access token. The browser receives only the token,
 * never the raw credentials.
 *
 * Set in Vercel dashboard (Project → Settings → Environment Variables):
 *   HUME_API_KEY    = your Hume API key
 *   HUME_SECRET_KEY = your Hume secret key
 *
 * The client then connects to Hume EVI using:
 *   new HumeClient({ accessToken })
 */

export const runtime = 'edge';

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

  const apiKey    = process.env.HUME_API_KEY;
  const secretKey = process.env.HUME_SECRET_KEY;

  if (!apiKey || !secretKey) {
    return new Response(
      JSON.stringify({ error: 'Hume credentials not configured on server' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  try {
    // Hume OAuth2 client-credentials flow
    const credentials = btoa(`${apiKey}:${secretKey}`);
    const tokenRes = await fetch('https://api.hume.ai/oauth2-cc/token', {
      method:  'POST',
      headers: {
        Authorization:  `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      console.error('[hume-token] Hume token endpoint error:', tokenRes.status, text);
      return new Response(
        JSON.stringify({ error: 'Failed to obtain Hume access token', detail: text }),
        { status: tokenRes.status, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const data = await tokenRes.json() as { access_token: string; expires_in: number };

    return new Response(
      JSON.stringify({ accessToken: data.access_token, expiresIn: data.expires_in }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          ...corsHeaders(req),
        },
      },
    );
  } catch (err) {
    console.error('[hume-token] unexpected error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders(req) } },
    );
  }
}