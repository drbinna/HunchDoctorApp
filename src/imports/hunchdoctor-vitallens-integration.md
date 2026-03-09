# HunchDoctor — VitalLens.js Integration
## Code Snippets + Figma Make Prompts

---

## What We Use From VitalLens.js

Based on the official docs, HunchDoctor needs:

| What | Why |
|---|---|
| `method: 'vitallens'` | Full API — HR, respiratory rate from camera |
| `addVideoStream()` | Feeds live webcam stream into VitalLens |
| `startVideoStream()` | Begins real-time processing |
| `stopVideoStream()` | Stops processing and clears buffers |
| `addEventListener('vitals')` | Receives live vital sign packets |
| `addEventListener('error')` | Handles failures gracefully |

**Methods NOT needed:** `processVideoFile()`, file widgets, unified widget

---

## What VitalLens Returns

```javascript
// The 'vitals' event fires continuously during a stream
// Each packet contains:
{
  heart_rate: {
    value: 72,          // beats per minute
    confidence: 0.91    // 0 to 1 — how reliable this reading is
  },
  respiratory_rate: {
    value: 15,          // breaths per minute
    confidence: 0.87
  }
  // HRV only available on paid plans — not on free tier
}
```

---

## Free Tier Reality Check

| Signal | Free Tier |
|---|---|
| Heart Rate (HR) | Yes — 40 scans/month |
| Respiratory Rate (RR) | Yes — 40 scans/month |
| HRV | No — paid plans only |

For the hackathon demo: HR + RR is enough. 
HRV can be simulated or derived from HR on the free tier.

---

## Local Fallback Methods (No API Key Needed)

VitalLens.js includes three built-in local algorithms 
that require NO API key and have NO scan limits:

| Method | What It Does | Accuracy |
|---|---|---|
| `'g'` | Green channel heart rate | Low |
| `'chrom'` | Chrominance-based HR | Medium |
| `'pos'` | Plane-orthogonal-to-skin HR | Medium |

**For the hackathon:** Use `'pos'` as a free fallback 
if the API key runs out of scans during judging.

---

## CDN Link

```html
<script type="module" 
  src="https://cdn.jsdelivr.net/npm/vitallens/dist/vitallens.browser.js">
</script>
```

---

## SNIPPET 1 — Initialize VitalLens

```javascript
import { VitalLens } from 
  'https://cdn.jsdelivr.net/npm/vitallens/dist/vitallens.browser.js'

const vl = new VitalLens({
  method: 'vitallens',    // Full API method — HR + RR
  apiKey: 'YOUR_VITALLENS_API_KEY'
})
```

**Fallback version — no API key needed:**

```javascript
const vl = new VitalLens({
  method: 'pos'   // Free local fallback — no key, no limits
})
```

---

## SNIPPET 2 — Start Camera + Feed to VitalLens

```javascript
async function startVitalLens() {
  try {
    // Step 1 — Open front camera via WebRTC
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 320 },
        height: { ideal: 240 }
      },
      audio: false
    })

    // Step 2 — Get video element
    const videoElement = document.getElementById('video')
    videoElement.srcObject = stream

    // Step 3 — Feed stream to VitalLens
    // addVideoStream takes the MediaStream + video element
    vl.addVideoStream(stream, videoElement)

    // Step 4 — Start processing
    vl.startVideoStream()

    console.log('VitalLens started')

  } catch (error) {
    console.error('Camera or VitalLens error:', error)
  }
}
```

---

## SNIPPET 3 — Listen for Vitals Events

```javascript
// 'vitals' event fires continuously as readings come in
vl.addEventListener('vitals', (event) => {
  const data = event.detail

  const heartRate = data.heart_rate?.value
  const hrConfidence = data.heart_rate?.confidence
  const respiratoryRate = data.respiratory_rate?.value
  const rrConfidence = data.respiratory_rate?.confidence

  console.log(`HR: ${heartRate} bpm (confidence: ${hrConfidence})`)
  console.log(`RR: ${respiratoryRate} breaths/min (confidence: ${rrConfidence})`)

  // Only use readings with confidence above 0.7
  if (hrConfidence > 0.7 && rrConfidence > 0.7) {
    updateHunchCompass(heartRate, respiratoryRate)
  }
})

// Handle errors gracefully
vl.addEventListener('error', (event) => {
  console.error('VitalLens error:', event.detail)
  // Fall back to simulated values for demo
  updateHunchCompass(72, 15)
})
```

