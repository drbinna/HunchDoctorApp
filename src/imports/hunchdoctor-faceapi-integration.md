# HunchDoctor — face-api.js Integration
## Code Snippets + Figma Make Prompts

---

## What We Use From face-api.js

Based on the official docs, HunchDoctor only needs:

| What | Why |
|---|---|
| `TinyFaceDetector` | 190KB, mobile-optimized, fast on phone browsers |
| `FaceExpressionModel` | 310KB, detects 7 expressions with probability scores |
| `detectSingleFace()` | We only need one face — the user's |
| `.withFaceExpressions()` | Returns expression probabilities we map to taste signals |

**Models NOT needed:** SSD Mobilenet, MTCNN, Landmarks, Face Recognition, Face Descriptors

---

## Expression Type Reference

From face-api.js docs, the `FaceExpression` type returns exactly these values:

```typescript
type FaceExpression = 
  'neutral' | 'happy' | 'sad' | 
  'angry' | 'fearful' | 'disgusted' | 'surprised'
```

Each returns a probability between 0 and 1.

---

## HunchDoctor Expression → Signal Mapping

```javascript
const SIGNAL_MAP = {
  disgusted: { signal: 'Bitter', meaning: 'Fatigue, defense, need for rest' },
  happy:     { signal: 'Sweet',  meaning: 'Comfort, reward, safety' },
  fearful:   { signal: 'Sour',   meaning: 'Alertness, anxiety, activation' },
  neutral:   { signal: 'Salt',   meaning: 'Grounded, balanced, stable' },
  sad:       { signal: 'Umami',  meaning: 'Depletion, need for nourishment' },
  angry:     { signal: 'Bitter', meaning: 'Stress, tension, overload' },
  surprised: { signal: 'Sour',   meaning: 'Curiosity, sudden shift' }
}
```

---

## SNIPPET 1 — HTML Setup

Paste this into your Figma Make HTML file head section.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HunchDoctor</title>

  <!-- face-api.js from CDN -->
  <script src="https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js"></script>

  <style>
    body {
      background: #0a0a0f;
      color: white;
      font-family: sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
    }

    /* Hide the video — we only need it for processing */
    #video {
      position: absolute;
      opacity: 0;
      pointer-events: none;
      width: 1px;
      height: 1px;
    }

    #status {
      font-size: 13px;
      letter-spacing: 3px;
      opacity: 0.5;
      margin-bottom: 24px;
      text-transform: uppercase;
    }

    #signal-display {
      font-size: 32px;
      font-weight: 300;
      letter-spacing: 6px;
      text-transform: uppercase;
      margin-bottom: 16px;
    }

    #insight-text {
      font-size: 15px;
      font-style: italic;
      opacity: 0.8;
      max-width: 300px;
      text-align: center;
      line-height: 1.6;
      min-height: 48px;
    }

    #scan-btn {
      margin-top: 40px;
      padding: 16px 40px;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 50px;
      color: white;
      font-size: 15px;
      letter-spacing: 2px;
      cursor: pointer;
      transition: all 0.3s ease;
    }

    #scan-btn:hover {
      background: rgba(255,255,255,0.14);
    }
  </style>
</head>
<body>

  <!-- Hidden video for camera feed -->
  <video id="video" autoplay muted playsinline></video>

  <div id="status">Waiting...</div>
  <div id="signal-display">—</div>
  <div id="insight-text">Tap to begin your reading</div>
  <button id="scan-btn" onclick="startScan()">Begin Scan</button>

  <script>
    // All JavaScript goes here — see snippets below
  </script>

</body>
</html>
```

---

## SNIPPET 2 — Load Models

Load only the two models HunchDoctor needs.
Models are hosted on a public CDN — no local files needed.

```javascript
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model'

