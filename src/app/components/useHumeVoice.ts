/**
 * useHumeVoice — wraps @humeai/voice-react's useVoice() and maps it to
 * the provider-agnostic EVIStatus shape used by VoiceScreen.tsx.
 *
 * Accepts a pre-fetched `accessToken` from the React Router voiceLoader
 * (the equivalent of getServerSideProps props injection in Next.js).
 *
 * Must be called inside a <VoiceProvider> subtree.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVoice } from '@humeai/voice-react';
import { HUME_CONFIG_ID } from '../../config/keys';
import type { EVIStatus } from './VoiceScreen';
import type { SignalName } from '../store';

// ── Hume prosody emotion → HunchDoctor taste signal ──────────────────────────
export const EMOTION_TO_SIGNAL: Record<string, SignalName> = {
  // Sweet — comfort, warmth, reward
  Joy: 'sweet', Contentment: 'sweet', Relief: 'sweet',
  Satisfaction: 'sweet', Adoration: 'sweet', Love: 'sweet',
  // Sour — alertness, activation, anticipation
  Excitement: 'sour', Surprise: 'sour', Interest: 'sour',
  Anticipation: 'sour', Amusement: 'sour', Elation: 'sour',
  // Bitter — depletion, defence, stress
  Sadness: 'bitter', Fear: 'bitter', Anxiety: 'bitter',
  Distress: 'bitter', Disgust: 'bitter', Anger: 'bitter',
  Frustration: 'bitter', Pain: 'bitter', Horror: 'bitter',
  // Salt — equilibrium, grounded, steady
  Calmness: 'salt', Serenity: 'salt', Concentration: 'salt',
  Determination: 'salt', Realization: 'salt',
  // Umami — depth, depletion, introspection
  Tiredness: 'umami', Boredom: 'umami', Contemplation: 'umami',
  Nostalgia: 'umami', Longing: 'umami',
};

function topEmotionToSignal(scores: Record<string, number>): SignalName {
  let topEmotion = '';
  let topScore = -1;
  for (const [emotion, score] of Object.entries(scores)) {
    if (score > topScore) {
      topScore = score;
      topEmotion = emotion;
    }
  }
  return EMOTION_TO_SIGNAL[topEmotion] ?? 'umami';
}

// ── Return type ───────────────────────────────────────────────────────────────
export interface HumeVoiceState {
  status: EVIStatus;
  isPlaying: boolean;
  transcript: string;
  speaker: 'hunch' | 'user' | null;
  voiceSignal: SignalName;
  /** Averaged prosody scores across every assistant turn in the session */
  aggregatedProsody: Record<string, number> | null;
  errorHint: string | null;
  keysConfigured: boolean;
  startEVI: () => Promise<void>;
  stopEVI: () => void;
}

