// ─────────────────────────────────────────────────────────────
//  HunchDoctor — Client-Side Config
// ─────────────────────────────────────────────────────────────
// 🔒 SECURITY: All API keys are server-side only (Vercel env vars).
//    They are accessed through proxy endpoints:
//      - /api/claude-proxy     → Anthropic Claude
//      - /api/hume-token       → Hume EVI access token
//      - /api/vitallens-proxy  → VitalLens rPPG
//
//    NEVER add VITE_ prefixed secrets here — they get bundled
//    into the client-side JavaScript and are visible to users.
// ─────────────────────────────────────────────────────────────

// ── Hume EVI config ID (not a secret — identifies which config to use) ──
// Find it: platform.hume.ai → EVI → Configurations → your config → ID
export const HUME_CONFIG_ID = import.meta.env.VITE_HUME_CONFIG_ID || "";