async function loadModels() {
  document.getElementById('status').textContent = 'Loading models...'
  
  try {
    // Load ONLY Tiny Face Detector — 190KB, mobile optimized
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL)
    
    // Load ONLY Face Expression model — 310KB
    await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL)
    
    document.getElementById('status').textContent = 'Ready'
    console.log('Models loaded successfully')
    
  } catch (error) {
    document.getElementById('status').textContent = 'Model load failed'
    console.error('Model loading error:', error)
  }
}
```

---

## SNIPPET 3 — Start Camera (WebRTC)

Opens the front-facing camera and feeds it to the hidden video element.

```javascript
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user', // front camera
        width: { ideal: 320 },
        height: { ideal: 240 }
      },
      audio: false
    })
    
    const video = document.getElementById('video')
    video.srcObject = stream
    
    // Wait for video to be ready
    await new Promise(resolve => {
      video.onloadedmetadata = () => resolve()
    })
    
    console.log('Camera started')
    return video
    
  } catch (error) {
    console.error('Camera access denied:', error)
    document.getElementById('status').textContent = 'Camera access needed'
    return null
  }
}
```

---

## SNIPPET 4 — Detect Expression

The core face-api.js call for HunchDoctor.
Uses TinyFaceDetector with inputSize 160 — fastest on mobile.

```javascript
async function detectExpression(video) {
  try {
    // detectSingleFace — we only need the user's face
    // TinyFaceDetectorOptions — mobile optimized, inputSize 160 = fastest
    const result = await faceapi
      .detectSingleFace(
        video,
        new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.5 })
      )
      .withFaceExpressions()

    if (!result) {
      console.log('No face detected')
      return null
    }

    // result.expressions returns all 7 probabilities
    const expressions = result.expressions
    console.log('Expressions:', expressions)

    // Find the dominant expression — highest probability score
    const dominant = Object.entries(expressions)
      .sort((a, b) => b[1] - a[1])[0]

    return {
      expression: dominant[0],    // e.g. "disgusted"
      probability: dominant[1],   // e.g. 0.65
      all: expressions            // full object for Claude
    }

  } catch (error) {
    console.error('Detection error:', error)
    return null
  }
}
```

---

## SNIPPET 5 — Map Expression to Taste Signal

```javascript
const SIGNAL_MAP = {
  disgusted: { signal: 'Bitter', color: '#8b7ab8' },
  happy:     { signal: 'Sweet',  color: '#f7a8c4' },
  fearful:   { signal: 'Sour',   color: '#a8e6a3' },
  neutral:   { signal: 'Salt',   color: '#a8d4f7' },
  sad:       { signal: 'Umami',  color: '#e8b887' },
  angry:     { signal: 'Bitter', color: '#8b7ab8' },
  surprised: { signal: 'Sour',   color: '#a8e6a3' }
}

function mapToSignal(expression) {
  return SIGNAL_MAP[expression] || { signal: 'Salt', color: '#a8d4f7' }
}
```

---

## SNIPPET 6 — Call Claude API

Sends expression and signal data to Claude.
Returns a warm, human insight line for the HunchDoctor avatar.

```javascript
const ANTHROPIC_API_KEY = 'YOUR_CLAUDE_API_KEY_HERE'

