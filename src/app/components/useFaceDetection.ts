/**
 * useFaceDetection — multi-frame averaged expression reading
 *
 * Accuracy improvements over v1 (single-snapshot):
 *
 *  1. MULTI-FRAME AVERAGING
 *     Takes SAMPLE_COUNT snapshots at SAMPLE_INTERVAL_MS throughout the scan
 *     window and averages all expression probabilities weighted by the face
 *     detection score. One bad frame can't dominate the result.
 *
 *  2. NO Math.random() IN SIGNAL COMPUTATION
 *     The original code applied `0.65 + Math.random() * 0.2` to the dominant
 *     signal — explicitly randomising the compass on every scan even with an
 *     identical face. All maths is now deterministic.
 *
 *  3. LONGER CAMERA WARMUP (2000 ms)
 *     Webcam auto-exposure / auto-white-balance typically settles in 2–3 s.
 *     Reading earlier means the first frames are often poorly lit.
 *
 *  4. HIGHER MODEL RESOLUTION (inputSize 224)
 *     TinyFaceDetector at inputSize 224 gives meaningfully better expression
 *     probabilities at the cost of ~15 ms extra per inference — negligible
 *     for a 5-second scan.
 *
 *  5. STRICTER DETECTION THRESHOLD (scoreThreshold 0.5)
 *     Filters out weak detections before they pollute the average.
 *
 *  6. MINIMUM VALID SAMPLE GATE
 *     Returns null (→ graceful fallback) if fewer than MIN_VALID_SAMPLES
 *     frames produced a confident detection.
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import * as faceapi from '@vladmandic/face-api';
import type { SignalValues, SignalName } from '../store';

// ── Model URL ─────────────────────────────────────────────────────────────────
// @vladmandic/face-api model weights hosted on jsDelivr CDN.
// Only TinyFaceDetector (190 KB) + FaceExpressionNet (310 KB) are loaded.
const MODELS_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model/';

// ── Scan tuning ───────────────────────────────────────────────────────────────
const SAMPLE_COUNT        = 8;      // number of frames to average (was 6)
const SAMPLE_INTERVAL_MS  = 500;    // ms between each sample
const CAMERA_WARMUP_MS    = 2000;   // ms before first sample (AE/AWB settle)
const MIN_VALID_SAMPLES   = 2;      // minimum frames with a detected face
const INPUT_SIZE          = 224;    // TinyFaceDetector input resolution
const SCORE_THRESHOLD     = 0.5;    // minimum face detection confidence

// ── Expression → signal ───────────────────────────────────────────────────────
const EXPRESSION_TO_SIGNAL: Record<string, SignalName> = {
  happy:     'sweet',
  surprised: 'sour',
  fearful:   'sour',
  angry:     'bitter',
  disgusted: 'bitter',
  sad:       'umami',
  neutral:   'salt',
};

// ── Types ─────────────────────────────────────────────────────────────────────
export type FaceDetectionStatus =
  | 'idle'
  | 'loading-models'
  | 'requesting-camera'
  | 'scanning'
  | 'no-face'
  | 'camera-denied'
  | 'error';

export interface FaceResult {
  signals:            SignalValues;
  dominantSignal:     SignalName;
  dominantExpression: string | null;
  /** Full weighted-average expression probabilities — all 7 classes */
  expressionScores:   Record<string, number>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useFaceDetection() {
  const [status, setStatus]           = useState<FaceDetectionStatus>('idle');
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const videoRef  = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Load models on mount
  useEffect(() => {
    setStatus('loading-models');
    Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_URL),
      faceapi.nets.faceExpressionNet.loadFromUri(MODELS_URL),
    ])
      .then(() => {
        console.log('[FaceDetection] models loaded ✓');
        setModelsLoaded(true);
        setStatus('idle');
      })
      .catch(err => {
        console.error('[FaceDetection] model load failed:', err);
        setStatus('error');
      });
  }, []);

  // ── scan ──────────────────────────────────────────────────────────────────
  const scan = useCallback(async (): Promise<FaceResult | null> => {
    if (!modelsLoaded) {
      console.warn('[FaceDetection] scan called before models loaded');
      return null;
    }

    // ── Step 1: camera ─────────────────────────────────────────────────────
    setStatus('requesting-camera');

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width:  { ideal: 640 },
          height: { ideal: 480 },
        },
      });
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : '';
      const isDenied = name === 'NotAllowedError' || name === 'PermissionDeniedError';
      setStatus(isDenied ? 'camera-denied' : 'error');
      if (isDenied) {
        console.debug('[FaceDetection] camera not available — using estimated signals');
      } else {
        console.warn('[FaceDetection] getUserMedia failed:', err);
      }
      return null;
    }

    streamRef.current = stream;

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      try {
        await videoRef.current.play();
      } catch { /* autoplay may throw — video still plays */ }
    }

    setStatus('scanning');

    // ── Step 2: warmup ─────────────────────────────────────────────────────
    await new Promise(r => setTimeout(r, CAMERA_WARMUP_MS));

    // ── Step 3: multi-frame sampling ───────────────────────────────────────
    type DetectionWithExpressions = faceapi.WithFaceExpressions<{
      detection: faceapi.FaceDetection;
    }>;
    const samples: DetectionWithExpressions[] = [];

    for (let i = 0; i < SAMPLE_COUNT; i++) {
      if (videoRef.current) {
        try {
          const result = await faceapi
            .detectSingleFace(
              videoRef.current,
              new faceapi.TinyFaceDetectorOptions({
                inputSize:      INPUT_SIZE,
                scoreThreshold: SCORE_THRESHOLD,
              }),
            )
            .withFaceExpressions();

          if (result) {
            samples.push(result);
            console.log(
              `[FaceDetection] sample ${i + 1}/${SAMPLE_COUNT}:`,
              result.expressions,
            );
          } else {
            console.log(`[FaceDetection] sample ${i + 1}/${SAMPLE_COUNT}: no face`);
          }
        } catch (e) {
          console.warn(`[FaceDetection] sample ${i + 1} error:`, e);
        }
      }

      if (i < SAMPLE_COUNT - 1) {
        await new Promise(r => setTimeout(r, SAMPLE_INTERVAL_MS));
      }
    }

    // ── Step 4: camera stays OPEN — caller calls stopCamera() when ready ───
    // We deliberately do NOT close the stream here.  Keeping the camera live
    // allows VitalLens to accumulate rPPG signal for as long as HunchCompass
    // decides (target ~20 s total).  Call stopCamera() when done.

    // ── Step 5: validate sample count ──────────────────────────────────────
    if (samples.length < MIN_VALID_SAMPLES) {
      console.warn(
        `[FaceDetection] only ${samples.length} valid samples — below MIN_VALID_SAMPLES (${MIN_VALID_SAMPLES})`,
      );
      setStatus('no-face');
      return null;
    }

    // ── Step 6: weighted average of expressions ────────────────────────────
    const avgExpr: Record<string, number> = {};
    let totalWeight = 0;

    for (const s of samples) {
      const w = s.detection.score;
      totalWeight += w;
      for (const [expr, val] of Object.entries(s.expressions)) {
        avgExpr[expr] = (avgExpr[expr] ?? 0) + (val as number) * w;
      }
    }
    for (const key of Object.keys(avgExpr)) {
      avgExpr[key] /= totalWeight;
    }

    const sortedExpr = Object.entries(avgExpr).sort(([, a], [, b]) => b - a);
    const dominantExpression = sortedExpr[0]?.[0] ?? null;

    console.log('[FaceDetection] averaged expressions:', avgExpr);
    console.log('[FaceDetection] dominant expression:', dominantExpression);

    // ── Step 7: map to signal values ──────────────────────────────────────
    const signalScores: SignalValues = {
      sweet: 0.08, sour: 0.08, bitter: 0.08, salt: 0.08, umami: 0.08,
    };

    for (const [expr, prob] of sortedExpr) {
      const sig = EXPRESSION_TO_SIGNAL[expr];
      if (sig) {
        signalScores[sig] = Math.min(1, signalScores[sig] + prob * 0.85);
      }
    }

    const dominantSignal = (
      Object.entries(signalScores) as [SignalName, number][]
    ).sort(([, a], [, b]) => b - a)[0][0];

    console.log('[FaceDetection] signal scores:', signalScores, '→ dominant:', dominantSignal);

    // Status stays 'scanning' — camera is still live for VitalLens
    return { signals: signalScores, dominantSignal, dominantExpression, expressionScores: avgExpr };
  }, [modelsLoaded]);

  // ── stopCamera — call this when VitalLens is done with the stream ──────────
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStatus('idle');
    console.log('[FaceDetection] camera stopped ✓');
  }, []);

  return { status, modelsLoaded, videoRef, streamRef, scan, stopCamera };
}