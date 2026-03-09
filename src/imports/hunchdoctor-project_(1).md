# HunchDoctor
### *Your gut has been trying to tell you something your whole life. We finally built the instrument to hear it.*

---

## Overview

HunchDoctor is a speculative wellness app that tracks, visualizes, and manipulates human interoceptive signals through gustatory (taste) sensing. It reads pre-conscious body signals — micro-facial expressions and biometric data — to decode what your body is experiencing before your brain catches up.

Built for the FigBuild 2026 design hackathon.

---

## The Problem

Your interoceptive system processes 11 million signals per second. Your conscious mind receives 50. Hunger, tension, craving, calm — your body already knows. You just don't have the instrument to read it.

Modern wellness tools address symptoms. HunchDoctor addresses the signal beneath the symptom.

---

## The Science

- Humans possess between 22 and 33 distinct senses beyond the traditional five
- Interoception is the nervous system's continuous detection of internal physiological signals
- HRV (Heart Rate Variability) is a direct window into how clearly your body can hear itself
- Micro-facial expressions precede conscious awareness by 200–500ms
- Taste signals are neurologically linked to emotion, reward, motivation, and arousal
- The gut-brain axis communicates internal state through taste-linked neurological channels

---

## Target Audience

Adults 25–45 experiencing:
- Stress and burnout
- Emotional dysregulation
- Disconnection from their physical selves
- Reactive behaviors — stress eating, caffeine dependence, emotional suppression

**Three User Personas:**
- **The Burned Out Professional** — body is signaling overload, mind won't slow down
- **The Emotional Eater** — cravings are emotional signals they can't decode
- **The Wellness Seeker** — already tuned in, wants deeper self-knowledge

---

## The Sense We Are Addressing

**Gustatory Interoception** — the body's pre-conscious taste anticipation signals.

The micro-signals your nervous system sends about what it needs before your brain registers a craving or emotion consciously. HunchDoctor makes the whisper audible.

**Wellness Dimension:** Emotional and mental wellness

**Behavioral Change Goal:** Moving users from reactive body responses toward proactive interoceptive literacy — recognizing and naming what their body is signaling before it escalates into a behavior.

---

## Core Features

### 1. The Hunch Compass
The core real-time interoceptive visualization.

Five signal poles — Sweet, Sour, Bitter, Salt, Umami — rendered as a living, breathing organic web. The user's current internal state mapped in real time. The HunchDoctor avatar floats beside it, reacting emotionally to the signal state.

**User Flow:**
- Compass blooms open on screen
- Passive sensing begins — camera reads expressions and biometrics
- Dominant signal illuminates
- Avatar reacts and delivers a Claude-generated insight line
- User chooses: Tell me more / I want to shift this / Save this moment

**Signal Mapping:**

| Expression | HunchDoctor Signal | Meaning |
|---|---|---|
| Disgusted | Bitter | Fatigue, defense, need for rest |
| Happy | Sweet | Comfort, reward, safety |
| Fearful | Sour | Alertness, anxiety, activation |
| Neutral | Salt | Grounded, balanced, stable |
| Sad | Umami | Depletion, need for nourishment |
| Angry | Bitter + Salt | Stress, tension, overload |
| Surprised | Sour + Sweet | Curiosity, sudden shift |

---

### 2. Signal Orbs
The insight and attention manipulation layer.

Five glowing orbs representing each taste signal. Users drag orbs toward the Hunch Compass to intentionally direct their interoceptive attention. Each orb drag triggers a Claude-generated insight about that signal channel.

**How It Actually Works:**
The orbs do not change how you feel. They change what you pay attention to. Deliberately directing conscious attention to a specific body signal amplifies awareness of it. The orb is a metaphor made interactive — it shows you where to look, not what to feel.

**What Each Orb Triggers:**
- Animated color response in the Compass
- A unique sound tone
- A Claude-generated insight specific to that signal
- A suggested real-world micro-action

---

### 3. The Hunch Journal
A longitudinal log where every check-in becomes a narrative entry.

Every session is automatically documented. No manual logging. Claude generates a 2–3 sentence narrative entry after each check-in capturing the physiological and emotional arc of that session.

