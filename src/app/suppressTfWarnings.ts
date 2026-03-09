/**
 * suppressTfWarnings.ts
 *
 * Both @vladmandic/face-api and vitallens bundle their own copy of TensorFlow.js.
 * When both are loaded in the same page, TF.js logs a flood of
 * "The kernel '…' for backend 'webgl' is already registered" warnings —
 * all of which are harmless (TF.js gracefully reuses the existing backend).
 *
 * This module patches console.warn and console.error ONCE at app boot to
 * suppress only those specific TF.js duplicate-registration messages.
 * All other warnings and errors pass through untouched.
 *
 * Import this file first in App.tsx (or main.tsx) so the patch is in place
 * before either TF.js-bundling library initialises.
 */

const TF_PATTERNS = [
  /already been set/,                       // "Platform browser has already been set"
  /backend was already registered/,          // "webgl backend was already registered"
  /is already registered/,                   // "The kernel '…' is already registered"
  /Reusing existing backend factory/,
];

function isTfNoise(args: unknown[]): boolean {
  return args.some(
    a => typeof a === 'string' && TF_PATTERNS.some(p => p.test(a)),
  );
}

const _warn  = console.warn.bind(console);
const _error = console.error.bind(console);

console.warn = (...args: unknown[]) => {
  if (!isTfNoise(args)) _warn(...args);
};

console.error = (...args: unknown[]) => {
  if (!isTfNoise(args)) _error(...args);
};