---

## SNIPPET 4 — Stop VitalLens

```javascript
function stopVitalLens() {
  // Stops processing, stops webcam, clears all buffers
  vl.stopVideoStream()
  console.log('VitalLens stopped')
}

// Pause without stopping camera
function pauseVitalLens() {
  vl.pauseVideoStream()
}

// Resume after pause
function resumeVitalLens() {
  vl.startVideoStream()
}
```

---

## SNIPPET 5 — Map Vitals to HunchDoctor Signal State

```javascript
function mapVitalsToSignalState(heartRate, respiratoryRate) {
  let signalState = {
    dominant: 'Salt',     // default — balanced
    color: '#a8d4f7',
    intensity: 'balanced'
  }

  // High HR + high RR = stress = Bitter dominant
  if (heartRate > 90 && respiratoryRate > 18) {
    signalState = {
      dominant: 'Bitter',
      color: '#8b7ab8',
      intensity: 'elevated',
      meaning: 'Nervous system under load — tension detected'
    }
  }
  // Low HR + low RR = calm = Sweet or Umami
  else if (heartRate < 65 && respiratoryRate < 13) {
    signalState = {
      dominant: 'Umami',
      color: '#e8b887',
      intensity: 'low',
      meaning: 'Deep rest state — body is settling'
    }
  }
  // Moderate elevated HR = activation = Sour
  else if (heartRate >= 75 && heartRate <= 90) {
    signalState = {
      dominant: 'Sour',
      color: '#a8e6a3',
      intensity: 'active',
      meaning: 'Body is alert and ready'
    }
  }
  // Normal resting = Salt = grounded
  else if (heartRate >= 65 && heartRate <= 75) {
    signalState = {
      dominant: 'Salt',
      color: '#a8d4f7',
      intensity: 'balanced',
      meaning: 'Nervous system stable and grounded'
    }
  }

  return signalState
}
```

---

## SNIPPET 6 — Combined VitalLens + face-api.js + Claude

Full combined sensing loop that feeds all data to Claude.

```javascript
let latestVitals = { heartRate: null, respiratoryRate: null }
let latestExpression = { expression: 'neutral', probability: 0.5 }

// VitalLens continuously updates vitals
vl.addEventListener('vitals', (event) => {
  const data = event.detail
  if (data.heart_rate?.confidence > 0.7) {
    latestVitals.heartRate = data.heart_rate.value
  }
  if (data.respiratory_rate?.confidence > 0.7) {
    latestVitals.respiratoryRate = data.respiratory_rate.value
  }
})

// face-api.js continuously updates expression
async function runExpressionLoop(videoElement) {
  setInterval(async () => {
    const result = await faceapi
      .detectSingleFace(videoElement, 
        new faceapi.TinyFaceDetectorOptions({ inputSize: 160 }))
      .withFaceExpressions()

    if (result) {
      const dominant = Object.entries(result.expressions)
        .sort((a, b) => b[1] - a[1])[0]
      latestExpression = {
        expression: dominant[0],
        probability: dominant[1]
      }
    }
  }, 2000) // Check every 2 seconds
}

// On demand — send combined data to Claude
async function generateInsight() {
  const time = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true
  })

  const vitalSignalState = mapVitalsToSignalState(
    latestVitals.heartRate || 72,
    latestVitals.respiratoryRate || 15
  )

  const SIGNAL_MAP = {
    disgusted: 'Bitter', happy: 'Sweet', fearful: 'Sour',
    neutral: 'Salt', sad: 'Umami', angry: 'Bitter', surprised: 'Sour'
  }

  const expressionSignal = SIGNAL_MAP[latestExpression.expression] || 'Salt'

  // Dominant signal = weighted combination of both inputs
  const dominantSignal = latestExpression.probability > 0.6
    ? expressionSignal        // Expression is confident — use it
    : vitalSignalState.dominant  // Fall back to vitals

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': 'YOUR_CLAUDE_API_KEY',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 100,
      messages: [{
        role: 'user',
        content: `You are HunchDoctor — a warm, witty wellness guide 
