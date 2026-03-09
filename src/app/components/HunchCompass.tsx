import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate, useLocation } from 'react-router';
import { Settings, Camera, CameraOff, Mic, X, FlaskConical } from 'lucide-react';
import { useApp } from '../store';
import { useFaceDetection, type FaceDetectionStatus } from './useFaceDetection';
import { useVitalLens } from './useVitalLens';
import { CompassWeb } from './CompassWeb';
import { AvatarOrb } from './AvatarOrb';
import {
  generateSignals,
  getRandomInsight,
  getRandomNarrative,
  getMockHR,
  getMockRR,
  SIGNAL_CONFIG,
  DEEP_INSIGHTS,
  type SignalValues,
  type SignalName,
} from './signals';
import { useClaudeInsight } from './useClaudeInsight';
import { EMOTION_TO_SIGNAL } from './useHumeVoice';

// ── Prosody scores → signal vector ───────────────────────────────────────────
// Converts Hume's 48-emotion probability map into the 5 taste-signal space
// so prosody can be blended at the signal level, not just forwarded as text.
function prosodyToSignalVector(prosodyScores: Record<string, number>): SignalValues {
  const vec: SignalValues = { sweet: 0, sour: 0, bitter: 0, salt: 0, umami: 0 };
  let mapped = 0;
  for (const [emotion, score] of Object.entries(prosodyScores)) {
    const sig = EMOTION_TO_SIGNAL[emotion];
    if (sig) { vec[sig] += score; mapped += score; }
  }
  // Normalise by total mapped weight so the vector sums to ~1 across channels
  if (mapped > 0) {
    for (const key of Object.keys(vec) as SignalName[]) vec[key] /= mapped;
  }
  console.log('[HunchCompass] prosody signal vector:', vec);
  return vec;
}

// ── 3-way signal fusion ───────────────────────────────────────────────────────
// face (real camera):  65%  prosody vector: 35%
// face (mock/no cam):  30%  prosody vector: 70%   ← prosody dominates when face unavailable
// no prosody:          face-only or mock-only
function fuseAllSources(
  faceSignals: SignalValues,
  faceIsReal: boolean,
  prosodyScores: Record<string, number> | null,
): { signals: SignalValues; dominant: SignalName; fusionNote: string } {
  const prosodyVec = prosodyScores ? prosodyToSignalVector(prosodyScores) : null;

  let fused = { ...faceSignals };
  let fusionNote = faceIsReal ? 'face-only (live)' : 'face-only (estimated)';

  if (prosodyVec) {
    const fW = faceIsReal ? 0.65 : 0.30;
    const pW = faceIsReal ? 0.35 : 0.70;
    for (const key of Object.keys(fused) as SignalName[]) {
      fused[key] = faceSignals[key] * fW + prosodyVec[key] * pW;
    }
    fusionNote = faceIsReal
      ? `face 65% + prosody 35%`
      : `estimated-face 30% + prosody 70%`;
  }

  const dominant = (Object.entries(fused) as [SignalName, number][])
    .sort((a, b) => b[1] - a[1])[0][0];

  console.log('[HunchCompass] fusion:', { fusionNote, dominant, fused });
  return { signals: fused, dominant, fusionNote };
}

function getScanLabel(status: FaceDetectionStatus, modelsLoaded: boolean): string {
  if (!modelsLoaded) return 'LOADING MODELS';
  switch (status) {
    case 'loading-models': return 'LOADING MODELS';
    case 'requesting-camera': return 'OPENING CAMERA';
    case 'scanning': return 'READING SIGNALS';
    case 'no-face': return 'ESTIMATING SIGNALS';
    case 'camera-denied': return 'ESTIMATING SIGNALS';
    case 'error': return 'ESTIMATING SIGNALS';
    default: return 'SENSING';
  }
}

