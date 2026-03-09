/**
 * VoiceScreen — Voice conversation phase powered by Hume EVI
 *
 * Key invariant for begin_facial_scan:
 *   send.success() must NOT be called until isPlaying === false.
 *   The SDK interprets the tool response as permission to move on, which
 *   immediately cuts off any audio still playing.  We await a polling
 *   promise (waitUntilSilent) so Hume always finishes speaking naturally
 *   before we acknowledge the tool call and navigate.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate, useLoaderData } from 'react-router';
import { ExternalLink, ArrowRight, Mic, MicOff, ShieldAlert, X } from 'lucide-react';
import { VoiceProvider } from '@humeai/voice-react';
import type { ToolCallHandler } from '@humeai/voice-react';
import { fetchAccessToken } from 'hume';
import { AvatarOrb } from './AvatarOrb';
import type { SignalName } from '../store';
import { SIGNAL_CONFIG } from './signals';
import { useHumeVoice } from './useHumeVoice';
import { HUME_API_KEY, HUME_SECRET_KEY, HUME_CONFIG_ID } from '../../config/keys';

// ── voiceLoader ───────────────────────────────────────────────────────────────
export async function voiceLoader() {
  const keysReady =
    HUME_API_KEY    !== 'YOUR_HUME_API_KEY_HERE'    && !!HUME_API_KEY &&
    HUME_SECRET_KEY !== 'YOUR_HUME_SECRET_KEY_HERE' && !!HUME_SECRET_KEY &&
    HUME_CONFIG_ID  !== 'YOUR_HUME_CONFIG_ID_HERE'  && !!HUME_CONFIG_ID;

  if (!keysReady) return { accessToken: '' };

  try {
    const accessToken = await fetchAccessToken({
      apiKey: String(HUME_API_KEY),
      secretKey: String(HUME_SECRET_KEY),
    });
    return { accessToken };
  } catch (error) {
    console.error('[voiceLoader] Failed to fetch Hume access token:', error);
    return { accessToken: '' };
  }
}

// ── EVI status type ───────────────────────────────────────────────────────────
export type EVIStatus =
  | 'idle'
  | 'requesting_mic'
  | 'connecting'
  | 'listening'
  | 'speaking'
  | 'ended'
  | 'mic_denied'
  | 'error';

// ── Wait until Hume is no longer playing audio ────────────────────────────────
//
// WHY THIS IS SUBTLE:
//   The Hume server sends `tool_call` and `audio_output` messages over the
//   same WebSocket. `tool_call` often arrives a few frames BEFORE the first
//   `audio_output` chunk for the closing phrase ("stay still, keep breathing"),
//   so `isPlaying` can be false at the exact moment `handleToolCall` fires.
//   Resolving immediately would call send.success() before audio even starts,
//   which causes the SDK to cut the phrase off entirely.
//
// STRATEGY:
//   1. STARTUP_GRACE_MS  — if audio hasn't started yet, keep polling until it
//      does (or until the grace window expires, meaning genuine silence).
//   2. STABLE_SILENT_MS  — once audio HAS played, only resolve after it has
//      been continuously silent for this long (guards against chunk gaps).
//   3. LIMIT_MS          — hard cap so a stuck state never blocks forever.
function waitUntilSilent(isPlayingRef: React.MutableRefObject<boolean>): Promise<void> {
  return new Promise<void>((resolve) => {
    const POLL_MS          = 50;
    const STARTUP_GRACE_MS = 2000;  // was 900 — give audio more time to START after tool_call
    const STABLE_SILENT_MS = 900;   // was 420 — audio must be silent for this long continuously
    const LIMIT_MS         = 18_000;

    let elapsed          = 0;
    let silentFor        = 0;
    let audioEverPlayed  = isPlayingRef.current; // true if audio was already going

    const id = setInterval(() => {
      elapsed += POLL_MS;

      if (isPlayingRef.current) {
        audioEverPlayed = true;
        silentFor = 0; // reset stability window whenever audio resumes
      } else {
        // Only accumulate silence AFTER audio has started.
        // Before that, we're inside the startup grace period waiting for the
        // first audio_output chunk to arrive.
        if (audioEverPlayed || elapsed >= STARTUP_GRACE_MS) {
          silentFor += POLL_MS;
        }
      }

      if (silentFor >= STABLE_SILENT_MS || elapsed >= LIMIT_MS) {
        clearInterval(id);
        resolve();
      }
    }, POLL_MS);
  });
}

// ── Browser name ──────────────────────────────────────────────────────────────
const BROWSER = (() => {
  const ua = navigator.userAgent;
  if (ua.includes('Edg'))     return 'Edge';
  if (ua.includes('Chrome'))  return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari'))  return 'Safari';
  return 'your browser';
})();

// ── View derived from status ──────────────────────────────────────────────────
type ScreenView = 'idle' | 'requesting_mic' | 'connecting' | 'active' | 'mic_denied' | 'error';

function toView(status: EVIStatus): ScreenView {
  switch (status) {
    case 'idle':           return 'idle';
    case 'requesting_mic': return 'requesting_mic';
    case 'connecting':     return 'connecting';
    case 'listening':
    case 'speaking':
    case 'ended':          return 'active';
    case 'mic_denied':     return 'mic_denied';
    case 'error':          return 'error';
  }
}

// ── Waveform ──────────────────────────────────────────────────────────────────
function WaveformBars({ isSpeaking, accentColor }: { isSpeaking: boolean; accentColor: string }) {
  const HEIGHTS = [0.4, 0.7, 1, 0.85, 0.55, 0.9, 0.6, 0.75, 0.45, 0.65];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '3px', height: '32px' }}>
      {HEIGHTS.map((h, i) => (
        <motion.div
          key={i}
          animate={isSpeaking
            ? { scaleY: [h * 0.3, h, h * 0.5, h * 0.85, h * 0.2, h * 0.9, h * 0.4, h] }
            : { scaleY: [0.08, 0.18, 0.08] }   // nearly flat / gently breathing when listening
          }
          transition={isSpeaking
            ? { duration: 1.3 + i * 0.09, repeat: Infinity, ease: 'easeInOut', delay: i * 0.07 }
            : { duration: 2.4 + i * 0.12, repeat: Infinity, ease: 'easeInOut', delay: i * 0.15 }
          }
          style={{
            width: '3px', height: '32px', borderRadius: '2px', transformOrigin: 'center',
            background: isSpeaking ? accentColor : 'rgba(255,255,255,0.3)',
            opacity:    isSpeaking ? 0.85 : 0.25,
            transition: 'opacity 0.5s ease, background 0.5s ease',
          }}
        />
      ))}
    </div>
  );
}

// ── VoiceScreenInner ──────────────────────────────────────────────────────────
// Responsibilities:
//   • Runs useHumeVoice and renders the UI
//   • Keeps outer-owned refs (isPlayingRef, voiceSignalRef, prosodyRef) in sync
//     so the outer component's ToolCallHandler can read live values without
//     being inside the VoiceProvider subtree
//   • Does NOT handle begin_facial_scan navigation — that lives in the outer
//     handleToolCall so send.success() can be properly delayed
function VoiceScreenInner({
  accessToken,
  onIsPlayingChange,
  onVoiceSignalChange,
  onRegisterStop,
  onProsodyChange,
  onEndSession,
}: {
  accessToken: string;
  /** Called every render so outer isPlayingRef stays in sync */
  onIsPlayingChange: (playing: boolean) => void;
  onVoiceSignalChange: (s: SignalName) => void;
  onRegisterStop: (fn: () => void) => void;
  onProsodyChange: (p: Record<string, number> | null) => void;
  /** Called when the session ends naturally (status === 'ended') */
  onEndSession: () => void;
}) {
  const navigate = useNavigate();

  const {
    status, isPlaying, transcript, speaker,
    voiceSignal, aggregatedProsody,
    errorHint, keysConfigured, startEVI, stopEVI,
  } = useHumeVoice(accessToken);

  // ── Sync live values to outer refs every render ───────────────────────────
  // Use layout-effect timing so refs are updated before any microtask that
  // reads them (e.g. the polling loop in waitUntilSilent).
  useEffect(() => { onIsPlayingChange(isPlaying); },         [isPlaying,         onIsPlayingChange]);
  useEffect(() => { onVoiceSignalChange(voiceSignal); },     [voiceSignal,        onVoiceSignalChange]);
  useEffect(() => { onProsodyChange(aggregatedProsody); },   [aggregatedProsody,  onProsodyChange]);
  useEffect(() => { onRegisterStop(stopEVI); },              [stopEVI,            onRegisterStop]);

  // Natural session end (Hume disconnected without tool call)
  useEffect(() => {
    if (status === 'ended') onEndSession();
  }, [status, onEndSession]);

  // Stable turn counter for transcript animation
  const prevSpeakerRef = useRef<typeof speaker>(null);
  const [turnId, setTurnId] = useState(0);
  useEffect(() => {
    if (speaker !== prevSpeakerRef.current) {
      prevSpeakerRef.current = speaker;
      if (speaker) setTurnId(n => n + 1);
    }
  }, [speaker]);

  // Connecting timer
  const [connectSec, setConnectSec] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (status === 'connecting') {
      setConnectSec(0);
      timerRef.current = setInterval(() => setConnectSec(s => s + 1), 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [status]);

  const view        = toView(status);
  const isSpeaking  = status === 'speaking';
  const isActive    = status === 'listening' || status === 'speaking';
  const accentColor = isActive ? (SIGNAL_CONFIG[voiceSignal]?.color ?? '#4FD1C5') : '#4FD1C5';

  // ── Prosody debug panel toggle ────────────────────────────────────────────
  const [showProsodyDebug, setShowProsodyDebug] = useState(false);

  // Top-5 emotions from aggregated user prosody (for debug panel)
  const top5Prosody = aggregatedProsody
    ? Object.entries(aggregatedProsody)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 8)
    : [];

  const handleSkip = useCallback(() => {
    stopEVI();
    navigate('/compass', { state: { voiceSignal: null } });
  }, [stopEVI, navigate]);

  const handleEnd = useCallback(() => {
    stopEVI();
    navigate('/compass', { state: { voiceSignal } });
  }, [stopEVI, navigate, voiceSignal]);

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#0a0a0f', position: 'relative', overflow: 'hidden' }}>

      {/* Ambient glow */}
      <motion.div
        animate={{ opacity: isActive ? 0.11 : 0.04, scale: isActive ? 1.1 : 1 }}
        transition={{ duration: 2.5, ease: 'easeInOut' }}
        style={{
          position: 'absolute', top: '10%', left: '50%', transform: 'translateX(-50%)',
          width: 500, height: 500, borderRadius: '50%', pointerEvents: 'none', zIndex: 0,
          background: `radial-gradient(circle, ${accentColor}55 0%, transparent 70%)`,
        }}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3" style={{ position: 'relative', zIndex: 10 }}>
        <div className="flex items-center gap-3">
          <AvatarOrb size={36} />
          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '11px', letterSpacing: '4px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' }}>
            HunchDoctor
          </span>
        </div>
        <button onClick={handleSkip} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px', color: 'rgba(255,255,255,0.3)' }}>
          <X size={18} />
        </button>
      </div>

      <div className="flex flex-col flex-1 items-center px-6" style={{ position: 'relative', zIndex: 10 }}>
        <AnimatePresence mode="wait">

          {/* ── IDLE ── */}
          {view === 'idle' && (
            <motion.div
              key="idle"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.45 }}
              className="flex flex-col items-center justify-center flex-1 gap-8 text-center"
            >
              <div style={{ position: 'relative' }}>
                <motion.div
                  animate={{ scale: [1, 1.12, 1], opacity: [0.1, 0.22, 0.1] }}
                  transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                  style={{ position: 'absolute', inset: -16, borderRadius: '50%', background: 'radial-gradient(circle, rgba(79,209,197,0.4) 0%, transparent 70%)' }}
                />
                <AvatarOrb size={100} />
              </div>
              <div style={{ maxWidth: 280 }}>
                <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '24px', fontStyle: 'italic', color: 'rgba(255,255,255,0.9)', marginBottom: 12, lineHeight: 1.4 }}>
                  Let's hear your body first
                </p>
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', lineHeight: 1.7, color: 'rgba(255,255,255,0.35)' }}>
                  Hunch will ask a few questions. Your voice carries signals your face can't always show.
                </p>
              </div>
              <div className="flex flex-col items-center gap-3 w-full" style={{ maxWidth: 280 }}>
                <motion.button
                  onClick={startEVI} disabled={!keysConfigured} whileTap={{ scale: 0.97 }}
                  style={{
                    width: '100%', height: 52, borderRadius: 999,
                    background: keysConfigured ? 'rgba(79,209,197,0.12)' : 'rgba(255,255,255,0.04)',
                    border: keysConfigured ? '1px solid rgba(79,209,197,0.35)' : '1px solid rgba(255,255,255,0.1)',
                    color: keysConfigured ? '#4FD1C5' : 'rgba(255,255,255,0.2)',
                    fontFamily: 'Inter, sans-serif', fontSize: '14px',
                    cursor: keysConfigured ? 'pointer' : 'not-allowed', letterSpacing: '1px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  <Mic size={15} /> Begin conversation
                </motion.button>
                <button onClick={handleSkip} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', fontFamily: 'Inter, sans-serif', fontSize: '12px', cursor: 'pointer', padding: '10px 20px' }}>
                  Skip — go straight to scan
                </button>
              </div>
            </motion.div>
          )}

          {/* ── REQUESTING MIC ── */}
          {view === 'requesting_mic' && (
            <motion.div
              key="requesting_mic"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
              className="flex flex-col items-center justify-center flex-1 gap-6 text-center"
            >
              <motion.div
                animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.6, 0.3] }}
                transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
                style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(79,209,197,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Mic size={24} color="#4FD1C5" />
              </motion.div>
              <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '22px', fontStyle: 'italic', color: 'rgba(255,255,255,0.85)' }}>
                Allow microphone access
              </p>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', color: 'rgba(255,255,255,0.35)', maxWidth: 240, lineHeight: 1.7 }}>
                A browser dialog should appear. Click <strong style={{ color: 'rgba(255,255,255,0.6)' }}>Allow</strong> to continue.
              </p>
            </motion.div>
          )}

          {/* ── CONNECTING ── */}
          {view === 'connecting' && (
            <motion.div
              key="connecting"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
              className="flex flex-col items-center justify-center flex-1 gap-6"
            >
              <AvatarOrb size={90} />
              <div className="flex items-center gap-2">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
                  style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(79,209,197,0.2)', borderTopColor: '#4FD1C5' }}
                />
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '11px', letterSpacing: '3px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>
                  Connecting{connectSec > 3 ? ` · ${connectSec}s` : ''}
                </span>
              </div>
              {connectSec >= 8 && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-2">
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '11px', color: 'rgba(255,255,255,0.25)', maxWidth: 220, lineHeight: 1.6, textAlign: 'center' }}>
                    Taking longer than usual…
                  </p>
                  <button onClick={handleSkip} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 999, color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter, sans-serif', fontSize: '12px', cursor: 'pointer', padding: '8px 20px' }}>
                    Skip to scan
                  </button>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* ── ACTIVE ── */}
          {view === 'active' && (
            <motion.div
              key="active"
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="flex flex-col items-center flex-1 gap-5 w-full"
              style={{ paddingTop: 20 }}
            >
              {/* Orb halo */}
              <div style={{ position: 'relative' }}>
                <motion.div
                  animate={{
                    scale:   isSpeaking ? [1, 1.3, 1] : [1, 1.08, 1],
                    opacity: isSpeaking ? [0.18, 0.38, 0.18] : [0.07, 0.16, 0.07],
                  }}
                  transition={{ repeat: Infinity, duration: isSpeaking ? 1.2 : 2.5, ease: 'easeInOut' }}
                  style={{ position: 'absolute', inset: -20, borderRadius: '50%', background: `radial-gradient(circle, ${accentColor}60 0%, transparent 70%)` }}
                />
                <AvatarOrb size={80} />
              </div>

              {/* Waveform + status label */}
              <div className="flex flex-col items-center gap-2">
                <WaveformBars isSpeaking={isSpeaking} accentColor={accentColor} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {/* Pulsing mic dot — only visible while listening, signals mic is hot */}
                  <AnimatePresence>
                    {!isSpeaking && (
                      <motion.div
                        key="mic-dot"
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: [0.5, 1, 0.5], scale: [0.8, 1, 0.8] }}
                        exit={{ opacity: 0, scale: 0.5 }}
                        transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
                        style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(255,255,255,0.45)', flexShrink: 0 }}
                      />
                    )}
                  </AnimatePresence>
                  <span style={{
                    fontFamily: 'Inter, sans-serif', fontSize: '10px', letterSpacing: '3px', textTransform: 'uppercase',
                    color: isSpeaking ? accentColor : 'rgba(255,255,255,0.45)',
                    transition: 'color 0.5s ease',
                  }}>
                    {isSpeaking ? 'Hunch is speaking' : 'Listening'}
                  </span>
                </div>
              </div>

              {/* Transcript bubble */}
              <div style={{ width: '100%', maxWidth: 320, minHeight: 80 }}>
                <AnimatePresence mode="wait">
                  {transcript ? (
                    <motion.div
                      key={turnId}
                      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.3 }}
                      style={{
                        background: speaker === 'hunch' ? 'rgba(79,209,197,0.06)' : 'rgba(255,255,255,0.04)',
                        border:     speaker === 'hunch' ? '1px solid rgba(79,209,197,0.2)' : '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 16, padding: '16px 20px',
                      }}
                    >
                      {speaker === 'user' && (
                        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '9px', letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', display: 'block', marginBottom: 6 }}>
                          You
                        </span>
                      )}
                      <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '16px', fontStyle: 'italic', color: 'rgba(255,255,255,0.85)', lineHeight: 1.55, margin: 0 }}>
                        {transcript}
                      </p>
                    </motion.div>
                  ) : (
                    <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 0 }} exit={{ opacity: 0 }} style={{ height: 80 }} />
                  )}
                </AnimatePresence>
              </div>

              {/* Bottom actions */}
              <div className="flex flex-col items-center gap-2" style={{ marginTop: 'auto', paddingBottom: 40 }}>

                {/* ── Prosody debug panel ── */}
                <AnimatePresence>
                  {showProsodyDebug && (
                    <motion.div
                      key="prosody-panel"
                      initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                      animate={{ opacity: 1, height: 'auto', marginBottom: 12 }}
                      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                      transition={{ duration: 0.3 }}
                      style={{
                        width: '100%', maxWidth: 300, overflow: 'hidden',
                        background: 'rgba(0,0,0,0.55)',
                        border: '1px solid rgba(79,209,197,0.18)',
                        borderRadius: 12,
                        padding: top5Prosody.length ? '12px 14px' : '10px 14px',
                      }}
                    >
                      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '9px', letterSpacing: '2.5px', textTransform: 'uppercase', color: 'rgba(79,209,197,0.6)', margin: '0 0 8px 0' }}>
                        Live prosody · user voice · top emotions
                      </p>
                      {top5Prosody.length === 0 ? (
                        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '11px', color: 'rgba(255,255,255,0.25)', margin: 0 }}>
                          No user turns yet — speak to populate
                        </p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                          {top5Prosody.map(([emotion, score]) => (
                            <div key={emotion} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '10px', color: 'rgba(255,255,255,0.55)', width: 90, flexShrink: 0 }}>
                                {emotion}
                              </span>
                              <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
                                <motion.div
                                  animate={{ width: `${(score * 100).toFixed(0)}%` }}
                                  transition={{ duration: 0.5, ease: 'easeOut' }}
                                  style={{ height: '100%', background: accentColor, borderRadius: 2 }}
                                />
                              </div>
                              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '9px', color: 'rgba(255,255,255,0.35)', width: 28, textAlign: 'right' }}>
                                {(score * 100).toFixed(0)}%
                              </span>
                            </div>
                          ))}
                          <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '9px', color: 'rgba(255,255,255,0.25)' }}>
                              → signal
                            </span>
                            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '9px', color: accentColor, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
                              {voiceSignal}
                            </span>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                <button
                  onClick={() => setShowProsodyDebug(v => !v)}
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.18)', fontFamily: 'Inter, sans-serif', fontSize: '10px', letterSpacing: '1.5px', cursor: 'pointer', padding: '4px 10px', textTransform: 'uppercase' }}
                >
                  {showProsodyDebug ? 'hide prosody' : 'show prosody'}
                </button>

                <button
                  onClick={handleEnd}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(79,209,197,0.1)', border: '1px solid rgba(79,209,197,0.25)', borderRadius: 999, color: '#4FD1C5', fontFamily: 'Inter, sans-serif', fontSize: '13px', cursor: 'pointer', padding: '10px 24px' }}
                >
                  Move to face scan <ArrowRight size={14} />
                </button>
                <button
                  onClick={handleSkip}
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)', fontFamily: 'Inter, sans-serif', fontSize: '11px', cursor: 'pointer', padding: 8 }}
                >
                  Skip voice entirely
                </button>
              </div>
            </motion.div>
          )}

          {/* ── MIC DENIED ── */}
          {view === 'mic_denied' && (
            <motion.div
              key="mic_denied"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
              className="flex flex-col items-center justify-center flex-1 gap-5 text-center"
            >
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(246,173,85,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(246,173,85,0.25)' }}>
                <ShieldAlert size={22} color="#F6AD55" />
              </div>
              <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '20px', fontStyle: 'italic', color: 'rgba(255,255,255,0.85)' }}>
                Microphone blocked
              </p>
              {errorHint === 'iframe_blocked' ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, maxWidth: 280 }}>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.7, textAlign: 'center', margin: 0 }}>
                    This preview runs inside a sandboxed frame that restricts microphone access. Open the app in its own tab to enable voice.
                  </p>
                  <motion.button whileTap={{ scale: 0.97 }} onClick={() => window.open(window.location.href, '_blank')}
                    style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'rgba(246,173,85,0.12)', border: '1px solid rgba(246,173,85,0.35)', borderRadius: 999, color: '#F6AD55', fontFamily: 'Inter, sans-serif', fontSize: '13px', cursor: 'pointer', padding: '10px 22px' }}
                  >
                    <ExternalLink size={13} /> Open in new tab
                  </motion.button>
                  <button onClick={handleSkip} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', fontFamily: 'Inter, sans-serif', fontSize: '12px', cursor: 'pointer', padding: '8px 16px' }}>
                    Skip voice — go to face scan
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', color: 'rgba(255,255,255,0.35)', maxWidth: 260, lineHeight: 1.8, textAlign: 'left', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '14px 16px' }}>
                    <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 8, fontFamily: 'Inter, sans-serif', fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase' }}>
                      To fix in {BROWSER}:
                    </p>
                    {BROWSER === 'Chrome' || BROWSER === 'Edge' ? (
                      <ol style={{ paddingLeft: 16, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <li>Click the 🔒 icon in the address bar</li>
                        <li>Set <strong style={{ color: 'rgba(255,255,255,0.6)' }}>Microphone</strong> → Allow</li>
                        <li>Reload the page</li>
                      </ol>
                    ) : BROWSER === 'Firefox' ? (
                      <ol style={{ paddingLeft: 16, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <li>Click the 🔒 icon in the address bar</li>
                        <li>Click <strong style={{ color: 'rgba(255,255,255,0.6)' }}>Permissions → Microphone</strong></li>
                        <li>Remove the block, then reload</li>
                      </ol>
                    ) : (
                      <ol style={{ paddingLeft: 16, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <li>Open browser site settings</li>
                        <li>Allow <strong style={{ color: 'rgba(255,255,255,0.6)' }}>Microphone</strong> for this page</li>
                        <li>Reload and try again</li>
                      </ol>
                    )}
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <button onClick={startEVI} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(246,173,85,0.1)', border: '1px solid rgba(246,173,85,0.3)', borderRadius: 999, color: '#F6AD55', fontFamily: 'Inter, sans-serif', fontSize: '13px', cursor: 'pointer', padding: '10px 24px' }}>
                      <Mic size={13} /> Try again
                    </button>
                    <button onClick={handleSkip} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', fontFamily: 'Inter, sans-serif', fontSize: '12px', cursor: 'pointer', padding: '8px 16px' }}>
                      Skip voice — go to face scan
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* ── ERROR ── */}
          {view === 'error' && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
              className="flex flex-col items-center justify-center flex-1 gap-6 text-center"
            >
              <div style={{ position: 'relative', width: 72, height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <motion.div
                  animate={{ opacity: [0.12, 0.22, 0.12] }}
                  transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
                  style={{ position: 'absolute', inset: -10, borderRadius: '50%', background: 'radial-gradient(circle, rgba(220,80,80,0.3) 0%, transparent 70%)' }}
                />
                <MicOff size={44} color="#D96B6B" strokeWidth={1.5} />
              </div>
              {errorHint === 'iframe_ws_blocked' ? (
                <>
                  <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '26px', fontStyle: 'italic', color: 'rgba(255,255,255,0.9)', margin: 0, lineHeight: 1.3 }}>
                    Preview can't reach Hume
                  </p>
                  <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', color: 'rgba(255,255,255,0.4)', maxWidth: 270, lineHeight: 1.8, textAlign: 'center', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '14px 18px' }}>
                    The Figma Make preview runs in a sandboxed iframe that blocks outbound WebSocket connections.<br /><br />
                    <strong style={{ color: 'rgba(255,255,255,0.65)' }}>Open the app in its own tab</strong> — voice will work there.
                  </div>
                  <div className="flex flex-col items-center gap-3 w-full" style={{ maxWidth: 280 }}>
                    <motion.button whileTap={{ scale: 0.97 }} onClick={() => window.open(window.location.href, '_blank')}
                      style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', height: 48, justifyContent: 'center', background: 'rgba(79,209,197,0.1)', border: '1px solid rgba(79,209,197,0.3)', borderRadius: 999, color: '#4FD1C5', fontFamily: 'Inter, sans-serif', fontSize: '13px', cursor: 'pointer' }}
                    >
                      <ExternalLink size={14} /> Open in new tab
                    </motion.button>
                    <button onClick={handleSkip} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', fontFamily: 'Inter, sans-serif', fontSize: '12px', cursor: 'pointer', padding: '8px 16px' }}>
                      Skip — go to face scan
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '26px', fontStyle: 'italic', color: 'rgba(255,255,255,0.9)', margin: 0, lineHeight: 1.3 }}>
                    Connection failed
                  </p>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', color: 'rgba(255,255,255,0.35)', maxWidth: 260, lineHeight: 1.7, margin: 0 }}>
                    Couldn't reach Hume — check the browser console for details, then retry.
                  </p>
                  <div className="flex flex-col items-center gap-3 w-full" style={{ maxWidth: 280 }}>
                    <motion.button onClick={startEVI} whileTap={{ scale: 0.97 }}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', height: 48, justifyContent: 'center', background: 'rgba(217,107,107,0.1)', border: '1px solid rgba(217,107,107,0.3)', borderRadius: 999, color: '#D96B6B', fontFamily: 'Inter, sans-serif', fontSize: '13px', cursor: 'pointer', letterSpacing: '0.5px' }}
                    >
                      <Mic size={14} /> Retry connection
                    </motion.button>
                    <button onClick={handleSkip} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', fontFamily: 'Inter, sans-serif', fontSize: '12px', cursor: 'pointer', padding: '8px 16px' }}>
                      Skip — go to face scan
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}

// ── VoiceScreen — owns tool call handling and navigation ──────────────────────
export function VoiceScreen() {
  const { accessToken } = useLoaderData<typeof voiceLoader>();
  const navigate = useNavigate();

  // Live refs kept in sync by VoiceScreenInner on every render.
  // The ToolCallHandler (below) reads these without ever being stale —
  // it doesn't need to be inside VoiceProvider to see current values.
  const isPlayingRef    = useRef(false);
  const voiceSignalRef  = useRef<SignalName>('umami');
  const prosodyRef      = useRef<Record<string, number> | null>(null);
  const stopEVIRef      = useRef<() => void>(() => {});

  // Guard against double-navigation (tool call path vs. natural 'ended' path)
  const navigatedRef = useRef(false);

  const navigateToCompass = useCallback(() => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    stopEVIRef.current();
    navigate('/compass', {
      state: {
        voiceSignal:   voiceSignalRef.current,
        prosodyScores: prosodyRef.current,
      },
    });
  }, [navigate]);

  // ── Tool call handler ─────────────────────────────────────────────────────
  // CRITICAL: send.success() must only be called AFTER isPlaying === false.
  // The Hume SDK treats the tool response as a transition signal — calling it
  // while audio is still playing causes an immediate cut-off.
  const handleToolCall: ToolCallHandler = useCallback(async (toolCall, send) => {
    console.log('[VoiceScreen] Tool call received:', toolCall.name);

    if (toolCall.name === 'begin_facial_scan') {
      // Wait for Hume to finish speaking its final sentence
      console.log('[VoiceScreen] Waiting for Hume to finish speaking before responding…');
      await waitUntilSilent(isPlayingRef);
      console.log('[VoiceScreen] Hume is silent — sending tool success and navigating');

      const response = send.success({ status: 'scan_initiated' });
      navigateToCompass();
      return response;
    }

    return send.error({
      error: `Unknown tool: ${toolCall.name}`,
      code: 'UNKNOWN_TOOL',
      level: 'warn',
      content: `The tool "${toolCall.name}" is not implemented.`,
    });
  }, [navigateToCompass]);

  return (
    <VoiceProvider
      configId={HUME_CONFIG_ID}
      clearMessagesOnDisconnect={true}
      onToolCall={handleToolCall}
    >
      <VoiceScreenInner
        accessToken={accessToken}
        onIsPlayingChange={(v) => { isPlayingRef.current = v; }}
        onVoiceSignalChange={(s) => { voiceSignalRef.current = s; }}
        onRegisterStop={(fn) => { stopEVIRef.current = fn; }}
        onProsodyChange={(p) => { prosodyRef.current = p; }}
        onEndSession={navigateToCompass}
      />
    </VoiceProvider>
  );
}