specializing in interoceptive awareness.

Current scan data:
- Time: ${time}
- Heart Rate: ${latestVitals.heartRate || 'unavailable'} bpm
- Respiratory Rate: ${latestVitals.respiratoryRate || 'unavailable'} breaths/min
- Dominant facial expression: ${latestExpression.expression} 
  (${Math.round(latestExpression.probability * 100)}% confidence)
- Dominant interoceptive signal: ${dominantSignal}
- Vital state: ${vitalSignalState.meaning || 'reading signals'}

Generate one warm insight line under 20 words. 
Speak directly to the user. Never be clinical or prescriptive.`
      }]
    })
  })

  const data = await response.json()
  return data.content[0].text
}
```

---

## COMPLETE FILE — VitalLens + face-api.js + Claude

Paste this entire block into Figma Make.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HunchDoctor</title>

  <!-- face-api.js -->
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
      animation: breathe 3s ease-in-out infinite,
                 float 4s ease-in-out infinite;
      box-shadow: 0 0 50px rgba(79,209,197,0.5);
      margin-bottom: 32px;
      transition: background 1s ease, box-shadow 1s ease;
    }
    @keyframes breathe {
      0%,100% { transform: scale(1); }
      50% { transform: scale(1.08); }
    }
    @keyframes float {
      0%,100% { transform: translateY(0); }
      50% { transform: translateY(-10px); }
    }
    .app-name {
      font-size: 11px;
      letter-spacing: 6px;
      opacity: 0.35;
      text-transform: uppercase;
      margin-bottom: 48px;
    }
    #status {
      font-size: 11px;
      letter-spacing: 3px;
      opacity: 0.4;
      text-transform: uppercase;
      margin-bottom: 12px;
      min-height: 16px;
    }
    #vitals-row {
      display: flex;
      gap: 32px;
      margin-bottom: 20px;
      min-height: 24px;
    }
    .vital-item {
      font-size: 12px;
      opacity: 0.5;
      letter-spacing: 1px;
    }
    .vital-value {
      font-size: 18px;
      font-weight: 300;
      opacity: 0.9;
    }
    #signal-display {
      font-size: 28px;
      font-weight: 300;
      letter-spacing: 8px;
      text-transform: uppercase;
      margin-bottom: 20px;
      min-height: 40px;
      transition: color 1s ease;
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
      font-size: 13px;
      letter-spacing: 3px;
      text-transform: uppercase;
      cursor: pointer;
      transition: all 0.3s ease;
    }
    #scan-btn:hover { background: rgba(255,255,255,0.12); }
    #scan-btn:disabled { opacity: 0.3; cursor: not-allowed; }
  </style>
