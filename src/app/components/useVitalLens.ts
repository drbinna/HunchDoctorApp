/**
 * useVitalLens — rPPG hook for HunchDoctor
 *
 * Two-path architecture:
 *
 *   PATH A — VitalLens DL (via backend proxy)
 *     1. Open camera, start MediaRecorder → accumulate WebM chunks
 *     2. After scan duration: assemble Blob, POST multipart to /api/vitallens-proxy
 *     3. Parse { vitals: { heart_rate, respiratory_rate } } from response
 *     4. Return DL-quality HR + RR
 *
 *   PATH B — Local POS fallback (Wang et al. 2017)
 *     Used when: proxy unavailable, API key missing, or upstream error
 *     1. setInterval @ 30 fps → 40×40 offscreen canvas → mean R/G/B
 *     2. POS projection → bandpass FIR → Cooley-Tukey FFT
 *     3. Dominant frequency in band → HR (bpm) / RR (rpm)
 *
 * Public API (unchanged — HunchCompass.tsx needs zero changes):
 *   startScan(videoEl, stream) → void
 *   stopScan()                 → Promise<{ hr, rr }>
 *   scanning                   → boolean
 *   method                     → 'api' | 'pos'
 */

import { useRef, useState, useCallback } from 'react';

// ── Proxy URL (served by /api/vitallens-proxy.ts) ─────────────────────────────
const PROXY_URL = '/api/vitallens-proxy';

// ── POS constants ─────────────────────────────────────────────────────────────
const FPS         = 30;
const MAX_SAMPLES = 900;   // 30 s @ 30 fps
const MIN_FRAMES  = 150;   // 5 s minimum

// ─────────────────────────────────────────────────────────────────────────────
// POS algorithm helpers (Path B)
// ─────────────────────────────────────────────────────────────────────────────

const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;

const stdDev = (a: number[]) => {
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length);
};

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const ang  = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let tr = 1, ti = 0;
      for (let j = 0; j < half; j++) {
        const ur = re[i+j],         ui = im[i+j];
        const vr = re[i+j+half]*tr - im[i+j+half]*ti;
        const vi = re[i+j+half]*ti + im[i+j+half]*tr;
        re[i+j]      = ur+vr;  im[i+j]      = ui+vi;
        re[i+j+half] = ur-vr;  im[i+j+half] = ui-vi;
        const nr = tr*wr - ti*wi; ti = tr*wi + ti*wr; tr = nr;
      }
    }
  }
}

function pos(rgb: [number, number, number][]): number[] {
  const R = rgb.map(([r])    => r);
  const G = rgb.map(([,g])   => g);
  const B = rgb.map(([,,b])  => b);
  const mR = mean(R), mG = mean(G), mB = mean(B);
  if (mR < 1 || mG < 1 || mB < 1) return R.map(() => 0);
  const Rn = R.map(r => r / mR);
  const Gn = G.map(g => g / mG);
  const Bn = B.map(b => b / mB);
  const S1 = Rn.map((r, i) => r - Gn[i]);
  const S2 = Rn.map((r, i) => r + Gn[i] - 2 * Bn[i]);
  const s1 = stdDev(S1), s2 = stdDev(S2);
  const alpha = s2 > 1e-6 ? s1 / s2 : 1;
  return S1.map((s, i) => s + alpha * S2[i]);
}

function bandpass(signal: number[], fps: number, loHz: number, hiHz: number): number[] {
  const nLo = Math.max(2, Math.round(fps / hiHz));
  const nHi = Math.max(nLo + 2, Math.round(fps / loHz));
  const sma = (arr: number[], n: number) =>
    arr.map((_, i) => {
      const s = Math.max(0, i - n + 1);
      return arr.slice(s, i + 1).reduce((a, v) => a + v, 0) / (i - s + 1);
    });
  return signal.map((_, i) => sma(signal, nLo)[i] - sma(signal, nHi)[i]);
}

function dominantFreq(signal: number[], fps: number, minHz: number, maxHz: number): number {
  let n = 1;
  while (n < signal.length) n <<= 1;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  signal.forEach((v, i) => { re[i] = v; });
  fft(re, im);
  const freqRes = fps / n;
  let best = -Infinity, bestFreq = (minHz + maxHz) / 2;
  for (let i = 1; i < n / 2; i++) {
    const freq = i * freqRes;
    if (freq < minHz || freq > maxHz) continue;
    const power = re[i] ** 2 + im[i] ** 2;
    if (power > best) { best = power; bestFreq = freq; }
  }
  return bestFreq;
}