**Single Entry Example:**
> *"Saturday 11:42pm — You arrived Bitter-heavy with a low respiratory rate. After engaging Sweet and Umami your compass softened noticeably. Your body was asking for grounding tonight, not stimulation. You gave it attention instead of action."*

**Pattern Layer:**
After 5 or more check-ins, HunchDoctor surfaces pattern observations:
> *"You have arrived Bitter-dominant in 4 of your last 6 afternoon check-ins. Your body has a pattern around this time of day. Would you like to explore what it might be responding to?"*

---

## User Flow

```
Launch App
    ↓
Welcome Screen — HunchDoctor avatar greets user
    ↓
"I'm ready" or "Just checking in"
    ↓
Hunch Compass — passive sensing begins
    ↓
Signal state revealed — avatar reacts — insight delivered
    ↓
User chooses:
    → Tell me more      → Deeper insight from Claude
    → Shift this        → Signal Orbs
    → Save this moment  → Hunch Journal entry created
    ↓
Hunch Journal — session narrative generated
    ↓
Pattern observation surfaced (after 5+ sessions)
```

---

## UI Design — Screen by Screen

### Design Principles
- **One thing per screen** — never compete for attention
- **Dark first** — deep near-black background on every screen
- **Text is minimal** — Claude speaks in short lines, never paragraphs
- **No dashboards** — no charts, no numbers, no data overload
- **Touch is intentional** — every tap means something
- **Transitions are slow** — nothing snaps, everything breathes

---

### SCREEN 1 — Welcome Screen

**Layout:** Fully centered. Single column. Nothing competes.

```
┌─────────────────────────────┐
│                             │
│                             │
│         [AVATAR]            │  ← Glowing orb, pulsing amber/teal
│                             │
│       HunchDoctor           │  ← App name, white, wide tracking
│                             │
│  "Good evening. Your body   │  ← Claude greeting, italic, dim white
│   has things to tell us."   │    max 2 lines, centered
│                             │
│                             │
│    ┌─────────────────┐      │  ← Primary CTA, full width pill button
│    │   I'm ready     │      │    white text on frosted glass
│    └─────────────────┘      │
│                             │
│      Just checking in       │  ← Secondary option, text only, dim
│                             │
└─────────────────────────────┘
```

**UI Details:**
- Background: `#0a0a0f` — near black
- Avatar: 120px glowing orb, centered, breathing animation
- App name: 13px, letter-spacing 6px, uppercase, opacity 60%
- Greeting text: 18px, italic, Cormorant or similar serif, opacity 85%
- Primary button: full width minus 40px margin, 56px height, rounded pill, frosted glass `rgba(255,255,255,0.08)`, white border `rgba(255,255,255,0.15)`
- Secondary option: 14px, opacity 40%, no underline, tap target 44px

---

### SCREEN 2 — Hunch Compass

**Layout:** Full screen. Avatar small top left. Compass center. Insight bottom.

```
┌─────────────────────────────┐
│  [avatar]    HunchDoctor    │  ← Small avatar top left, app name right
│                             │
│           SWEET             │  ← Signal label, 11px, dim
│             ●               │
│   UMAMI  ●   ●  SOUR        │  ← Five poles around compass web
│        ●       ●            │
│   SALT  ●       ● BITTER    │
│                             │
│    ┌───────────────┐        │
│    │  [COMPASS WEB]│        │  ← Organic breathing pentagon shape
│    │               │        │    fills with dominant signal color
│    └───────────────┘        │
│                             │
│  ┌──────────────────────┐   │  ← Frosted glass insight card
│  │ Bitter is leading.   │   │    14px, italic, white
│  │ Your body is bracing │   │
│  │ for something.       │   │
│  └──────────────────────┘   │
│                             │
│  Tell me more  |  Shift it  │  ← Two ghost pill buttons, side by side
│                             │
│      Save this moment       │  ← Text only, dim, below buttons
└─────────────────────────────┘
```

**UI Details:**
- Compass web: SVG pentagon, organic edges, filled gradient matches dominant signal color
- Signal poles: 8px dots, labeled in 10px uppercase, 40% opacity when inactive, 100% when dominant
- Compass fill colors by signal:
  - Sweet: `#f7a8c4` soft pink
  - Sour: `#a8e6a3` acid green
  - Bitter: `#8b7ab8` deep violet
  - Salt: `#a8d4f7` cool blue
  - Umami: `#e8b887` amber gold