</head>
<body>

  <video id="video" autoplay muted playsinline></video>

  <div class="avatar" id="avatar"></div>
  <div class="app-name">HunchDoctor</div>

  <div id="status">Loading...</div>

  <div id="vitals-row">
    <div class="vital-item">
      HR <span class="vital-value" id="hr-value">—</span>
    </div>
    <div class="vital-item">
      RR <span class="vital-value" id="rr-value">—</span>
    </div>
  </div>

  <div id="signal-display">—</div>
  <div id="insight-text">Your body has things to tell us.</div>
  <button id="scan-btn" onclick="startFullScan()" disabled>
    Begin Scan
  </button>

  <script type="module">
    import { VitalLens } from
      'https://cdn.jsdelivr.net/npm/vitallens/dist/vitallens.browser.js'

    const CLAUDE_KEY = 'YOUR_CLAUDE_API_KEY'
    const VITALLENS_KEY = 'YOUR_VITALLENS_API_KEY'
    const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model'

    const SIGNAL_MAP = {
      disgusted: { signal: 'Bitter', color: '#8b7ab8' },
      happy:     { signal: 'Sweet',  color: '#f7a8c4' },
      fearful:   { signal: 'Sour',   color: '#a8e6a3' },
      neutral:   { signal: 'Salt',   color: '#a8d4f7' },
      sad:       { signal: 'Umami',  color: '#e8b887' },
      angry:     { signal: 'Bitter', color: '#8b7ab8' },
      surprised: { signal: 'Sour',   color: '#a8e6a3' }
    }

    let latestVitals = { hr: null, rr: null }
    let latestExpression = { expression: 'neutral', probability: 0.5 }
    let vl = null
    let expressionInterval = null

    // Load face-api models
    async function loadModels() {
      document.getElementById('status').textContent = 'Loading models...'
      await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL)
      await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL)
      document.getElementById('status').textContent = 'Ready'
      document.getElementById('scan-btn').disabled = false
    }

    // Initialize VitalLens
    function initVitalLens() {
      vl = new VitalLens({
        method: 'vitallens',
        apiKey: VITALLENS_KEY
      })

      vl.addEventListener('vitals', (event) => {
        const data = event.detail
        if (data.heart_rate?.confidence > 0.6) {
          latestVitals.hr = Math.round(data.heart_rate.value)
          document.getElementById('hr-value').textContent =
            `${latestVitals.hr}`
        }
        if (data.respiratory_rate?.confidence > 0.6) {
          latestVitals.rr = Math.round(data.respiratory_rate.value)
          document.getElementById('rr-value').textContent =
            `${latestVitals.rr}`
        }
      })

      vl.addEventListener('error', (event) => {
        console.warn('VitalLens error — using fallback values', event.detail)
        latestVitals = { hr: 72, rr: 15 }
      })
    }

    // Start expression detection loop
    function startExpressionLoop(videoElement) {
      expressionInterval = setInterval(async () => {
        const result = await faceapi
          .detectSingleFace(videoElement,
            new faceapi.TinyFaceDetectorOptions({
              inputSize: 160,
              scoreThreshold: 0.5
            }))
          .withFaceExpressions()

        if (result) {
          const dominant = Object.entries(result.expressions)
            .sort((a, b) => b[1] - a[1])[0]
          latestExpression = {
            expression: dominant[0],
            probability: dominant[1]
          }
        }
      }, 2000)
    }

    // Get insight from Claude
    async function getInsight(signal) {
      const time = new Date().toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', hour12: true
      })
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': CLAUDE_KEY,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 100,
            messages: [{
              role: 'user',
              content: `You are HunchDoctor — a warm witty wellness guide 
specializing in interoceptive awareness. Time: ${time}. 
Heart Rate: ${latestVitals.hr || 'unavailable'} bpm. 
Respiratory Rate: ${latestVitals.rr || 'unavailable'} breaths/min. 
Expression: ${latestExpression.expression}. 
Dominant signal: ${signal}. 
One warm insight under 20 words. 
Direct address. Never clinical.`
            }]
          })
        })
        const data = await res.json()
        return data.content[0].text
      } catch (e) {
        return `${signal} is leading. Your body is speaking clearly today.`
      }
    }

    // Main scan function
    window.startFullScan = async function() {
      const btn = document.getElementById('scan-btn')
      const status = document.getElementById('status')
      const signalDisplay = document.getElementById('signal-display')
      const insightText = document.getElementById('insight-text')

      btn.disabled = true
      status.textContent = 'Opening camera...'

      // Open camera
      let stream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 320 } },
          audio: false
        })
      } catch (e) {
        status.textContent = 'Camera access needed'
        btn.disabled = false
        return
      }

      const videoElement = document.getElementById('video')
      videoElement.srcObject = stream

      await new Promise(r => { videoElement.onloadedmetadata = r })

      // Start VitalLens
      status.textContent = 'Reading vitals...'
      initVitalLens()
      vl.addVideoStream(stream, videoElement)
      vl.startVideoStream()

      // Start expression detection
      startExpressionLoop(videoElement)

      // Wait for readings to stabilize
      await new Promise(r => setTimeout(r, 5000))

      // Determine dominant signal
      const expressionSignal = SIGNAL_MAP[latestExpression.expression]
        || SIGNAL_MAP['neutral']

      const dominantSignal = latestExpression.probability > 0.6
        ? expressionSignal.signal
        : (latestVitals.hr > 85 ? 'Bitter' : 'Salt')

      const signalColor = expressionSignal.color

      // Update UI
      signalDisplay.textContent = dominantSignal
      signalDisplay.style.color = signalColor

      // Get insight from Claude
      status.textContent = 'Generating insight...'
      const insight = await getInsight(dominantSignal)
      insightText.textContent = insight
      status.textContent = 'Scan complete'

      // Stop sensing
      vl.stopVideoStream()
      clearInterval(expressionInterval)
      stream.getTracks().forEach(t => t.stop())

      btn.disabled = false
      btn.textContent = 'Scan Again'
    }

    // Initialize on load
    window.addEventListener('load', loadModels)
  </script>
