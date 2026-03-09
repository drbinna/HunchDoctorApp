import type { SignalName, SignalValues } from '../store';

export const SIGNAL_CONFIG: Record<SignalName, { color: string; label: string; glow: string }> = {
  sweet: { color: '#f7a8c4', label: 'SWEET', glow: 'rgba(247,168,196,0.4)' },
  sour: { color: '#a8e6a3', label: 'SOUR', glow: 'rgba(168,230,163,0.4)' },
  bitter: { color: '#8b7ab8', label: 'BITTER', glow: 'rgba(139,122,184,0.4)' },
  salt: { color: '#a8d4f7', label: 'SALT', glow: 'rgba(168,212,247,0.4)' },
  umami: { color: '#e8b887', label: 'UMAMI', glow: 'rgba(232,184,135,0.4)' },
};

export const SIGNAL_ORDER: SignalName[] = ['sweet', 'sour', 'bitter', 'salt', 'umami'];

// Pentagon angles: starting top, clockwise
export const SIGNAL_ANGLES = SIGNAL_ORDER.map((_, i) => -Math.PI / 2 + (2 * Math.PI / 5) * i);

export const COMPASS_INSIGHTS: Record<SignalName, string[]> = {
  sweet: [
    "Comfort is near. Your body is remembering safety.",
    "A Sweet signal. You are seeking warmth and reward.",
    "Your nervous system is leaning into ease right now.",
  ],
  sour: [
    "Heightened. Your body is primed for something incoming.",
    "Sour is alertness before the moment arrives.",
    "Your system is activated, not anxious. There's a difference.",
  ],
  bitter: [
    "Bitter is leading. Your body is bracing for something.",
    "Fatigue has gathered. Your system is asking for rest.",
    "Depletion is speaking. Bitter means the reserves are thinning.",
  ],
  salt: [
    "Grounded. Your body found solid ground.",
    "Salt means balance. You are exactly where you are.",
    "Your nervous system is steady. This is rare. Notice it.",
  ],
  umami: [
    "Depletion. Your body is asking to be nourished.",
    "Umami signals a deep need. Not hunger — substance.",
    "Your system is asking for depth, not stimulation.",
  ],
};

export const DEEP_INSIGHTS: Record<SignalName, string> = {
  sweet: "Your body is craving comfort and safety. This is not weakness — it's intelligence. The Sweet signal activates when your nervous system is seeking reward after effort. What have you been carrying that deserves acknowledgment right now?",
  sour: "Sour is your body's readiness signal. Your system is elevated, alert, processing. This is not anxiety — it's preparation. Your nervous system is doing its job. Notice what specifically has put it on alert.",
  bitter: "The Bitter signal runs deep. It is your body's oldest warning: reserves are low, defense is up. You have been running on less than you need. This is your nervous system asking, not demanding. What would one small act of rest look like right now?",
  salt: "Salt is the rarest signal to catch. It means your nervous system found equilibrium — not forced, not suppressed. Just balanced. Notice what conditions made this moment possible. This is data worth keeping.",
  umami: "Umami is your body asking for substance. Not food necessarily — depth, meaning, connection. Your system is depleted in a way that stimulation cannot fix. What would genuine nourishment look like for you today?",
};

export const ORB_INSIGHTS: Record<SignalName, string> = {
  sweet: "Sweet attention introduced. Your body recognizes this signal. Notice where warmth lives in you right now.",
  sour: "Sour channel opened. Alertness amplified. Let your system tell you what it's preparing for.",
  bitter: "Bitter acknowledged. You are not ignoring it anymore. What has been draining you that you haven't named yet?",
  salt: "Salt attention directed. Grounding is possible even now. Your body knows how to find equilibrium.",
  umami: "Umami channel engaged. Your body is identifying a need. Not hunger — something deeper.",
};

export const JOURNAL_NARRATIVES: Record<SignalName, string[]> = {
  sweet: [
    "A Sweet session. Your nervous system arrived seeking comfort and found a moment of grace. The compass brightened as your body acknowledged its own need for warmth.",
    "Sweet-dominant. Something softer was underneath the surface today. Your body asked for ease — and you gave it your attention instead of your resistance.",
  ],
  sour: [
    "Sour-dominant. Your body arrived activated and primed. The compass caught an alertness that your mind hadn't fully named yet. You listened before you understood.",
    "A Sour reading. Your system was already in motion before the session began. Whatever is coming, your body has been quietly preparing.",
  ],
  bitter: [
    "Bitter led the session. Your heart rate carried the weight of something recent. The compass named what you hadn't said aloud: the reserves are thinning. You acknowledged it.",
    "Bitter-dominant again. Your body is consistent about this signal. It's not a flaw — it's information. Something has been drawing on your energy longer than you've noticed.",
  ],
  salt: [
    "Salt emerged. A grounded session — equilibrium without effort. Your nervous system found stillness and the compass reflected it back to you clearly.",
    "Salt-dominant. Balance arrived without being forced. Your body remembered what calm feels like. This reading is worth keeping.",
  ],
  umami: [
    "Umami led the way. A depth signal. Your body asked for nourishment — not food, but substance. The compass held that request in amber light while you sat with it.",
    "Umami-dominant. Your system identified a depletion your mind had been rationalizing away. The compass gave it a name. Now you have one too.",
  ],
};

export function generateSignals(): { signals: SignalValues; dominantSignal: SignalName } {
  const dominantIndex = Math.floor(Math.random() * SIGNAL_ORDER.length);
  const dominantSignal = SIGNAL_ORDER[dominantIndex];
  const signals = {} as SignalValues;
  SIGNAL_ORDER.forEach((name, i) => {
    if (i === dominantIndex) {
      signals[name] = 0.62 + Math.random() * 0.23;
    } else {
      signals[name] = 0.12 + Math.random() * 0.38;
    }
  });
  return { signals, dominantSignal };
}

export function getDominantSignal(signals: SignalValues): SignalName {
  return (Object.keys(signals) as SignalName[]).reduce((a, b) =>
    signals[a] > signals[b] ? a : b
  );
}

export function getRandomInsight(signal: SignalName): string {
  const options = COMPASS_INSIGHTS[signal];
  return options[Math.floor(Math.random() * options.length)];
}

export function getRandomNarrative(signal: SignalName): string {
  const options = JOURNAL_NARRATIVES[signal];
  return options[Math.floor(Math.random() * options.length)];
}

export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Good morning. Your body has things to tell us.";
  if (hour >= 12 && hour < 17) return "Good afternoon. Let's read what you're carrying.";
  if (hour >= 17 && hour < 21) return "Good evening. Your signals are ready when you are.";
  return "Late night. Your body is still speaking. Shall we listen?";
}

export function getMockHR(): number {
  return 68 + Math.floor(Math.random() * 24);
}

export function getMockRR(): number {
  return 12 + Math.floor(Math.random() * 6);
}