- Insight card: frosted glass, `rgba(255,255,255,0.06)`, 16px border radius, 20px padding
- Insight text: 15px, italic, white, 2–3 lines max
- Action buttons: ghost pill style, 48px height, side by side with 12px gap
- Save option: 13px text only, opacity 35%, sits below buttons with 24px margin

---

### SCREEN 3 — Signal Orbs

**Layout:** Compass shrinks to top half. Orbs appear in bottom tray.

```
┌─────────────────────────────┐
│  [avatar]    HunchDoctor    │
│                             │
│    ┌───────────────┐        │  ← Compass smaller now, top half
│    │  [COMPASS]    │        │    still breathing, still live
│    └───────────────┘        │
│                             │
│  Direct your attention to:  │  ← 12px label, dim, centered
│                             │
│  ●Sweet  ●Sour  ●Bitter     │  ← Five orbs in a row
│          ●Salt  ●Umami      │    glowing, draggable
│                             │
│  ┌──────────────────────┐   │  ← Insight card — updates on each drag
│  │ Sweet attention      │   │
│  │ introduced. Your     │   │
│  │ body recognizes      │   │
│  │ this signal.         │   │
│  └──────────────────────┘   │
│                             │
│         Done                │  ← Text only, dim, saves to journal
└─────────────────────────────┘
```

**UI Details:**
- Orbs: 52px circles, radial gradient matching each signal color, soft drop shadow glow
- Orb labels: 10px beneath each orb, uppercase, signal name
- Orbs animate on drag — scale up 15%, glow intensifies
- When orb reaches compass — compass web ripples and shifts color toward that signal
- Insight card updates in real time as each orb is engaged
- Orb tray: frosted glass strip across bottom half, subtle border top

---

### SCREEN 4 — Hunch Journal

**Layout:** Scroll view. Pattern observation pinned top. Entries below.

```
┌─────────────────────────────┐
│  ← Back      Journal        │  ← Nav bar, minimal, back arrow left
│                             │
│  ┌──────────────────────┐   │  ← Pattern card — amber accent
│  │ ⚡ Pattern detected   │   │    only shows after 5+ sessions
│  │ Bitter-dominant on   │   │
│  │ weekday afternoons.  │   │
│  └──────────────────────┘   │
│                             │
│  Today                      │  ← Date label, 11px, dim, uppercase
│                             │
│  ┌──────────────────────┐   │  ← Journal entry card
│  │ 11:42pm              │   │    frosted glass, full width
│  │                      │   │
│  │ You arrived Bitter-  │   │    15px italic narrative text
│  │ heavy. After Sweet   │   │
│  │ and Umami your       │   │
│  │ compass softened.    │   │
│  └──────────────────────┘   │
│                             │
│  Yesterday                  │  ← Previous date group
│                             │
│  ┌──────────────────────┐   │
│  │ 2:14pm               │   │
│  │                      │   │
│  │ Salt-dominant. Body  │   │
│  │ asked for stillness. │   │
│  └──────────────────────┘   │
│                             │
└─────────────────────────────┘
```

**UI Details:**
- Nav bar: 44px height, back arrow 24px, title centered 15px medium weight
- Pattern card: amber left border `#F7A85A` 3px, slightly brighter background, ⚡ icon 16px
- Date labels: 11px, uppercase, letter-spacing 3px, opacity 40%
- Entry cards: frosted glass, `rgba(255,255,255,0.05)`, 16px radius, 20px padding
- Entry time: 12px, monospace, opacity 50%, top of card
- Entry text: 15px, italic, serif font, line-height 1.6, white opacity 85%
- Cards stack vertically with 12px gap
- Scroll is smooth, no pagination

---

### SCREEN 5 — Settings

**Layout:** Simple list. Clean. Minimal.

