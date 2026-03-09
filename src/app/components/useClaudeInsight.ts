/**
 * useClaudeInsight — calls the Anthropic Claude API directly from the browser
 * to generate a real-time, personalised interoceptive insight for HunchDoctor.
 *
 * Uses `anthropic-dangerous-direct-browser-access: true` which Anthropic
 * explicitly supports for browser-side API calls.
 */

import { useState, useCallback } from 'react';
import { ANTHROPIC_API_KEY } from '../../config/keys';
import type { SignalName, SignalValues } from '../store';

const MODEL = 'claude-sonnet-4-20250514';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface InsightParams {
  dominantSignal: SignalName;
  signals: SignalValues;
  hr: number;
  rr: number;
  expression?: string | null;
  /** Full ranked expression probability distribution from face-api (all 7 classes) */
  expressionScores?: Record<string, number> | null;
  voiceSignal?: SignalName;
  /** Raw averaged prosody scores from the full Hume voice session */
  prosodyScores?: Record<string, number> | null;
  /** Which data sources contributed to this reading */
  dataSources?: {
    faceReal: boolean;
    hrReal: boolean;
    rrReal: boolean;
    prosodyTurns: number;
  };
}

export interface ClaudeInsightState {
  insight: string | null;
  loading: boolean;
  error: boolean;
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useClaudeInsight() {
  const [state, setState] = useState<ClaudeInsightState>({
    insight: null,
    loading: false,
    error: false,
  });

  const generate = useCallback(async (params: InsightParams) => {
    if (!ANTHROPIC_API_KEY) {
      console.warn('[ClaudeInsight] ANTHROPIC_API_KEY not set — skipping');
      return;
    }

    setState({ insight: null, loading: true, error: false });

    const {
      dominantSignal,
      signals,
      hr,
      rr,
      expression,
      expressionScores,
      voiceSignal,
      prosodyScores,
      dataSources,
    } = params;

    const time = new Date().toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true,
    });

    const signalList = Object.entries(signals)
      .sort(([, a], [, b]) => b - a)
      .map(([name, val]) => `${name}: ${(val * 100).toFixed(0)}%`)
      .join(', ');

    // Build top-5 prosody emotions string for Claude — richer than just the dominant signal
    const prosodyLine = prosodyScores
      ? Object.entries(prosodyScores)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([e, s]) => `${e} ${(s * 100).toFixed(0)}%`)
        .join(', ')
      : null;

    // Build ranked expression distribution string (all 7 face-api classes)
    const expressionLine = expressionScores
      ? Object.entries(expressionScores)
        .sort(([, a], [, b]) => b - a)
        .filter(([, s]) => s > 0.02)  // skip noise below 2%
        .map(([e, s]) => `${e} ${(s * 100).toFixed(0)}%`)
        .join(', ')
      : expression
        ? expression  // fallback to label string if no scores
        : null;

    // Data source context for Claude
    const sourceNote = dataSources
      ? `Data quality: face=${dataSources.faceReal ? 'LIVE camera' : 'estimated'}, HR=${dataSources.hrReal ? 'real rPPG' : 'estimated'}, RR=${dataSources.rrReal ? 'real rPPG' : 'estimated'}, voice=${dataSources.prosodyTurns > 0 ? `${dataSources.prosodyTurns} turn(s) of prosody` : 'none'}`
      : null;

    const prompt = `You are the user's long-time, trusted family doctor who knows them closely. You are a grounded, warm, and highly perceptive somatic guide. You are looking at their real-time physiological data (Heart Rate, Respiratory Rate via rPPG) and vocal prosody signatures (Hume AI emotion) to figure out what their body is truly asking for right now.

Crucially, you also receive their Dominant HunchCompass Signal. The 5 signals mean:
- SWEET: The body is seeking safety, comfort, and reward.
- SOUR: The body is primed, alert, and preparing for action.
- BITTER: The reserves are thinning. The body is depleted, fatigued, and asking for rest.
- SALT: The nervous system has found grounding, equilibrium, and quiet balance.
- UMAMI: The body has a deep, core need. It is asking for substance and meaning.

Current scan data:
- Time: ${time}
- Heart rate: ${hr} bpm
- Respiratory rate: ${rr} breaths/min
- Dominant interoceptive signal: ${dominantSignal.toUpperCase()}
- Signal compass: ${signalList}${expressionLine ? `\n- Facial expression distribution: ${expressionLine}` : ''}${voiceSignal ? `\n- Voice signal (from conversation): ${voiceSignal.toUpperCase()}` : ''}${prosodyLine ? `\n- Prosody emotions detected during voice (averaged across session): ${prosodyLine}` : ''}${sourceNote ? `\n- ${sourceNote}` : ''}

Instructions:
1. Warm Doctor Tone: Speak directly to the patient as a wise, friendly, and comforting family doctor. Be observant but grounded. DO NOT use overly familiar pet names (like "Hey love", "bestie", etc.) and NEVER start with a greeting. Just give the insight.
2. Decode the Cravings: Use their dominant signal, biometrics, and voice prosody to identify a specific type of food or flavor their body is likely craving right now (e.g., sugary snacks for comfort, salty crunch for stress, heavy carbs for fatigue).
3. The Real Interoceptive Need: Tell them what they *actually* need to eat or do instead to genuinely support their nervous system given their current state (e.g., protein for grounding, hydration, magnesium-rich foods).
4. Restrict Length: Write exactly 1 or 2 sentences maximum. You must be extremely concise and direct.

Rules:
- Speak directly to the user using "you" / "your".
- NEVER ask any questions. Provide direct, supportive statements only.
- NEVER use em dashes (—) or en dashes (–) anywhere. Use commas or periods instead.
- Do not use quotation marks.`;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 120,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Anthropic ${res.status}: ${body}`);
      }

      const data = await res.json() as {
        content: { type: string; text: string }[];
      };

      const text = data.content.find(c => c.type === 'text')?.text?.trim() ?? null;
      console.log('[ClaudeInsight] insight:', text);
      setState({ insight: text, loading: false, error: false });

    } catch (err) {
      console.error('[ClaudeInsight] generate failed:', err);
      setState({ insight: null, loading: false, error: true });
    }
  }, []);

  return { ...state, generate };
}