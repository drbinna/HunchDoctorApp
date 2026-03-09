// ─────────────────────────────────────────────────────────────
//  HunchDoctor — API Keys Config
// ─────────────────────────────────────────────────────────────

// ── VitalLens rPPG (heart rate + respiratory rate) ────────────
// Key is injected server-side by /api/vitallens-proxy.ts
// Set VITALLENS_API_KEY in Vercel → Settings → Environment Variables
// The frontend no longer needs this key directly.
export const VITALLENS_API_KEY = '';

// ── Anthropic Claude (insight generation) ────────────────────
export const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY || "";

// ── Hume EVI (empathic voice interface) ──────────────────────
// Find it: platform.hume.ai → API Keys
export const HUME_API_KEY = import.meta.env.VITE_HUME_API_KEY || "";

// Find it: platform.hume.ai → API Keys (same page, Secret Key column)
export const HUME_SECRET_KEY = import.meta.env.VITE_HUME_SECRET_KEY || "";

// Find it: platform.hume.ai → EVI → Configurations → your config → ID
export const HUME_CONFIG_ID = import.meta.env.VITE_HUME_CONFIG_ID || "";