```
┌─────────────────────────────┐
│  ← Back      Settings       │
│                             │
│  Sensing                    │  ← Section label, 11px uppercase dim
│                             │
│  Camera access      [ON]    │  ← Toggle row
│  VitalLens sensing  [ON]    │
│  Expression reading [ON]    │
│                             │
│  Experience                 │
│                             │
│  Quiet Mode         [OFF]   │
│  Insight frequency  Medium  │  ← Tappable, opens options
│                             │
│  Privacy                    │
│                             │
│  Data stays on device  ✓    │  ← Non-interactive, trust signal
│  Clear all sessions    →    │  ← Destructive, tappable
│  Export my data        →    │
│                             │
│  About                      │
│                             │
│  HunchDoctor is a           │  ← Legal note, 12px, dim
│  speculative wellness tool, │
│  not a medical device.      │
│                             │
└─────────────────────────────┘
```

**UI Details:**
- Toggle rows: 48px height, label left, toggle right, separator line `rgba(255,255,255,0.06)`
- Toggles: teal `#4FD1C5` when on, grey when off
- Section labels: 11px, uppercase, letter-spacing 3px, opacity 35%
- Destructive actions: same style but label in soft red `#f87171`
- Legal note: 12px, opacity 30%, bottom of screen

---

## Screens — Figma Wireframe Inventory

| Screen | Key Elements | Primary Action |
|---|---|---|
| **Welcome** | Avatar, greeting text, two response options | I'm ready → Compass |
| **Hunch Compass** | Organic signal web, five poles, insight card, two action buttons | Shift it → Orbs |
| **Signal Orbs** | Compass top, five draggable orbs, live insight card | Done → Journal |
| **Hunch Journal** | Pattern card, scrollable entry cards, date groups | Tap entry → expand |
| **Settings** | Sensing toggles, privacy controls, quiet mode, legal note | Back → previous screen |

---

## Navigation Structure

```
Welcome Screen
    ↓
Hunch Compass ←──────────────────┐
    ↓                            │
Signal Orbs ── Done ─────────────┤
    ↓                            │
Hunch Journal ── Back ───────────┘
    
[Settings] accessible from Compass via gear icon top right
```

---

## Use Cases

### Use Case 1 — The 2pm Crash
Maya reaches for her third coffee. HunchDoctor detects a Bitter signal spike through HR drop and micro-expression mapping. Instead of caffeine it surfaces: *"Your nervous system is overstimulated, not under-energized. Try 4 minutes of stillness."* She avoids the crash.

### Use Case 2 — The Stress Eat
Jordan opens the fridge after a hard meeting. HunchDoctor recognizes a Sweet signal surge tied to emotional tension and surfaces: *"Your body is asking for comfort, not calories. What happened in the last hour?"* The question interrupts the automatic behavior.

### Use Case 3 — The Morning Read
Priya opens HunchDoctor before breakfast. The Hunch Compass shows a Sour-dominant state — her body is primed for focus and activation. She adjusts her morning routine, skips the slow breakfast, and starts her most demanding work first.

---

## What Claude Does Inside HunchDoctor

Claude is the voice of HunchDoctor. Every word the avatar speaks is Claude. Without it HunchDoctor is a visualization. Claude makes it feel alive, personal, and intelligent.

### Six Claude Functions:

**1. Welcome Greeting**
Time-aware personalized greeting based on time of day and last session data.

**2. Compass Insight Line**
Single human-readable insight translating biometric and expression data into language.

**3. Deep Insight Expansion**
3–4 sentence read of current interoceptive state when user taps "Tell me more."

**4. Signal Orb Insight**
Specific insight about a taste signal and what directing attention toward it reveals.

**5. Journal Entry Narrative**
2–3 sentence entry capturing the physiological and emotional arc of each session.

**6. Pattern Observation**
Cross-session pattern detection surfaced after 5 or more journal entries.

---

## API Stack

| Priority | API | Purpose | Cost |
|---|---|---|---|
| 1 | **Anthropic Claude API** | All insight language generation | Pay per token |
| 2 | **VitalLens API** | HR and respiratory rate from front camera | Free tier — 40 scans/month |
| 3 | **WebRTC** | Front camera access | Free — browser native |
| 4 | **face-api.js** | Micro-expression detection | Free — open source |

---

## Sensing Pipeline

```
Front Camera → WebRTC
                  ↓
      VitalLens  →  Heart Rate + Respiratory Rate  ─┐
                                                     ├→ Claude API → Insight
      face-api.js →  Expression Probabilities      ─┘
                  ↓
         Combined data payload sent to Claude
                  ↓
      HunchDoctor avatar delivers insight to user
```

---