async function getClaudeInsight(expressionData, signalData) {
  const timeOfDay = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })

  const prompt = `You are HunchDoctor — a warm, witty, medically intelligent 
wellness guide specializing in interoceptive awareness.

Current user scan data:
- Time: ${timeOfDay}
- Dominant facial expression: ${expressionData.expression} 
  (probability: ${Math.round(expressionData.probability * 100)}%)
- Dominant taste signal detected: ${signalData.signal}
- Full expression scan: ${JSON.stringify(expressionData.all)}

Generate a single warm insight line of no more than 20 words 
that the HunchDoctor avatar will deliver to the user about 
their current interoceptive state.

Rules:
- Speak directly to the user as "you" or "your"
- Reference the dominant signal naturally
- Never be clinical or prescriptive
- Sound like a wise, slightly witty friend
- Do not start with "I" — start with the insight itself`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    })

    const data = await response.json()
    return data.content[0].text

  } catch (error) {
    console.error('Claude API error:', error)
    return `${signalData.signal} is leading. Your body is trying to tell you something.`
  }
}
```

---

## SNIPPET 7 — Full Scan Flow

Combines all snippets into one complete scan function.

```javascript
async function startScan() {
  const btn = document.getElementById('scan-btn')
  const status = document.getElementById('status')
  const signalDisplay = document.getElementById('signal-display')
  const insightText = document.getElementById('insight-text')

  btn.disabled = true
  btn.textContent = 'Scanning...'
  status.textContent = 'Reading your signals...'

  // Step 1 — Start camera
  const video = await startCamera()
  if (!video) {
    btn.disabled = false
    btn.textContent = 'Try Again'
    return
  }

  // Step 2 — Small delay to let camera stabilize
  await new Promise(resolve => setTimeout(resolve, 1500))

  // Step 3 — Detect expression
  status.textContent = 'Detecting expression...'
  const expressionData = await detectExpression(video)

  if (!expressionData) {
    status.textContent = 'No face detected. Try again.'
    btn.disabled = false
    btn.textContent = 'Try Again'
    return
  }

  // Step 4 — Map to signal
  const signalData = mapToSignal(expressionData.expression)
  signalDisplay.textContent = signalData.signal
  signalDisplay.style.color = signalData.color

  // Step 5 — Get Claude insight
  status.textContent = 'Generating insight...'
  const insight = await getClaudeInsight(expressionData, signalData)
  insightText.textContent = insight

  // Step 6 — Done
  status.textContent = 'Scan complete'
  btn.disabled = false
  btn.textContent = 'Scan Again'

  // Stop camera to save battery
  const stream = video.srcObject
  stream.getTracks().forEach(track => track.stop())
}
```

---

## SNIPPET 8 — Initialize on Page Load

```javascript
// Run when page loads
window.addEventListener('load', async () => {
  await loadModels()
})
```

---

## COMPLETE FILE — Paste This Entire Block Into Figma Make

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HunchDoctor</title>
  <script src="https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0a0a0f;
      color: white;
      font-family: -apple-system, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 40px 24px;
    }
    #video {
      position: absolute;
      opacity: 0;
      pointer-events: none;
      width: 1px;
      height: 1px;
    }
    .avatar {
      width: 100px;
      height: 100px;
      border-radius: 50%;
      background: radial-gradient(circle, #f7a85a, #4fd1c5);
      animation: breathe 3s ease-in-out infinite, float 4s ease-in-out infinite;
      box-shadow: 0 0 40px rgba(79,209,197,0.5);
      margin-bottom: 32px;
    }
    @keyframes breathe {
      0%,100% { transform: scale(1); }
      50% { transform: scale(1.07); }
    }
    @keyframes float {
      0%,100% { transform: translateY(0); }
      50% { transform: translateY(-10px); }
    }
    .app-name {
      font-size: 12px;
      letter-spacing: 6px;
      opacity: 0.4;
      text-transform: uppercase;
      margin-bottom: 48px;
    }
    #status {
      font-size: 11px;
      letter-spacing: 3px;
      opacity: 0.4;
      text-transform: uppercase;
      margin-bottom: 16px;
      min-height: 16px;
    }
    #signal-display {
      font-size: 28px;
      font-weight: 300;
      letter-spacing: 8px;
      text-transform: uppercase;
      margin-bottom: 20px;
      min-height: 40px;
      transition: color 0.8s ease;
    }
    #insight-text {
      font-size: 15px;
      font-style: italic;
      opacity: 0.75;
      max-width: 280px;
      text-align: center;
      line-height: 1.7;
      min-height: 52px;
      margin-bottom: 48px;
    }
    #scan-btn {
      padding: 16px 48px;
      background: rgba(255,255,255,0.07);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 50px;
      color: white;
      font-size: 14px;
      letter-spacing: 3px;
      text-transform: uppercase;
      cursor: pointer;
      transition: all 0.3s ease;
    }
    #scan-btn:hover { background: rgba(255,255,255,0.12); }
    #scan-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  </style>
</head>
<body>

  <video id="video" autoplay muted playsinline></video>

  <div class="avatar"></div>
  <div class="app-name">HunchDoctor</div>

  <div id="status">Loading...</div>
  <div id="signal-display">—</div>
  <div id="insight-text">Your body has things to tell us.</div>
  <button id="scan-btn" onclick="startScan()" disabled>Begin Scan</button>

  <script>
    const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model'
    const ANTHROPIC_API_KEY = 'YOUR_API_KEY_HERE'

    const SIGNAL_MAP = {
      disgusted: { signal: 'Bitter', color: '#8b7ab8' },
      happy:     { signal: 'Sweet',  color: '#f7a8c4' },
      fearful:   { signal: 'Sour',   color: '#a8e6a3' },
      neutral:   { signal: 'Salt',   color: '#a8d4f7' },
      sad:       { signal: 'Umami',  color: '#e8b887' },
      angry:     { signal: 'Bitter', color: '#8b7ab8' },
      surprised: { signal: 'Sour',   color: '#a8e6a3' }
    }

    async function loadModels() {
      try {
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL)
        await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL)
        document.getElementById('status').textContent = 'Ready'
        document.getElementById('scan-btn').disabled = false
      } catch (e) {
        document.getElementById('status').textContent = 'Setup error'
        console.error(e)
      }
    }

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } },
          audio: false
        })
        const video = document.getElementById('video')
        video.srcObject = stream
        await new Promise(resolve => { video.onloadedmetadata = resolve })
        return video
      } catch (e) {
        document.getElementById('status').textContent = 'Camera access needed'
        return null
      }
    }

    async function detectExpression(video) {
      const result = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.5 }))
        .withFaceExpressions()
      if (!result) return null
      const dominant = Object.entries(result.expressions).sort((a, b) => b[1] - a[1])[0]
      return { expression: dominant[0], probability: dominant[1], all: result.expressions }
    }

    async function getClaudeInsight(expressionData, signalData) {
      const time = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 100,
            messages: [{
              role: 'user',
              content: `You are HunchDoctor — a warm, witty wellness guide specializing in interoceptive awareness. Time: ${time}. Dominant expression: ${expressionData.expression} (${Math.round(expressionData.probability * 100)}%). Dominant signal: ${signalData.signal}. Generate one warm insight line under 20 words. Speak to the user directly. Never be clinical.`
            }]
          })
        })
        const data = await res.json()
        return data.content[0].text
      } catch (e) {
        return `${signalData.signal} is leading. Your body is trying to tell you something.`
      }
    }

    async function startScan() {
      const btn = document.getElementById('scan-btn')
      const status = document.getElementById('status')
      const signalDisplay = document.getElementById('signal-display')
      const insightText = document.getElementById('insight-text')

      btn.disabled = true
      status.textContent = 'Reading signals...'
      insightText.textContent = '...'

      const video = await startCamera()
      if (!video) { btn.disabled = false; return }

      await new Promise(r => setTimeout(r, 1500))

      status.textContent = 'Detecting expression...'
      const expressionData = await detectExpression(video)

      if (!expressionData) {
        status.textContent = 'No face detected'
        insightText.textContent = 'Move closer and try again.'
        btn.disabled = false
        btn.textContent = 'Try Again'
        return
      }

      const signalData = SIGNAL_MAP[expressionData.expression] || SIGNAL_MAP['neutral']
      signalDisplay.textContent = signalData.signal
      signalDisplay.style.color = signalData.color

      status.textContent = 'Generating insight...'
      const insight = await getClaudeInsight(expressionData, signalData)
      insightText.textContent = insight

      status.textContent = 'Scan complete'
      btn.disabled = false
      btn.textContent = 'Scan Again'

      video.srcObject.getTracks().forEach(t => t.stop())
    }

    window.addEventListener('load', loadModels)
  </script>
</body>
</html>
```

