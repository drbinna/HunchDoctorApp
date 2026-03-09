/**
 * vitallens-stub.ts — kept for reference only
 *
 * useVitalLens.ts no longer imports from the vitallens npm package.
 * The real integration now uses:
 *   - MediaRecorder to capture video during scan
 *   - /api/vitallens-proxy (Vercel edge function) to call api.rouast.com
 *     server-side with CORS headers and the API key injected from env
 *   - Local POS fallback if the proxy is unavailable
 *
 * This stub is kept so that any accidental `import 'vitallens'` in user code
 * resolves to a typed no-op rather than crashing the bundler.
 */

export class VitalLens {
  constructor(_opts?: unknown) {}
  addEventListener(_event: string, _handler: unknown) {}
  removeEventListener(_event: string, _handler: unknown) {}
  async setVideoStream(_stream?: unknown, _el?: unknown) {}
  startVideoStream() {}
  stopVideoStream() {}
  async close() {}
}

export default VitalLens;