// ─────────────────────────────────────────────────────────────────────────────
// VitalLens API response types
// ─────────────────────────────────────────────────────────────────────────────

interface VitalSignEntry {
  value:      number;
  confidence: number;
  unit?:      string;
  /** per-second values array */
  time_s?:    number[];
}

interface VitalLensAPIResult {
  vitals?: {
    heart_rate?:       VitalSignEntry;
    respiratory_rate?: VitalSignEntry;
    hrv_sdnn?:         VitalSignEntry;
  };
  /** some API versions return snake_case at root */
  heart_rate?:       VitalSignEntry;
  respiratory_rate?: VitalSignEntry;
}

function extractVitals(data: VitalLensAPIResult): { hr: number | null; rr: number | null } {
  // Handle both nested { vitals: {...} } and flat { heart_rate: {...} }
  const hr = data.vitals?.heart_rate?.value ?? data.heart_rate?.value ?? null;
  const rr = data.vitals?.respiratory_rate?.value ?? data.respiratory_rate?.value ?? null;
  return {
    hr: hr !== null ? Math.round(hr) : null,
    rr: rr !== null ? Math.round(rr) : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PATH A — VitalLens DL via proxy
// ─────────────────────────────────────────────────────────────────────────────

/** Check if the proxy is reachable with the current API key */
export async function proxyHealthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${PROXY_URL}?endpoint=resolve-model`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    // 200 or 400 (bad request) both mean the proxy+API are reachable
    return res.status < 500;
  } catch {
    return false;
  }
}

/**
 * Send a recorded video Blob to the VitalLens file endpoint via our proxy.
 * Returns null on any error so the caller can fall back to POS.
 */
async function callVitalLensAPI(
  videoBlob: Blob,
  fps: number,
  onLog?: (msg: string) => void
): Promise<{ hr: number | null; rr: number | null } | null> {
  const log = (m: string) => { console.log(`[VitalLens/API] ${m}`); onLog?.(m); };

  log(`Sending ${(videoBlob.size / 1024).toFixed(0)} KB video to proxy…`);

  const form = new FormData();
  form.append('video', videoBlob, 'scan.webm');
  form.append('fps', String(fps));
  form.append('roi_method', 'face');

  let res: Response;
  try {
    res = await fetch(`${PROXY_URL}?endpoint=file`, {
      method: 'POST',
      body: form,
    });
  } catch (err) {
    log(`Network error: ${err}`);
    return null;
  }

  const text = await res.text();

  if (!res.ok) {
    log(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    return null;
  }

  let data: VitalLensAPIResult;
  try {
    data = JSON.parse(text);
  } catch {
    log(`JSON parse error — raw: ${text.slice(0, 200)}`);
    return null;
  }

  const vitals = extractVitals(data);
  log(`HR=${vitals.hr} bpm  RR=${vitals.rr}/min  (DL model)`);
  return vitals;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

interface VitalResult {
  hr: number | null;
  rr: number | null;
  /** Which path produced the result */
  method: 'api' | 'pos';
  /** Raw API response for audit panel */
  apiRaw?: VitalLensAPIResult;
}

export function useVitalLens() {
  // ── Shared state ────────────────────────────────────────────────────────────
  const [scanning, setScanning] = useState(false);
  const [method,   setMethod]   = useState<'api' | 'pos'>('pos');

  // ── Path A refs (MediaRecorder) ─────────────────────────────────────────────
  const recorderRef    = useRef<MediaRecorder | null>(null);
  const chunksRef      = useRef<Blob[]>([]);
  const recordFpsRef   = useRef<number>(FPS);

  // ── Path B refs (POS) ───────────────────────────────────────────────────────
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const rgbBufRef    = useRef<[number, number, number][]>([]);
  const canvasRef    = useRef<HTMLCanvasElement | null>(null);

  // ── startScan ───────────────────────────────────────────────────────────────
  const startScan = useCallback(async (videoEl: HTMLVideoElement, stream?: MediaStream) => {
    chunksRef.current  = [];
    rgbBufRef.current  = [];

    // ── Path A setup: MediaRecorder on the stream ───────────────────────────
    if (stream) {
      const mimeType = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
        'video/mp4',
      ].find(t => MediaRecorder.isTypeSupported(t)) ?? '';

      try {
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
        recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
        recorder.start(500); // 500 ms chunks
        recorderRef.current = recorder;
        recordFpsRef.current = stream.getVideoTracks()[0]?.getSettings().frameRate ?? FPS;
        console.log(`[VitalLens/API] MediaRecorder started (${mimeType || 'default'}, ${recordFpsRef.current} fps)`);
      } catch (err) {
        console.warn('[VitalLens/API] MediaRecorder failed — will use POS only:', err);
        recorderRef.current = null;
      }
    }

    // ── Path B setup: offscreen canvas for POS ──────────────────────────────
    const canvas = document.createElement('canvas');
    canvas.width = 40; canvas.height = 40;
    canvasRef.current = canvas;
    const ctx = canvas.getContext('2d')!;

    intervalRef.current = setInterval(() => {
      if (!videoEl || videoEl.videoWidth === 0) return;
      try {
        const vw = videoEl.videoWidth, vh = videoEl.videoHeight;
        ctx.drawImage(videoEl, vw * 0.25, vh * 0.1, vw * 0.5, vh * 0.8, 0, 0, 40, 40);
        const { data } = ctx.getImageData(0, 0, 40, 40);
        let r = 0, g = 0, b = 0;
        for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i+1]; b += data[i+2]; }
        const px = data.length / 4;
        rgbBufRef.current.push([r / px, g / px, b / px]);
        if (rgbBufRef.current.length > MAX_SAMPLES) rgbBufRef.current.shift();
      } catch { /* cross-origin guard */ }
    }, 1000 / FPS);

    setScanning(true);
    console.log('[VitalLens] scan started — both paths armed');
  }, []);

  // ── stopScan ────────────────────────────────────────────────────────────────
  const stopScan = useCallback(async (
    onLog?: (msg: string) => void
  ): Promise<VitalResult> => {
    // Stop POS sampler
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    setScanning(false);

    const rgbBuf = [...rgbBufRef.current];
    rgbBufRef.current = [];

    // ── PATH A: Stop recorder, assemble Blob, call proxy ───────────────────
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      const recorder = recorderRef.current;
      recorderRef.current = null;

      const videoBlob = await new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' });
          chunksRef.current = [];
          resolve(blob);
        };
        recorder.stop();
      });

      onLog?.(`MediaRecorder stopped — ${(videoBlob.size / 1024).toFixed(0)} KB video`);

      if (videoBlob.size > 10_000) { // need at least ~10 KB
        const result = await callVitalLensAPI(videoBlob, recordFpsRef.current, onLog);
        if (result && (result.hr !== null || result.rr !== null)) {
          setMethod('api');
          return { ...result, method: 'api' };
        }
        onLog?.('API returned no vitals — falling back to POS');
      } else {
        onLog?.('Video blob too small — falling back to POS');
      }
    }

    // ── PATH B: Local POS fallback ──────────────────────────────────────────
    onLog?.(`POS fallback: ${rgbBuf.length} frames`);
    console.log(`[VitalLens/POS] analyzing ${rgbBuf.length} frames`);

    if (rgbBuf.length < MIN_FRAMES) {
      console.warn(`[VitalLens/POS] too few frames (${rgbBuf.length})`);
      setMethod('pos');
      return { hr: null, rr: null, method: 'pos' };
    }

    try {
      const pulse   = pos(rgbBuf);
      const hrBand  = bandpass(pulse, FPS, 0.7,  4.0);
      const rrBand  = bandpass(pulse, FPS, 0.15, 0.5);
      const hrFreq  = dominantFreq(hrBand, FPS, 0.7,  4.0);
      const rrFreq  = dominantFreq(rrBand, FPS, 0.15, 0.5);
      const hr      = Math.round(hrFreq * 60);
      const rr      = Math.round(rrFreq * 60);
      onLog?.(`POS result: HR=${hr} bpm  RR=${rr}/min`);
      console.log(`[VitalLens/POS] HR=${hr}bpm RR=${rr}/min`);
      setMethod('pos');
      return { hr, rr, method: 'pos' };
    } catch (err) {
      console.warn('[VitalLens/POS] analysis error:', err);
      setMethod('pos');
      return { hr: null, rr: null, method: 'pos' };
    }
  }, []);

  return { startScan, stopScan, scanning, method };
}