## Data Payload Sent to Claude

```json
{
  "time": "Saturday 11:42pm",
  "heart_rate": 78,
  "respiratory_rate": 14,
  "dominant_expression": "disgusted",
  "expression_probabilities": {
    "neutral": 0.10,
    "happy": 0.05,
    "sad": 0.08,
    "angry": 0.05,
    "fearful": 0.02,
    "disgusted": 0.65,
    "surprised": 0.05
  },
  "dominant_signal": "Bitter",
  "session_number": 4,
  "last_session_signal": "Bitter"
}
```

---

## Claude API Call Template

```javascript
const response = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    messages: [{
      role: "user",
      content: `You are HunchDoctor — a warm, witty, medically 
      intelligent wellness guide specializing in interoceptive 
      awareness.
      
      Current user data:
      - Time: ${timeOfDay}
      - Heart Rate: ${heartRate} bpm
      - Respiratory Rate: ${respiratoryRate} breaths/min
      - Dominant Expression: ${dominantExpression}
      - Dominant Taste Signal: ${dominantSignal}
      - Session number: ${sessionNumber}
      
      Generate a single warm insight line of no more than 
      20 words that the HunchDoctor avatar will deliver 
      to the user about their current interoceptive state.`
    }]
  })
})
```

---

## VitalLens API Call Template

```javascript
const response = await fetch("https://api.rouast.com/vitallens", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer YOUR_VITALLENS_KEY"
  },
  body: JSON.stringify({
    video: base64VideoFrames,
    fps: 30
  })
})

const data = await response.json()
const heartRate = data.heart_rate
const respiratoryRate = data.respiratory_rate
```

---

## face-api.js CDN

```html
<script src="https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js"></script>
```

## face-api.js Usage

```javascript
// Load only what HunchDoctor needs
await faceapi.loadTinyFaceDetectorModel('/models')
await faceapi.loadFaceExpressionModel('/models')

// Detect expression from video stream
const result = await faceapi
  .detectSingleFace(videoElement, new faceapi.TinyFaceDetectorOptions())
  .withFaceExpressions()

const expressions = result.expressions
// { neutral: 0.1, happy: 0.05, disgusted: 0.65, ... }
```

---

## Build Order

1. **Claude API** — get insights working first
2. **face-api.js** — add expression detection via CDN
3. **WebRTC** — open camera to feed face-api.js
4. **VitalLens** — layer in biometric sensing last

---



## Safeguards

**Privacy and Consent**
All sensing requires explicit opt-in per session. Users can pause all sensing at any time with a single tap.

**Data Stays Local**
All interoceptive data processed on-device. Nothing leaves the phone without explicit user export request.

**Not a Medical Device**
HunchDoctor reflects — it never prescribes. Every insight is framed as an observation, not a diagnosis.

**No Social Comparison**
No social sharing of raw signal data. No comparative features. Interoception is personal and the design enforces that.

**Emergency Protocol**
If HR drops to concerning levels or distress signals persist across multiple sessions, HunchDoctor surfaces: *"Your body has been under significant stress. Would you like to talk to someone?"* with mental health resource links.

**Manipulation Transparency**
Signal Orbs are explicitly designed as attention tools — not behavior modification triggers. The app is transparent that dragging an orb directs attention, not physiology.

**Quiet Mode**
If signal complexity exceeds a user-defined threshold the app automatically reduces to a single ambient pulse. No notifications. No prompts. Just presence.

---

## Visual Design Direction

- **Background:** Deep near-black `#0a0a0f`
- **Primary accent:** Warm amber `#F7A85A`
- **Secondary accent:** Electric teal `#4FD1C5`
- **Text:** White, wide letter-spacing, editorial typography
- **Components:** Frosted glass cards, soft blur, translucent layers
- **Motion:** Slow breathing animations, organic pulse, smooth transitions
- **Feel:** Cinematic, medical, magical, minimal

---

## Tagline Options

- *"Your gut was right. As usual."*
- *"Your body already knows. HunchDoctor translates."*
- *"The sense you never knew you had."*
- *"Listen deeper."*

---

## Submission Deliverables

- Demo video (3–5 minutes maximum)
- Figma Slides deck with embedded Figma Make prototype

---

*HunchDoctor — Built for FigBuild 2026*
