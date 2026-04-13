/**
 * VitalLensTestScreen — rPPG diagnostic for HunchDoctor
 *
 * Three panels:
 *  ① SDK Status      — which library/method works & why, proxy architecture
 *  ② CORS Diagnosis  — confirms api.rouast.com is CORS-blocked in browser
 *  ③ Scan            — runs a real scan via /api/vitallens-proxy (DL) with
 *                       automatic POS fallback; live green-channel waveform
 *
 * Route: /vitallens-test
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router';
import {
  ArrowLeft, Activity, CheckCircle, XCircle,
  RefreshCw, Wifi, WifiOff, Server, Cpu, Zap,
  UploadCloud, ChevronRight,
} from 'lucide-react';
// VitalLens API key is server-side only — no client-side import needed
import { useVitalLens, proxyHealthCheck } from './useVitalLens';

// ── Constants ─────────────────────────────────────────────────────────────────
const DIRECT_API_URL = 'https://api.rouast.com/vitallens-v3/file';
const RECORD_SEC     = 30;
const FPS            = 30;
const WAVEFORM_LEN   = 240;

// VitalLens API key is now server-side only (set via VITALLENS_API_KEY env var on Vercel).
// This diagnostic screen checks proxy health instead of displaying the raw key.

// ── Types ─────────────────────────────────────────────────────────────────────
type Phase =
  | 'idle' | 'cors-check' | 'proxy-check'
  | 'opening-camera' | 'scanning' | 'uploading' | 'done' | 'error';

// ── Component ─────────────────────────────────────────────────────────────────
export function VitalLensTestScreen() {
  const navigate = useNavigate();
  const { startScan, stopScan, scanning } = useVitalLens();

  const [phase,      setPhase]      = useState<Phase>('idle');
  const [elapsed,    setElapsed]    = useState(0);
  const [logLines,   setLogLines]   = useState<string[]>([]);
  const [errorMsg,   setErrorMsg]   = useState('');
  const [corsStatus, setCorsStatus] = useState<'unknown' | 'blocked' | 'open'>('unknown');
  const [corsDetail, setCorsDetail] = useState('');
  const [proxyOk,    setProxyOk]    = useState<boolean | null>(null);
  const [hr,         setHr]         = useState<number | null>(null);
  const [rr,         setRr]         = useState<number | null>(null);
  const [resultMethod, setResultMethod] = useState<'api' | 'pos' | null>(null);
  const [waveform,   setWaveform]   = useState<number[]>([]);

  const videoRef    = useRef<HTMLVideoElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const waveTimerRef= useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef   = useRef<HTMLCanvasElement | null>(null);
  const abortRef    = useRef(false);
  const startRef    = useRef(0);

  // log helper
  const log = useCallback((msg: string, kind: 'info' | 'ok' | 'warn' | 'err' = 'info') => {
    const ts = new Date().toISOString().slice(11, 23);
    const p  = { info: '', ok: '✓ ', warn: '⚠ ', err: '✗ ' }[kind];
    setLogLines(l => [`[${ts}] ${p}${msg}`, ...l].slice(0, 80));
  }, []);

  const cleanup = useCallback(() => {
    abortRef.current = true;
    if (timerRef.current)     { clearInterval(timerRef.current);     timerRef.current = null; }
    if (waveTimerRef.current) { clearInterval(waveTimerRef.current); waveTimerRef.current = null; }
    if (streamRef.current)    { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (videoRef.current)     videoRef.current.srcObject = null;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  // ── CORS check ──────────────────────────────────────────────────────────────
  const runCorsCheck = useCallback(async () => {
    abortRef.current = false;
    setPhase('cors-check');
    setLogLines([]);
    setCorsStatus('unknown');
    setCorsDetail('');

    log(`POST → ${DIRECT_API_URL}`);
    log('No CORS headers expected (server-side-only API)');

    try {
      const res = await fetch(DIRECT_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const txt = await res.text();
      log(`HTTP ${res.status}`, res.ok ? 'ok' : 'warn');
      if (res.status === 400 || res.status === 401 || res.status === 422) {
        setCorsStatus('open');
        setCorsDetail(`CORS headers present — API reachable (HTTP ${res.status}: ${txt.slice(0, 60)})`);
      } else {
        setCorsStatus('open');
        setCorsDetail(`HTTP ${res.status}: ${txt.slice(0, 80)}`);
      }
    } catch (err) {
      log(`${err}`, 'err');
      setCorsStatus('blocked');
      setCorsDetail('No Access-Control-Allow-Origin — API is server-side only. Use /api/vitallens-proxy.');
    }
    setPhase('idle');
  }, [log]);

  // ── Proxy health check ──────────────────────────────────────────────────────
  const runProxyCheck = useCallback(async () => {
    setPhase('proxy-check');
    log('Checking /api/vitallens-proxy…');
    const ok = await proxyHealthCheck();
    setProxyOk(ok);
    if (ok) {
      log('Proxy is reachable ✓', 'ok');
    } else {
      log('Proxy unreachable — deploy to Vercel + set VITALLENS_API_KEY env var', 'warn');
    }
    setPhase('idle');
  }, [log]);

  // ── Main scan ───────────────────────────────────────────────────────────────
  const runScan = useCallback(async () => {
    abortRef.current = false;
    cleanup();
    setPhase('idle');
    setElapsed(0);
    setErrorMsg('');
    setHr(null);
    setRr(null);
    setResultMethod(null);
    setWaveform([]);
    setLogLines([]);

    // 1. Open camera
    setPhase('opening-camera');
    log('Requesting camera…');

    let stream: MediaStream;
    try {
      const p = navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 }, audio: false });
      const t = new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error('getUserMedia timed out — camera may be blocked')), 10000));
      stream = await Promise.race([p, t]);
    } catch (err) {
      log(`${err}`, 'err');
      setErrorMsg(`${err}`);
      setPhase('error');
      return;
    }

    if (abortRef.current) { stream.getTracks().forEach(t => t.stop()); return; }
    streamRef.current = stream;

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      try { await videoRef.current.play(); } catch { /* autoplay policy */ }
    }
    log(`Camera open — ${stream.getVideoTracks()[0]?.getSettings().width}×${stream.getVideoTracks()[0]?.getSettings().height}`, 'ok');

    // 2. Arm both paths in useVitalLens
    await startScan(videoRef.current!, stream);
    log('Both paths armed: MediaRecorder (API) + POS sampler (fallback)', 'ok');

    // 3. Live green-channel waveform from offscreen canvas
    const wCanvas = document.createElement('canvas');
    wCanvas.width = 40; wCanvas.height = 40;
    canvasRef.current = wCanvas;
    const wCtx = wCanvas.getContext('2d')!;

    waveTimerRef.current = setInterval(() => {
      const vid = videoRef.current;
      if (!vid || vid.videoWidth === 0) return;
      try {
        const vw = vid.videoWidth, vh = vid.videoHeight;
        wCtx.drawImage(vid, vw * 0.25, vh * 0.1, vw * 0.5, vh * 0.8, 0, 0, 40, 40);
        const { data } = wCtx.getImageData(0, 0, 40, 40);
        let g = 0;
        for (let i = 0; i < data.length; i += 4) g += data[i + 1];
        setWaveform(w => [...w, g / (data.length / 4)].slice(-WAVEFORM_LEN));
      } catch { /* ignore */ }
    }, 1000 / FPS);

    // 4. Countdown timer
    setPhase('scanning');
    startRef.current = Date.now();

    timerRef.current = setInterval(() => {
      const s = Math.floor((Date.now() - startRef.current) / 1000);
      setElapsed(s);
      if (s >= RECORD_SEC && !abortRef.current) {
        clearInterval(timerRef.current!);  timerRef.current = null;
        clearInterval(waveTimerRef.current!); waveTimerRef.current = null;
        handleScanComplete();
      }
    }, 250);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanup, log, startScan]);

  const handleScanComplete = useCallback(async () => {
    if (abortRef.current) return;

    // Stop camera immediately for privacy
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;

    setPhase('uploading');
    log('Scan complete — stopping recorder, calling proxy…');

    try {
      const result = await stopScan((msg) => log(msg));

      if (result.method === 'api') {
        log(`VitalLens DL: HR=${result.hr} bpm  RR=${result.rr}/min`, 'ok');
      } else {
        log(`POS fallback: HR=${result.hr} bpm  RR=${result.rr}/min`, 'ok');
      }

      setHr(result.hr);
      setRr(result.rr);
      setResultMethod(result.method);
      setPhase('done');
    } catch (err) {
      log(`${err}`, 'err');
      setErrorMsg(`${err}`);
      setPhase('error');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log, stopScan]);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const busy      = ['opening-camera', 'scanning', 'uploading'].includes(phase);
  const recPct    = Math.min(100, Math.round((elapsed / RECORD_SEC) * 100));
  const remaining = Math.max(0, RECORD_SEC - elapsed);

  const phaseColor: Record<Phase, string> = {
    idle: 'rgba(255,255,255,0.2)', 'cors-check': '#A78BFA', 'proxy-check': '#A78BFA',
    'opening-camera': '#F6AD55', scanning: '#4FD1C5',
    uploading: '#A78BFA', done: '#68D391', error: '#D96B6B',
  };
  const phaseLabel: Record<Phase, string> = {
    idle: 'Ready', 'cors-check': 'Checking CORS…', 'proxy-check': 'Checking proxy…',
    'opening-camera': 'Opening camera…',
    scanning: `Recording — ${remaining}s left (${recPct}%)`,
    uploading: 'Uploading + running DL model…',
    done: 'Complete', error: 'Error',
  };

  // SVG waveform
  const wH = 56, wW = 380;
  const wavePoints = (() => {
    if (waveform.length < 2) return '';
    const mn = Math.min(...waveform), mx = Math.max(...waveform), range = mx - mn || 1;
    return waveform.map((v, i) => {
      const x = (i / (waveform.length - 1)) * wW;
      const y = wH - (((v - mn) / range) * (wH - 8) + 4);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  })();

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#07070d', color: 'white', fontFamily: 'Inter,sans-serif', overflowY: 'auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => { cleanup(); navigate('/'); }}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: 0 }}>
            <ArrowLeft size={15} /><span style={{ fontSize: 12 }}>Home</span>
          </button>
          <span style={{ color: 'rgba(255,255,255,0.1)' }}>·</span>
          <span style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>rPPG Diagnostic</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', borderRadius: 99, padding: '3px 10px',
            color: '#68D391',
            background: 'rgba(104,211,145,0.08)',
            border: '1px solid rgba(104,211,145,0.2)',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <CheckCircle size={10} />
            key: server-side only
          </span>
        </div>
      </div>

      <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 1140, margin: '0 auto' }}>

        {/* ── LEFT COLUMN ───────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* ① SDK Status */}
          <Card title="① Which Client Library Works?">
            {/* Answer banner */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8,
              background: 'rgba(79,209,197,0.06)', border: '1px solid rgba(79,209,197,0.2)', marginBottom: 4,
            }}>
              <CheckCircle size={13} color="#4FD1C5" style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: '#4FD1C5', lineHeight: 1.5 }}>
                <strong>JavaScript Client</strong> — "Run VitalLens in browser or Node.js"
              </span>
            </div>
            <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', margin: '0 0 10px 0', lineHeight: 1.6 }}>
              Python = server-side only · iOS = Swift · Direct API = CORS-blocked in every browser
            </p>

            {/* Method matrix */}
            {[
              { icon: <Zap size={10} />, method: 'method: "vitallens"', tag: 'DL model', tagColor: '#A78BFA', status: 'proxy ✓', statusColor: '#68D391', why: 'State-of-art accuracy. Needs API — CORS-blocked direct. Works via /api/vitallens-proxy.' },
              { icon: <Cpu size={10} />, method: 'method: "pos"',       tag: 'local',    tagColor: '#4FD1C5', status: 'npm bug', statusColor: '#F6AD55', why: 'No API needed. npm@0.4.x missing worker.js in dist/ — Vite crashes. We re-implement manually.' },
              { icon: <Cpu size={10} />, method: 'method: "chrom"',     tag: 'local',    tagColor: '#4FD1C5', status: 'npm bug', statusColor: '#F6AD55', why: 'Same algorithm family. Same missing-worker.js issue.' },
              { icon: <Cpu size={10} />, method: 'Manual POS (ours)',    tag: 'fallback', tagColor: '#68D391', status: '✓ live',  statusColor: '#68D391', why: 'Identical Wang 2017 physics. Runs client-side, zero deps. Used when proxy unavailable.' },
            ].map(({ icon, method, tag, tagColor, status, statusColor, why }, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '1fr auto', gap: 6,
                padding: '7px 9px', borderRadius: 6,
                background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)',
                marginBottom: 3,
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                    <span style={{ color: tagColor, opacity: 0.6 }}>{icon}</span>
                    <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,255,255,0.6)' }}>{method}</span>
                    <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 99, background: `${tagColor}18`, border: `1px solid ${tagColor}33`, color: tagColor }}>{tag}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 9, color: 'rgba(255,255,255,0.22)', lineHeight: 1.5 }}>{why}</p>
                </div>
                <span style={{
                  fontSize: 9, padding: '2px 8px', borderRadius: 99, height: 'fit-content', alignSelf: 'center',
                  background: `${statusColor}11`, border: `1px solid ${statusColor}33`, color: statusColor, whiteSpace: 'nowrap',
                }}>{status}</span>
              </div>
            ))}

            {/* worker.js note */}
            <div style={{ marginTop: 6, padding: '7px 10px', borderRadius: 6, background: 'rgba(246,173,85,0.04)', border: '1px solid rgba(246,173,85,0.14)' }}>
              <p style={{ margin: 0, fontSize: 9, color: 'rgba(246,173,85,0.65)', lineHeight: 1.6 }}>
                <strong>npm bug detail:</strong>{' '}
                <code style={{ fontFamily: 'monospace', fontSize: 8 }}>vitallens@0.4.x</code> references{' '}
                <code style={{ fontFamily: 'monospace', fontSize: 8 }}>new Worker(new URL("./worker.js", …))</code>{' '}
                but <code style={{ fontFamily: 'monospace', fontSize: 8 }}>worker.js</code> is missing from dist/.
                The face-detection worker IS inlined (base64 data URL — fine). The missing file is TensorFlow.js's WebGL backend worker.
              </p>
            </div>
          </Card>

          {/* ② Architecture diagram */}
          <Card title="② Proxy Architecture (what we implemented)">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {/* Browser box */}
              <ArchBox color="#4FD1C5" label="Browser" icon={<Activity size={11} />}>
                MediaRecorder → WebM blob → POST /api/vitallens-proxy?endpoint=file
              </ArchBox>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 16px' }}>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
                <ChevronRight size={10} color="rgba(255,255,255,0.2)" />
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
              </div>
              {/* Proxy box */}
              <ArchBox color="#A78BFA" label="Vercel Edge Function" icon={<Server size={11} />}>
                Injects x-api-key from env · CORS headers · Streams body to api.rouast.com
              </ArchBox>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 16px' }}>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
                <ChevronRight size={10} color="rgba(255,255,255,0.2)" />
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
              </div>
              {/* VitalLens box */}
              <ArchBox color="#F6AD55" label="api.rouast.com/vitallens-v3/file" icon={<Zap size={11} />}>
                DL model → {'{'} vitals: {'{'} heart_rate: {'{'} value, confidence {'}'} {'}'} {'}'}
              </ArchBox>
            </div>
            <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p style={{ margin: 0, fontSize: 9, color: 'rgba(255,255,255,0.25)', lineHeight: 1.6 }}>
                Fallback: if proxy unreachable → local POS algorithm runs automatically.<br />
                Env var needed on Vercel: <code style={{ fontFamily: 'monospace', fontSize: 8 }}>VITALLENS_API_KEY</code>
              </p>
            </div>
          </Card>

          {/* ② CORS check */}
          <Card title="③ CORS Diagnosis — Direct API (no camera)">
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', margin: '0 0 8px 0', lineHeight: 1.6 }}>
              Confirms api.rouast.com does not send CORS headers. Expected result:{' '}
              <span style={{ color: '#F6AD55' }}>BLOCKED</span>.
            </p>
            {corsStatus !== 'unknown' && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', borderRadius: 8, marginBottom: 8,
                background: corsStatus === 'blocked' ? 'rgba(246,173,85,0.06)' : 'rgba(104,211,145,0.06)',
                border: `1px solid ${corsStatus === 'blocked' ? 'rgba(246,173,85,0.18)' : 'rgba(104,211,145,0.18)'}`,
              }}>
                {corsStatus === 'blocked'
                  ? <WifiOff size={12} color="#F6AD55" style={{ flexShrink: 0, marginTop: 1 }} />
                  : <Wifi size={12} color="#68D391" style={{ flexShrink: 0, marginTop: 1 }} />}
                <span style={{ fontSize: 10, color: corsStatus === 'blocked' ? '#F6AD55' : '#68D391', lineHeight: 1.55 }}>{corsDetail}</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn onClick={runCorsCheck} disabled={phase !== 'idle'} icon={<WifiOff size={12} />}>
                Check Direct CORS
              </Btn>
              <Btn onClick={runProxyCheck} disabled={phase !== 'idle'} icon={<Server size={12} />} color="#A78BFA">
                {proxyOk === null ? 'Check Proxy' : proxyOk ? '✓ Proxy OK' : '✗ Proxy offline'}
              </Btn>
            </div>
          </Card>
        </div>

        {/* ── RIGHT COLUMN ──────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Camera preview */}
          <div style={{
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 12, overflow: 'hidden', position: 'relative', aspectRatio: '4/3',
          }}>
            <video ref={videoRef} autoPlay muted playsInline
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transform: 'scaleX(-1)' }} />

            {phase !== 'scanning' && phase !== 'uploading' && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 8,
                background: 'rgba(7,7,13,0.85)', backdropFilter: 'blur(4px)',
              }}>
                <Activity size={22} color={phase === 'done' ? '#68D391' : phase === 'error' ? '#D96B6B' : 'rgba(255,255,255,0.1)'} />
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.18)', letterSpacing: 1.5 }}>
                  {phase === 'done' ? 'Scan complete'
                    : phase === 'error' ? 'Error'
                    : 'Camera opens on scan start'}
                </span>
              </div>
            )}

            {phase === 'scanning' && (
              <>
                <div style={{
                  position: 'absolute', left: '25%', top: '10%', width: '50%', height: '80%',
                  border: '1px solid rgba(79,209,197,0.35)', borderRadius: 8, pointerEvents: 'none',
                }} />
                <div style={{
                  position: 'absolute', top: 10, left: 10, display: 'flex', alignItems: 'center', gap: 6,
                  background: 'rgba(0,0,0,0.65)', borderRadius: 99, padding: '4px 10px 4px 8px',
                }}>
                  <motion.div animate={{ opacity: [1, 0.2, 1] }} transition={{ repeat: Infinity, duration: 1 }}
                    style={{ width: 6, height: 6, borderRadius: '50%', background: '#D96B6B' }} />
                  <span style={{ fontSize: 10, letterSpacing: 2, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>
                    REC {remaining}s
                  </span>
                </div>
                <div style={{
                  position: 'absolute', top: 10, right: 10, fontSize: 9, fontFamily: 'monospace',
                  color: 'rgba(255,255,255,0.3)', background: 'rgba(0,0,0,0.5)', borderRadius: 4, padding: '2px 6px',
                }}>
                  {Math.min(elapsed * FPS, 900)} frames
                </div>
              </>
            )}

            {phase === 'uploading' && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 10,
                background: 'rgba(7,7,13,0.75)', backdropFilter: 'blur(6px)',
              }}>
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}>
                  <UploadCloud size={28} color="#A78BFA" />
                </motion.div>
                <span style={{ fontSize: 11, color: '#A78BFA', letterSpacing: 1.5 }}>Running DL model…</span>
              </div>
            )}
          </div>

          {/* Waveform */}
          <Card title="Live green-channel signal (face ROI)">
            <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 8, overflow: 'hidden', height: 62 }}>
              {wavePoints
                ? <svg width="100%" height={wH} viewBox={`0 0 ${wW} ${wH}`} preserveAspectRatio="none" style={{ display: 'block' }}>
                    <path d={wavePoints} fill="none" stroke="#4FD1C5" strokeWidth="1.5" strokeLinejoin="round" />
                  </svg>
                : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.1)', letterSpacing: 2 }}>waveform appears during scan</span>
                  </div>
              }
            </div>
          </Card>

          {/* Scan controls */}
          <Card title="④ Scan — VitalLens DL + POS Fallback">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <motion.div animate={busy ? { opacity: [1, 0.3, 1] } : { opacity: 1 }} transition={{ repeat: Infinity, duration: 1.4 }}
                  style={{ width: 7, height: 7, borderRadius: '50%', background: phaseColor[phase] }} />
                <span style={{ fontSize: 11, color: phaseColor[phase] }}>{phaseLabel[phase]}</span>
              </div>
            </div>

            {phase === 'scanning' && (
              <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden', marginBottom: 10 }}>
                <motion.div style={{ height: '100%', borderRadius: 3, background: '#4FD1C5' }}
                  animate={{ width: `${recPct}%` }} transition={{ duration: 0.3, ease: 'linear' }} />
              </div>
            )}

            {errorMsg && (
              <div style={{
                fontSize: 11, color: '#D96B6B', background: 'rgba(217,107,107,0.07)',
                border: '1px solid rgba(217,107,107,0.18)', borderRadius: 8, padding: '8px 12px', marginBottom: 10, lineHeight: 1.55,
              }}>
                {errorMsg}
                {errorMsg.includes('iframe') && (
                  <p style={{ marginTop: 6, fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
                    Open in a standalone tab for camera access.
                  </p>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <motion.button whileTap={{ scale: 0.97 }} onClick={runScan} disabled={busy}
                style={{
                  flex: 1, height: 42, borderRadius: 999, cursor: busy ? 'not-allowed' : 'pointer',
                  background: 'rgba(79,209,197,0.09)', border: '1px solid rgba(79,209,197,0.24)',
                  color: '#4FD1C5', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  opacity: busy ? 0.4 : 1,
                }}>
                {phase === 'done' || phase === 'error'
                  ? <><RefreshCw size={13} /> Run again</>
                  : <><Activity size={13} /> Start {RECORD_SEC}s scan</>}
              </motion.button>
              {busy && (
                <motion.button whileTap={{ scale: 0.97 }} onClick={() => { cleanup(); setPhase('idle'); }}
                  style={{
                    height: 42, paddingInline: 16, borderRadius: 999, cursor: 'pointer',
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)',
                    color: 'rgba(255,255,255,0.4)', fontSize: 13,
                  }}>
                  Cancel
                </motion.button>
              )}
            </div>
          </Card>

          {/* Results */}
          <Card title="Results">
            {resultMethod && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 6, marginBottom: 8,
                background: resultMethod === 'api' ? 'rgba(167,139,250,0.07)' : 'rgba(79,209,197,0.07)',
                border: `1px solid ${resultMethod === 'api' ? 'rgba(167,139,250,0.2)' : 'rgba(79,209,197,0.2)'}`,
              }}>
                {resultMethod === 'api' ? <Zap size={11} color="#A78BFA" /> : <Cpu size={11} color="#4FD1C5" />}
                <span style={{ fontSize: 10, color: resultMethod === 'api' ? '#A78BFA' : '#4FD1C5' }}>
                  {resultMethod === 'api' ? 'VitalLens DL model (via proxy)' : 'POS local algorithm (fallback)'}
                </span>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <ReadingBox label="Heart Rate" value={hr} unit="bpm" color="#D96B6B" min={40} max={200} />
              <ReadingBox label="Resp. Rate" value={rr} unit="/min" color="#4FD1C5" min={8} max={30} />
            </div>
          </Card>

          {/* Log */}
          <Card title="Log">
            <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {logLines.length === 0
                ? <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.1)', fontFamily: 'monospace' }}>— waiting —</span>
                : logLines.map((l, i) => (
                  <span key={i} style={{
                    fontSize: 10, fontFamily: 'monospace', whiteSpace: 'pre-wrap', lineHeight: 1.5,
                    color: l.includes('✓') ? 'rgba(104,211,145,0.7)'
                      : l.includes('✗') ? 'rgba(217,107,107,0.7)'
                      : l.includes('⚠') ? 'rgba(246,173,85,0.7)'
                      : 'rgba(255,255,255,0.25)',
                  }}>{l}</span>
                ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '14px 16px' }}>
      {title && <p style={{ fontSize: 9, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)', margin: '0 0 10px 0' }}>{title}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
    </div>
  );
}

function ArchBox({ label, color, icon, children }: { label: string; color: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ padding: '8px 12px', borderRadius: 8, background: `${color}08`, border: `1px solid ${color}22` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ color }}>{icon}</span>
        <span style={{ fontSize: 10, color, letterSpacing: 1 }}>{label}</span>
      </div>
      <p style={{ margin: 0, fontSize: 9, color: 'rgba(255,255,255,0.3)', lineHeight: 1.6, fontFamily: 'monospace' }}>{children}</p>
    </div>
  );
}

function Btn({
  onClick, disabled, icon, color = '#4FD1C5', children,
}: {
  onClick: () => void; disabled?: boolean; icon?: React.ReactNode; color?: string; children: React.ReactNode;
}) {
  return (
    <motion.button whileTap={{ scale: 0.97 }} onClick={onClick} disabled={disabled}
      style={{
        height: 36, borderRadius: 999, cursor: disabled ? 'not-allowed' : 'pointer',
        background: `${color}0d`, border: `1px solid ${color}2a`,
        color, fontSize: 11, display: 'flex', alignItems: 'center', gap: 6, padding: '0 14px',
        opacity: disabled ? 0.4 : 1,
      }}>
      {icon}{children}
    </motion.button>
  );
}

function ReadingBox({ label, value, unit, color, min, max }: {
  label: string; value: number | null; unit: string; color: string; min: number; max: number;
}) {
  const inRange = value !== null && value >= min && value <= max;
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: `1px solid ${inRange ? color + '44' : 'rgba(255,255,255,0.06)'}`,
      borderRadius: 10, padding: '12px 14px', textAlign: 'center',
    }}>
      <p style={{ fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', margin: '0 0 6px 0' }}>{label}</p>
      <AnimatePresence mode="wait">
        {value !== null
          ? <motion.div key={value} initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4 }}>
              <span style={{ fontSize: 32, color: inRange ? color : 'rgba(255,255,255,0.4)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>{unit}</span>
            </motion.div>
          : <motion.span key="dash" style={{ fontSize: 24, color: 'rgba(255,255,255,0.1)' }}>—</motion.span>
        }
      </AnimatePresence>
      {value !== null && (
        <p style={{ fontSize: 8, margin: '4px 0 0 0', color: inRange ? color : 'rgba(255,255,255,0.2)' }}>
          {inRange ? `✓ normal (${min}–${max})` : `⚠ outside ${min}–${max}`}
        </p>
      )}
    </div>
  );
}