// ── Hook ────────────────────────────────────────────────────────────────────
export function useHumeVoice(accessToken: string): HumeVoiceState {
  const {
    connect,
    disconnect,
    status,
    isPlaying,
    messages,
    isMicrophoneError,
  } = useVoice();

  const [localStatus, setLocalStatus] = useState<EVIStatus>('idle');
  const [voiceSignal, setVoiceSignal]   = useState<SignalName>('umami');
  const [errorHint,   setErrorHint]     = useState<string | null>(null);

  const hasConnectedRef  = useRef(false);
  const timeoutRef       = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearConnectTimeout = useCallback(() => {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
  }, []);

  const keysConfigured =
    !!HUME_CONFIG_ID && HUME_CONFIG_ID !== 'YOUR_HUME_CONFIG_ID_HERE';

  // ── Map Hume VoiceStatus → EVIStatus ───────────────────────────────────────
  // NOTE: useVoice() returns `status` as an object { value: string }, NOT a
  // plain string — so we must switch on status.value, not status itself.
  useEffect(() => {
    switch (status.value) {
      case 'connecting':
        setLocalStatus('connecting');
        break;

      case 'connected':
        clearConnectTimeout();
        hasConnectedRef.current = true;
        setLocalStatus(isPlaying ? 'speaking' : 'listening');
        break;

      case 'disconnected':
        clearConnectTimeout();
        if (hasConnectedRef.current) {
          setLocalStatus('ended');
          hasConnectedRef.current = false;
        }
        break;

      case 'error':
        clearConnectTimeout();
        if (isMicrophoneError) {
          const inIframe = window !== window.parent;
          setErrorHint(inIframe ? 'iframe_blocked' : null);
          setLocalStatus('mic_denied');
        } else {
          setLocalStatus('error');
        }
        break;
    }
  }, [status.value, isPlaying, isMicrophoneError]);

  // ── Derive voiceSignal from the latest USER prosody scores ──────────────────
  // user_message events carry the user's spoken prosody — that's what we want
  // to map to a taste signal (not assistant_message, which reflects Hume's voice).
  useEffect(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i] as Record<string, unknown>;
      if (msg.type === 'user_message') {
        const scores = (msg as { models?: { prosody?: { scores?: Record<string, number> } } })
          ?.models?.prosody?.scores;
        if (scores && typeof scores === 'object') {
          const sig = topEmotionToSignal(scores);
          if (import.meta.env.DEV) console.log('[useHumeVoice] user prosody → voiceSignal:', sig, scores);
          setVoiceSignal(sig);
          break;
        }
      }
    }
  }, [messages]);

  // ── Aggregate prosody scores across ALL user turns ─────────────────────────
  // Averaged so Claude receives the emotional arc of the full conversation
  // from the USER's voice — not Hume's output voice.
  const aggregatedProsody = useMemo<Record<string, number> | null>(() => {
    const totals: Record<string, number> = {};
    let count = 0;
    for (const msg of messages) {
      const m = msg as Record<string, unknown>;
      if (m.type === 'user_message') {
        const scores = (m as { models?: { prosody?: { scores?: Record<string, number> } } })
          ?.models?.prosody?.scores;
        if (scores && typeof scores === 'object') {
          count++;
          for (const [emotion, score] of Object.entries(scores)) {
            totals[emotion] = (totals[emotion] ?? 0) + (score as number);
          }
        }
      }
    }
    if (count === 0) return null;
    const averaged = Object.fromEntries(
      Object.entries(totals).map(([e, s]) => [e, s / count])
    );
    const top5 = Object.entries(averaged)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([e, s]) => `${e} ${(s * 100).toFixed(0)}%`)
      .join(', ');
    if (import.meta.env.DEV) console.log(`[useHumeVoice] aggregated prosody (${count} user turns): ${top5}`);
    return averaged;
  }, [messages]);

  // ─ Transcript + speaker — newest relevant message ──────────────────────────
  let transcript = '';
  let speaker: 'hunch' | 'user' | null = null;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as Record<string, unknown>;
    if (msg.type === 'assistant_message' || msg.type === 'user_message') {
      const content = (msg as { message?: { content?: string } }).message?.content ?? '';
      transcript = content;
      speaker = msg.type === 'assistant_message' ? 'hunch' : 'user';
      break;
    }
  }

  // ── startEVI ─────────────────────────────────────────────────────────────
  // 1. Probes mic permission
  // 2. Fetches a FRESH access token right before connecting (avoids stale/empty
  //    tokens from the route loader if the user sat on the idle screen for a
  //    while, or if the initial loader fetch silently failed)
  // 3. Arms a 15-second hard timeout so a stuck WebSocket surfaces as an error
  const startEVI = useCallback(async () => {
    hasConnectedRef.current = false;
    setErrorHint(null);
    clearConnectTimeout();

    // ── 1. Probe mic permission ──────────────────────────────────────────────
    let micState: PermissionState = 'prompt';
    try {
      const perm = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      micState = perm.state;
    } catch {
      // Permissions API not supported — fall back to 'prompt'
    }

    if (micState === 'denied') {
      setLocalStatus('mic_denied');
      return;
    }

    setLocalStatus(micState === 'granted' ? 'connecting' : 'requesting_mic');

    // ── 2. Fetch a fresh token from our server-side proxy ──
    let token = accessToken;
    try {
      const tokenRes = await fetch('/api/hume-token', { method: 'POST' });
      if (tokenRes.ok) {
        const tokenData = await tokenRes.json() as { accessToken: string };
        if (tokenData.accessToken) token = tokenData.accessToken;
      }
      if (import.meta.env.DEV) console.log('[useHumeVoice] Fresh access token fetched ✓');
    } catch (err) {
      if (import.meta.env.DEV) console.error('[useHumeVoice] token fetch failed, falling back to loader token:', err);
      // If fresh fetch fails, fall back to whatever the loader gave us
    }

    if (!token) {
      if (import.meta.env.DEV) console.error('[useHumeVoice] No access token available — aborting connect');
      setLocalStatus('error');
      return;
    }

    // Ensure we're showing 'connecting' now that we have the token
    setLocalStatus('connecting');

    // ── 3. 8-second hard timeout ──────────────────────────────────────────────
    // If we're inside an iframe (Figma Make preview), the sandbox blocks outbound
    // WebSocket connections to wss://api.hume.ai — detect this and surface a
    // targeted "open in new tab" hint instead of a generic error.
    timeoutRef.current = setTimeout(() => {
      const inIframe = window !== window.parent;
      if (import.meta.env.DEV) console.warn('[useHumeVoice] Connection timed out after 8s. inIframe:', inIframe);
      setErrorHint(inIframe ? 'iframe_ws_blocked' : 'timeout');
      setLocalStatus('error');
    }, 8000);

    // ── 4. Connect ────────────────────────────────────────────────────────────
    connect({
      auth: { type: 'accessToken', value: token },
      configId: HUME_CONFIG_ID,   // ← must be passed here; VoiceProvider prop is ignored by SDK
      // Override the system prompt to enforce a strict single-question flow.
      // This prevents Hume from asking follow-up questions after the user responds.
      systemPrompt: {
        role: 'system',
        content: `You are Hunch — a calm, intuitive wellness companion inside HunchDoctor.

RULES (follow exactly):
1. Ask the user ONE single open-ended question about how they are feeling right now — their body sensations, energy level, or emotional state. Keep the question to one sentence.
2. Listen in complete silence while the user answers. Do NOT speak until they finish.
3. After the user has finished their response, say a brief, warm acknowledgement (one sentence maximum — no follow-up questions, no probing).
4. Immediately call the begin_facial_scan tool.

NEVER ask a second question. NEVER ask for clarification. NEVER ask the user to elaborate. One question, one acknowledgement, then begin_facial_scan. That is the complete flow.`,
      },
    })
      .then(() => {
        // Success handled by the useEffect watching `status` → 'connected'
      })
      .catch((err: Error) => {
        clearConnectTimeout();
        if (import.meta.env.DEV) console.error('[useHumeVoice] connect error:', err);
        setLocalStatus('error');
      });
  }, [connect, accessToken]);

  // ── stopEVI ─────────────────────────────────────────────────────────────────
  const stopEVI = useCallback(() => {
    clearConnectTimeout();
    disconnect();
    hasConnectedRef.current = false;
    setLocalStatus('idle');
  }, [disconnect]);

  return {
    status: localStatus,
    isPlaying,
    transcript,
    speaker,
    voiceSignal,
    aggregatedProsody,
    errorHint,
    keysConfigured,
    startEVI,
    stopEVI,
  };
}