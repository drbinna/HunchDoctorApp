# 🧭 HunchDoctor

**An interoceptive wellness companion that reads your body's hidden signals.**

HunchDoctor uses real-time facial expression analysis, voice prosody sensing, and remote photoplethysmography (rPPG) to generate a personalised "taste compass" — mapping your internal state across five dimensions: **Sweet**, **Sour**, **Bitter**, **Salt**, and **Umami**.

> *Your body knows things before your mind catches up. HunchDoctor helps you listen.*

---

## ✨ Features

### 🎯 Signal Compass
A five-axis interoceptive compass that visualises your current internal state. Each axis represents a "taste signal" — a metaphorical mapping of emotional and physiological patterns to the five basic tastes.

### 📷 Facial Expression Analysis
Uses **face-api.js** to detect and classify facial expressions in real time through your device camera. Expression data is translated into the taste-signal space and fused with other data sources.

### 🎙️ Empathic Voice Interface (EVI)
Powered by **Hume AI's EVI**, the voice interface captures emotional prosody — the tonal and rhythmic qualities of your speech — and maps them to signal dimensions. The voice session generates a detailed 48-emotion probability map that is fused with facial data.

### 💓 Remote Vital Sign Estimation (rPPG)
Estimates **heart rate** and **respiratory rate** from your camera feed using:
- **VitalLens API** — cloud-based rPPG analysis for high-accuracy readings
- **POS Algorithm** — a local fallback using the Plane-Orthogonal-to-Skin method for offline heart rate estimation

### 🧠 AI-Powered Insights
After scanning, **Anthropic Claude** generates a personalised interoceptive insight based on fused signal data, biometrics, facial expressions, and voice prosody — helping you understand what your body might be telling you.

### 📓 Journal
Save scan results to a personal journal to track your interoceptive patterns over time.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────┐
│                  Browser                     │
│                                              │
│  Camera → face-api.js → expression signals   │
│  Camera → rPPG frames → POS algorithm        │
│  Microphone → Hume EVI → prosody scores      │
│                                              │
│  ┌─────────────────────────────────────────┐ │
│  │         Signal Fusion Engine            │ │
│  │   face (65%) + prosody (35%) → compass  │ │
│  └─────────────────────────────────────────┘ │
│                    ↓                         │
│  Claude insight ← /api/claude-proxy          │
│  Hume token    ← /api/hume-token             │
│  VitalLens     ← /api/vitallens-proxy        │
└──────────────────│───────────────────────────┘
                   │
       ┌───────────▼───────────┐
       │  Vercel Edge Functions │
       │  (API keys live here)  │
       └───────────────────────┘
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + Vite |
| Routing | React Router v7 |
| Animations | Framer Motion (`motion/react`) |
| Facial Detection | face-api.js (TensorFlow.js) |
| Voice AI | Hume AI EVI (`@humeai/voice-react`) |
| Vital Signs | VitalLens API + local POS algorithm |
| AI Insights | Anthropic Claude (via server-side proxy) |
| Deployment | Vercel (Edge Functions for API proxying) |
| Styling | Tailwind CSS v4 + custom CSS |

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
git clone https://github.com/drbinna/HunchDoctorApp.git
cd HunchDoctorApp
npm install
```

### Environment Variables

Create a `.env.local` file in the root:

```env
# Client-side (safe — non-secret config identifier)
VITE_HUME_CONFIG_ID=your_hume_config_id

# Server-side only (for local dev with `vercel dev`)
# These should NOT have the VITE_ prefix
ANTHROPIC_API_KEY=sk-ant-...
HUME_API_KEY=your_hume_api_key
HUME_SECRET_KEY=your_hume_secret_key
VITALLENS_API_KEY=your_vitallens_api_key
```

> **⚠️ Important:** Only `VITE_` prefixed variables are bundled into the client-side code. All API keys use server-side-only variables and are accessed through proxy endpoints.

### Running Locally

```bash
# Standard Vite dev server (API proxies won't work)
npm run dev

# Full-stack with Vercel serverless functions
vercel dev
```

### Production Deployment

Deploy to Vercel and set the following **Environment Variables** in the Vercel Dashboard (Settings → Environment Variables):

| Variable | Description |
|----------|-------------|
| `VITE_HUME_CONFIG_ID` | Hume EVI configuration ID |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key |
| `HUME_API_KEY` | Hume AI API key |
| `HUME_SECRET_KEY` | Hume AI secret key |
| `VITALLENS_API_KEY` | VitalLens/Rouast API key |

---

## 🔒 Security

All API keys are handled **server-side only** through Vercel Edge Functions:

- `/api/claude-proxy` — Proxies Anthropic Claude requests
- `/api/hume-token` — Exchanges Hume credentials for short-lived access tokens
- `/api/vitallens-proxy` — Proxies VitalLens rPPG API requests

The client-side bundle **never** contains secret API keys. CORS is restricted to approved origins.

---

## 📁 Project Structure

```
├── api/                      # Vercel serverless functions
│   ├── claude-proxy.ts       # Anthropic Claude API proxy
│   ├── hume-token.ts         # Hume OAuth2 token exchange
│   └── vitallens-proxy.ts    # VitalLens rPPG API proxy
├── src/
│   ├── app/
│   │   ├── components/
│   │   │   ├── HunchCompass.tsx       # Main compass scanning screen
│   │   │   ├── CompassWeb.tsx         # SVG compass visualisation
│   │   │   ├── AvatarOrb.tsx          # Animated avatar indicator
│   │   │   ├── VoiceScreen.tsx        # Hume EVI voice interface
│   │   │   ├── useHumeVoice.ts        # Voice hook with prosody mapping
│   │   │   ├── useFaceDetection.ts    # Face-api.js detection hook
│   │   │   ├── useVitalLens.ts        # rPPG vital sign estimation
│   │   │   ├── useClaudeInsight.ts    # AI insight generation
│   │   │   └── signals.ts            # Signal config and mock data
│   │   └── store.ts                   # App state management
│   ├── config/
│   │   └── keys.ts                    # Client-side config (non-secrets only)
│   └── main.tsx                       # App entry point
├── .env.local                         # Local env vars (gitignored)
└── guidelines/
    └── Guidelines.md                  # Design guidelines
```

---

## 📄 License

This project is private. All rights reserved.

---

## 🙏 Acknowledgements

- [Hume AI](https://hume.ai) — Empathic Voice Interface
- [Anthropic](https://anthropic.com) — Claude AI
- [VitalLens / Rouast](https://www.rouast.com/vitallens/) — Remote photoplethysmography
- [face-api.js](https://github.com/justadudewhohacks/face-api.js) — Face detection and expression recognition
- Original design from [Figma](https://www.figma.com/design/AmEyIt6cQyCrnxBL2aSSSM/Wellness-App-for-Figbuild)