</body>
</html>
```

---

## Figma Make Agent Prompt

```
Build a HunchDoctor wellness app screen in HTML using 
ES modules. Dark background #0a0a0f.

Load these two libraries:
1. face-api.js from CDN:
   https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js
2. VitalLens from ES module CDN:
   https://cdn.jsdelivr.net/npm/vitallens/dist/vitallens.browser.js

UI Elements (centered, single column):
- Glowing animated avatar orb — radial gradient 
  amber #F7A85A to teal #4FD1C5, 100px, breathing + 
  floating CSS animation
- App name HUNCHDOCTOR — 11px uppercase letter-spacing 6px opacity 35%
- Status line — 11px uppercase letter-spacing 3px opacity 40%
- Vitals row — HR and RR displayed side by side, 
  values update in real time from VitalLens
- Signal display — 28px uppercase letter-spacing 8px, 
  color changes per dominant signal
- Italic insight text — 15px italic opacity 75% 
  max 280px centered
- Begin Scan button — ghost pill style frosted glass

On button click:
1. Open front camera via getUserMedia
2. Feed stream to VitalLens with addVideoStream()
3. Call vl.startVideoStream() and listen for vitals events
4. Run face-api.js TinyFaceDetector + withFaceExpressions() 
   every 2 seconds
5. After 5 seconds combine both signals
6. Map expression to taste signal using:
   disgusted=Bitter, happy=Sweet, fearful=Sour, 
   neutral=Salt, sad=Umami
7. Call Claude API with combined data
8. Display signal name and insight text
9. Stop all streams when complete

Signal colors:
Bitter=#8b7ab8, Sweet=#f7a8c4, Sour=#a8e6a3, 
Salt=#a8d4f7, Umami=#e8b887

Use type="module" script tag for VitalLens import.
All animations CSS only.
```

---

## Key Notes

**Script Type**
VitalLens uses ES modules. Your script tag must be:
```html
<script type="module">
  import { VitalLens } from 'https://cdn.jsdelivr.net/npm/vitallens/dist/vitallens.browser.js'
</script>
```

**Confidence Threshold**
Only trust vitals readings above 0.6 confidence. 
Below that — use fallback values to avoid bad data 
reaching Claude.

**5 Second Warmup**
VitalLens needs a few seconds of video to stabilize 
its readings. Always wait at least 5 seconds before 
pulling the final values.

**Free Tier Fallback**
If VitalLens API key runs out during the demo, 
swap `method: 'vitallens'` to `method: 'pos'` — 
no key needed, runs locally, still gives HR estimate.

**Local Backend Option**
Move both API keys (VitalLens + Claude) to your 
local Express server and call via ngrok URL. 
Keeps keys off the frontend entirely.