---

## Figma Make Prompt

Paste this into the Figma Make Agent panel to build the screen:

```
Build a single screen HTML app called HunchDoctor.

The screen is a dark wellness app — background #0a0a0f near black.

It should contain:
1. A glowing animated avatar orb at the top — radial gradient 
   amber #F7A85A to teal #4FD1C5, 100px circle, breathing 
   and floating animation, soft teal glow shadow

2. App name "HUNCHDOCTOR" below avatar — 12px, letter-spacing 
   6px, uppercase, white, opacity 40%

3. A status line — 11px, letter-spacing 3px, uppercase, 
   opacity 40%, shows current app state

4. A signal display — 28px, letter-spacing 8px, uppercase, 
   shows the dominant taste signal name, color changes 
   based on signal

5. An italic insight text — 15px italic, opacity 75%, 
   max 280px wide, centered, line-height 1.7

6. A "Begin Scan" button — full ghost pill style, 
   frosted glass background rgba(255,255,255,0.07), 
   1px white border rgba(255,255,255,0.12), 
   50px border radius, 14px uppercase letter-spacing 3px

7. A hidden video element for camera access

The JavaScript should:
- Load face-api.js from CDN on page load
- Load TinyFaceDetector and FaceExpression models from 
  https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model
- On button click: open front camera via WebRTC, wait 
  1.5 seconds, run detectSingleFace().withFaceExpressions(), 
  find dominant expression, map to taste signal, 
  call Claude API for insight, display result
- Map expressions to signals:
  disgusted=Bitter, happy=Sweet, fearful=Sour, 
  neutral=Salt, sad=Umami, angry=Bitter, surprised=Sour
- Signal colors:
  Bitter=#8b7ab8, Sweet=#f7a8c4, Sour=#a8e6a3, 
  Salt=#a8d4f7, Umami=#e8b887

Everything centered, single column, generous spacing.
All animations CSS only. No external dependencies except 
face-api.js CDN.
```

---

## Important Notes

**Model CDN**
Use `@vladmandic/face-api` models on jsDelivr — this is the most reliable public CDN for face-api.js model weights. The original model URLs are often unreliable.

**Camera Permission**
The browser will show a permission prompt automatically on first use. This is expected behavior and tells judges the sensing is real.

**API Key Security**
For the hackathon demo, the Claude API key can go directly in the code. For any production use, move it to a backend.

**TinyFaceDetectorOptions inputSize**
Use `160` for fastest mobile performance. If detection is unreliable, increase to `224` or `320` — slower but more accurate.

**scoreThreshold**
Default is `0.5`. Lower to `0.3` if face is not being detected. Raise to `0.7` for stricter detection.