export function HunchCompass() {
  const navigate = useNavigate();
  const location = useLocation();
  // voiceSignal + prosodyScores arrive via React Router state from VoiceScreen
  const routeState = (location.state as { voiceSignal?: SignalName | null; prosodyScores?: Record<string, number> | null } | null);
  const voiceSignal: SignalName | null = routeState?.voiceSignal ?? null;
  const prosodyScores: Record<string, number> | null = routeState?.prosodyScores ?? null;

  const { addJournalEntry } = useApp();
  const { status: faceStatus, modelsLoaded, videoRef, streamRef, scan, stopCamera } = useFaceDetection();
  const { startScan: startVitalScan, stopScan: stopVitalScan } = useVitalLens();
  const { insight: claudeInsight, loading: claudeLoading, generate: generateInsight } = useClaudeInsight();

  const [phase, setPhase] = useState<'pre-scan' | 'scanning' | 'revealed'>('pre-scan');
  const [scanSubLabel, setScanSubLabel] = useState('');  // "READING SIGNALS" / "MEASURING VITALS"
  const [signals, setSignals] = useState<SignalValues>({ sweet: 0.08, sour: 0.08, bitter: 0.08, salt: 0.08, umami: 0.08 });
  const [dominantSignal, setDominantSignal] = useState<SignalName | null>(null);
  const [insight, setInsight] = useState('');
  const [hr, setHr] = useState(0);
  const [rr, setRr] = useState(0);
  const [showDeep, setShowDeep] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [usedCamera, setUsedCamera] = useState(false);
  const [dominantExpression, setDominantExpression] = useState<string | null>(null);
  const [expressionScores, setExpressionScores] = useState<Record<string, number> | null>(null);
  const [cameraLive, setCameraLive] = useState(false);
  const [voiceFused, setVoiceFused] = useState(false);
  const [fusionNote, setFusionNote] = useState('');
  const [hrIsReal, setHrIsReal] = useState(false);
  const [rrIsReal, setRrIsReal] = useState(false);
  // Audit panel toggle
  const [showAudit, setShowAudit] = useState(false);

  const hasScanned = useRef(false);

  // ── Camera permission awareness ────────────────────────────────────────────
  // getUserMedia MUST be called inside a user-gesture stack when permission
  // hasn't been granted yet. We check the Permissions API on mount so we know
  // whether we can auto-fire or need one tap to create the gesture context.
  const [cameraPermission, setCameraPermission] = useState<
    'checking' | 'granted' | 'needs-gesture' | 'denied'
  >('checking');

  useEffect(() => {
    if (!navigator.permissions) {
      // Permissions API not supported — assume we need a gesture to be safe
      setCameraPermission('needs-gesture');
      return;
    }
    navigator.permissions
      .query({ name: 'camera' as PermissionName })
      .then(result => {
        if (result.state === 'granted') {
          setCameraPermission('granted');
        } else if (result.state === 'denied') {
          setCameraPermission('denied');
        } else {
          // 'prompt' — first-time ask; need user gesture so the browser shows
          // the permission dialog instead of immediately throwing NotAllowedError
          setCameraPermission('needs-gesture');
        }
        // React to live permission changes (e.g. user revokes mid-session)
        result.onchange = () => {
          setCameraPermission(
            result.state === 'granted' ? 'granted'
              : result.state === 'denied' ? 'denied'
                : 'needs-gesture'
          );
        };
      })
      .catch(() => setCameraPermission('needs-gesture'));
  }, []);

  // Derive cameraLive directly from faceStatus — no event listeners needed
  // faceStatus becomes 'scanning' the instant video.play() succeeds in the hook
  useEffect(() => {
    setCameraLive(faceStatus === 'scanning');
  }, [faceStatus]);

  // Start VitalLens as soon as the camera feed is live
  useEffect(() => {
    if (faceStatus === 'scanning' && videoRef.current) {
      startVitalScan(videoRef.current, streamRef.current ?? undefined);
    }
  }, [faceStatus, videoRef, streamRef, startVitalScan]);

  const runScan = useCallback(async (skipCamera = false) => {
    if (hasScanned.current) return;
    hasScanned.current = true;
    setPhase('scanning');

    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

    // ── Timing constants ─────────────────────────────────────────────────────
    // Phase 1: face-api multi-frame sampling  (~6.5 s: 2 s warmup + 8 × 500 ms)
    // Phase 2: VitalLens-only hold            (~38.5 s, camera stays open)
    // Total camera-open target:               ~45 s → reliable rPPG window
    const FACE_PHASE_MS = 6500;   // rough face-scan duration (for progress bar)
    const TOTAL_SCAN_MS = 45000;  // total camera-open target

    const scanStartTime = Date.now();

    // Progress bar: 0–55% during face phase, 55–95% during vitals hold, 100% at end
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - scanStartTime;
      if (elapsed < FACE_PHASE_MS) {
        setScanProgress(Math.round((elapsed / FACE_PHASE_MS) * 55));
      } else {
        const vitalsElapsed = elapsed - FACE_PHASE_MS;
        const vitalsDuration = TOTAL_SCAN_MS - FACE_PHASE_MS;
        setScanProgress(55 + Math.round(Math.min(40, (vitalsElapsed / vitalsDuration) * 40)));
      }
    }, 120);

    let resultSignals: SignalValues;
    let resultDominant: SignalName;
    let expr: string | null = null;
    let exprScores: Record<string, number> | null = null;
    let faceIsReal = false;
    let note = '';

    // ── Phase 1: face-api expression sampling ────────────────────────────────
    // scan() no longer closes the camera — it returns with the stream still live.
    setScanSubLabel('READING SIGNALS');
    const faceResult = skipCamera ? null : await scan();

    if (faceResult) {
      faceIsReal = true;
      expr = faceResult.dominantExpression;
      exprScores = faceResult.expressionScores;
      setUsedCamera(true);
      if (prosodyScores) setVoiceFused(true);
      console.log('[HunchCompass] face phase done — camera still live for VitalLens');
    }

    // ── Phase 2: VitalLens hold ───────────────────────────────────────────────
    // Keep camera open until TOTAL_SCAN_MS has elapsed from scan start.
    // VitalLens was already started by the useEffect when faceStatus → 'scanning'.
    if (!skipCamera) {
      const elapsed = Date.now() - scanStartTime;
      const remaining = TOTAL_SCAN_MS - elapsed;
      if (remaining > 500) {
        setScanSubLabel('MEASURING VITALS');
        console.log(`[HunchCompass] VitalLens phase — waiting ${Math.round(remaining / 1000)}s more`);
        await new Promise(r => setTimeout(r, remaining));
      }
      // Now close the camera so VitalLens stops receiving frames
      stopCamera();
    }

    // ── Collect vitals ────────────────────────────────────────────────────────
    const vitalResult = skipCamera ? { hr: null, rr: null } : await stopVitalScan();

    const realHr = vitalResult.hr ? Math.round(vitalResult.hr) : null;
    const realRr = vitalResult.rr ? Math.round(vitalResult.rr) : null;
    const newHr = realHr ?? getMockHR();
    const newRr = realRr ?? getMockRR();
    setHrIsReal(realHr !== null);
    setRrIsReal(realRr !== null);
    console.log(`[HunchCompass] vitals — HR: ${realHr ?? `est(${newHr})`}, RR: ${realRr ?? `est(${newRr})`}`);

    // ── Signal fusion ─────────────────────────────────────────────────────────
    if (faceResult) {
      const { signals: fused, dominant, fusionNote: fn } = fuseAllSources(
        faceResult.signals, true, prosodyScores,
      );
      resultSignals = fused;
      resultDominant = dominant;
      note = fn;
    } else {
      // No face — use mock base, let prosody dominate if available
      const mock = generateSignals();
      const { signals: fused, dominant, fusionNote: fn } = fuseAllSources(
        mock.signals, false, prosodyScores,
      );
      resultSignals = fused;
      resultDominant = dominant;
      note = fn;
      if (prosodyScores) setVoiceFused(true);
    }

    // ── Reveal ────────────────────────────────────────────────────────────────
    clearInterval(progressInterval);
    setScanProgress(100);
    setCameraLive(false);
    setScanSubLabel('');
    setSignals(resultSignals);
    setDominantSignal(resultDominant);
    setInsight(getRandomInsight(resultDominant));
    setHr(newHr);
    setRr(newRr);
    setDominantExpression(expr);
    setExpressionScores(exprScores);
    setFusionNote(note);
    setPhase('revealed');

    // Count prosody turns for Claude's data-quality note
    const prosodyTurns = prosodyScores
      ? Object.keys(prosodyScores).length > 0 ? 1 : 0
      : 0;

    // Fire Claude insight generation — non-blocking
    generateInsight({
      dominantSignal: resultDominant,
      signals: resultSignals,
      hr: newHr,
      rr: newRr,
      expression: expr,
      expressionScores: exprScores,
      voiceSignal: voiceSignal ?? undefined,
      prosodyScores,
      dataSources: {
        faceReal: faceIsReal,
        hrReal: realHr !== null,
        rrReal: realRr !== null,
        prosodyTurns,
      },
    });
  }, [scan, stopCamera, stopVitalScan, generateInsight, voiceSignal, prosodyScores]);

  // Auto-fire ONLY when permission is already granted — otherwise we need a
  // user-gesture tap first (see the pre-scan UI below).
  useEffect(() => {
    if (modelsLoaded && cameraPermission === 'granted' && !hasScanned.current) {
      runScan();
    }
  }, [modelsLoaded, cameraPermission, runScan]);

  // If camera is denied entirely, bypass getUserMedia completely and go straight
  // to mock signals — calling scan() would just throw NotAllowedError anyway.
  useEffect(() => {
    if (modelsLoaded && cameraPermission === 'denied' && !hasScanned.current) {
      runScan(true); // skipCamera — no getUserMedia call
    }
  }, [modelsLoaded, cameraPermission, runScan]);

  const handleGestureTap = useCallback(() => {
    // This is called from an onClick — guaranteed user-gesture context.
    // Now getUserMedia will show the permission prompt instead of throwing.
    if (!hasScanned.current) runScan();
  }, [runScan]);

  const handleSave = useCallback(() => {
    if (!dominantSignal) return;
    const narrative = getRandomNarrative(dominantSignal);
    addJournalEntry({
      id: Date.now().toString(),
      timestamp: new Date(),
      dominantSignal,
      signals,
      narrative,
    });
    setSavedToast(true);
    setTimeout(() => navigate('/journal'), 800);
  }, [dominantSignal, signals, addJournalEntry, navigate]);

  const dominantColor = dominantSignal ? SIGNAL_CONFIG[dominantSignal].color : '#4FD1C5';
  const scanLabel = getScanLabel(faceStatus, modelsLoaded);
  const cameraBlocked = faceStatus === 'camera-denied' || faceStatus === 'error';

  // All expressions for audit panel — show every class, sorted descending (no filter)
  const topExpressions = expressionScores
    ? Object.entries(expressionScores).sort(([, a], [, b]) => b - a)
    : [];

  // Top prosody for audit panel
  const topProsody = prosodyScores
    ? Object.entries(prosodyScores).sort(([, a], [, b]) => b - a).slice(0, 6)
    : [];

  // Did the user come from a voice session at all?
  const didVoice = voiceSignal !== null || prosodyScores !== null;

  // Expression → signal mapping (mirrored from useFaceDetection for audit traceability)
  const EXPR_TO_SIGNAL: Record<string, SignalName> = {
    happy: 'sweet', surprised: 'sour', fearful: 'sour',
    angry: 'bitter', disgusted: 'bitter', sad: 'umami', neutral: 'salt',
  };
  const SIGNAL_COLORS: Record<SignalName, string> = {
    sweet: '#f7a8c4', sour: '#a8e6a3', bitter: '#8b7ab8', salt: '#a8d4f7', umami: '#e8b887',
  };

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#0a0a0f' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <div className="flex items-center gap-3">
          <AvatarOrb size={36} dominantSignal={dominantSignal} />
          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '11px', letterSpacing: '4px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' }}>
            HunchDoctor
          </span>
        </div>
        <button onClick={() => navigate('/settings')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px', color: 'rgba(255,255,255,0.4)' }}>
          <Settings size={18} />
        </button>
      </div>

      {/* ── PRE-SCAN PHASE: permission gate ── */}
      <AnimatePresence>
        {phase === 'pre-scan' && (
          <motion.div
            key="pre-scan"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col flex-1 items-center justify-center px-8 gap-8"
          >
            {/* Pulsing camera icon */}
            <div style={{ position: 'relative', width: 88, height: 88 }}>
              <motion.div
                animate={{ scale: [1, 1.18, 1], opacity: [0.15, 0.28, 0.15] }}
                transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
                style={{
                  position: 'absolute', inset: -10,
                  borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(255,255,255,0.35) 0%, transparent 70%)',
                }}
              />
              <div style={{
                width: 88, height: 88, borderRadius: '50%',
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Camera size={32} color="rgba(255,255,255,0.8)" />
              </div>
            </div>

            {/* Title + description */}
            <div className="flex flex-col items-center gap-3 text-center">
              <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '22px', fontStyle: 'italic', color: 'rgba(255,255,255,0.9)', margin: 0 }}>
                Reading your signals
              </p>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', lineHeight: 1.7, color: 'rgba(255,255,255,0.35)', margin: 0, maxWidth: '260px' }}>
                HunchDoctor will briefly access your front camera to read facial expressions. Nothing is recorded or stored.
              </p>
            </div>

            {/* Bottom affordance — auto-spinner when permission granted,
                tap-to-allow when we still need a user-gesture context */}
            <AnimatePresence mode="wait">
              {cameraPermission === 'needs-gesture' && modelsLoaded ? (
                /* One tap creates the user-gesture stack so getUserMedia
                   shows the browser permission prompt instead of throwing. */
                <motion.button
                  key="tap-target"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.35 }}
                  onClick={handleGestureTap}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
                    padding: '12px 24px',
                  }}
                >
                  <motion.div
                    animate={{ scale: [1, 1.12, 1], opacity: [0.6, 1, 0.6] }}
                    transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                    style={{
                      width: 44, height: 44, borderRadius: '50%',
                      background: 'rgba(255,255,255,0.1)',
                      border: '1px solid rgba(255,255,255,0.4)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Camera size={18} color="rgba(255,255,255,0.85)" />
                  </motion.div>
                  <span style={{
                    fontFamily: 'Inter, sans-serif', fontSize: '10px',
                    letterSpacing: '3px', textTransform: 'uppercase',
                    color: 'rgba(255,255,255,0.3)',
                  }}>
                    tap to allow camera
                  </span>
                </motion.button>
              ) : (
                /* Permission already granted or still checking — show spinner */
                <motion.div
                  key="spinner"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center gap-2"
                >
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1.6, ease: 'linear' }}
                    style={{
                      width: 18, height: 18, borderRadius: '50%',
                      border: '2px solid rgba(255,255,255,0.15)',
                      borderTopColor: 'rgba(255,255,255,0.7)',
                    }}
                  />
                  <span style={{
                    fontFamily: 'Inter, sans-serif', fontSize: '10px',
                    letterSpacing: '3px', textTransform: 'uppercase',
                    color: 'rgba(255,255,255,0.25)',
                  }}>
                    {modelsLoaded ? 'starting…' : 'preparing…'}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── SCANNING PHASE: split layout ── */}
      <AnimatePresence>
        {phase === 'scanning' && (
          <motion.div
            key="scan-layout"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col flex-1"
          >
            {/* Side-by-side: camera | compass */}
            <div className="flex flex-1 gap-3 px-4" style={{ minHeight: 0 }}>

              {/* ── Left: Camera feed ── */}
              <div className="flex flex-col" style={{ width: '44%' }}>
                <div
                  style={{
                    position: 'relative',
                    flex: 1,
                    borderRadius: '20px',
                    overflow: 'hidden',
                    background: '#0d0d18',
                    border: cameraLive
                      ? '1px solid rgba(255,255,255,0.4)'
                      : '1px solid rgba(255,255,255,0.08)',
                    boxShadow: cameraLive
                      ? '0 0 24px rgba(255,255,255,0.15), inset 0 0 40px rgba(0,0,0,0.6)'
                      : 'inset 0 0 40px rgba(0,0,0,0.6)',
                    transition: 'border-color 0.6s ease, box-shadow 0.6s ease',
                    minHeight: '200px',
                  }}
                >
                  {/* Actual video element — mirrored */}
                  <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      transform: 'scaleX(-1)',
                      opacity: cameraLive ? 1 : 0,
                      transition: 'opacity 0.8s ease',
                      borderRadius: '20px',
                    }}
                  />

                  {/* Placeholder when camera not yet live */}
                  <AnimatePresence>
                    {!cameraLive && (
                      <motion.div
                        initial={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.6 }}
                        style={{
                          position: 'absolute',
                          inset: 0,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '10px',
                        }}
                      >
                        {cameraBlocked ? (
                          <CameraOff size={28} color="rgba(255,255,255,0.15)" />
                        ) : (
                          <motion.div
                            animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.7, 0.4] }}
                            transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
                          >
                            <Camera size={28} color="rgba(255,255,255,0.5)" />
                          </motion.div>
                        )}
                        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '9px', letterSpacing: '2px', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase' }}>
                          {cameraBlocked ? 'unavailable' : 'waiting...'}
                        </span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Scanline sweep — only when live */}
                  {cameraLive && (
                    <motion.div
                      animate={{ top: ['-5%', '105%'] }}
                      transition={{ repeat: Infinity, duration: 2.4, ease: 'linear', repeatDelay: 0.8 }}
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        height: '2px',
                        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)',
                        pointerEvents: 'none',
                        zIndex: 3,
                      }}
                    />
                  )}

                  {/* Corner brackets — top left */}
                  <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 4, pointerEvents: 'none' }}>
                    <div style={{ width: 14, height: 14, borderTop: '1.5px solid rgba(255,255,255,0.6)', borderLeft: '1.5px solid rgba(255,255,255,0.6)', borderRadius: '2px 0 0 0' }} />
                  </div>
                  {/* Corner brackets — bottom right */}
                  <div style={{ position: 'absolute', bottom: 10, right: 10, zIndex: 4, pointerEvents: 'none' }}>
                    <div style={{ width: 14, height: 14, borderBottom: '1.5px solid rgba(255,255,255,0.6)', borderRight: '1.5px solid rgba(255,255,255,0.6)', borderRadius: '0 0 2px 0' }} />
                  </div>

                  {/* Dark vignette overlay */}
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.55) 100%)',
                    pointerEvents: 'none',
                    zIndex: 2,
                  }} />

                  {/* LIVE badge */}
                  {cameraLive && (
                    <div style={{
                      position: 'absolute',
                      top: 10,
                      right: 10,
                      zIndex: 5,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: 'rgba(0,0,0,0.5)',
                      backdropFilter: 'blur(6px)',
                      borderRadius: '999px',
                      padding: '3px 8px',
                      border: '1px solid rgba(255,255,255,0.3)',
                    }}>
                      <motion.div
                        animate={{ opacity: [1, 0.2, 1] }}
                        transition={{ repeat: Infinity, duration: 1.2 }}
                        style={{ width: 5, height: 5, borderRadius: '50%', background: '#ffffff' }}
                      />
                      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '8px', letterSpacing: '1.5px', color: 'rgba(255,255,255,0.7)' }}>LIVE</span>
                    </div>
                  )}
                </div>

                {/* Expression label below camera */}
                <div style={{ height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <AnimatePresence mode="wait">
                    {faceStatus === 'scanning' && (
                      <motion.span
                        key="detecting"
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        style={{ fontFamily: 'Inter, sans-serif', fontSize: '9px', letterSpacing: '2px', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase' }}
                      >
                        detecting expression
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* ── Right: Compass loading ── */}
              <div className="flex flex-col items-center justify-center" style={{ flex: 1 }}>
                <CompassWeb
                  signals={signals}
                  dominantSignal={dominantSignal}
                  size={180}
                  revealed={false}
                />
              </div>
            </div>

            {/* Scan status bar at bottom of scan phase */}
            <div className="flex flex-col items-center gap-2 py-4 px-5">
              <div className="flex items-center gap-2">
                {cameraBlocked
                  ? <CameraOff size={10} color="rgba(255,255,255,0.3)" />
                  : <Camera size={10} color="rgba(255,255,255,0.6)" />
                }
                <AnimatePresence mode="wait">
                  <motion.span
                    key={scanSubLabel || scanLabel}
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -3 }}
                    transition={{ duration: 0.3 }}
                    style={{
                      fontFamily: 'Inter, sans-serif',
                      fontSize: '10px',
                      letterSpacing: '3px',
                      color: scanSubLabel === 'MEASURING VITALS'
                        ? 'rgba(246,173,85,0.7)'
                        : cameraBlocked ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.6)',
                      textTransform: 'uppercase',
                    }}
                  >
                    {scanSubLabel || scanLabel}
                  </motion.span>
                </AnimatePresence>
              </div>
              <div style={{ width: '160px', height: '2px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px' }}>
                <motion.div style={{
                  height: '100%',
                  background: scanSubLabel === 'MEASURING VITALS'
                    ? 'rgba(246,173,85,0.7)'
                    : cameraBlocked ? 'rgba(255,255,255,0.2)' : '#ffffff',
                  borderRadius: '2px',
                  width: `${scanProgress}%`,
                  transition: 'width 0.15s linear, background 0.6s ease',
                }} />
              </div>
              {scanSubLabel === 'MEASURING VITALS' && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  style={{ fontFamily: 'Inter, sans-serif', fontSize: '9px', letterSpacing: '1.5px', color: 'rgba(255,255,255,0.2)', margin: 0, textAlign: 'center' }}
                >
                  stay still · rPPG reading heart rate
                </motion.p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── REVEALED PHASE ── */}
      <AnimatePresence>
        {phase === 'revealed' && (
          <motion.div
            key="revealed-layout"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7 }}
            className="flex flex-col flex-1"
          >
            {/* Biometric strip */}
            <div className="flex justify-center gap-6 pb-1" style={{ fontFamily: 'Inter, sans-serif', fontSize: '10px', letterSpacing: '2px', color: 'rgba(255,255,255,0.3)' }}>
              <span style={{ color: hrIsReal ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.3)' }}>
                HR {hr} bpm{hrIsReal ? ' ●' : ' ○'}
              </span>
              <span style={{ color: rrIsReal ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.3)' }}>
                RESP {rr}/min{rrIsReal ? ' ●' : ' ○'}
              </span>
              {usedCamera ? (
                <span style={{ color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Camera size={9} /> LIVE
                </span>
              ) : (
                <span style={{ color: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <CameraOff size={9} /> EST
                </span>
              )}
              {voiceFused && voiceSignal && (
                <span style={{ color: 'rgba(168,85,247,0.7)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Mic size={9} /> VOICE
                </span>
              )}
            </div>

            {/* Full compass */}
            <div className="flex justify-center items-center flex-1" style={{ paddingTop: '8px' }}>
              <CompassWeb signals={signals} dominantSignal={dominantSignal} size={290} revealed={true} />
            </div>

            {/* Insight card + actions */}
            <div className="px-5 pb-8" style={{ paddingTop: '8px' }}>
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
              >
                <div className="flex items-center justify-center gap-2 mb-3">
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: dominantColor }} />
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '10px', letterSpacing: '3px', textTransform: 'uppercase', color: dominantColor, opacity: 0.9 }}>
                    {dominantSignal && SIGNAL_CONFIG[dominantSignal].label} dominant
                    {dominantExpression && (
                      <span style={{ color: 'rgba(255,255,255,0.3)', marginLeft: '8px' }}>· {dominantExpression}</span>
                    )}
                  </span>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '20px', border: '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(12px)', marginBottom: '16px', minHeight: '72px', position: 'relative', overflow: 'hidden' }}>
                  <AnimatePresence mode="wait">
                    {claudeLoading ? (
                      <motion.div
                        key="claude-loading"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
                      >
                        {/* Shimmer skeleton lines */}
                        {[1, 0.7].map((w, i) => (
                          <motion.div
                            key={i}
                            animate={{ opacity: [0.15, 0.35, 0.15] }}
                            transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut', delay: i * 0.2 }}
                            style={{
                              height: '14px',
                              borderRadius: '6px',
                              background: 'rgba(255,255,255,0.18)',
                              width: `${w * 100}%`,
                            }}
                          />
                        ))}
                        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '9px', letterSpacing: '2px', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', marginTop: '2px' }}>
                          reading your signals…
                        </span>
                      </motion.div>
                    ) : (
                      <motion.p
                        key={claudeInsight ?? insight}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.6 }}
                        style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '17px', fontStyle: 'italic', color: 'rgba(255,255,255,0.88)', lineHeight: 1.6, margin: 0 }}
                      >
                        {claudeInsight ?? insight}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>

                <div className="flex gap-3 mb-5">
                  <button
                    onClick={() => setShowDeep(true)}
                    style={{ flex: 1, height: '48px', borderRadius: '999px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.85)', fontFamily: 'Inter, sans-serif', fontSize: '13px', cursor: 'pointer' }}
                  >
                    Go deeper
                  </button>
                  <button
                    onClick={handleSave}
                    style={{ flex: 1, height: '48px', borderRadius: '999px', background: `${dominantColor}14`, border: `1px solid ${dominantColor}35`, color: dominantColor, fontFamily: 'Inter, sans-serif', fontSize: '13px', cursor: 'pointer' }}
                  >
                    {savedToast ? 'Saved ✓' : 'Save to journal'}
                  </button>
                </div>

                <button
                  onClick={() => navigate('/')}
                  style={{ width: '100%', height: '44px', borderRadius: '999px', background: 'none', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.35)', fontFamily: 'Inter, sans-serif', fontSize: '13px', cursor: 'pointer' }}
                >
                  New check-in
                </button>

                {/* ── Data Audit toggle ── */}
                <button
                  onClick={() => setShowAudit(v => !v)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '10px 0 0', color: 'rgba(255,255,255,0.18)', fontFamily: 'Inter, sans-serif', fontSize: '10px', letterSpacing: '2px', textTransform: 'uppercase' }}
                >
                  <FlaskConical size={11} />
                  {showAudit ? 'hide sensor audit' : 'sensor audit'}
                </button>

                {/* ── Data Audit Panel ── */}
                <AnimatePresence>
                  {showAudit && (
                    <motion.div
                      key="audit"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.35 }}
                      style={{ overflow: 'hidden', width: '100%' }}
                    >
                      <div style={{
                        marginTop: 8,
                        background: 'rgba(0,0,0,0.5)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 14,
                        padding: '14px 16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 14,
                        fontFamily: 'Inter, sans-serif',
                        fontSize: '10px',
                      }}>

                        {/* ── Face-api section ── */}
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                            <span style={{ letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>face-api.js</span>
                            <span style={{ color: usedCamera ? 'rgba(79,209,197,0.7)' : 'rgba(255,120,120,0.6)' }}>
                              {usedCamera ? 'LIVE · 6 frames · 224px' : 'no camera'}
                            </span>
                          </div>
                          {topExpressions.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                              {topExpressions.map(([expr, score]) => {
                                const mappedSig = EXPR_TO_SIGNAL[expr];
                                const barColor = mappedSig ? SIGNAL_COLORS[mappedSig] : 'rgba(255,255,255,0.25)';
                                const pct = Math.round(score * 100);
                                return (
                                  <div key={expr} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ width: 62, color: pct > 5 ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.28)', flexShrink: 0 }}>{expr}</span>
                                    <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                                      <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${pct}%` }}
                                        transition={{ duration: 0.6, ease: 'easeOut', delay: 0.05 }}
                                        style={{ height: '100%', background: barColor, borderRadius: 2, opacity: pct > 5 ? 1 : 0.35 }}
                                      />
                                    </div>
                                    <span style={{ width: 26, textAlign: 'right', color: pct > 5 ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)' }}>{pct}%</span>
                                    {mappedSig ? (
                                      <span style={{ width: 40, textAlign: 'right', color: SIGNAL_COLORS[mappedSig], opacity: pct > 5 ? 0.85 : 0.25, letterSpacing: '1px', textTransform: 'uppercase', fontSize: '9px' }}>
                                        {mappedSig}
                                      </span>
                                    ) : <span style={{ width: 40 }} />}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <span style={{ color: 'rgba(255,255,255,0.2)' }}>No face detected — estimated signals used</span>
                          )}
                        </div>

                        {/* ── VitalLens section ── */}
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={{ letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>VitalLens rPPG</span>
                            <span style={{ color: (hrIsReal || rrIsReal) ? 'rgba(79,209,197,0.7)' : 'rgba(255,180,80,0.7)' }}>
                              {(hrIsReal || rrIsReal) ? 'real signal' : 'needs ~45s'}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: 16, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>
                            <span>HR {hr} bpm <span style={{ color: hrIsReal ? 'rgba(79,209,197,0.7)' : 'rgba(255,200,100,0.55)' }}>{hrIsReal ? '(rPPG)' : '(est)'}</span></span>
                            <span>RR {rr}/min <span style={{ color: rrIsReal ? 'rgba(79,209,197,0.7)' : 'rgba(255,200,100,0.55)' }}>{rrIsReal ? '(rPPG)' : '(est)'}</span></span>
                          </div>
                          {!hrIsReal && !rrIsReal && (
                            <p style={{ margin: 0, color: 'rgba(255,255,255,0.2)', lineHeight: 1.55, fontSize: '9.5px' }}>
                              rPPG measures subtle skin-colour changes from blood flow (~45s scan window). Camera access required for real readings.{' '}
                              <a href="/vitallens-test" target="_blank" rel="noreferrer" style={{ color: 'rgba(79,209,197,0.55)', textDecoration: 'underline', cursor: 'pointer' }}>
                                Run diagnostic →
                              </a>
                            </p>
                          )}
                        </div>

                        {/* ── Hume Prosody section ── */}
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={{ letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>Hume prosody</span>
                            <span style={{ color: topProsody.length > 0 ? 'rgba(168,85,247,0.7)' : didVoice ? 'rgba(255,180,80,0.7)' : 'rgba(255,255,255,0.2)' }}>
                              {topProsody.length > 0 ? 'session avg' : didVoice ? 'voice · no emotions' : 'voice skipped'}
                            </span>
                          </div>
                          {topProsody.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                              {topProsody.map(([emotion, score]) => {
                                const mappedSig = EMOTION_TO_SIGNAL[emotion];
                                const pct = Math.round(score * 100);
                                return (
                                  <div key={emotion} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ width: 88, color: 'rgba(255,255,255,0.5)', flexShrink: 0 }}>{emotion}</span>
                                    <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                                      <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${pct}%` }}
                                        transition={{ duration: 0.6, ease: 'easeOut', delay: 0.08 }}
                                        style={{ height: '100%', background: mappedSig ? SIGNAL_COLORS[mappedSig] : 'rgba(168,85,247,0.6)', borderRadius: 2 }}
                                      />
                                    </div>
                                    <span style={{ width: 26, textAlign: 'right', color: 'rgba(255,255,255,0.3)' }}>{pct}%</span>
                                    {mappedSig ? (
                                      <span style={{ width: 40, textAlign: 'right', color: SIGNAL_COLORS[mappedSig], opacity: 0.8, letterSpacing: '1px', textTransform: 'uppercase', fontSize: '9px' }}>
                                        {mappedSig}
                                      </span>
                                    ) : <span style={{ width: 40, textAlign: 'right', color: 'rgba(255,255,255,0.15)', fontSize: '9px' }}>—</span>}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <p style={{ margin: 0, color: 'rgba(255,255,255,0.2)', lineHeight: 1.55, fontSize: '9.5px' }}>
                              {didVoice
                                ? 'Voice session detected but prosody aggregation returned empty — check user_message filter in useHumeVoice.'
                                : 'Navigate through the Voice screen to include prosody in the reading.'}
                            </p>
                          )}
                        </div>

                        {/* ── Fusion + mini compass ── */}
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)' }}>fusion</span>
                            <span style={{ color: 'rgba(255,255,255,0.45)' }}>{fusionNote || '—'}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)' }}>claude</span>
                            <span style={{ color: 'rgba(255,255,255,0.45)' }}>claude-sonnet-4</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)' }}>dominant</span>
                            <span style={{ color: dominantColor, textTransform: 'uppercase', letterSpacing: '3px', fontSize: '11px' }}>{dominantSignal}</span>
                          </div>
                          {/* Signal mini bar chart */}
                          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                            {(['sweet', 'sour', 'bitter', 'salt', 'umami'] as SignalName[]).map(sig => {
                              const pct = Math.round(signals[sig] * 100);
                              const isDOM = sig === dominantSignal;
                              return (
                                <div key={sig} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                                  <div style={{ width: '100%', height: 28, background: 'rgba(255,255,255,0.04)', borderRadius: 3, overflow: 'hidden', display: 'flex', alignItems: 'flex-end' }}>
                                    <motion.div
                                      initial={{ height: 0 }}
                                      animate={{ height: `${pct}%` }}
                                      transition={{ duration: 0.7, ease: 'easeOut', delay: 0.12 }}
                                      style={{ width: '100%', background: isDOM ? SIGNAL_COLORS[sig] : `${SIGNAL_COLORS[sig]}44`, borderRadius: '2px 2px 0 0' }}
                                    />
                                  </div>
                                  <span style={{ fontSize: '8px', letterSpacing: '1px', color: isDOM ? SIGNAL_COLORS[sig] : 'rgba(255,255,255,0.18)', textTransform: 'uppercase' }}>
                                    {sig.slice(0, 2)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Deep insight modal ── */}
      <AnimatePresence>
        {showDeep && dominantSignal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,15,0.88)', backdropFilter: 'blur(20px)', display: 'flex', alignItems: 'flex-end', zIndex: 100 }}
            onClick={() => setShowDeep(false)}
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: 'spring', damping: 26, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
              style={{ width: '100%', background: 'rgba(18,18,28,0.98)', borderRadius: '24px 24px 0 0', padding: '32px 24px 52px', border: '1px solid rgba(255,255,255,0.07)', borderBottom: 'none' }}
            >
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: dominantColor }} />
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '10px', letterSpacing: '3px', textTransform: 'uppercase', color: dominantColor }}>
                    {SIGNAL_CONFIG[dominantSignal].label}
                  </span>
                </div>
                <button
                  onClick={() => setShowDeep(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', padding: 4 }}
                >
                  <X size={18} />
                </button>
              </div>
              <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '18px', fontStyle: 'italic', color: 'rgba(255,255,255,0.88)', lineHeight: 1.7, margin: 0 }}>
                {DEEP_INSIGHTS[dominantSignal]}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}